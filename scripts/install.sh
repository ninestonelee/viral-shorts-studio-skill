#!/bin/bash
# viral-shorts-studio 스킬 설치 (macOS / Linux)
# 사용법: 레포 폴더 안에서  bash scripts/install.sh
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/viral-shorts-studio"
DST="$HOME/.claude/skills/viral-shorts-studio"
mkdir -p "$HOME/.claude/skills"
if [ -e "$DST" ] && [ ! -L "$DST" ]; then
  echo "이미 같은 이름의 폴더가 있어요: $DST"
  echo "Finder에서 그 폴더를 지운 뒤 이 스크립트를 다시 실행해 주세요."
  exit 1
fi
ln -sfn "$SRC" "$DST"
echo "설치 완료 → $DST"
echo "확인 중..."
if command -v python3 >/dev/null 2>&1; then
  python3 "$DST/scripts/vss.py" packs
  echo ""; echo "실행기: python3  (명령 예: python3 $DST/scripts/vss.py packs)"
elif command -v node >/dev/null 2>&1; then
  node "$DST/scripts/vss.js" packs
  echo ""; echo "실행기: node  (파이썬이 없어서 Node 판을 씁니다. 명령 예: node $DST/scripts/vss.js packs)"
else
  echo "python3도 node도 없어요. 둘 중 하나만 있으면 됩니다. Node.js를 권해요: https://nodejs.org 에서 LTS 설치 후 다시 실행."
  exit 1
fi
echo ""
echo "위에 장르 팩 8줄이 보이면 성공이에요. Claude Code를 새로 열면 /viral-shorts-studio 스킬이 보입니다."
