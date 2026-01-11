# Tauri 개발 서버 실행 스크립트
# PowerShell에서 이 스크립트를 실행하거나, npm run tauri:dev를 사용하세요

$env:PATH += ";$env:USERPROFILE\.cargo\bin"
npm run tauri:dev

