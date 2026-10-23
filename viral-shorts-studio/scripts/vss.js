#!/usr/bin/env node
/* 바이럴 쇼츠 스튜디오 CLI — vss.py와 같은 명령·같은 출력을 내는 Node 판.
   파이썬이 없는 컴퓨터용. 판정은 LLM이 아니라 이 코드로만 한다.
   상태 파일: <batch>/project.json (vss.py와 호환, 서로 바꿔 써도 된다) */
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process"), crypto = require("crypto");

const SKILL_DIR = path.dirname(path.dirname(path.resolve(__filename)));
const PACKS_DIR = path.join(SKILL_DIR, "packs");
const LV = ["1차(리뷰·문의 원문)", "커뮤니티·후기", "기사·2차 인용", "미확인"];
const REL_DISC = { own: "판매자가 직접 제작한 영상입니다", affiliate: "쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다",
  client: "광고주로부터 제작비를 지원받았습니다", none: "" };
const MARK = /\s*\[확인 필요\]/g;

const out = (...a) => process.stdout.write(a.join(" ") + "\n");
function die(msg, code = 1) { if (msg) process.stderr.write(msg + "\n"); process.exit(code); }
function today() { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function nowMin() { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${today()}T${p(d.getHours())}:${p(d.getMinutes())}`; }
const uid = () => crypto.randomBytes(4).toString("hex");
// 파이썬 round(): 정확히 .5면 짝수로
function pyRound(x, nd = 0) { const m = 10 ** nd, y = x * m, f = Math.floor(y), diff = y - f;
  let r = diff === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(y); return r / m; }
const fix1 = x => pyRound(x, 1).toFixed(1);
const fmtSec = x => Number.isInteger(x) ? x.toFixed(1) : String(x);
const readJ = p => JSON.parse(fs.readFileSync(p, "utf8"));
const dumps = o => JSON.stringify(o, null, 2);
const cntStr = (t, s) => t.split(s).length - 1;
const sum = a => a.reduce((x, y) => x + y, 0);
const nows = s => s.replace(/\s/g, "");
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };

// ---------- 상태 ----------
function load(B) { const p = path.join(B, "project.json"); if (!exists(p)) die(`project.json 없음: ${p} — 먼저 \`vss.js init\` 실행`); return readJ(p); }
function save(B, P) { fs.writeFileSync(path.join(B, "project.json"), dumps(P), "utf8"); }
function loadPack(pid, B) {
  const cands = []; if (B) cands.push(path.join(B, "pack.json")); cands.push(path.join(PACKS_DIR, pid + ".json"));
  for (const c of cands) if (exists(c)) { const pk = readJ(c); if (pk.id === pid || c.endsWith("pack.json")) return pk; }
  die(`팩 없음: ${pid} (packs/: ${fs.readdirSync(PACKS_DIR).map(x => x.slice(0, -5)).sort().join(", ")})`);
}
function loadRules(B) { for (const c of [path.join(B, "rules.json"), path.join(SKILL_DIR, "templates", "rules.json")]) if (exists(c)) return readJ(c); return []; }
function bannedList(P, pk) { const ex = (P.research.bannedExtra || "").split(",").map(s => s.trim()).filter(Boolean); return [...(pk.banned || []), ...ex]; }

// ---------- 길이·장면 ----------
function estSec(plan) { return pyRound(nows(plan.lines.map(l => l.text).join("")).length / 4.5); }
function scenesOf(plan, pk) {
  if (!plan.scenes || plan.scenes.length !== plan.lines.length) {
    const chars = plan.lines.map(l => nows(l.text).length + 2), s = sum(chars) || 1, tot = Math.max(pk.duration[0], estSec(plan)), old = plan.scenes || [];
    plan.scenes = plan.lines.map((_, i) => ({ asset: i < old.length ? old[i].asset : "", sec: pyRound(chars[i] / s * tot, 1) }));
  }
  return plan.scenes;
}

// ---------- 훅 린트 (보정 전 휴리스틱) ----------
const JOSA = /(으로서|으로써|에게서|이라는|라는|에서|에게|으로|부터|까지|처럼|보다|이나|하고|은|는|이|가|을|를|의|에|도|로|와|과|만|께)$/;
const NUM = /\d[\d,.]*\s?(%|퍼센트|개월|개|명|원|억|만|천|배|위|편|번|시간|분|초|일|주|달|년|세|살|대)?|[일이삼사오륙육칠팔구십백천만억]+\s?(개월|개|명|원|억|배|시간|분|일|주|년)/g;
const VAGUE = ["미친", "충격", "대박", "역대급", "놀라운", "엄청", "어마어마", "비밀", "완벽", "최고", "궁극", "혁명", "레전드", "소름", "경악", "실화", "폭로"];
const YOU = /(당신|여러분|대표님|사장님|임원|[3-7]0대|은퇴|퇴직|직장인|부모님|님[,\s]|너)/g;
const STAKE = /(잃|손해|낭비|놓치|위험|비용|늦|후회|망(하|합|친)|포기|못 ?(하|합|해)|전에|멈추|절대|마지막|뒤처|도태|사라지|끝났|끝나)/g;
const CURIO = /(왜|어떻게|무엇|뭘|뭐가|어떤|아무도|몰랐|진짜|사실|딱|단 하나|이유|정체|반전|알고 ?보니|\?)/g;
const CLOSED = /(때문에|그래서|알려드립니다|알려 ?드릴게요|소개합니다|설명합니다|정리했습니다)/;
const GREET = /^\s*(안녕하세요|여러분 ?안녕|환영합니다|오늘은|이번 영상은|오늘도)/;
const W = "[가-힣A-Za-z0-9_]"; // 파이썬 \b(유니코드)와 맞추기 위한 경계
const FORM = {
  "The Statistic": [/\d+\s?(%|퍼센트)/, /\d+\s?(명|개|곳)\s?(중|가운데)/, /(대부분|절반|10명 중)/],
  "Someone Else's Result": [/에서\s?\S*\s?(까지|로)\s?(늘|올|성장|매각|달성)/, /\d+\s?(억|만|배)\s?(매각|달성|벌)/, /(CEO|대표|창업자|공동창업자)\S*\s?(가|이)\s?(인정|말)/],
  "The Mistake": [/(틀렸|잘못|실수|착각|오해)/, /(때문에|이유)\s?.*(안|못|않)/, /(하고 ?있(다면|는))/],
  "Contrarian Flip": [/(다들|모두|누구나|흔히)\s?.*(하지만|그런데|아닙니다|틀렸)/, /(오히려|반대로)/, /(아니라)/],
  "The Reveal": [/(보여\s?드리|공개|직접 보)/, /(화면|프롬프트|파일).*(그대로|전부|통째)/, /(통째로|전부)\s?(공개|풀)/],
  "The Superlative": [/(가장|제일|최고|최악|최단|최초)/, /(1위|넘버원)/],
  "The Clock": [/\d+\s?(분|초|시간|일)\s?(안에|만에|동안|이면|뒤)/, /(하루|한 ?주|일주일)\s?(만에|안에)/],
  "I Tried It": [/(해봤|써봤|따라해|직접 \S+해)/, /\d+\s?(일|주|개월)\s?(동안|간)/, /(맡겨|돌려)\s?봤/],
  "The Question": [/\?\s*$/, /(왜|어떻게|뭐가|무엇이)\s?\S+/],
  "Before and After": [/(전|이전)\s?.*(후|이후)/, /(처음엔|예전엔).*(지금은|이제는)/, /(바꿨더니|바꾸고 나서)/],
  "The Teardown": [/(분석|해부|뜯어|파헤|비교|따져)/, /\d+\s?(개|편|명)\s?(을|를)?\s?(분석|조사|뜯어|비교)/],
  "The Stack": [/(조합|같이 쓰|함께 쓰)/],
  "The Warning": [/(하지 ?마|마세요|말고|전에 )/, /(위험|주의|경고|손해|조심)/, /(모르면|안 보면)/],
  "The List": [/^\s?\S*\d+\s?(가지|개|단계|명|편|선)/, /(\d+|[일이삼사오육칠팔구십]+)\s?(가지|개|단계)/],
  "The Receipt": [/(캡처|화면|통장|대시보드|스크린샷|영수증)/, /(실제|진짜)\s?.*(수치|숫자|화면|결과)/],
  "The Insider": [/(내부|업계|현직|아무도 말 ?안|알려주지 않)/, /(숨겨진|숨은)/],
  "The Impossible Claim": [/(없이도|하나도 안)/, /(혼자서|혼자)\s?.*(만에|개월)/],
  "The Comparison": [new RegExp(`(?<!${W})vs(?!${W})|VS|대\\s`), /(비교|둘 중|세 가지 방법|3가지로)/, /(이긴|승자|결과는)/],
  "The Origin": [/(시작은|출발은|처음 시작)/, /(매번|항상)\s?.*(같은|똑같)/],
  "The Deadline": [/\d+\s?월\s?\d*\s?일?/, /(이번 ?(달|주)|올해|내년|곧)\s?.*(바뀝|끝납|종료|사라)/, /(마감|종료|폐지|변경)/],
  "The Direct Address": [/^\s?\S*(대표님|사장님|임원|[3-7]0대|은퇴|직장인)/, /(분들?께|하는 ?분|라면)\s?/],
};
const FIX = { "구체성": "형용사 하나를 숫자·이름·날짜로", "호명": "첫 4어절 안에 호명(대표님/50대/…)",
  "손실·위험": "지금 방식을 유지하면 잃는 것 한 줄", "호기심": "스스로 답을 말해버리는 절반을 자른다", "간결성": "6~16어절로" };
const eoj = t => t.match(/[가-힣A-Za-z0-9%$.,]+/g) || [];
function stem(w) { w = w.replace(/^[.,]+|[.,]+$/g, ""); if (w.length >= 3) w = w.replace(JOSA, "") || w; return w.toLowerCase(); }
const clamp = v => Math.max(0, Math.min(100, v));
const cnt = (re, t) => (t.match(re) || []).length;
const ACRO = new RegExp(`(?<!${W})[A-Z][A-Za-z0-9]{1,}(?!${W})`, "g");

function lintHook(t) {
  t = (t || "").trim(); if (!t) return null;
  const parts = {
    "구체성": clamp(34 + Math.min(cnt(NUM, t), 3) * 22 - sum(VAGUE.map(v => cntStr(t, v))) * 16 + Math.min(18, 6 * cnt(ACRO, t))
      + (/[「『《“"'‘].+[」』》”"'’]/.test(t) ? 8 : 0)),
    "호명": clamp(26 + cnt(YOU, t) * 20 + (new RegExp(YOU.source).test(eoj(t).slice(0, 4).join(" ")) ? 30 : 0)),
    "손실·위험": clamp(22 + cnt(STAKE, t) * 26 + (cnt(NUM, t) ? 14 : 0)),
    "호기심": clamp(24 + cnt(CURIO, t) * 17 + (t.endsWith("?") ? 18 : 0) + (CLOSED.test(t) ? -18 : 0)),
  };
  const n = eoj(t).length;
  parts["간결성"] = !n ? 0 : (n >= 6 && n <= 16 ? 100 : (n < 6 ? Math.max(30, 100 - (6 - n) * 14) : Math.max(10, 100 - (n - 16) * 8)));
  const vals = Object.values(parts);
  let v = pyRound(.6 * (sum(vals) / vals.length) + .4 * Math.min(...vals));
  const greet = GREET.test(t); if (greet) v = Math.max(0, v - 15);
  let best = "미분류", hits = 0;
  for (const [name, ps] of Object.entries(FORM)) { const h = ps.filter(p => p.test(t)).length; if (h > hits) { best = name; hits = h; } }
  let low = Object.keys(parts)[0]; for (const k of Object.keys(parts)) if (parts[k] < parts[low]) low = k;
  const band = v >= 72 ? "STRONG" : v >= 55 ? "WORKABLE" : "WEAK";
  return { parts, v, band, formula: best, hits, weak: low, fix: FIX[low], vague: VAGUE.filter(w => t.includes(w)), greet };
}

function lintTitle(t, thumb) {
  t = (t || "").trim(); const issues = [], n = t.length;
  if (n > 100) issues.push(`제목 ${n}자 (한도 100)`); else if (n > 60) issues.push(`제목 ${n}자 — 데스크톱 60자 근처에서 잘림`);
  const v = VAGUE.filter(w => t.includes(w)); if (v.length) issues.push(`제목 과장어 ${v.join(",")}`);
  if (!new RegExp(NUM.source).test(t)) issues.push("제목에 숫자·날짜 없음");
  if (thumb) {
    const tw = new Set(eoj(t).map(stem)), hw = eoj(thumb).map(stem);
    const sh = [...new Set(hw.filter(y => [...tw].some(x => x === y || (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))))))].sort();
    if (sh.length) issues.push(`썸네일이 제목과 겹침: ${sh.join(",")}`);
    if (eoj(thumb).length > 4 || nows(thumb).length > 14) issues.push("썸네일 문구 4어절/14자 초과");
  }
  return issues;
}

// ---------- 플랜 검사 ----------
function checkPlan(P, pk, plan) {
  const bl = bannedList(P, pk), errs = [], warns = [];
  const txt = [plan.title || "", plan.thumb || "", plan.desc || "", plan.tiktok || "", plan.insta || "", ...plan.lines.map(l => l.text), ...(plan.tags || [])].join(" ");
  for (const b of bl) if (txt.includes(b)) errs.push(`금지어 "${b}"`);
  const strong = plan.lines.filter(l => l.strong).length; if (strong !== 1) errs.push(`센 문장 ${strong}개 (1개여야)`);
  const sec = estSec(plan);
  if (sec < pk.duration[0] - 5 || sec > pk.duration[1] + 5) warns.push(`추정 ${sec}초 (목표 ${pk.duration[0]}~${pk.duration[1]})`);
  if (!/핵심|제품|결과|현장|등장/.test((plan.lines.length ? plan.lines[0].shot : "") || "")) warns.push(`1번 컷에 핵심 등장 표시 없음 (첫 ${pk.coreAppearSec}초)`);
  if (pk.disclosure && !(plan.desc || "").includes(pk.disclosure.slice(0, 6))) errs.push("설명에 표기 문구 없음");
  const nt = (plan.tags || []).length; if (nt < 5) warns.push(`태그 ${nt}개 (10개 권장)`);
  if (txt.includes("[확인 필요]")) warns.push("[확인 필요] 남아 있음 — 발행 전 제거");
  const nums = plan.lines.map(l => l.text).join(" ").match(/[0-9][0-9,.]*/g);
  if (nums && !P.research.pains.some(x => x.src)) warns.push("대사에 숫자 있는데 출처 있는 발화가 없음");
  const h = lintHook(plan.lines.length ? plan.lines[0].text : "");
  if (h) {
    plan._lint = { hook: h.v, formula: h.formula };
    if (h.greet) warns.push('훅이 인사·"오늘은 ~"로 시작 (요약문이 됨)');
    if (h.vague.length) warns.push(`훅 과장어 ${h.vague.join(",")}`);
    if (h.v < 45) warns.push(`훅 린트 ${h.v}점(${h.band}) — 약한 곳: ${h.weak} → ${h.fix} [보정 전 휴리스틱]`);
  }
  warns.push(...lintTitle(plan.title, plan.thumb));
  return { errs, warns, sec, lint: h };
}

function sceneCheck(P, pk, plan) {
  const sc = scenesOf(plan, pk), errs = [], warns = [], tot = sum(sc.map(s => s.sec));
  const assets = Object.fromEntries(P.assets.map(a => [a.id, a]));
  const a0 = sc.length ? assets[sc[0].asset] : null;
  if (!a0) errs.push("1번 컷 소재 없음");
  else if (!/정면|사용|현장|화면|비교/.test(a0.role || "")) warns.push(`1번 컷 역할 "${a0.role}" — 핵심(정면·사용 장면·현장·화면)이 첫 ${pk.coreAppearSec}초에`);
  if (sc.length && sc[0].sec > pk.coreAppearSec + 1) warns.push(`1번 컷 ${fmtSec(sc[0].sec)}초 — 핵심 등장이 ${pk.coreAppearSec}초를 넘길 수 있음`);
  const miss = sc.filter(s => !s.asset).length; if (miss) warns.push(`소재 미지정 ${miss}컷 (검정 화면)`);
  const unk = sc.filter(s => assets[s.asset] && assets[s.asset].rights === "미확인").length; if (unk) errs.push(`권리 미확인 소재 ${unk}개 사용 — R-005`);
  if (tot < pk.duration[0] - 5 || tot > pk.duration[1] + 5) warns.push(`총 ${fix1(tot)}초 (목표 ${pk.duration[0]}~${pk.duration[1]})`);
  return { errs, warns, tot };
}

function gramSet(plan) { const s = nows(plan.lines.map(l => l.text).join("")), g = new Set(); for (let i = 0; i < s.length - 2; i++) g.add(s.slice(i, i + 3)); return g; }
function simMax(plan, others) {
  let best = { s: 0, w: null }; const a = gramSet(plan); if (a.size < 5) return best;
  for (const [label, o] of others) {
    if (o.id === plan.id) continue; const b = gramSet(o); if (b.size < 5) continue;
    let inter = 0; for (const x of a) if (b.has(x)) inter++;
    const s = inter / (a.size + b.size - inter);
    if (s > best.s) best = { s, w: label + " / " + (o.title || "").slice(0, 20) };
  }
  return best;
}
function otherPlans(B, P) {
  const res = P.plans.map(pl => [P.name, pl]), parent = path.dirname(path.resolve(B));
  for (const d of fs.readdirSync(parent).sort()) {
    const pj = path.join(parent, d, "project.json");
    if (path.resolve(parent, d) === path.resolve(B) || !exists(pj)) continue;
    try { const Q = readJ(pj); res.push(...Q.plans.map(pl => [Q.name, pl])); } catch {}
  }
  return res;
}

// ---------- 프롬프트(Claude가 직접 수행) ----------
function ctx(P, pk, rules) {
  const rl = rules.filter(r => ["ss-plan", "ss-clone", "ss-render"].includes(r.stage)).map(r => "- " + r.rule).join("\n"), s = P.subject;
  return `[장르 팩] ${pk.name} — ${pk.desc}\n[소재] ${s.name || "(이름 없음)"} / ${s.url} / 관계: ${s.rel}\n`
    + `메모: ${s.notes}\n[보여줄 것] ${P.sourcing.show || "(미정)"}\n[금지 표현] ${bannedList(P, pk).join(", ")}\n`
    + `[표기 문구] ${pk.disclosure || "없음"}\n[길이] ${pk.duration[0]}~${pk.duration[1]}초, 핵심은 첫 ${pk.coreAppearSec}초 안 등장\n[규칙 원장]\n${rl}`;
}
function researchPrompt(P, pk, rules) {
  const qs = pk.research.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return "너는 숏폼 리서처다. 아래 소재에 대해 \"만들기 전 절반\"을 한다. 상상으로 쓰지 말고, 실제로 확인한 공개 출처(리뷰·커뮤니티·기사·지침)만 쓰고 모르면 lv=3(미확인)으로 표시하라. "
    + "WebSearch·WebFetch로 원문을 직접 확인한 것만 lv 0~2다.\n\n" + ctx(P, pk, rules) + `\n\n[리서치 질문]\n${qs}\n\n출력은 JSON만:\n`
    + '{"pains":[{"quote":"원문 요지","src":"URL 또는 출처명","lv":0|1|2|3,"hook":"쇼츠 훅 한 줄"}],"trends":[{"type":"유형","src":"URL","note":"메모"}],"banned_add":["이 소재에서 추가로 피할 표현"]}\npains는 5개 이상.';
}
function planPrompt(P, pk, rules) {
  const r = P.research; let ref = "";
  if (r.ref && r.ref.out) { const o = r.ref.out; ref = `\n[레퍼런스 구조] 길이 ${o.sec}초, 문장 ${o.n}, 훅 ${o.hookType}, CTA ${o.cta}. 구조만 쓰고 문장은 새로.`; }
  const pains = r.pains.map((x, i) => `${i + 1}. "${x.quote}" (${x.src}, ${LV[parseInt(x.lv ?? 3)]}) → 훅: ${x.hook}`).join("\n");
  const trends = r.trends.map(t => `- ${t.type} ${t.src} ${t.note}`).join("\n");
  const hooks = pk.hooks.map(h => `- ${h.id} ${h.name}: ${h.formula}`).join("\n");
  return `너는 숏폼 기획자다. 리서치 결과로 ${P.count}편의 콘텐츠 플랜을 쓴다. 편마다 훅 유형을 다르게 하고, 첫 문장은 리서치 발화를 변형해서 쓴다. `
    + "대사는 3~5문장, 그중 \"가장 센 문장\" 하나만 strong=true. 숫자는 리서치에 있는 것만. 금지 표현 0개. 표기 문구는 설명과 플랫폼 문구에 포함.\n\n"
    + ctx(P, pk, rules) + ref + `\n\n[리서치 발화]\n${pains}\n[트렌드]\n${trends}\n[훅 유형 목록]\n${hooks}\n\n출력은 JSON 배열만:\n`
    + '[{"hook":"훅 id","thumb":"썸네일 카피 8자 내","title":"제목","lines":[{"text":"대사","shot":"화면 설명","strong":false}],"desc":"유튜브 설명","tags":["태그 10개"],"tiktok":"틱톡 문구","insta":"인스타 문구"}]';
}

// ---------- 템플릿 플랜 ----------
function templatePlans(P, pk) {
  const pains = P.research.pains.filter(x => x.quote); if (!pains.length) die("리서치 발화가 없어요. research.pains에 3건 이상 먼저");
  const name = P.subject.name || "이것", show = P.sourcing.show || "사용 장면", disc = pk.disclosure || "", url = P.subject.url || "", hooks = pk.hooks, res = [];
  for (let i = 0; i < P.count; i++) {
    const h = hooks[i % hooks.length], pa = pains[i % pains.length], q = pa.quote.replace(/[.。]$/, ""), unv = parseInt(pa.lv ?? 3) === 3 ? " [확인 필요]" : "";
    const first = ({
      problem: `${q}, 솔직히 그렇지 않으세요?`, situation: `${q}. 그래서 저는 이렇게 합니다.`, question: `${q}, 왜 그럴까요?`,
      unboxing: `${name} 박스를 열면 이게 들어 있습니다.`, compare: `${name}, 뭐가 다르냐고 많이 물으세요.`, wow: `와, ${name} 이건 진짜 ${show}네요.`,
      myth: `${q}? 그렇지 않습니다.`, result: `${q}, 그다음에 생기는 일.`, reframe: `${q}, 사실은 다른 문제예요.`,
      checklist: `이 중 두 개면 ${name} 이야기를 들어보세요.`, number: `${q}.`, before: `전에는 ${q}.`, quote: `"${q}"라는 말을 들었습니다.`,
      decision: `${q}. 그날 결정했습니다.`, routine: `매일 ${q}.`, beforeafter: `왼쪽이 전, 오른쪽이 후예요. ${q}.`, list: `${name} 쓰는 분들 필수 3가지.`,
      timer: `${q}, 몇 초 걸리는지 보세요.`, who: `${q}인 분만 보세요.`, proof: `"${q}" — 수강생이 한 말입니다.`, demo: `${q}, 1분만 직접 보여드릴게요.`,
      scene: `${q}.`, owner: `"${q}" 사장님 말씀입니다.`, review: `"${q}" 후기 그대로입니다.`, daily: `${q}.`,
      diagnose: `${q} 회사들의 공통점이 있습니다.`, case: `${q}.`,
    })[h.id] ?? `${q}.`;
    const parts = h.formula.split("→"), third = parts.length > 2 && parts[2].trim() ? parts[2].trim() : "한 가지만 더";
    const desc = (pk.descTemplate || "{name} — {show}. {disclosure}").split("{name}").join(name).split("{show}").join(show)
      .split("{disclosure}").join(disc).split("{url}").join(url).split("{sources}").join(pains.filter(x => x.src).map(x => x.src).slice(0, 2).join(", "));
    const tags = [];
    for (const t of [name.replace(/ /g, ""), h.name, ...show.split(/[,·/]/).map(s => s.trim().replace(/ /g, "")).slice(0, 3), ...(pk.tagSeeds || [])])
      if (t && !tags.includes(t) && t.length <= 10) tags.push(t);
    res.push({ id: uid(), hook: h.id, thumb: (pa.hook || q).slice(0, 8), title: `${(pa.hook || q).slice(0, 24)} (${name})`,
      lines: [{ text: first + unv, shot: `0~${pk.coreAppearSec}초: ${show} (핵심 등장)`, strong: false },
        { text: `그래서 ${name}. ${show}.`, shot: "핵심 동작/장면 클로즈업", strong: true },
        { text: `${third}: (여기에 근거 1개)`, shot: "보조 장면", strong: false },
        { text: `${(pk.cta || ["링크는 프로필"])[0]}.`, shot: "엔딩, 루프", strong: false }],
      desc, tags: tags.slice(0, 10),
      tiktok: `${first.slice(0, 40)} #${name.replace(/ /g, "")} ${disc ? "(" + disc + ")" : ""}`.trim(),
      insta: `${first.slice(0, 60)} — ${show}. ${disc}`, scenes: [], voiceId: null });
  }
  return res;
}

// ---------- 발행 문구 ----------
function discFor(P, pk) { const seen = []; for (const x of [pk.disclosure || "", REL_DISC[P.subject.rel] || ""]) if (x && !seen.includes(x)) seen.push(x); return seen.join(" · "); }
function publishText(P, pk, pl) {
  const d = discFor(P, pk), url = P.subject.url || "", tags = (pl.tags || []).map(t => "#" + t.replace(/ /g, "")).join(" ");
  const dAdd = d && !pl.desc.includes(d) ? "\n" + d : "";
  const yt = `[제목]\n${pl.title}\n\n[설명]\n${pl.desc}\n${dAdd}\n${url ? "\n" + url : ""}\n\n${tags}\n\n[고정 댓글]\n${(pk.cta || [""])[0]} ${url}${d ? " (" + d + ")" : ""}`;
  const tt = `${pl.tiktok || ""}\n${d && !(pl.tiktok || "").includes(d) ? d : ""}\n${tags}`;
  const ig = `${pl.insta || ""}\n${d && !(pl.insta || "").includes(d) ? d : ""}\n.\n${tags}`;
  const th = `${pl.lines.length ? pl.lines[0].text.replace(MARK, "") : pl.title} ${url}`;
  return [yt, tt, ig, th];
}
function ytMeta(P, pk, pl) {
  const d = discFor(P, pk), tags = (pl.tags || []).filter(Boolean).map(t => t.replace(/ /g, "")), url = P.subject.url || "";
  let desc = `${pl.desc}\n${d && !pl.desc.includes(d) ? "\n" + d : ""}${url ? "\n\n" + url : ""}`.trim();
  if (!/#shorts/i.test(desc)) desc += "\n\n#Shorts " + tags.slice(0, 4).map(t => "#" + t).join(" ");
  return { title: pl.title.slice(0, 100), desc: desc.slice(0, 4900), tags: tags.slice(0, 15) };
}

// ---------- 발행 게이트 ----------
function ffprobe(p) {
  try {
    const r = cp.spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", p], { encoding: "utf8", timeout: 30000 });
    if (r.error || r.status !== 0) return null;
    const j = JSON.parse(r.stdout), st = (j.streams || [{}])[0];
    return { w: parseInt(st.width || 0), h: parseInt(st.height || 0), dur: parseFloat((j.format || {}).duration || 0) };
  } catch { return null; }
}
function allUploads(B) {
  const res = [], parent = path.dirname(path.resolve(B));
  for (const d of fs.readdirSync(parent)) { const pj = path.join(parent, d, "project.json"); if (exists(pj)) try { res.push(...Object.values(readJ(pj).uploads || {})); } catch {} }
  return res;
}
function pubGates(B, P, pk, pl, video, cap = 2, gapH = 6) {
  const c = checkPlan(P, pk, pl), s = sceneCheck(P, pk, pl), txt = pl.lines.map(l => l.text).join("") + pl.title + pl.desc, g = [];
  g.push(["굿 승인 기록(approve)", P.approvals.some(a => a.plan === pl.id)]);
  g.push(["플랜 검사 오류 0", !c.errs.length]); g.push(["장면표 검사 오류 0", !s.errs.length]); g.push(["[확인 필요] 0", !txt.includes("[확인 필요]")]);
  const unk = P.assets.filter(a => a.rights === "미확인").length; g.push([`소재 권리 미확인 0 (현재 ${unk})`, unk === 0]);
  const sim = simMax(pl, otherPlans(B, P)); g.push([`다른 편과 대사 유사도 < 50% (최대 ${pyRound(sim.s * 100)}%${sim.w ? " · " + sim.w : ""})`, sim.s < .5]);
  const up = (P.uploads || {})[pl.id]; g.push(["이 편은 아직 업로드 안 함/결과 확정", !up || ["failed", "verified-missing"].includes(up.state)]);
  const ups = allUploads(B).filter(u => ["done", "verified", "unknown"].includes(u.state)), todayN = ups.filter(u => u.day === today()).length;
  g.push([`오늘 업로드 ${todayN}/${cap}`, todayN < cap]);
  const last = Math.max(0, ...ups.map(u => u.ts || 0)); g.push([`직전 업로드와 ${gapH}시간 간격`, Date.now() / 1000 - last >= gapH * 3600]);
  const vok = !!video && exists(video); g.push(["영상 파일 존재", vok]);
  const meta = vok ? ffprobe(video) : null;
  g.push([`세로·180초 이하 (Shorts 조건${meta ? " · " + JSON.stringify(meta) : " · ffprobe 없음/실패"})`, !!meta && meta.h > meta.w && meta.dur <= 180]);
  g.push(["YouTube 토큰(VSS_YT_TOKEN) 있음", !!process.env.VSS_YT_TOKEN]);
  return [g, c, s];
}

// ---------- 성과 ----------
const num = x => parseFloat(x || 0) || 0;
const score = f => num(f.v48) * (1 + num(f.stay) / 100) + num(f.click) * 20 + num(f.conv) * 200;
function winner(P) {
  const rows = [];
  for (const pl of P.plans) { const f = P.perf.find(x => x.plan === pl.id); if (f && String(f.v48 ?? "") !== "") rows.push([pl, f]); }
  if (rows.length < 2) return null;
  rows.sort((a, b) => score(b[1]) - score(a[1]));
  return { best: rows[0], worst: rows[rows.length - 1], n: rows.length };
}
function spearman(a, b) {
  const rk = x => { const s = x.map((_, i) => i).sort((i, j) => x[i] - x[j]), r = Array(x.length).fill(0); s.forEach((i, k) => r[i] = k + 1); return r; };
  const ra = rk(a), rb = rk(b), n = a.length, d = sum(ra.map((v, i) => (v - rb[i]) ** 2));
  return 1 - 6 * d / (n * (n * n - 1));
}
function parseRet(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const nums = [];
    for (let c of line.split(",")) { c = c.replace(/[%"\s]/g, ""); if (c !== "" && !isNaN(Number(c))) nums.push(Number(c)); }
    if (nums.length >= 2) rows.push([nums[0], nums[1]]);
  }
  return rows;
}
function lineAt(pl, pk, sec) {
  const sc = scenesOf(pl, pk); let acc = 0;
  for (let i = 0; i < sc.length; i++) { if (sec < acc + sc[i].sec || i === sc.length - 1) return [i, i < pl.lines.length ? pl.lines[i].text : ""]; acc += sc[i].sec; }
  return [0, ""];
}
function analyzeRet(rows, pl, pk, unit) {
  const dur = sum(scenesOf(pl, pk).map(s => s.sec)) || 30, conv = unit === "pct" ? x => x / 100 * dur : x => x;
  const r = rows.map(([x, y]) => [conv(x), y]).sort((a, b) => a[0] - b[0]); if (r.length < 4) return null;
  const hw = Math.min(30, dur * .25);
  const at = t => { let v = r[0][1]; for (const [x, y] of r) { if (x <= t) v = y; else break; } return v; };
  const lost = r[0][1] - at(hw);
  const drops = r.slice(1).map((_, k) => ({ t: r[k + 1][0], d: r[k][1] - r[k + 1][1] })).sort((a, b) => b.d - a.d);
  const cl = []; for (const d of drops.slice(0, 3)) if (d.d > 0) { const [i, text] = lineAt(pl, pk, d.t); cl.push({ ...d, i, text }); }
  const mid = r.filter(x => x[0] >= hw), slide = mid.length > 1 ? (mid[0][1] - mid[mid.length - 1][1]) / Math.max(1, mid[mid.length - 1][0] - mid[0][0]) : 0;
  return { dur, hw, lost, cl, slide, end: r[r.length - 1][1] };
}

// ---------- 내보내기 ----------
function w(p, text) { fs.writeFileSync(p, text, "utf8"); out("  →", p); }
function exportAll(B, P, pk, idx, outdir) {
  const pl = P.plans[idx]; fs.mkdirSync(outdir, { recursive: true });
  const sc = scenesOf(pl, pk), assets = Object.fromEntries(P.assets.map(a => [a.id, a])), n = idx + 1;
  const tone = { problem: "problem-solve", wow: "wow-reaction", beforeafter: "before-after", situation: "situation-vlog", list: "list-ranking" }[pl.hook] || "problem-solve";
  const o = { product: { name: P.subject.name, link: P.subject.url, notes: P.subject.notes }, tone,
    reference: (P.research.ref || {}).url || "", title: pl.title, thumbnail: { line1: pl.thumb || "", line2: "", time: null }, hero: null,
    lines: pl.lines.map((l, i) => ({ text: l.text.replace(MARK, ""), shot: i < sc.length ? ((assets[sc[i].asset] || {}).name || "") : "" })),
    description: { title: pl.title, body: pl.desc, cta: (pk.cta || [""])[0], hashtags: (pl.tags || []).map(t => "#" + t.replace(/ /g, "")) },
    ad_label: pk.disclosure || "", rights: P.assets.map(a => ({ file: a.name, role: a.role, rights: a.rights })) };
  w(path.join(outdir, `script_${n}.json`), dumps(o));
  const ls = pl.lines.map(l => l.text.replace(MARK, ""));
  const shots = pl.lines.map((l, i) => `${i + 1}. ${l.shot || ""}${l.strong ? " (★ 센 문장, 자막 크게)" : ""}`).join("\n");
  const md = `# ${pl.title}\n\n> 장르 팩: ${pk.name} · 훅: ${pl.hook} · 목표 ${pk.duration[0]}~${pk.duration[1]}초 · 720p\n> 표기: ${pk.disclosure || "없음"}\n\n`
    + `## Hook\n${ls[0] || ""}\n\n## Body\n${ls.slice(1, -1).join("\n")}\n\n## CTA\n${ls.length ? ls[ls.length - 1] : ""}\n\n## Shots\n${shots}\n\n## Thumbnail\n${pl.thumb || ""}\n\n`
    + `## Description\n${pl.desc}\n${(pl.tags || []).map(t => "#" + t).join(" ")}\n`;
  w(path.join(outdir, `factory_${n}.md`), md);
  w(path.join(outdir, `script_045_${n}.txt`), ls.join("\n") + "\n");
  const [yt, tt, ig, th] = publishText(P, pk, pl);
  w(path.join(outdir, `publish_${n}.md`), `# 발행 문구 ${n}편\n\n## YouTube\n\`\`\`\n${yt}\n\`\`\`\n\n## TikTok\n\`\`\`\n${tt}\n\`\`\`\n\n## Instagram\n\`\`\`\n${ig}\n\`\`\`\n\n## Threads\n\`\`\`\n${th}\n\`\`\`\n`);
}
function export050(P, pk, outdir) {
  fs.mkdirSync(outdir, { recursive: true });
  const r = P.research, sym = { y: "✔", n: "✘", alt: "△ 대체" };
  const research = `# ${P.name} — 1단계 리서치 (바이럴 쇼츠 스튜디오 내보내기 ${today()})\n\n## 소싱 판정\n`
    + pk.sourcing.map(c => `- ${c.q} → ${sym[P.sourcing.checks[c.id]] || "미판정"}`).join("\n")
    + `\n- 보여줄 것: ${P.sourcing.show}\n\n## 발화 (근거)\n| # | 원문 | 출처 | 확인 | 훅 후보 |\n|---|---|---|---|---|\n`
    + r.pains.map((x, i) => `| ${i + 1} | ${x.quote} | ${x.src} | ${LV[parseInt(x.lv ?? 3)]} | ${x.hook} |`).join("\n")
    + "\n\n## 트렌드\n" + r.trends.map(t => `- ${t.type} — ${t.src} ${t.note}`).join("\n")
    + `\n\n## 금지 표현\n${bannedList(P, pk).join(", ")}\n`;
  const hooks = Object.fromEntries(pk.hooks.map(h => [h.id, h.name]));
  const plan = `# ${P.name} — 2단계 콘텐츠 플랜 (${P.plans.length}편)\n\n` + P.plans.map((pl, i) =>
    `## ${i + 1}편 · ${hooks[pl.hook] || pl.hook}\n- 썸네일 카피: **${pl.thumb || ""}**\n- 제목: ${pl.title}\n- 대사:\n`
    + pl.lines.map((l, j) => `  ${j + 1}. ${l.text}${l.strong ? " ← 센 문장" : ""} \`[장면: ${l.shot || ""}]\``).join("\n")
    + `\n- 유튜브 설명: ${pl.desc}\n- 태그: ${(pl.tags || []).join(", ")}\n- 틱톡: ${pl.tiktok || ""}\n- 인스타: ${pl.insta || ""}\n`).join("\n");
  w(path.join(outdir, "research.md"), research); w(path.join(outdir, "content_plan.md"), plan);
}

// ---------- 업로드 (YouTube Data API, resumable) — 실제 OAuth 미검증 ----------
function httpReq(url, { method = "GET", headers = {}, body = null, timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), req = require("https").request({ hostname: u.hostname, path: u.pathname + u.search, method, headers }, res => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.setTimeout(timeout, () => req.destroy(new Error("timeout"))); req.on("error", reject); if (body) req.write(body); req.end();
  });
}
async function upload(B, P, pk, idx, video, privacy, publishAt, synthetic) {
  const tok = process.env.VSS_YT_TOKEN, pl = P.plans[idx], m = ytMeta(P, pk, pl);
  const status = { privacyStatus: privacy, selfDeclaredMadeForKids: false };
  if (publishAt) { status.privacyStatus = "private"; status.publishAt = publishAt; }
  if (synthetic) status.containsSyntheticMedia = true;
  const body = JSON.stringify({ snippet: { title: m.title, description: m.desc, tags: m.tags, categoryId: "22" }, status });
  const size = fs.statSync(video).size;
  const rec = { state: "unknown", day: today(), ts: Date.now() / 1000, video };
  (P.uploads = P.uploads || {})[pl.id] = rec; save(B, P); // 결과 불명도 한도에 포함(중복 업로드 방지)
  try {
    const r = await httpReq("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST", body,
      headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(size), "X-Upload-Content-Type": "video/mp4" } });
    const loc = r.headers.location; if (!loc) throw new Error("업로드 주소 없음");
    const r2 = await httpReq(loc, { method: "PUT", body: fs.readFileSync(video), headers: { "Content-Type": "video/mp4" }, timeout: 1800000 });
    const j = JSON.parse(r2.body); rec.state = "done"; rec.videoId = j.id; save(B, P);
    const r3 = await httpReq(`https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${j.id}`, { headers: { Authorization: "Bearer " + tok } });
    const vj = JSON.parse(r3.body);
    if (vj.items && vj.items.length) { rec.state = "verified"; out(`업로드 검증 완료: https://youtu.be/${j.id} (${vj.items[0].status.privacyStatus})`); }
    else { rec.state = "verified-missing"; out("업로드 응답은 왔지만 videos.list에 없음 — 채널 스튜디오에서 확인"); }
  } catch (e) { out("업로드 실패/결과 불명:", String(e.message || e).slice(0, 200)); out("상태는 unknown으로 남겼습니다. 재시도하지 말고 채널 최근 업로드를 먼저 대조하세요."); }
  save(B, P);
}

// ---------- 출력 도우미 ----------
function reportPlan(P, pk, i, pl) {
  const c = checkPlan(P, pk, pl), s = sceneCheck(P, pk, pl), hooks = Object.fromEntries(pk.hooks.map(h => [h.id, h.name]));
  const mark = c.errs.length || s.errs.length ? "✘" : "✔";
  out(`\n[${i + 1}편] ${mark} ${hooks[pl.hook] || pl.hook} · 추정 ${c.sec}초 · 훅 린트 ${c.lint ? c.lint.v : "-"}점(${c.lint ? c.lint.formula : "-"})`);
  out(`  제목: ${pl.title}`);
  for (const e of c.errs) out("  ✘ 플랜:", e); for (const e of s.errs) out("  ✘ 장면:", e);
  for (const x of c.warns) out("  △", x); for (const x of s.warns) out("  △ 장면:", x);
  return !(c.errs.length || s.errs.length);
}

// ---------- 인자 파서 (argparse 최소 호환) ----------
const SPEC = {
  init: { pos: ["name"], opts: { pack: { req: true }, count: { int: true, def: 5 }, subject: { def: "" }, url: { def: "" }, rel: { def: "own", choices: Object.keys(REL_DISC) }, notes: { def: "" } }, help: "배치 폴더 생성" },
  packs: { pos: [], opts: {}, help: "팩 목록" },
  sourcing: { pos: ["answers"], opts: { show: { def: "" } }, help: "소싱 판정 기록 (id=y|n|alt,...)" },
  prompt: { pos: ["kind"], posChoices: { kind: ["research", "plan"] }, opts: {}, help: "리서치/플랜 요청문 출력(Claude가 수행)" },
  ingest: { pos: ["kind", "file"], posChoices: { kind: ["research", "plans"] }, opts: {}, help: "JSON 결과 반영" },
  template: { pos: [], opts: {}, help: "AI 없이 템플릿 플랜 생성" },
  check: { pos: [], opts: { plan: { int: true, def: 0 } }, help: "플랜·장면표 검사" },
  lint: { pos: ["text"], opts: {}, help: "훅 한 문장 린트" },
  asset: { pos: ["file"], opts: { role: { req: true }, rights: { req: true } }, help: "소재 등록" },
  scene: { pos: ["map"], opts: { plan: { int: true, req: true } }, help: "장면표 소재 지정 (1=a1,2=a2)" },
  export: { pos: [], opts: { plan: { int: true, def: 0 }, out: { def: "" } }, help: "내보내기" },
  "publish-text": { pos: [], opts: { plan: { int: true, req: true } }, help: "발행 문구 출력" },
  approve: { pos: [], opts: { plan: { int: true, req: true } }, help: "굿 승인 기록" },
  gates: { pos: [], opts: { plan: { int: true, req: true }, video: { def: "" }, cap: { int: true, def: 2 }, gap: { float: true, def: 6 } }, help: "발행 게이트 12개 점검" },
  upload: { pos: [], opts: { plan: { int: true, req: true }, video: { req: true }, privacy: { def: "private", choices: ["private", "unlisted", "public"] }, "publish-at": { def: "" }, synthetic: { flag: true }, "yes-public": { def: "" } }, help: "YouTube 업로드(기본 비공개)" },
  perf: { pos: [], opts: { plan: { int: true, req: true }, v48: {}, stay: {}, avg: {}, click: {}, conv: {}, v7: {}, date: {} }, help: "성과 입력" },
  winner: { pos: [], opts: {}, help: "48h 승자·규칙 후보" },
  retention: { pos: ["csv"], opts: { plan: { int: true, req: true }, unit: { def: "pct", choices: ["pct", "sec"] } }, help: "보존율 CSV 해석" },
  calibrate: { pos: [], opts: {}, help: "훅 린트 vs 48h 조회 순위상관" },
  rule: { pos: ["text"], opts: { stage: { req: true }, check: { def: "" }, source: { def: "" } }, help: "규칙 후보 추가" },
};
function usage() {
  out("usage: vss.js [-b 배치폴더] <명령> ...\n\n명령:");
  for (const [k, v] of Object.entries(SPEC)) out(`  ${k.padEnd(13)} ${v.help}`);
  out("\n자세한 사용법은 docs/02_사용법.md");
}
function parseArgs(argv) {
  const a = { batch: "." }; let i = 0;
  while (i < argv.length && argv[i].startsWith("-")) {
    if (argv[i] === "-b" || argv[i] === "--batch") { a.batch = argv[i + 1]; i += 2; }
    else if (argv[i] === "-h" || argv[i] === "--help") { usage(); process.exit(0); }
    else die(`알 수 없는 옵션: ${argv[i]}`, 2);
  }
  a.cmd = argv[i++]; if (!a.cmd) { usage(); process.exit(2); }
  const sp = SPEC[a.cmd]; if (!sp) die(`알 수 없는 명령: ${a.cmd} (가능: ${Object.keys(SPEC).join(", ")})`, 2);
  const pos = [];
  while (i < argv.length) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const k = t.slice(2), o = sp.opts[k]; if (!o) die(`${a.cmd}: 알 수 없는 옵션 --${k}`, 2);
      if (o.flag) { a[k] = true; i++; continue; }
      const v = argv[i + 1]; if (v === undefined) die(`--${k} 값이 필요해요`, 2);
      if (o.choices && !o.choices.includes(v)) die(`--${k}: ${v} 는 선택지에 없음 (${o.choices.join(", ")})`, 2);
      a[k] = o.int ? parseInt(v, 10) : o.float ? parseFloat(v) : v; if ((o.int || o.float) && isNaN(a[k])) die(`--${k}: 숫자가 필요해요`, 2);
      i += 2;
    } else { pos.push(t); i++; }
  }
  if (pos.length !== sp.pos.length) die(`${a.cmd}: 인자 ${sp.pos.length}개 필요 (${sp.pos.join(", ")}), 받은 것 ${pos.length}개`, 2);
  sp.pos.forEach((k, j) => { a[k] = pos[j]; const ch = sp.posChoices && sp.posChoices[k]; if (ch && !ch.includes(pos[j])) die(`${k}: ${pos[j]} 는 선택지에 없음 (${ch.join(", ")})`, 2); });
  for (const [k, o] of Object.entries(sp.opts)) { if (a[k] === undefined) { if (o.req) die(`${a.cmd}: --${k} 가 필요해요`, 2); if ("def" in o) a[k] = o.def; else if (o.flag) a[k] = false; } }
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2)), B = a.batch;
  if (a.cmd === "packs") {
    for (const fn of fs.readdirSync(PACKS_DIR).sort()) { const pk = readJ(path.join(PACKS_DIR, fn)); out(`${pk.id.padEnd(10)} ${pk.name} — ${pk.desc}`); }
    return;
  }
  if (a.cmd === "lint") { out(dumps(lintHook(a.text))); return; }
  if (a.cmd === "init") {
    fs.mkdirSync(B, { recursive: true });
    if (exists(path.join(B, "project.json"))) die("이미 project.json 있음");
    loadPack(a.pack);
    const P = readJ(path.join(SKILL_DIR, "templates", "project.json"));
    Object.assign(P, { name: a.name, count: a.count, packId: a.pack, created: today(), subject: { url: a.url, name: a.subject, notes: a.notes, rel: a.rel } });
    save(B, P); fs.copyFileSync(path.join(SKILL_DIR, "templates", "rules.json"), path.join(B, "rules.json"));
    fs.mkdirSync(path.join(B, "assets"), { recursive: true });
    out(`배치 생성: ${path.resolve(B)} (팩 ${a.pack}, ${a.count}편)`); return;
  }

  const P = load(B), pk = loadPack(P.packId, B), rules = loadRules(B);

  if (a.cmd === "sourcing") {
    for (const kv of a.answers.split(",")) { const [k, v] = kv.split("="); P.sourcing.checks[k.trim()] = (v || "").trim(); }
    if (a.show) P.sourcing.show = a.show; save(B, P);
    const bad = pk.sourcing.filter(c => P.sourcing.checks[c.id] === "n"), miss = pk.sourcing.filter(c => !(c.id in P.sourcing.checks));
    for (const c of pk.sourcing) out({ y: "✔", n: "✘", alt: "△" }[P.sourcing.checks[c.id]] || "?", c.q);
    if (bad.length) { out("\n중단: ✘ 항목이 있어요. 소재를 바꾸거나 대체(alt) 방안을 정하세요."); process.exit(2); }
    if (miss.length) { out("\n미판정:", miss.map(c => c.q).join("; ")); process.exit(2); }
    out("\n소싱 통과 →", P.sourcing.show || "(보여줄 것 미정 — --show 로 적어주세요)");
  } else if (a.cmd === "prompt") {
    out(a.kind === "research" ? researchPrompt(P, pk, rules) : planPrompt(P, pk, rules));
  } else if (a.cmd === "ingest") {
    const j = readJ(a.file);
    if (a.kind === "research") {
      const r = P.research;
      for (const x of j.pains || []) r.pains.push({ quote: x.quote || "", src: x.src || "", lv: x.lv ?? 3, hook: x.hook || "" });
      for (const t of j.trends || []) r.trends.push({ type: t.type || "", src: t.src || "", note: t.note || "" });
      if (j.banned_add && j.banned_add.length) r.bannedExtra = [r.bannedExtra || "", ...j.banned_add].filter(Boolean).join(", ");
      const nosrc = r.pains.filter(x => !x.src).length;
      out(`리서치 반영: 발화 ${r.pains.length}건(출처 없음 ${nosrc}), 트렌드 ${r.trends.length}건`);
      if (nosrc) out("△ 출처 없는 발화가 있어요 — R-001: 발화 100%에 출처");
    } else {
      if (!Array.isArray(j)) die("배열이 아님");
      P.plans = j.map(x => ({ id: uid(), hook: x.hook || pk.hooks[0].id, thumb: x.thumb || "", title: x.title || "",
        lines: (x.lines || []).map(l => ({ text: l.text || "", shot: l.shot || "", strong: !!l.strong })),
        desc: x.desc || "", tags: x.tags || [], tiktok: x.tiktok || "", insta: x.insta || "", scenes: [], voiceId: null }));
      out(`플랜 ${P.plans.length}편 반영`);
      const hooks = P.plans.map(p => p.hook);
      if (new Set(hooks).size < hooks.length) out("△ 훅 유형 중복 — R-002: 편마다 다르게");
      const valid = pk.hooks.map(h => h.id);
      hooks.forEach((hk, i) => { if (!valid.includes(hk)) out(`△ ${i + 1}편 훅 id '${hk}'는 이 팩에 없음 (가능: ${[...valid].sort().join(", ")})`); });
    }
    save(B, P);
  } else if (a.cmd === "template") {
    P.plans = templatePlans(P, pk); save(B, P); out(`${P.plans.length}편 템플릿 생성 — 뼈대입니다. 문장을 다듬고 check 하세요`);
  } else if (a.cmd === "check") {
    const idxs = a.plan === 0 ? P.plans.map((_, i) => i) : [a.plan - 1];
    const ok = idxs.map(i => reportPlan(P, pk, i, P.plans[i])).every(Boolean); save(B, P);
    out(ok ? "\n전체 통과" : "\n오류 있음 — 발행 불가"); process.exit(ok ? 0 : 1);
  } else if (a.cmd === "asset") {
    const aid = "a" + uid().slice(0, 4);
    P.assets.push({ id: aid, name: path.basename(a.file), path: path.resolve(a.file), role: a.role, rights: a.rights });
    save(B, P); out(`소재 ${aid}: ${a.file} · ${a.role} · ${a.rights}`);
  } else if (a.cmd === "scene") {
    const pl = P.plans[a.plan - 1], sc = scenesOf(pl, pk);
    for (const kv of a.map.split(",")) { const [k, v] = kv.split("="); sc[parseInt(k) - 1].asset = (v || "").trim(); }
    save(B, P); reportPlan(P, pk, a.plan - 1, pl); save(B, P);
  } else if (a.cmd === "export") {
    const o = a.out || path.join(B, "exports"), idxs = a.plan === 0 ? P.plans.map((_, i) => i) : [a.plan - 1];
    for (const i of idxs) exportAll(B, P, pk, i, o);
    export050(P, pk, o); save(B, P);
    out("factory_N.md → 영상 제작 스킬(shopping-shorts-factory)에 넘기는 대본 / script_N.json·script_045_N.txt → 다른 렌더 도구용 / publish_N.md → 발행 문구 / research.md·content_plan.md → 기획 문서");
  } else if (a.cmd === "publish-text") {
    const [yt, tt, ig, th] = publishText(P, pk, P.plans[a.plan - 1]);
    out("=== YouTube ===\n" + yt + "\n\n=== TikTok ===\n" + tt + "\n\n=== Instagram ===\n" + ig + "\n\n=== Threads ===\n" + th);
  } else if (a.cmd === "approve") {
    const pl = P.plans[a.plan - 1], c = checkPlan(P, pk, pl), s = sceneCheck(P, pk, pl);
    if (c.errs.length || s.errs.length || pl.lines.map(l => l.text).join("").includes("[확인 필요]")) die("승인 불가: 검사 오류 또는 [확인 필요] 남음 — check 먼저");
    P.approvals.push({ plan: pl.id, at: nowMin() }); save(B, P); out(`굿 기록 — ${a.plan}편. 이제 gates → upload`);
  } else if (a.cmd === "gates") {
    const [g] = pubGates(B, P, pk, P.plans[a.plan - 1], a.video, a.cap, a.gap); save(B, P);
    for (const [name, ok] of g) out(ok ? "✔" : "✘", name);
    const allok = g.every(x => x[1]); out(allok ? "\n게이트 전부 통과 — upload 가능" : "\n막힘 — ✘ 항목 해결 전 업로드 금지"); process.exit(allok ? 0 : 1);
  } else if (a.cmd === "upload") {
    const [g] = pubGates(B, P, pk, P.plans[a.plan - 1], a.video, 2, 6);
    if (!g.every(x => x[1])) { for (const [name, ok] of g) if (!ok) out("✘", name); die("게이트 미통과 — 업로드 중단"); }
    if (a.privacy === "public" && a["yes-public"] !== "공개") die("즉시 공개는 --yes-public 공개 를 함께 넣어야 합니다 (기본은 비공개)");
    const m = ytMeta(P, pk, P.plans[a.plan - 1]);
    out(`업로드: ${m.title} / ${a.privacy}${a["publish-at"] ? " / 예약 " + a["publish-at"] : ""} / ${a.video}`);
    await upload(B, P, pk, a.plan - 1, a.video, a.privacy, a["publish-at"], a.synthetic);
  } else if (a.cmd === "perf") {
    const pl = P.plans[a.plan - 1]; let f = P.perf.find(x => x.plan === pl.id);
    if (!f) { f = { plan: pl.id, date: "", v48: "", stay: "", avg: "", click: "", conv: "", v7: "" }; P.perf.push(f); }
    for (const k of ["date", "v48", "stay", "avg", "click", "conv", "v7"]) if (a[k] !== undefined) f[k] = a[k];
    save(B, P); out("성과 기록:", JSON.stringify(f).replace(/":/g, '": ').replace(/,"/g, ', "'));
  } else if (a.cmd === "winner") {
    const wn = winner(P); if (!wn) die("48h 조회가 입력된 편이 2개 미만");
    const hooks = Object.fromEntries(pk.hooks.map(h => [h.id, h.name])), hn = pl => hooks[pl.hook] || pl.hook, b = wn.best, wst = wn.worst, core = scenesOf(b[0], pk)[0].sec;
    out(`n=${wn.n} 승자: ${b[0].title} (${hn(b[0])}) 점수 ${pyRound(score(b[1]))}`);
    out(`      패자: ${wst[0].title} (${hn(wst[0])}) 점수 ${pyRound(score(wst[1]))}`);
    out(`\n[규칙 후보] 이 소재는 ${hn(b[0])} 훅, 1번 컷 ${fmtSec(core)}초가 48h 기준 우세. 다음 배치에서 재현되면 규칙으로 올린다 (R-007).`);
    out("점수식은 가설: v48×(1+stay/100) + click×20 + conv×200");
  } else if (a.cmd === "retention") {
    const pl = P.plans[a.plan - 1], r = analyzeRet(parseRet(fs.readFileSync(a.csv, "utf8")), pl, pk, a.unit);
    if (!r) die("숫자 열 2개 이상, 4행 이상 필요");
    out(`훅 구간(첫 ${fix1(r.hw)}초) 이탈 ${fix1(r.lost)}%p · 끝 유지 ${fix1(r.end)}% · 중간 하락 ${pyRound(r.slide, 2).toFixed(2)}%p/초 (롱폼 기준 훅 이탈 25% 미만이 건강 — 쇼츠는 미보정)`);
    for (const c of r.cl) out(`  ${fix1(c.t)}초 · −${fix1(c.d)}%p · ${c.i + 1}번 대사: "${c.text}"`);
    if (r.cl.length) { const c0 = r.cl[0]; out(`\n[규칙 후보] ${pl.title.slice(0, 24)}: ${fix1(c0.t)}초(${c0.i + 1}번 대사 "${c0.text.slice(0, 24)}")에서 ${fix1(c0.d)}%p 급락. 후보일 뿐 — 2편 이상 반복 + ㅇㅇ 뒤에 규칙.`); }
    save(B, P);
  } else if (a.cmd === "calibrate") {
    const rows = [];
    for (const pl of P.plans) { const f = P.perf.find(x => x.plan === pl.id), h = lintHook(pl.lines.length ? pl.lines[0].text : ""); if (h && f && String(f.v48 ?? "") !== "") rows.push([h.v, parseFloat(f.v48)]); }
    if (rows.length < 5) { out(`n=${rows.length} — 5편 전엔 계산 안 함. 린트는 체크리스트로만.`); return; }
    const rho = spearman(rows.map(r => r[0]), rows.map(r => r[1]));
    const verdict = rows.length < 10 ? "(표본 10 미만 — 결론 보류)" : (rho < .3 ? "→ 약함: 가중치 폐기, 체크리스트로만" : "→ 쓸 만함");
    out(`n=${rows.length}, 훅 린트 vs 48h 조회 ρ=${pyRound(rho, 2).toFixed(2)} ${verdict}`);
  } else if (a.cmd === "rule") {
    const rid = `R-${String(rules.length + 1).padStart(3, "0")}`;
    rules.push({ id: rid, stage: a.stage, rule: a.text, check: a.check, source: a.source, added: today(), hits: 0 });
    fs.writeFileSync(path.join(B, "rules.json"), dumps(rules), "utf8"); out(`${rid} 추가 (${a.stage}) — rules.json은 050 하네스와 호환`);
  }
}
main().catch(e => die(String(e.stack || e)));
