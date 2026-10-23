#!/usr/bin/env python3
"""바이럴 쇼츠 스튜디오 CLI — 051 앱(index.html)의 판정·내보내기 로직을 그대로 이식.

판정은 LLM 판단이 아니라 이 코드로만 한다(결과가 날마다 흔들리지 않게).
상태 파일: <batch>/project.json (앱의 프로젝트 모델과 같은 필드)
"""
import argparse, json, os, re, sys, subprocess, shutil, datetime, uuid, time

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS_DIR = os.path.join(SKILL_DIR, "packs")
LV = ["1차(리뷰·문의 원문)", "커뮤니티·후기", "기사·2차 인용", "미확인"]
REL_DISC = {"own": "판매자가 직접 제작한 영상입니다",
            "affiliate": "쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다",
            "client": "광고주로부터 제작비를 지원받았습니다", "none": ""}
MARK = re.compile(r"\s*\[확인 필요\]")


def today():
    return datetime.date.today().isoformat()


def uid():
    return uuid.uuid4().hex[:8]


# ---------- 상태 ----------
def load(batch):
    p = os.path.join(batch, "project.json")
    if not os.path.exists(p):
        sys.exit(f"project.json 없음: {p} — 먼저 `vss.py init` 실행")
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(batch, P):
    with open(os.path.join(batch, "project.json"), "w", encoding="utf-8") as f:
        json.dump(P, f, ensure_ascii=False, indent=2)


def load_pack(pid, batch=None):
    cands = []
    if batch:
        cands.append(os.path.join(batch, "pack.json"))  # 배치 전용 팩(복제·편집본)
    cands.append(os.path.join(PACKS_DIR, pid + ".json"))
    for c in cands:
        if os.path.exists(c):
            with open(c, encoding="utf-8") as f:
                pk = json.load(f)
            if pk.get("id") == pid or c.endswith("pack.json"):
                return pk
    sys.exit(f"팩 없음: {pid} (packs/: {', '.join(sorted(x[:-5] for x in os.listdir(PACKS_DIR)))})")


def load_rules(batch):
    for c in [os.path.join(batch, "rules.json"), os.path.join(SKILL_DIR, "templates", "rules.json")]:
        if os.path.exists(c):
            with open(c, encoding="utf-8") as f:
                return json.load(f)
    return []


def banned_list(P, pk):
    ex = [s.strip() for s in (P["research"].get("bannedExtra") or "").split(",") if s.strip()]
    return list(pk.get("banned", [])) + ex


# ---------- 길이·장면 ----------
def est_sec(plan):
    ch = len(re.sub(r"\s", "", "".join(l["text"] for l in plan["lines"])))
    return round(ch / 4.5)


def scenes_of(plan, pk):
    if not plan.get("scenes") or len(plan["scenes"]) != len(plan["lines"]):
        chars = [len(re.sub(r"\s", "", l["text"])) + 2 for l in plan["lines"]]
        s = sum(chars) or 1
        tot = max(pk["duration"][0], est_sec(plan))
        old = plan.get("scenes") or []
        plan["scenes"] = [{"asset": (old[i]["asset"] if i < len(old) else ""), "sec": round(chars[i] / s * tot, 1)}
                          for i in range(len(plan["lines"]))]
    return plan["scenes"]


# ---------- 훅 린트 (056 포팅, 보정 전 휴리스틱) ----------
JOSA = re.compile(r"(으로서|으로써|에게서|이라는|라는|에서|에게|으로|부터|까지|처럼|보다|이나|하고|은|는|이|가|을|를|의|에|도|로|와|과|만|께)$")
NUM = re.compile(r"\d[\d,.]*\s?(%|퍼센트|개월|개|명|원|억|만|천|배|위|편|번|시간|분|초|일|주|달|년|세|살|대)?|[일이삼사오륙육칠팔구십백천만억]+\s?(개월|개|명|원|억|배|시간|분|일|주|년)")
VAGUE = ['미친', '충격', '대박', '역대급', '놀라운', '엄청', '어마어마', '비밀', '완벽', '최고', '궁극', '혁명', '레전드', '소름', '경악', '실화', '폭로']
YOU = re.compile(r"(당신|여러분|대표님|사장님|임원|[3-7]0대|은퇴|퇴직|직장인|부모님|님[,\s]|너)")
STAKE = re.compile(r"(잃|손해|낭비|놓치|위험|비용|늦|후회|망(하|합|친)|포기|못 ?(하|합|해)|전에|멈추|절대|마지막|뒤처|도태|사라지|끝났|끝나)")
CURIO = re.compile(r"(왜|어떻게|무엇|뭘|뭐가|어떤|아무도|몰랐|진짜|사실|딱|단 하나|이유|정체|반전|알고 ?보니|\?)")
CLOSED = re.compile(r"(때문에|그래서|알려드립니다|알려 ?드릴게요|소개합니다|설명합니다|정리했습니다)")
GREET = re.compile(r"^\s*(안녕하세요|여러분 ?안녕|환영합니다|오늘은|이번 영상은|오늘도)")
FORM = {
    "The Statistic": [r"\d+\s?(%|퍼센트)", r"\d+\s?(명|개|곳)\s?(중|가운데)", r"(대부분|절반|10명 중)"],
    "Someone Else's Result": [r"에서\s?\S*\s?(까지|로)\s?(늘|올|성장|매각|달성)", r"\d+\s?(억|만|배)\s?(매각|달성|벌)", r"(CEO|대표|창업자|공동창업자)\S*\s?(가|이)\s?(인정|말)"],
    "The Mistake": [r"(틀렸|잘못|실수|착각|오해)", r"(때문에|이유)\s?.*(안|못|않)", r"(하고 ?있(다면|는))"],
    "Contrarian Flip": [r"(다들|모두|누구나|흔히)\s?.*(하지만|그런데|아닙니다|틀렸)", r"(오히려|반대로)", r"(아니라)"],
    "The Reveal": [r"(보여\s?드리|공개|직접 보)", r"(화면|프롬프트|파일).*(그대로|전부|통째)", r"(통째로|전부)\s?(공개|풀)"],
    "The Superlative": [r"(가장|제일|최고|최악|최단|최초)", r"(1위|넘버원)"],
    "The Clock": [r"\d+\s?(분|초|시간|일)\s?(안에|만에|동안|이면|뒤)", r"(하루|한 ?주|일주일)\s?(만에|안에)"],
    "I Tried It": [r"(해봤|써봤|따라해|직접 \S+해)", r"\d+\s?(일|주|개월)\s?(동안|간)", r"(맡겨|돌려)\s?봤"],
    "The Question": [r"\?\s*$", r"(왜|어떻게|뭐가|무엇이)\s?\S+"],
    "Before and After": [r"(전|이전)\s?.*(후|이후)", r"(처음엔|예전엔).*(지금은|이제는)", r"(바꿨더니|바꾸고 나서)"],
    "The Teardown": [r"(분석|해부|뜯어|파헤|비교|따져)", r"\d+\s?(개|편|명)\s?(을|를)?\s?(분석|조사|뜯어|비교)"],
    "The Stack": [r"(조합|같이 쓰|함께 쓰)"],
    "The Warning": [r"(하지 ?마|마세요|말고|전에 )", r"(위험|주의|경고|손해|조심)", r"(모르면|안 보면)"],
    "The List": [r"^\s?\S*\d+\s?(가지|개|단계|명|편|선)", r"(\d+|[일이삼사오육칠팔구십]+)\s?(가지|개|단계)"],
    "The Receipt": [r"(캡처|화면|통장|대시보드|스크린샷|영수증)", r"(실제|진짜)\s?.*(수치|숫자|화면|결과)"],
    "The Insider": [r"(내부|업계|현직|아무도 말 ?안|알려주지 않)", r"(숨겨진|숨은)"],
    "The Impossible Claim": [r"(없이도|하나도 안)", r"(혼자서|혼자)\s?.*(만에|개월)"],
    "The Comparison": [r"\bvs\b|VS|대\s", r"(비교|둘 중|세 가지 방법|3가지로)", r"(이긴|승자|결과는)"],
    "The Origin": [r"(시작은|출발은|처음 시작)", r"(매번|항상)\s?.*(같은|똑같)"],
    "The Deadline": [r"\d+\s?월\s?\d*\s?일?", r"(이번 ?(달|주)|올해|내년|곧)\s?.*(바뀝|끝납|종료|사라)", r"(마감|종료|폐지|변경)"],
    "The Direct Address": [r"^\s?\S*(대표님|사장님|임원|[3-7]0대|은퇴|직장인)", r"(분들?께|하는 ?분|라면)\s?"],
}
FIX = {'구체성': '형용사 하나를 숫자·이름·날짜로', '호명': '첫 4어절 안에 호명(대표님/50대/…)',
       '손실·위험': '지금 방식을 유지하면 잃는 것 한 줄', '호기심': '스스로 답을 말해버리는 절반을 자른다', '간결성': '6~16어절로'}


def eoj(t):
    return re.findall(r"[가-힣A-Za-z0-9%$.,]+", t)


def stem(w):
    w = re.sub(r"^[.,]+|[.,]+$", "", w)
    if len(w) >= 3:
        w = JOSA.sub("", w) or w
    return w.lower()


def clamp(v):
    return max(0, min(100, v))


def cnt(re_, t):
    return len(re_.findall(t))


def lint_hook(t):
    t = (t or "").strip()
    if not t:
        return None
    parts = {
        '구체성': clamp(34 + min(cnt(NUM, t), 3) * 22 - sum(t.count(v) for v in VAGUE) * 16
                     + min(18, 6 * len(re.findall(r"\b[A-Z][A-Za-z0-9]{1,}\b", t)))
                     + (8 if re.search(r"[「『《“\"'‘].+[」』》”\"'’]", t) else 0)),
        '호명': clamp(26 + cnt(YOU, t) * 20 + (30 if YOU.search(" ".join(eoj(t)[:4])) else 0)),
        '손실·위험': clamp(22 + cnt(STAKE, t) * 26 + (14 if cnt(NUM, t) else 0)),
        '호기심': clamp(24 + cnt(CURIO, t) * 17 + (18 if t.endswith("?") else 0) + (-18 if CLOSED.search(t) else 0)),
    }
    n = len(eoj(t))
    parts['간결성'] = 0 if not n else (100 if 6 <= n <= 16 else (max(30, 100 - (6 - n) * 14) if n < 6 else max(10, 100 - (n - 16) * 8)))
    vals = list(parts.values())
    v = round(.6 * (sum(vals) / len(vals)) + .4 * min(vals))
    if GREET.search(t):
        v = max(0, v - 15)
    best, hits = "미분류", 0
    for name, ps in FORM.items():
        h = sum(1 for p in ps if re.search(p, t))
        if h > hits:
            best, hits = name, h
    low = min(parts, key=parts.get)
    band = "STRONG" if v >= 72 else "WORKABLE" if v >= 55 else "WEAK"
    return {"parts": parts, "v": v, "band": band, "formula": best, "hits": hits, "weak": low, "fix": FIX[low],
            "vague": [w for w in VAGUE if w in t], "greet": bool(GREET.search(t))}


def lint_title(t, thumb):
    t = (t or "").strip()
    issues = []
    n = len(t)
    if n > 100:
        issues.append(f"제목 {n}자 (한도 100)")
    elif n > 60:
        issues.append(f"제목 {n}자 — 데스크톱 60자 근처에서 잘림")
    v = [w for w in VAGUE if w in t]
    if v:
        issues.append(f"제목 과장어 {','.join(v)}")
    if not NUM.search(t):
        issues.append("제목에 숫자·날짜 없음")
    if thumb:
        tw = {stem(x) for x in eoj(t)}
        hw = [stem(x) for x in eoj(thumb)]
        sh = sorted({y for y in hw if any(x == y or (len(x) >= 2 and len(y) >= 2 and (y in x or x in y)) for x in tw)})
        if sh:
            issues.append(f"썸네일이 제목과 겹침: {','.join(sh)}")
        if len(eoj(thumb)) > 4 or len(re.sub(r"\s", "", thumb)) > 14:
            issues.append("썸네일 문구 4어절/14자 초과")
    return issues


# ---------- 플랜 검사 ----------
def check_plan(P, pk, plan):
    bl = banned_list(P, pk)
    errs, warns = [], []
    txt = " ".join([plan.get("title", ""), plan.get("thumb", ""), plan.get("desc", ""), plan.get("tiktok", ""),
                    plan.get("insta", "")] + [l["text"] for l in plan["lines"]] + list(plan.get("tags") or []))
    for b in bl:
        if b in txt:
            errs.append(f'금지어 "{b}"')
    strong = sum(1 for l in plan["lines"] if l.get("strong"))
    if strong != 1:
        errs.append(f"센 문장 {strong}개 (1개여야)")
    sec = est_sec(plan)
    if sec < pk["duration"][0] - 5 or sec > pk["duration"][1] + 5:
        warns.append(f"추정 {sec}초 (목표 {pk['duration'][0]}~{pk['duration'][1]})")
    if not re.search(r"핵심|제품|결과|현장|등장", (plan["lines"][0].get("shot") if plan["lines"] else "") or ""):
        warns.append(f"1번 컷에 핵심 등장 표시 없음 (첫 {pk['coreAppearSec']}초)")
    if pk.get("disclosure") and pk["disclosure"][:6] not in (plan.get("desc") or ""):
        errs.append("설명에 표기 문구 없음")
    if len(plan.get("tags") or []) < 5:
        warns.append(f"태그 {len(plan.get('tags') or [])}개 (10개 권장)")
    if "[확인 필요]" in txt:
        warns.append("[확인 필요] 남아 있음 — 발행 전 제거")
    nums = re.findall(r"[0-9][0-9,.]*", " ".join(l["text"] for l in plan["lines"]))
    if nums and not any(x.get("src") for x in P["research"]["pains"]):
        warns.append("대사에 숫자 있는데 출처 있는 발화가 없음")
    # 린트는 경고로만
    h = lint_hook(plan["lines"][0]["text"] if plan["lines"] else "")
    if h:
        plan["_lint"] = {"hook": h["v"], "formula": h["formula"]}
        if h["greet"]:
            warns.append('훅이 인사·"오늘은 ~"로 시작 (요약문이 됨)')
        if h["vague"]:
            warns.append(f"훅 과장어 {','.join(h['vague'])}")
        if h["v"] < 45:
            warns.append(f"훅 린트 {h['v']}점({h['band']}) — 약한 곳: {h['weak']} → {h['fix']} [보정 전 휴리스틱]")
    warns += lint_title(plan.get("title"), plan.get("thumb"))
    return {"errs": errs, "warns": warns, "sec": sec, "lint": h}


def scene_check(P, pk, plan):
    sc = scenes_of(plan, pk)
    errs, warns = [], []
    tot = sum(s["sec"] for s in sc)
    assets = {a["id"]: a for a in P["assets"]}
    a0 = assets.get(sc[0]["asset"]) if sc else None
    if not a0:
        errs.append("1번 컷 소재 없음")
    elif not re.search(r"정면|사용|현장|화면|비교", a0.get("role", "")):
        warns.append(f'1번 컷 역할 "{a0.get("role")}" — 핵심(정면·사용 장면·현장·화면)이 첫 {pk["coreAppearSec"]}초에')
    if sc and sc[0]["sec"] > pk["coreAppearSec"] + 1:
        warns.append(f"1번 컷 {sc[0]['sec']}초 — 핵심 등장이 {pk['coreAppearSec']}초를 넘길 수 있음")
    miss = sum(1 for s in sc if not s["asset"])
    if miss:
        warns.append(f"소재 미지정 {miss}컷 (검정 화면)")
    unk = sum(1 for s in sc if s["asset"] in assets and assets[s["asset"]].get("rights") == "미확인")
    if unk:
        errs.append(f"권리 미확인 소재 {unk}개 사용 — R-005")
    if tot < pk["duration"][0] - 5 or tot > pk["duration"][1] + 5:
        warns.append(f"총 {tot:.1f}초 (목표 {pk['duration'][0]}~{pk['duration'][1]})")
    return {"errs": errs, "warns": warns, "tot": tot}


def gram_set(plan):
    s = re.sub(r"\s", "", "".join(l["text"] for l in plan["lines"]))
    return {s[i:i + 3] for i in range(len(s) - 2)}


def sim_max(plan, others):
    """다른 편과 대사 3-gram 자카드 유사도 최댓값. others: (라벨, plan) 목록."""
    best = {"s": 0.0, "w": None}
    a = gram_set(plan)
    if len(a) < 5:
        return best
    for label, o in others:
        if o.get("id") == plan.get("id"):
            continue
        b = gram_set(o)
        if len(b) < 5:
            continue
        s = len(a & b) / len(a | b)
        if s > best["s"]:
            best = {"s": s, "w": label + " / " + (o.get("title") or "")[:20]}
    return best


def other_plans(batch, P):
    """같은 프로젝트 폴더 아래 다른 배치의 플랜까지 모아 중복 감지."""
    out = [(P["name"], pl) for pl in P["plans"]]
    parent = os.path.dirname(os.path.abspath(batch))
    for d in sorted(os.listdir(parent)):
        pj = os.path.join(parent, d, "project.json")
        if os.path.abspath(os.path.join(parent, d)) == os.path.abspath(batch) or not os.path.exists(pj):
            continue
        try:
            with open(pj, encoding="utf-8") as f:
                Q = json.load(f)
            out += [(Q["name"], pl) for pl in Q["plans"]]
        except Exception:
            pass
    return out


# ---------- 프롬프트(폴라가 직접 수행) ----------
def ctx(P, pk, rules):
    rl = "\n".join("- " + r["rule"] for r in rules if r["stage"] in ("ss-plan", "ss-clone", "ss-render"))
    s = P["subject"]
    return (f"[장르 팩] {pk['name']} — {pk['desc']}\n[소재] {s.get('name') or '(이름 없음)'} / {s.get('url')} / 관계: {s.get('rel')}\n"
            f"메모: {s.get('notes')}\n[보여줄 것] {P['sourcing'].get('show') or '(미정)'}\n[금지 표현] {', '.join(banned_list(P, pk))}\n"
            f"[표기 문구] {pk.get('disclosure') or '없음'}\n[길이] {pk['duration'][0]}~{pk['duration'][1]}초, 핵심은 첫 {pk['coreAppearSec']}초 안 등장\n[규칙 원장]\n{rl}")


def research_prompt(P, pk, rules):
    qs = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(pk["research"]))
    return ("너는 숏폼 리서처다. 아래 소재에 대해 \"만들기 전 절반\"을 한다. 상상으로 쓰지 말고, 실제로 확인한 공개 출처(리뷰·커뮤니티·기사·지침)만 쓰고 모르면 lv=3(미확인)으로 표시하라. "
            "WebSearch·WebFetch로 원문을 직접 확인한 것만 lv 0~2다.\n\n" + ctx(P, pk, rules) + f"\n\n[리서치 질문]\n{qs}\n\n출력은 JSON만:\n"
            '{"pains":[{"quote":"원문 요지","src":"URL 또는 출처명","lv":0|1|2|3,"hook":"쇼츠 훅 한 줄"}],"trends":[{"type":"유형","src":"URL","note":"메모"}],"banned_add":["이 소재에서 추가로 피할 표현"]}\npains는 5개 이상.')


def plan_prompt(P, pk, rules):
    r = P["research"]
    ref = ""
    if r.get("ref", {}).get("out"):
        o = r["ref"]["out"]
        ref = f"\n[레퍼런스 구조] 길이 {o.get('sec')}초, 문장 {o.get('n')}, 훅 {o.get('hookType')}, CTA {o.get('cta')}. 구조만 쓰고 문장은 새로."
    pains = "\n".join(f"{i + 1}. \"{x['quote']}\" ({x.get('src')}, {LV[int(x.get('lv', 3))]}) → 훅: {x.get('hook')}" for i, x in enumerate(r["pains"]))
    trends = "\n".join(f"- {t.get('type')} {t.get('src')} {t.get('note')}" for t in r["trends"])
    hooks = "\n".join(f"- {h['id']} {h['name']}: {h['formula']}" for h in pk["hooks"])
    return (f"너는 숏폼 기획자다. 리서치 결과로 {P['count']}편의 콘텐츠 플랜을 쓴다. 편마다 훅 유형을 다르게 하고, 첫 문장은 리서치 발화를 변형해서 쓴다. "
            "대사는 3~5문장, 그중 \"가장 센 문장\" 하나만 strong=true. 숫자는 리서치에 있는 것만. 금지 표현 0개. 표기 문구는 설명과 플랫폼 문구에 포함.\n\n"
            + ctx(P, pk, rules) + ref + f"\n\n[리서치 발화]\n{pains}\n[트렌드]\n{trends}\n[훅 유형 목록]\n{hooks}\n\n출력은 JSON 배열만:\n"
            '[{"hook":"훅 id","thumb":"썸네일 카피 8자 내","title":"제목","lines":[{"text":"대사","shot":"화면 설명","strong":false}],"desc":"유튜브 설명","tags":["태그 10개"],"tiktok":"틱톡 문구","insta":"인스타 문구"}]')


# ---------- 템플릿 플랜(키·AI 없이 뼈대) ----------
def template_plans(P, pk):
    pains = [x for x in P["research"]["pains"] if x.get("quote")]
    if not pains:
        sys.exit("리서치 발화가 없어요. research.pains에 3건 이상 먼저")
    name = P["subject"].get("name") or "이것"
    show = P["sourcing"].get("show") or "사용 장면"
    disc = pk.get("disclosure", "")
    url = P["subject"].get("url", "")
    hooks = pk["hooks"]
    out = []
    for i in range(P["count"]):
        h = hooks[i % len(hooks)]
        pa = pains[i % len(pains)]
        q = re.sub(r"[.。]$", "", pa["quote"])
        unv = " [확인 필요]" if int(pa.get("lv", 3)) == 3 else ""
        first = {
            "problem": f"{q}, 솔직히 그렇지 않으세요?", "situation": f"{q}. 그래서 저는 이렇게 합니다.", "question": f"{q}, 왜 그럴까요?",
            "unboxing": f"{name} 박스를 열면 이게 들어 있습니다.", "compare": f"{name}, 뭐가 다르냐고 많이 물으세요.", "wow": f"와, {name} 이건 진짜 {show}네요.",
            "myth": f"{q}? 그렇지 않습니다.", "result": f"{q}, 그다음에 생기는 일.", "reframe": f"{q}, 사실은 다른 문제예요.",
            "checklist": f"이 중 두 개면 {name} 이야기를 들어보세요.", "number": f"{q}.", "before": f"전에는 {q}.", "quote": f"\"{q}\"라는 말을 들었습니다.",
            "decision": f"{q}. 그날 결정했습니다.", "routine": f"매일 {q}.", "beforeafter": f"왼쪽이 전, 오른쪽이 후예요. {q}.", "list": f"{name} 쓰는 분들 필수 3가지.",
            "timer": f"{q}, 몇 초 걸리는지 보세요.", "who": f"{q}인 분만 보세요.", "proof": f"\"{q}\" — 수강생이 한 말입니다.", "demo": f"{q}, 1분만 직접 보여드릴게요.",
            "scene": f"{q}.", "owner": f"\"{q}\" 사장님 말씀입니다.", "review": f"\"{q}\" 후기 그대로입니다.", "daily": f"{q}.",
            "diagnose": f"{q} 회사들의 공통점이 있습니다.", "case": f"{q}.",
        }.get(h["id"], f"{q}.")
        parts = h["formula"].split("→")
        third = parts[2].strip() if len(parts) > 2 and parts[2].strip() else "한 가지만 더"
        desc = (pk.get("descTemplate") or "{name} — {show}. {disclosure}").replace("{name}", name).replace("{show}", show) \
            .replace("{disclosure}", disc).replace("{url}", url).replace("{sources}", ", ".join([x["src"] for x in pains if x.get("src")][:2]))
        tags = []
        for t in [name.replace(" ", ""), h["name"]] + [s.strip().replace(" ", "") for s in re.split(r"[,·/]", show)][:3] + list(pk.get("tagSeeds") or []):
            if t and t not in tags and (len(t) <= 10):
                tags.append(t)
        out.append({"id": uid(), "hook": h["id"], "thumb": (pa.get("hook") or q)[:8], "title": f"{(pa.get('hook') or q)[:24]} ({name})",
                    "lines": [{"text": first + unv, "shot": f"0~{pk['coreAppearSec']}초: {show} (핵심 등장)", "strong": False},
                              {"text": f"그래서 {name}. {show}.", "shot": "핵심 동작/장면 클로즈업", "strong": True},
                              {"text": f"{third}: (여기에 근거 1개)", "shot": "보조 장면", "strong": False},
                              {"text": f"{(pk.get('cta') or ['링크는 프로필'])[0]}.", "shot": "엔딩, 루프", "strong": False}],
                    "desc": desc, "tags": tags[:10],
                    "tiktok": f"{first[:40]} #{name.replace(' ', '')} {'(' + disc + ')' if disc else ''}".strip(),
                    "insta": f"{first[:60]} — {show}. {disc}", "scenes": [], "voiceId": None})
    return out


# ---------- 발행 문구 ----------
def disc_for(P, pk):
    base = pk.get("disclosure") or ""
    rel = REL_DISC.get(P["subject"].get("rel"), "")
    seen = []
    for x in [base, rel]:
        if x and x not in seen:
            seen.append(x)
    return " · ".join(seen)


def publish_text(P, pk, pl):
    d = disc_for(P, pk)
    url = P["subject"].get("url", "")
    tags = " ".join("#" + t.replace(" ", "") for t in (pl.get("tags") or []))
    d_add = chr(10) + d if d and d not in pl['desc'] else ''
    yt = f"[제목]\n{pl['title']}\n\n[설명]\n{pl['desc']}\n{d_add}\n{chr(10) + url if url else ''}\n\n{tags}\n\n[고정 댓글]\n{(pk.get('cta') or [''])[0]} {url}{' (' + d + ')' if d else ''}"
    tt = f"{pl.get('tiktok', '')}\n{d if d and d not in pl.get('tiktok', '') else ''}\n{tags}"
    ig = f"{pl.get('insta', '')}\n{d if d and d not in pl.get('insta', '') else ''}\n.\n{tags}"
    th = f"{MARK.sub('', pl['lines'][0]['text']) if pl['lines'] else pl['title']} {url}"
    return yt, tt, ig, th


def yt_meta(P, pk, pl):
    d = disc_for(P, pk)
    tags = [t.replace(" ", "") for t in (pl.get("tags") or []) if t]
    desc = f"{pl['desc']}\n{chr(10) + d if d and d not in pl['desc'] else ''}{chr(10) + chr(10) + P['subject'].get('url', '') if P['subject'].get('url') else ''}".strip()
    if not re.search(r"#shorts", desc, re.I):
        desc += "\n\n#Shorts " + " ".join("#" + t for t in tags[:4])
    return {"title": pl["title"][:100], "desc": desc[:4900], "tags": tags[:15]}


# ---------- 발행 게이트 ----------
def ffprobe(path):
    if not shutil.which("ffprobe"):
        return None
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                              "-of", "json", path], capture_output=True, text=True, timeout=30).stdout
        j = json.loads(out)
        st = (j.get("streams") or [{}])[0]
        return {"w": int(st.get("width", 0)), "h": int(st.get("height", 0)), "dur": float(j.get("format", {}).get("duration", 0))}
    except Exception:
        return None


def pub_gates(batch, P, pk, pl, video, cap=2, gap_h=6):
    c = check_plan(P, pk, pl)
    s = scene_check(P, pk, pl)
    txt = "".join(l["text"] for l in pl["lines"]) + pl["title"] + pl["desc"]
    g = []
    g.append(("굿 승인 기록(approve)", any(a["plan"] == pl["id"] for a in P["approvals"])))
    g.append(("플랜 검사 오류 0", not c["errs"]))
    g.append(("장면표 검사 오류 0", not s["errs"]))
    g.append(("[확인 필요] 0", "[확인 필요]" not in txt))
    unk = sum(1 for a in P["assets"] if a.get("rights") == "미확인")
    g.append((f"소재 권리 미확인 0 (현재 {unk})", unk == 0))
    sim = sim_max(pl, other_plans(batch, P))
    g.append((f"다른 편과 대사 유사도 < 50% (최대 {round(sim['s'] * 100)}%{' · ' + sim['w'] if sim['w'] else ''})", sim["s"] < .5))
    up = P.get("uploads", {}).get(pl["id"])
    g.append(("이 편은 아직 업로드 안 함/결과 확정", not up or up.get("state") in ("failed", "verified-missing")))
    counted = ("done", "verified", "unknown")
    ups = [u for u in all_uploads(batch) if u.get("state") in counted]
    today_n = sum(1 for u in ups if u.get("day") == today())
    g.append((f"오늘 업로드 {today_n}/{cap}", today_n < cap))
    last = max([u.get("ts", 0) for u in ups] or [0])
    g.append((f"직전 업로드와 {gap_h}시간 간격", time.time() - last >= gap_h * 3600))
    g.append(("영상 파일 존재", bool(video) and os.path.exists(video)))
    meta = ffprobe(video) if video and os.path.exists(video) else None
    g.append((f"세로·180초 이하 (Shorts 조건{' · ' + str(meta) if meta else ' · ffprobe 없음/실패'})",
              bool(meta) and meta["h"] > meta["w"] and meta["dur"] <= 180))
    g.append(("YouTube 토큰(VSS_YT_TOKEN) 있음", bool(os.environ.get("VSS_YT_TOKEN"))))
    return g, c, s


def all_uploads(batch):
    out = []
    parent = os.path.dirname(os.path.abspath(batch))
    for d in os.listdir(parent):
        pj = os.path.join(parent, d, "project.json")
        if os.path.exists(pj):
            try:
                with open(pj, encoding="utf-8") as f:
                    out += list(json.load(f).get("uploads", {}).values())
            except Exception:
                pass
    return out


# ---------- 성과 ----------
def score(f):
    return float(f.get("v48") or 0) * (1 + float(f.get("stay") or 0) / 100) + float(f.get("click") or 0) * 20 + float(f.get("conv") or 0) * 200


def winner(P):
    rows = []
    for pl in P["plans"]:
        f = next((x for x in P["perf"] if x["plan"] == pl["id"]), None)
        if f and str(f.get("v48", "")) != "":
            rows.append((pl, f))
    if len(rows) < 2:
        return None
    rows.sort(key=lambda r: score(r[1]), reverse=True)
    return {"best": rows[0], "worst": rows[-1], "n": len(rows)}


def spearman(a, b):
    def rk(x):
        s = sorted(range(len(x)), key=lambda i: x[i])
        r = [0] * len(x)
        for k, i in enumerate(s):
            r[i] = k + 1
        return r
    ra, rb = rk(a), rk(b)
    n = len(a)
    d = sum((ra[i] - rb[i]) ** 2 for i in range(n))
    return 1 - 6 * d / (n * (n * n - 1))


def parse_ret(text):
    rows = []
    for line in text.splitlines():
        nums = []
        for c in line.split(","):
            c = re.sub(r'[%"\s]', "", c)
            try:
                nums.append(float(c))
            except ValueError:
                pass
        if len(nums) >= 2:
            rows.append((nums[0], nums[1]))
    return rows


def line_at(pl, pk, sec):
    sc = scenes_of(pl, pk)
    acc = 0
    for i, s in enumerate(sc):
        if sec < acc + s["sec"] or i == len(sc) - 1:
            return i, pl["lines"][i]["text"] if i < len(pl["lines"]) else ""
        acc += s["sec"]
    return 0, ""


def analyze_ret(rows, pl, pk, unit):
    dur = sum(s["sec"] for s in scenes_of(pl, pk)) or 30
    conv = (lambda x: x / 100 * dur) if unit == "pct" else (lambda x: x)
    r = sorted(((conv(x), y) for x, y in rows), key=lambda t: t[0])
    if len(r) < 4:
        return None
    hw = min(30, dur * .25)

    def at(t):
        v = r[0][1]
        for x, y in r:
            if x <= t:
                v = y
            else:
                break
        return v
    lost = r[0][1] - at(hw)
    drops = sorted(({"t": r[i][0], "d": r[i - 1][1] - r[i][1]} for i in range(1, len(r))), key=lambda d: -d["d"])
    cl = []
    for d in drops[:3]:
        if d["d"] > 0:
            i, txt = line_at(pl, pk, d["t"])
            cl.append({**d, "i": i, "text": txt})
    mid = [x for x in r if x[0] >= hw]
    slide = (mid[0][1] - mid[-1][1]) / max(1, mid[-1][0] - mid[0][0]) if len(mid) > 1 else 0
    return {"dur": dur, "hw": hw, "lost": lost, "cl": cl, "slide": slide, "end": r[-1][1]}


# ---------- 내보내기 ----------
def export_all(batch, P, pk, idx, outdir):
    pl = P["plans"][idx]
    os.makedirs(outdir, exist_ok=True)
    sc = scenes_of(pl, pk)
    assets = {a["id"]: a for a in P["assets"]}
    n = idx + 1
    # 048 script.json
    tone = {"problem": "problem-solve", "wow": "wow-reaction", "beforeafter": "before-after", "situation": "situation-vlog", "list": "list-ranking"}.get(pl["hook"], "problem-solve")
    o = {"product": {"name": P["subject"].get("name"), "link": P["subject"].get("url"), "notes": P["subject"].get("notes")}, "tone": tone,
         "reference": P["research"].get("ref", {}).get("url", ""), "title": pl["title"], "thumbnail": {"line1": pl.get("thumb", ""), "line2": "", "time": None}, "hero": None,
         "lines": [{"text": MARK.sub("", l["text"]), "shot": assets.get(sc[i]["asset"], {}).get("name", "") if i < len(sc) else ""} for i, l in enumerate(pl["lines"])],
         "description": {"title": pl["title"], "body": pl["desc"], "cta": (pk.get("cta") or [""])[0], "hashtags": ["#" + t.replace(" ", "") for t in pl.get("tags") or []]},
         "ad_label": pk.get("disclosure", ""), "rights": [{"file": a.get("name"), "role": a.get("role"), "rights": a.get("rights")} for a in P["assets"]]}
    w(os.path.join(outdir, f"script_{n}.json"), json.dumps(o, ensure_ascii=False, indent=2))
    # factory md (shopping-shorts-factory 입력)
    ls = [MARK.sub("", l["text"]) for l in pl["lines"]]
    shots = "\n".join(f"{i + 1}. {l.get('shot', '')}{' (★ 센 문장, 자막 크게)' if l.get('strong') else ''}" for i, l in enumerate(pl["lines"]))
    md = (f"# {pl['title']}\n\n> 장르 팩: {pk['name']} · 훅: {pl['hook']} · 목표 {pk['duration'][0]}~{pk['duration'][1]}초 · 720p\n> 표기: {pk.get('disclosure') or '없음'}\n\n"
          f"## Hook\n{ls[0] if ls else ''}\n\n## Body\n{chr(10).join(ls[1:-1])}\n\n## CTA\n{ls[-1] if ls else ''}\n\n## Shots\n{shots}\n\n## Thumbnail\n{pl.get('thumb', '')}\n\n"
          f"## Description\n{pl['desc']}\n{' '.join('#' + t for t in pl.get('tags') or [])}\n")
    w(os.path.join(outdir, f"factory_{n}.md"), md)
    # 045 txt
    w(os.path.join(outdir, f"script_045_{n}.txt"), "\n".join(ls) + "\n")
    # 발행 문구
    yt, tt, ig, th = publish_text(P, pk, pl)
    w(os.path.join(outdir, f"publish_{n}.md"), f"# 발행 문구 {n}편\n\n## YouTube\n```\n{yt}\n```\n\n## TikTok\n```\n{tt}\n```\n\n## Instagram\n```\n{ig}\n```\n\n## Threads\n```\n{th}\n```\n")
    return outdir


def export_050(P, pk, outdir):
    os.makedirs(outdir, exist_ok=True)
    r = P["research"]
    sym = {"y": "✔", "n": "✘", "alt": "△ 대체"}
    research = (f"# {P['name']} — 1단계 리서치 (바이럴 쇼츠 스튜디오 내보내기 {today()})\n\n## 소싱 판정\n"
                + "\n".join(f"- {c['q']} → {sym.get(P['sourcing']['checks'].get(c['id']), '미판정')}" for c in pk["sourcing"])
                + f"\n- 보여줄 것: {P['sourcing'].get('show')}\n\n## 발화 (근거)\n| # | 원문 | 출처 | 확인 | 훅 후보 |\n|---|---|---|---|---|\n"
                + "\n".join(f"| {i + 1} | {x['quote']} | {x.get('src')} | {LV[int(x.get('lv', 3))]} | {x.get('hook')} |" for i, x in enumerate(r["pains"]))
                + "\n\n## 트렌드\n" + "\n".join(f"- {t.get('type')} — {t.get('src')} {t.get('note')}" for t in r["trends"])
                + f"\n\n## 금지 표현\n{', '.join(banned_list(P, pk))}\n")
    hooks = {h["id"]: h["name"] for h in pk["hooks"]}
    plan = f"# {P['name']} — 2단계 콘텐츠 플랜 ({len(P['plans'])}편)\n\n" + "\n".join(
        f"## {i + 1}편 · {hooks.get(pl['hook'], pl['hook'])}\n- 썸네일 카피: **{pl.get('thumb', '')}**\n- 제목: {pl['title']}\n- 대사:\n"
        + "\n".join(f"  {j + 1}. {l['text']}{' ← 센 문장' if l.get('strong') else ''} `[장면: {l.get('shot', '')}]`" for j, l in enumerate(pl["lines"]))
        + f"\n- 유튜브 설명: {pl['desc']}\n- 태그: {', '.join(pl.get('tags') or [])}\n- 틱톡: {pl.get('tiktok', '')}\n- 인스타: {pl.get('insta', '')}\n"
        for i, pl in enumerate(P["plans"]))
    w(os.path.join(outdir, "research.md"), research)
    w(os.path.join(outdir, "content_plan.md"), plan)


def w(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print("  →", path)


# ---------- 업로드 (YouTube Data API, resumable) — 실제 OAuth 미검증 ----------
def upload(batch, P, pk, idx, video, privacy, publish_at, synthetic):
    import urllib.request
    tok = os.environ.get("VSS_YT_TOKEN")
    pl = P["plans"][idx]
    m = yt_meta(P, pk, pl)
    status = {"privacyStatus": privacy, "selfDeclaredMadeForKids": False}
    if publish_at:
        status["privacyStatus"] = "private"
        status["publishAt"] = publish_at
    if synthetic:
        status["containsSyntheticMedia"] = True
    body = json.dumps({"snippet": {"title": m["title"], "description": m["desc"], "tags": m["tags"], "categoryId": "22"}, "status": status}).encode()
    size = os.path.getsize(video)
    req = urllib.request.Request("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", data=body, method="POST",
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json; charset=UTF-8",
                                          "X-Upload-Content-Length": str(size), "X-Upload-Content-Type": "video/mp4"})
    rec = {"state": "unknown", "day": today(), "ts": time.time(), "video": video}
    P.setdefault("uploads", {})[pl["id"]] = rec
    save(batch, P)  # 결과 불명도 한도에 포함(중복 업로드 방지)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            loc = r.headers.get("Location")
        if not loc:
            raise RuntimeError("업로드 주소 없음")
        with open(video, "rb") as f:
            data = f.read()
        put = urllib.request.Request(loc, data=data, method="PUT", headers={"Content-Type": "video/mp4"})
        with urllib.request.urlopen(put, timeout=1800) as r:
            j = json.loads(r.read().decode())
        rec.update({"state": "done", "videoId": j.get("id")})
        save(batch, P)
        # 사후 검증
        vreq = urllib.request.Request(f"https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id={j.get('id')}", headers={"Authorization": "Bearer " + tok})
        with urllib.request.urlopen(vreq, timeout=60) as r:
            vj = json.loads(r.read().decode())
        if vj.get("items"):
            rec["state"] = "verified"
            print(f"업로드 검증 완료: https://youtu.be/{j.get('id')} ({vj['items'][0]['status'].get('privacyStatus')})")
        else:
            rec["state"] = "verified-missing"
            print("업로드 응답은 왔지만 videos.list에 없음 — 채널 스튜디오에서 확인")
    except Exception as e:
        print("업로드 실패/결과 불명:", str(e)[:200])
        print("상태는 unknown으로 남겼습니다. 재시도하지 말고 채널 최근 업로드를 먼저 대조하세요.")
    save(batch, P)


# ---------- 출력 도우미 ----------
def report_plan(P, pk, i, pl):
    c = check_plan(P, pk, pl)
    s = scene_check(P, pk, pl)
    hooks = {h["id"]: h["name"] for h in pk["hooks"]}
    mark = "✘" if c["errs"] or s["errs"] else "✔"
    print(f"\n[{i + 1}편] {mark} {hooks.get(pl['hook'], pl['hook'])} · 추정 {c['sec']}초 · 훅 린트 {c['lint']['v'] if c['lint'] else '-'}점({c['lint']['formula'] if c['lint'] else '-'})")
    print(f"  제목: {pl['title']}")
    for e in c["errs"]:
        print("  ✘ 플랜:", e)
    for e in s["errs"]:
        print("  ✘ 장면:", e)
    for x in c["warns"]:
        print("  △", x)
    for x in s["warns"]:
        print("  △ 장면:", x)
    return not (c["errs"] or s["errs"])


def main():
    ap = argparse.ArgumentParser(description="바이럴 쇼츠 스튜디오 CLI")
    ap.add_argument("--batch", "-b", default=".", help="배치 폴더(project.json 위치)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("init", help="배치 폴더 생성"); s.add_argument("name"); s.add_argument("--pack", required=True); s.add_argument("--count", type=int, default=5)
    s.add_argument("--subject", default=""); s.add_argument("--url", default=""); s.add_argument("--rel", default="own", choices=list(REL_DISC)); s.add_argument("--notes", default="")
    sub.add_parser("packs", help="팩 목록")
    s = sub.add_parser("sourcing", help="소싱 판정 기록"); s.add_argument("answers", help="id=y|n|alt,... 예: visible=y,reviews=alt,rights=y"); s.add_argument("--show", default="")
    s = sub.add_parser("prompt", help="리서치/플랜 요청문 출력(폴라가 직접 수행)"); s.add_argument("kind", choices=["research", "plan"])
    s = sub.add_parser("ingest", help="JSON 결과 반영"); s.add_argument("kind", choices=["research", "plans"]); s.add_argument("file")
    sub.add_parser("template", help="AI 없이 템플릿 플랜 생성")
    s = sub.add_parser("check", help="플랜·장면표 검사"); s.add_argument("--plan", type=int, default=0, help="1부터, 0=전부")
    s = sub.add_parser("lint", help="훅 한 문장 린트"); s.add_argument("text")
    s = sub.add_parser("asset", help="소재 등록"); s.add_argument("file"); s.add_argument("--role", required=True, help="정면/사용 장면/현장/화면/비교/보조"); s.add_argument("--rights", required=True, help="직접 촬영/판매자 제공/AI 생성/미확인")
    s = sub.add_parser("scene", help="장면표 소재 지정"); s.add_argument("--plan", type=int, required=True); s.add_argument("map", help="컷번호=소재id,... 예: 1=a1,2=a2")
    s = sub.add_parser("export", help="내보내기 (048·factory·045·발행문구) + 050 md"); s.add_argument("--plan", type=int, default=0); s.add_argument("--out", default="")
    s = sub.add_parser("publish-text", help="발행 문구 출력"); s.add_argument("--plan", type=int, required=True)
    s = sub.add_parser("approve", help="굿 승인 기록"); s.add_argument("--plan", type=int, required=True)
    s = sub.add_parser("gates", help="발행 게이트 12개 점검"); s.add_argument("--plan", type=int, required=True); s.add_argument("--video", default=""); s.add_argument("--cap", type=int, default=2); s.add_argument("--gap", type=float, default=6)
    s = sub.add_parser("upload", help="게이트 전부 통과 시 YouTube 업로드(기본 비공개)"); s.add_argument("--plan", type=int, required=True); s.add_argument("--video", required=True)
    s.add_argument("--privacy", default="private", choices=["private", "unlisted", "public"]); s.add_argument("--publish-at", default=""); s.add_argument("--synthetic", action="store_true"); s.add_argument("--yes-public", default="")
    s = sub.add_parser("perf", help="성과 입력"); s.add_argument("--plan", type=int, required=True); s.add_argument("--v48"); s.add_argument("--stay"); s.add_argument("--avg"); s.add_argument("--click"); s.add_argument("--conv"); s.add_argument("--v7"); s.add_argument("--date")
    sub.add_parser("winner", help="48h 승자·규칙 후보")
    s = sub.add_parser("retention", help="보존율 CSV 해석"); s.add_argument("--plan", type=int, required=True); s.add_argument("csv"); s.add_argument("--unit", default="pct", choices=["pct", "sec"])
    sub.add_parser("calibrate", help="훅 린트 vs 48h 조회 순위상관 (10편 전 결론 보류)")
    s = sub.add_parser("rule", help="규칙 후보 추가"); s.add_argument("--stage", required=True); s.add_argument("text"); s.add_argument("--check", default=""); s.add_argument("--source", default="")
    a = ap.parse_args()
    B = a.batch

    if a.cmd == "packs":
        for fn in sorted(os.listdir(PACKS_DIR)):
            with open(os.path.join(PACKS_DIR, fn), encoding="utf-8") as f:
                pk = json.load(f)
            print(f"{pk['id']:10s} {pk['name']} — {pk['desc']}")
        return
    if a.cmd == "lint":
        print(json.dumps(lint_hook(a.text), ensure_ascii=False, indent=2)); return
    if a.cmd == "init":
        os.makedirs(B, exist_ok=True)
        if os.path.exists(os.path.join(B, "project.json")):
            sys.exit("이미 project.json 있음")
        load_pack(a.pack)
        with open(os.path.join(SKILL_DIR, "templates", "project.json"), encoding="utf-8") as f:
            P = json.load(f)
        P.update({"name": a.name, "count": a.count, "packId": a.pack, "created": today(),
                  "subject": {"url": a.url, "name": a.subject, "notes": a.notes, "rel": a.rel}})
        save(B, P)
        shutil.copy(os.path.join(SKILL_DIR, "templates", "rules.json"), os.path.join(B, "rules.json"))
        os.makedirs(os.path.join(B, "assets"), exist_ok=True)
        print(f"배치 생성: {os.path.abspath(B)} (팩 {a.pack}, {a.count}편)"); return

    P = load(B); pk = load_pack(P["packId"], B); rules = load_rules(B)

    if a.cmd == "sourcing":
        for kv in a.answers.split(","):
            k, v = kv.split("=")
            P["sourcing"]["checks"][k.strip()] = v.strip()
        if a.show:
            P["sourcing"]["show"] = a.show
        save(B, P)
        bad = [c["q"] for c in pk["sourcing"] if P["sourcing"]["checks"].get(c["id"]) == "n"]
        miss = [c["q"] for c in pk["sourcing"] if c["id"] not in P["sourcing"]["checks"]]
        for c in pk["sourcing"]:
            print({"y": "✔", "n": "✘", "alt": "△"}.get(P["sourcing"]["checks"].get(c["id"]), "?"), c["q"])
        if bad:
            print("\n중단: ✘ 항목이 있어요. 소재를 바꾸거나 대체(alt) 방안을 정하세요.")
            sys.exit(2)
        if miss:
            print("\n미판정:", "; ".join(miss)); sys.exit(2)
        print("\n소싱 통과 →", P["sourcing"]["show"] or "(보여줄 것 미정 — --show 로 적어주세요)")
    elif a.cmd == "prompt":
        print(research_prompt(P, pk, rules) if a.kind == "research" else plan_prompt(P, pk, rules))
    elif a.cmd == "ingest":
        with open(a.file, encoding="utf-8") as f:
            j = json.load(f)
        if a.kind == "research":
            r = P["research"]
            for x in j.get("pains", []):
                r["pains"].append({"quote": x.get("quote", ""), "src": x.get("src", ""), "lv": x.get("lv", 3), "hook": x.get("hook", "")})
            for t in j.get("trends", []):
                r["trends"].append({"type": t.get("type", ""), "src": t.get("src", ""), "note": t.get("note", "")})
            if j.get("banned_add"):
                r["bannedExtra"] = ", ".join([x for x in [r.get("bannedExtra", "")] + j["banned_add"] if x])
            nosrc = sum(1 for x in r["pains"] if not x.get("src"))
            print(f"리서치 반영: 발화 {len(r['pains'])}건(출처 없음 {nosrc}), 트렌드 {len(r['trends'])}건")
            if nosrc:
                print("△ 출처 없는 발화가 있어요 — R-001: 발화 100%에 출처")
        else:
            if not isinstance(j, list):
                sys.exit("배열이 아님")
            P["plans"] = [{"id": uid(), "hook": x.get("hook") or pk["hooks"][0]["id"], "thumb": x.get("thumb", ""), "title": x.get("title", ""),
                           "lines": [{"text": l.get("text", ""), "shot": l.get("shot", ""), "strong": bool(l.get("strong"))} for l in x.get("lines", [])],
                           "desc": x.get("desc", ""), "tags": x.get("tags", []), "tiktok": x.get("tiktok", ""), "insta": x.get("insta", ""), "scenes": [], "voiceId": None} for x in j]
            print(f"플랜 {len(P['plans'])}편 반영")
            hooks = [p["hook"] for p in P["plans"]]
            if len(set(hooks)) < len(hooks):
                print("△ 훅 유형 중복 — R-002: 편마다 다르게")
            valid = {h["id"] for h in pk["hooks"]}
            for i, hk in enumerate(hooks):
                if hk not in valid:
                    print(f"△ {i + 1}편 훅 id '{hk}'는 이 팩에 없음 (가능: {', '.join(sorted(valid))})")
        save(B, P)
    elif a.cmd == "template":
        P["plans"] = template_plans(P, pk); save(B, P)
        print(f"{len(P['plans'])}편 템플릿 생성 — 뼈대입니다. 문장을 다듬고 check 하세요")
    elif a.cmd == "check":
        idxs = range(len(P["plans"])) if a.plan == 0 else [a.plan - 1]
        ok = all([report_plan(P, pk, i, P["plans"][i]) for i in idxs])
        save(B, P)
        print("\n전체 통과" if ok else "\n오류 있음 — 발행 불가"); sys.exit(0 if ok else 1)
    elif a.cmd == "asset":
        aid = "a" + uid()[:4]
        P["assets"].append({"id": aid, "name": os.path.basename(a.file), "path": os.path.abspath(a.file), "role": a.role, "rights": a.rights})
        save(B, P); print(f"소재 {aid}: {a.file} · {a.role} · {a.rights}")
    elif a.cmd == "scene":
        pl = P["plans"][a.plan - 1]; sc = scenes_of(pl, pk)
        for kv in a.map.split(","):
            k, v = kv.split("="); sc[int(k) - 1]["asset"] = v.strip()
        save(B, P); report_plan(P, pk, a.plan - 1, pl); save(B, P)
    elif a.cmd == "export":
        out = a.out or os.path.join(B, "exports")
        idxs = range(len(P["plans"])) if a.plan == 0 else [a.plan - 1]
        for i in idxs:
            export_all(B, P, pk, i, out)
        export_050(P, pk, out); save(B, P)
        print("factory_N.md → 영상 제작 스킬(shopping-shorts-factory)에 넘기는 대본 / script_N.json·script_045_N.txt → 다른 렌더 도구용 / publish_N.md → 발행 문구 / research.md·content_plan.md → 기획 문서")
    elif a.cmd == "publish-text":
        yt, tt, ig, th = publish_text(P, pk, P["plans"][a.plan - 1])
        print("=== YouTube ===\n" + yt + "\n\n=== TikTok ===\n" + tt + "\n\n=== Instagram ===\n" + ig + "\n\n=== Threads ===\n" + th)
    elif a.cmd == "approve":
        pl = P["plans"][a.plan - 1]
        c = check_plan(P, pk, pl); s = scene_check(P, pk, pl)
        if c["errs"] or s["errs"] or "[확인 필요]" in "".join(l["text"] for l in pl["lines"]):
            sys.exit("승인 불가: 검사 오류 또는 [확인 필요] 남음 — check 먼저")
        P["approvals"].append({"plan": pl["id"], "at": datetime.datetime.now().isoformat(timespec="minutes")}); save(B, P)
        print(f"굿 기록 — {a.plan}편. 이제 gates → upload")
    elif a.cmd == "gates":
        g, _, _ = pub_gates(B, P, pk, P["plans"][a.plan - 1], a.video, a.cap, a.gap); save(B, P)
        for name, ok in g:
            print("✔" if ok else "✘", name)
        allok = all(ok for _, ok in g)
        print("\n게이트 전부 통과 — upload 가능" if allok else "\n막힘 — ✘ 항목 해결 전 업로드 금지"); sys.exit(0 if allok else 1)
    elif a.cmd == "upload":
        g, _, _ = pub_gates(B, P, pk, P["plans"][a.plan - 1], a.video, 2, 6)
        if not all(ok for _, ok in g):
            for name, ok in g:
                if not ok:
                    print("✘", name)
            sys.exit("게이트 미통과 — 업로드 중단")
        if a.privacy == "public" and a.yes_public != "공개":
            sys.exit('즉시 공개는 --yes-public 공개 를 함께 넣어야 합니다 (기본은 비공개)')
        m = yt_meta(P, pk, P["plans"][a.plan - 1])
        print(f"업로드: {m['title']} / {a.privacy}{' / 예약 ' + a.publish_at if a.publish_at else ''} / {a.video}")
        upload(B, P, pk, a.plan - 1, a.video, a.privacy, a.publish_at, a.synthetic)
    elif a.cmd == "perf":
        pl = P["plans"][a.plan - 1]
        f = next((x for x in P["perf"] if x["plan"] == pl["id"]), None)
        if not f:
            f = {"plan": pl["id"], "date": "", "v48": "", "stay": "", "avg": "", "click": "", "conv": "", "v7": ""}; P["perf"].append(f)
        for k in ["date", "v48", "stay", "avg", "click", "conv", "v7"]:
            v = getattr(a, k)
            if v is not None:
                f[k] = v
        save(B, P); print("성과 기록:", json.dumps(f, ensure_ascii=False))
    elif a.cmd == "winner":
        wn = winner(P)
        if not wn:
            sys.exit("48h 조회가 입력된 편이 2개 미만")
        hooks = {h["id"]: h["name"] for h in pk["hooks"]}
        b, wst = wn["best"], wn["worst"]
        core = scenes_of(b[0], pk)[0]["sec"]
        hn = lambda pl: hooks.get(pl['hook'], pl['hook'])
        print(f"n={wn['n']} 승자: {b[0]['title']} ({hn(b[0])}) 점수 {score(b[1]):.0f}")
        print(f"      패자: {wst[0]['title']} ({hn(wst[0])}) 점수 {score(wst[1]):.0f}")
        print(f"\n[규칙 후보] 이 소재는 {hn(b[0])} 훅, 1번 컷 {core}초가 48h 기준 우세. 다음 배치에서 재현되면 규칙으로 올린다 (R-007).")
        print("점수식은 가설: v48×(1+stay/100) + click×20 + conv×200")
    elif a.cmd == "retention":
        pl = P["plans"][a.plan - 1]
        with open(a.csv, encoding="utf-8") as f:
            r = analyze_ret(parse_ret(f.read()), pl, pk, a.unit)
        if not r:
            sys.exit("숫자 열 2개 이상, 4행 이상 필요")
        print(f"훅 구간(첫 {r['hw']:.1f}초) 이탈 {r['lost']:.1f}%p · 끝 유지 {r['end']:.1f}% · 중간 하락 {r['slide']:.2f}%p/초 (롱폼 기준 훅 이탈 25% 미만이 건강 — 쇼츠는 미보정)")
        for c in r["cl"]:
            print(f"  {c['t']:.1f}초 · −{c['d']:.1f}%p · {c['i'] + 1}번 대사: \"{c['text']}\"")
        if r["cl"]:
            c0 = r["cl"][0]
            print(f"\n[규칙 후보] {pl['title'][:24]}: {c0['t']:.1f}초({c0['i'] + 1}번 대사 \"{c0['text'][:24]}\")에서 {c0['d']:.1f}%p 급락. 후보일 뿐 — 2편 이상 반복 + ㅇㅇ 뒤에 규칙.")
        save(B, P)
    elif a.cmd == "calibrate":
        rows = []
        for pl in P["plans"]:
            f = next((x for x in P["perf"] if x["plan"] == pl["id"]), None)
            h = lint_hook(pl["lines"][0]["text"] if pl["lines"] else "")
            if h and f and str(f.get("v48", "")) != "":
                rows.append((h["v"], float(f["v48"])))
        if len(rows) < 5:
            print(f"n={len(rows)} — 5편 전엔 계산 안 함. 린트는 체크리스트로만."); return
        rho = spearman([r[0] for r in rows], [r[1] for r in rows])
        verdict = "(표본 10 미만 — 결론 보류)" if len(rows) < 10 else ("→ 약함: 가중치 폐기, 체크리스트로만" if rho < .3 else "→ 쓸 만함")
        print(f"n={len(rows)}, 훅 린트 vs 48h 조회 ρ={rho:.2f} {verdict}")
    elif a.cmd == "rule":
        rid = f"R-{len(rules) + 1:03d}"
        rules.append({"id": rid, "stage": a.stage, "rule": a.text, "check": a.check, "source": a.source, "added": today(), "hits": 0})
        with open(os.path.join(B, "rules.json"), "w", encoding="utf-8") as f:
            json.dump(rules, f, ensure_ascii=False, indent=2)
        print(f"{rid} 추가 ({a.stage}) — rules.json은 050 하네스와 호환")


if __name__ == "__main__":
    main()
