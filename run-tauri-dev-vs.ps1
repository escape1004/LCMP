# Tauri 개발 서버 실행 스크립트 (Visual Studio 환경 포함)
# PowerShell에서 이 스크립트를 실행하세요

# 이전 프로세스 종료
Write-Host "이전 프로세스 종료 중..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -eq "node" -or $_.ProcessName -like "*local*" -or $_.ProcessName -like "*music*"} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Visual Studio 환경 변수 설정
$vcvarsPath = "C:\Program Files\Microsoft Visual Studio\18\Insiders\VC\Auxiliary\Build\vcvars64.bat"
if (Test-Path $vcvarsPath) {
    Write-Host "Visual Studio 환경 변수 설정 중..." -ForegroundColor Yellow
    cmd /c "`"$vcvarsPath`" >nul 2>&1 && set" | ForEach-Object {
        if ($_ -match "^(.+?)=(.*)$") {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

# Cargo 경로 추가
$cargoPath = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $cargoPath) {
    $env:PATH += ";$cargoPath"
    Write-Host "Cargo 경로 추가됨" -ForegroundColor Green
}

# Tauri 실행
Write-Host "Tauri 개발 서버 시작 중..." -ForegroundColor Green
npm run tauri dev
