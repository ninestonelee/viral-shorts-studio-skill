# 바이럴 쇼츠 스튜디오 스킬 (viral-shorts-studio)

> Claude Code에 끼우는 **쇼츠 기획 비서**입니다. 상품 주소 하나를 주면 "리서치 → 대본 여러 편 → 자동 검사 → 발행 문구"까지 순서대로 함께 갑니다.
> 바이브코딩 수업용으로 만들었어요. 코딩을 몰라도 따라올 수 있게 썼습니다.

## 이게 뭔가요? (1분 설명)

쇼츠를 만들 때 제일 많이 하는 실수는 **"일단 영상부터 찍는 것"**이에요. 그래서 이 스킬은 반대로 갑니다. 찍기 전에 할 일, 즉 "만들기 전 절반"을 먼저 끝냅니다.

1. **소싱 질문** — 이 상품으로 쇼츠를 만들어도 되는지 2~3개 질문에 ✔/✘로 답합니다. 하나라도 ✘면 거기서 멈춰요. (안 될 상품에 시간 쓰지 않기)
2. **리서치** — 실제 리뷰·커뮤니티 글에서 "불편한 말"을 출처와 함께 모읍니다. 상상으로 쓰지 않아요.
3. **대본 여러 편** — 편마다 다른 "훅(첫 문장) 유형"으로 3~5편을 씁니다.
4. **자동 검사** — 금지어, 길이, 첫 3초에 핵심이 나오는지, 센 문장이 딱 하나인지… 컴퓨터가 기계적으로 봅니다.
5. **발행 문구** — 유튜브·틱톡·인스타 설명글과 태그, 법적 표기 문구(쿠팡 파트너스 등)를 자동으로 만듭니다.
6. **성과 비교** — 48시간 뒤 조회수를 넣으면 어떤 훅이 이겼는지 알려 줍니다.

영상 자체를 만드는(렌더) 기능은 들어 있지 않아요. 그건 다른 도구(`shopping-shorts-factory` 스킬, 캡컷, 브루 등)에 맡기고, 이 스킬은 **거기에 넘길 대본과 장면표를 완성하는 것**이 역할입니다.

## 준비물

| 준비물 | 확인 방법 |
|---|---|
| Claude Code (터미널에서 쓰는 Claude) | 터미널에 `claude --version` 입력 → 버전이 나오면 OK |
| Python 3.9 이상 **또는** Node.js 18 이상 (둘 중 하나) | `python3 --version` 또는 `node --version`. 둘 중 하나만 숫자가 나오면 OK |
| 이 저장소 | 아래 설치 안내 |

추가 패키지 설치는 없어요. 같은 프로그램이 파이썬 판(`vss.py`)과 Node 판(`vss.js`) 두 가지로 들어 있어서, 컴퓨터에 있는 쪽을 설치 스크립트가 알아서 골라 줍니다. 명령·화면·결과 파일은 완전히 같아요.

## 설치 (5분)

자세한 그림 설명은 [docs/01_설치하기.md](docs/01_설치하기.md)에 있어요. 급하면 아래만 따라 하세요.

**Mac**
```bash
cd ~/Documents
git clone https://github.com/ninestonelee/viral-shorts-studio-skill.git
cd viral-shorts-studio-skill
bash scripts/install.sh
```

**Windows (PowerShell)**
```powershell
cd ~\Documents
git clone https://github.com/ninestonelee/viral-shorts-studio-skill.git
cd viral-shorts-studio-skill
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

마지막에 이런 8줄이 보이면 성공이에요.
```
b2b        B2B · 리드 · 컨설팅 — 의사결정자 대상. ...
brand      브랜드 · 창업자 스토리 — ...
course     강의 · 모집 · 세미나 — ...
health     건강정보 · 운동/습관 — ...
local      지역 매장 · 오프라인 — ...
service    서비스 · 앱 · SaaS — ...
shop-aff   쇼핑 · 제휴(쿠팡 파트너스) — ...
shop-own   쇼핑 · 자사 상품 — ...
```

git이 없거나 어려우면 GitHub 페이지 오른쪽 위 녹색 **Code → Download ZIP**으로 받아 압축을 풀고, 그 폴더 안에서 설치 스크립트를 실행해도 똑같아요.

## 처음 써 보기 (10분)

Claude Code를 열고 이렇게 말해 보세요.

```
/viral-shorts-studio 연습용으로 examples/sample_batch 데이터를 써서 쇼츠 3편 기획을 처음부터 끝까지 보여줘
```

Claude가 팩을 고르고, 소싱 질문을 던지고, 예제 리서치를 넣고, 대본 3편을 검사하고, 발행 문구까지 만들어 보여 줍니다. 실제 화면과 설명은 [docs/02_사용법.md](docs/02_사용법.md)에 있어요.

## 문서 안내

| 문서 | 언제 보나 |
|---|---|
| [docs/00_핸즈온.md](docs/00_핸즈온.md) | **처음이면 이것 하나만.** 설치부터 발행 문구까지 40분 따라 하기 |
| [docs/01_설치하기.md](docs/01_설치하기.md) | 처음 설치할 때, 설치가 안 될 때 |
| [docs/02_사용법.md](docs/02_사용법.md) | 각 단계가 무엇을 하는지, 화면이 어떻게 나오는지 |
| [docs/03_실습_90분.md](docs/03_실습_90분.md) | 수업 시간에 따라 하는 실습 순서 |
| [docs/04_자주묻는질문.md](docs/04_자주묻는질문.md) | 막혔을 때 |
| [viral-shorts-studio/references/gates.md](viral-shorts-studio/references/gates.md) | 검사 항목 전체 목록, 발행 게이트 12개 |
| [viral-shorts-studio/references/pack-schema.md](viral-shorts-studio/references/pack-schema.md) | 내 장르 팩을 새로 만들 때 |

## 폴더 구조

```
viral-shorts-studio-skill/
├─ viral-shorts-studio/      ← 스킬 본체 (이 폴더가 ~/.claude/skills/ 에 연결됨)
│  ├─ SKILL.md               Claude가 읽는 작업 순서
│  ├─ scripts/vss.py         검사·내보내기·게이트를 판정하는 프로그램 (파이썬 판)
│  ├─ scripts/vss.js         같은 프로그램의 Node 판 (파이썬 없는 컴퓨터용)
│  ├─ packs/*.json           장르 팩 8종
│  ├─ templates/             새 배치의 빈 틀, 기본 규칙 7개
│  └─ references/            검사 항목표, 팩 만드는 법
├─ examples/sample_batch/    연습용 리서치·플랜 데이터 (가상의 미니 청소기)
├─ scripts/install.sh, install.ps1
└─ docs/                     설치·사용법·실습·FAQ
```

## 꼭 알아 둘 것

- **검사는 컴퓨터가, 글은 Claude가, 결정은 내가.** 검사에서 ✘가 나오면 Claude가 "괜찮다"고 넘기지 않고 고쳐서 다시 검사합니다.
- **유튜브 자동 업로드 기능은 아직 실제 계정으로 검증하지 않았어요.** 수업에서는 발행 문구를 복사해 직접 올리는 것으로 충분합니다.
- 문서의 명령은 `python3 $V …`로 적혀 있어요. Node 판을 쓰는 분은 `python3`를 `node`로, `vss.py`를 `vss.js`로 바꿔 읽으면 됩니다. 그 외는 전부 같아요.
- 하루 2편, 6시간 간격이라는 한도가 들어 있어요. 같은 대본을 찍어 내듯 대량 생산하면 채널에 해롭기 때문입니다.

## 출처와 라이선스

"051 바이럴 쇼츠 스튜디오" 단일 HTML 앱(2026-10-17)의 판정 로직을 Python과 Node.js로 옮긴 것입니다(두 판은 같은 입력에 같은 출력을 냅니다). 훅 린트는 youtube-agent-skill(MIT)의 아이디어를 한국어로 다시 구현했습니다. MIT License.
