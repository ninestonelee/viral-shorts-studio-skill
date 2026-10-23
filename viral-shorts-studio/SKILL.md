---
name: viral-shorts-studio
description: 쇼핑·마케팅 쇼츠를 "만들기 전 절반"부터 차근차근 기획하는 스킬. 장르 팩(자사 쇼핑·쿠팡 제휴·건강정보·브랜드·서비스·강의·지역 매장·B2B) 하나를 고르면, 소싱 질문 → 리서치(출처 필수) → 콘텐츠 플랜 N편(훅 유형 분산) → 기계 검사(금지어·길이·핵심 3초·훅 린트) → 소재 권리·장면표 → 영상 제작 도구용 대본 내보내기 → 발행 문구·승인 → 발행 게이트 12개 → 48시간 성과 비교 → 규칙 후보까지 한 흐름으로 간다. 검사와 게이트는 코드가 판정하고, 글은 Claude가 쓰고, 승인은 사용자가 한다. Triggers - "/viral-shorts-studio", "쇼츠 기획해줘", "쇼츠 3편 플랜", "쇼츠 리서치부터", "제휴 쇼츠", "쿠팡 쇼츠 배치", "쇼츠 발행 게이트", "쇼츠 성과 비교", 상품·서비스 주소를 주며 쇼츠 여러 편을 부탁할 때. 대본 한 편만 빨리 → coupang-shorts, 영상 렌더만 → shopping-shorts-factory.
---

# 바이럴 쇼츠 스튜디오 (viral-shorts-studio)

> 한 줄: **검사는 코드가, 글은 Claude가, 결정은 사용자가.**
> 금지어·길이·3초 등장·대사 중복·하루 한도 같은 판정은 `scripts/vss.py`(또는 같은 동작의 Node 판 `scripts/vss.js`)가 합니다. Claude가 "이 정도면 괜찮겠지"라고 넘기지 않습니다.

## 이 스킬이 하는 일, 하지 않는 일

| 하는 일 | 하지 않는 일 (다른 스킬이 함) |
|---|---|
| 소싱 질문, 리서치, 플랜 N편, 검사, 발행 문구, 게이트, 성과 비교 | 영상 렌더 → `shopping-shorts-factory` (대본은 `exports/factory_N.md`) |
| 장르 팩 8종으로 갈아 끼우기 | 대본 1편만 빨리 → `coupang-shorts` |
| 규칙 원장 쌓기 (`rules.json`) | 썸네일 이미지 → 썸네일 스킬 |

## 파일은 어디에 생기나

배치 하나(예: 상품 하나로 3편) = 폴더 하나. 사용자 작업 폴더 아래 `shorts/<배치명>/`을 권장합니다.
```
<배치>/project.json   모든 상태 (소재·소싱·리서치·플랜·소재·성과·승인·업로드)
<배치>/rules.json     규칙 원장 (R-001~R-007 기본 7개)
<배치>/assets/        사진·영상 소재
<배치>/exports/       factory_N.md · script_N.json · script_045_N.txt · publish_N.md · research.md · content_plan.md
<배치>/pack.json      (선택) 이 배치만의 팩 편집본 — 있으면 내장 팩보다 우선
```
같은 부모 폴더 아래 다른 배치까지 읽어서 **대사 중복·하루 업로드 한도·간격**을 계산합니다. 배치 폴더는 한곳에 모아 두세요.

## Claude가 따르는 순서

아래에서 `V`는 `~/.claude/skills/viral-shorts-studio/scripts/vss.py`, 모든 명령은 `-b <배치폴더>`를 붙입니다.

**실행기 고르기(처음 한 번).** `python3 --version`이 되면 그대로 `python3 $V …`를 쓴다. 안 되면(command not found) `node --version`을 확인하고 `V`를 `scripts/vss.js`로 바꿔 `node $V …`로 쓴다. 두 프로그램은 명령·출력·project.json이 완전히 같으니 아래 예시의 `python3`만 `node`로 읽으면 된다. 둘 다 없으면 사용자에게 Node.js(https://nodejs.org LTS) 설치를 안내하고 멈춘다.

### 0. 팩 고르기
`python3 $V packs`로 8종을 보여주고, 사용자 상황에 맞는 것을 **Claude가 추천하고 이유를 말한 뒤** 사용자가 고릅니다. 맞는 게 없으면 가장 가까운 팩을 `<배치>/pack.json`으로 복사해 고칩니다(`references/pack-schema.md`).

### 1. 시작
```bash
python3 $V -b shorts/1차 init "미니 청소기 1차" --pack shop-aff --count 3 \
  --subject "무선 미니 청소기" --url https://... --rel affiliate --notes "차량용, 노즐 1.5cm"
```
`--rel`: own(내 상품) / affiliate(제휴 — 대가성 문구 자동) / client(광고주) / none(판매 없음).

### 2. 소싱 질문 — 사용자에게 묻고 기록
팩의 소싱 질문 2~3개를 **그대로 읽어 주고** ✔(y) / ✘(n) / △대체(alt)로 답을 받습니다. "보여줄 것"(화면에 실제로 보일 장면)도 한 줄 받습니다.
```bash
python3 $V -b shorts/1차 sourcing "visible=y,reviews=y,rights=alt" --show "노즐이 시트 틈에 들어가는 장면"
```
**하나라도 ✘면 멈춥니다**(종료 코드 2). 그 상품으론 쇼츠를 안 만드는 게 맞다는 뜻이에요. 다른 상품을 고르거나 대체안을 정한 뒤 다시 합니다.

### 3. 리서치 — Claude가 직접
```bash
python3 $V -b shorts/1차 prompt research
```
출력된 요청문을 **Claude 자신이 수행**합니다. WebSearch·WebFetch로 실제로 연 리뷰·커뮤니티·기사만 lv 0~2, 직접 못 확인한 건 lv 3(미확인). 상상으로 쓰지 않습니다. 결과 JSON을 `<배치>/research_raw.json`으로 저장하고:
```bash
python3 $V -b shorts/1차 ingest research shorts/1차/research_raw.json
```
출처 없는 발화가 있으면 경고가 뜹니다(R-001). 발화 5건 미만이면 플랜으로 넘어가지 않습니다.

### 4. 플랜 N편 — Claude가 쓴다
```bash
python3 $V -b shorts/1차 prompt plan        # 요청문 → Claude가 수행 → JSON 배열 저장
python3 $V -b shorts/1차 ingest plans shorts/1차/plans_raw.json
python3 $V -b shorts/1차 check              # 전부 검사. ✘가 하나라도 있으면 종료 코드 1
```
리서치 없이 뼈대만 보고 싶을 때는 `template`(AI 없이 공식으로 생성, 문장은 다듬어야 함).

`check`가 보는 것: 금지어 · 센 문장 정확히 1개 · 추정 길이 · 1번 컷 핵심 등장 표시 · 설명에 표기 문구 · 태그 5개 이상 · [확인 필요] 잔존 · 숫자 있는데 출처 없음 · 훅 린트(경고만) · 제목 길이/과장어 · 썸네일-제목 겹침.
**✘는 반드시 고치고, △는 읽어 보고 판단해서 고칩니다.** 린트 점수는 참고용이라 막지 않습니다.
플랜을 고칠 땐 `project.json`의 `plans[]`를 직접 편집하고 다시 `check`.

### 5. 소재·장면표
```bash
python3 $V -b shorts/1차 asset shorts/1차/assets/nozzle.jpg --role "사용 장면" --rights "직접 촬영"
python3 $V -b shorts/1차 scene --plan 1 "1=a1b2c,2=a1b2c,3=a9f00,4=a1b2c"
```
역할: 정면 / 사용 장면 / 현장 / 화면 / 비교 / 보조. 권리: 직접 촬영 / 판매자 제공 / AI 생성 / 미확인.
**권리가 "미확인"인 소재가 장면표에 있으면 오류**입니다(R-005). 1번 컷은 핵심 역할이어야 하고 길이는 3초 근처.

### 6. 내보내기 → 영상 제작
```bash
python3 $V -b shorts/1차 export             # 전 편. --plan N 으로 한 편만
```
`exports/factory_N.md`를 `shopping-shorts-factory` 스킬에 넘겨 영상을 만듭니다. 결과 mp4는 `<배치>/renders/N.mp4`에 받고, **Claude가 프레임 2장(0~1초, 센 문장 구간)을 직접 열어 확인**합니다.

### 7. 발행 문구·승인
```bash
python3 $V -b shorts/1차 publish-text --plan 1    # YouTube/TikTok/Instagram/Threads 문구, 표기 문구 자동
python3 $V -b shorts/1차 approve --plan 1         # 사용자가 "좋아요/굿" 한 뒤에만
```
approve는 검사 오류나 [확인 필요]가 남아 있으면 거부합니다. **승인은 사용자 말로만 받습니다.** Claude가 스스로 approve하지 않습니다.

### 8. 발행 게이트 → 업로드
```bash
python3 $V -b shorts/1차 gates --plan 1 --video shorts/1차/renders/1.mp4
VSS_YT_TOKEN=... python3 $V -b shorts/1차 upload --plan 1 --video shorts/1차/renders/1.mp4
```
게이트 12개가 전부 ✔일 때만 업로드가 진행됩니다(`references/gates.md`). 기본 **비공개**. 즉시 공개는 `--privacy public --yes-public 공개`, 예약은 `--publish-at 2026-11-01T09:00:00Z`. AI 생성 소재가 있으면 `--synthetic`.
토큰은 환경변수로만 넘기고 파일이나 채팅에 남기지 않습니다. 결과 불명(시간 초과)은 `unknown`으로 기록되고 **재시도 금지**, 채널의 최근 업로드를 먼저 확인합니다.
업로드 기능은 **아직 실제 계정으로 검증되지 않았습니다.** 첫 실행은 비공개로, 유튜브 스튜디오를 열어 둔 상태에서 하세요. 수업에서는 8번을 건너뛰고 7번 발행 문구를 복사해 직접 올려도 충분합니다.

### 9. 성과 → 규칙 후보 (48시간 뒤)
```bash
python3 $V -b shorts/1차 perf --plan 1 --v48 1200 --stay 62 --click 14 --conv 1 --date 11-03
python3 $V -b shorts/1차 winner                       # 점수식 v48×(1+stay/100)+click×20+conv×200 (가설)
python3 $V -b shorts/1차 retention --plan 1 ret.csv   # 유튜브 스튜디오 시청 지속률 CSV → 급락 지점의 대사
python3 $V -b shorts/1차 calibrate                    # 훅 린트 vs 48h 조회 상관, 10편 전엔 결론 보류
python3 $V -b shorts/1차 rule --stage ss-perf "..." --check "..." --source "1차 승자"
```
규칙은 **후보**로만 올리고, 사용자가 동의하고 다음 배치에서도 재현될 때 `rule`로 원장에 넣습니다(R-007).

## Claude가 하지 않는 것
- 검사나 게이트를 "이 정도면 괜찮다"고 우회하기. 오류는 고쳐서 통과시킵니다.
- 출처 없는 숫자·효능 문장 쓰기. 건강 팩은 치료·예방·개선 단정 금지(팩 banned).
- 하루 한도(2편)·간격(6시간)을 묻지 않고 바꾸기. 반복 대량 생산 방지 장치라 사용자가 명시적으로 요청할 때만 `--cap --gap`.
- 영상 렌더를 이 스킬 안에서 새로 만들기. 영상 제작 스킬에 넘깁니다.

## 끝나면
배치 폴더 경로·편수·검사 결과·내보내기 파일을 세 줄로 보고합니다: **바꾼 것 · 뺀 것 · 확인한 것.**

참고: `references/gates.md`(검사 항목·게이트 12개·규칙 7개), `references/pack-schema.md`(팩 만들기).
