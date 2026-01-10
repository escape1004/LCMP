@echo off
REM 이전 프로세스 종료
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM "Local Music Player.exe" /T >nul 2>&1
timeout /t 2 /nobreak >nul

REM Visual Studio 환경 변수 설정
call setup-vs-env.bat

REM Cargo 경로 추가
set PATH=%PATH%;%USERPROFILE%\.cargo\bin

REM Tauri 실행
npm run tauri dev
