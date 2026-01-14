# Tauri 개발 서버 실행 스크립트
# PowerShell에서 이 스크립트를 실행하거나, npm run tauri:dev를 사용하세요

# 이전 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -eq "LCMP" -or $_.ProcessName -like "*local*" -or $_.ProcessName -like "*music*"} | Stop-Process -Force -ErrorAction SilentlyContinue

$env:PATH += ";$env:USERPROFILE\.cargo\bin"

# 아이콘이 변경된 경우를 위해 Rust 빌드 캐시 정리 (선택사항)
# 주석을 해제하면 매번 깨끗하게 빌드됩니다 (느려질 수 있음)
# Set-Location src-tauri
# cargo clean
# Set-Location ..

npm run tauri:dev

