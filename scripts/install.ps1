# viral-shorts-studio 스킬 설치 (Windows PowerShell)
# 사용법: 레포 폴더 안에서  powershell -ExecutionPolicy Bypass -File scripts\install.ps1
$Here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Src = Join-Path $Here "viral-shorts-studio"
$Dst = Join-Path $env:USERPROFILE ".claude\skills\viral-shorts-studio"
New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE ".claude\skills") | Out-Null
if (Test-Path $Dst) { Write-Host "이미 같은 이름의 폴더가 있어요: $Dst  (탐색기에서 지운 뒤 다시 실행)"; exit 1 }
New-Item -ItemType Junction -Path $Dst -Target $Src | Out-Null
Write-Host "설치 완료 → $Dst"
# Codex도 쓰는 컴퓨터면 Codex 스킬 폴더에도 연결
if (Test-Path (Join-Path $env:USERPROFILE ".codex")) {
  $CDir = Join-Path $env:USERPROFILE ".agents\skills"; New-Item -ItemType Directory -Force -Path $CDir | Out-Null
  $CDst = Join-Path $CDir "viral-shorts-studio"
  if (-not (Test-Path $CDst)) { New-Item -ItemType Junction -Path $CDst -Target $Src | Out-Null; Write-Host "Codex 연결 → $CDst" }
}
Write-Host "확인 중..."
if (Get-Command python -ErrorAction SilentlyContinue) {
  python (Join-Path $Dst "scripts\vss.py") packs
  Write-Host ""; Write-Host "실행기: python  (명령 예: python $Dst\scripts\vss.py packs)"
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
  node (Join-Path $Dst "scripts\vss.js") packs
  Write-Host ""; Write-Host "실행기: node  (파이썬이 없어서 Node 판을 씁니다. 명령 예: node $Dst\scripts\vss.js packs)"
} else {
  Write-Host "python도 node도 없어요. 둘 중 하나만 있으면 됩니다. Node.js를 권해요: https://nodejs.org 에서 LTS 설치 후 다시 실행."; exit 1
}
Write-Host ""
Write-Host "위에 장르 팩 8줄이 보이면 성공이에요. Claude Code를 새로 열면 /viral-shorts-studio 스킬이 보입니다."
