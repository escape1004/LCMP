@echo off
REM 이전 프로세스 종료
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM "LCMP.exe" /T >nul 2>&1
taskkill /F /IM "Local Music Player.exe" /T >nul 2>&1
timeout /t 2 /nobreak >nul

REM Visual Studio 환경 변수 설정
call setup-vs-env.bat

REM Cargo 경로 추가
set PATH=%PATH%;%USERPROFILE%\.cargo\bin

REM 아이콘이 변경된 경우를 위해 Rust 빌드 캐시 정리 (선택사항)
REM 주석을 해제하면 매번 깨끗하게 빌드됩니다 (느려질 수 있음)
REM cd src-tauri
REM cargo clean
REM cd ..

REM Tauri 실행
npm run tauri dev

