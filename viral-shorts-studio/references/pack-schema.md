# 장르 팩 스키마 (packs/*.json)

새 장르 = 팩 하나. 내장 8종: shop-own(자사 쇼핑) · shop-aff(제휴) · health(건강정보) · brand(브랜드 스토리) · service(서비스·앱) · course(강의·모집) · local(지역 매장) · b2b.

배치 전용 편집본은 `<배치>/pack.json`에 두면 내장 팩보다 우선한다. 공용으로 쓸 거면 `~/.claude/skills/viral-shorts-studio/packs/<id>.json`에 추가.

```jsonc
{
  "id": "shop-own",                 // 파일명과 같게
  "name": "쇼핑 · 자사 상품",
  "desc": "한 줄 성격. 프롬프트 [장르 팩]에 들어감",
  "subjectLabel": "상품 URL",        // 소재 입력 안내
  "sourcing": [                     // 소싱 게이트 질문. 하나라도 ✘(n)면 중단. y / n / alt(대체)
    {"id": "visible", "q": "효과·동작이 화면에 보이는가?"}
  ],
  "research": ["리서치 질문 1", "..."],   // research 프롬프트에 번호 붙어 들어감
  "hooks": [                              // 편마다 다르게 배정. template 생성 시 id별 첫 문장 공식 사용
    {"id": "problem", "name": "불편형", "formula": "\"○○할 때 △△하지 않으세요?\" → 그래서 이거 → 사용 2단계 → CTA"}
  ],
  "banned": ["최고", "1위", "치료"],       // 기계 검사 금지어 (부분 문자열 일치)
  "disclosure": "판매자가 직접 제작한 영상입니다",  // 설명·플랫폼 문구·고정 댓글에 자동. 없으면 ""
  "cta": ["프로필 링크", "..."],           // [0]이 템플릿 마지막 대사·고정 댓글
  "kpi": ["48h 조회", "계속 시청%", "링크 클릭", "주문"],
  "duration": [25, 35],                   // 초. ±5 허용
  "coreAppearSec": 3,                     // 핵심 등장 시한
  "descTemplate": "{name} — {show}. {disclosure}. 상세: {url}",   // {sources}도 가능
  "tagSeeds": ["쇼츠", "추천템"]
}
```

템플릿 첫 문장이 정의된 훅 id: problem, situation, question, unboxing, compare, wow, myth, result, reframe, checklist, number, before, quote, decision, routine, beforeafter, list, timer, who, proof, demo, scene, owner, review, daily, diagnose, case. 그 외 id는 발화 원문 그대로 첫 문장이 된다.

048 `script.json` tone 매핑: problem→problem-solve, wow→wow-reaction, beforeafter→before-after, situation→situation-vlog, list→list-ranking, 나머지 problem-solve.

## 팩 추가 후보 (051 README "다음")
- 유튜브 채널 홍보(인생OS 본편 예고 쇼츠) — 050 본편 레인과 연결
- 혜택 큐레이션(lifeos-benefit-shorts 흡수) — 우주보스 패턴을 hooks·banned·sourcing으로
