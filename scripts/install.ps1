# viral-shorts-studio 스킬 설치 (Windows PowerShell)
# 사용법: 레포 폴더 안에서  powershell -ExecutionPolicy Bypass -File scripts\install.ps1
$Here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Src = Join-Path $Here "viral-shorts-studio"
$Dst = Join-Path $env:USERPROFILE ".claude\skills\viral-shorts-studio"
New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE ".claude\skills") | Out-Null
if (Test-Path $Dst) { Write-Host "이미 같은 이름의 폴더가 있어요: $Dst  (탐색기에서 지운 뒤 다시 실행)"; exit 1 }
New-Item -ItemType Junction -Path $Dst -Target $Src | Out-Null
Write-Host "설치 완료 → $Dst"
Write-Host "확인 중..."
python (Join-Path $Dst "scripts\vss.py") packs
Write-Host ""
Write-Host "위에 장르 팩 8줄이 보이면 성공이에요. Claude Code를 새로 열면 /viral-shorts-studio 스킬이 보입니다."
