# Local Music Player

태그 기반의 노래 플레이어 - 모던한 UI로 노래를 태그별로 관리하고 재생할 수 있는 데스크톱 미디어 플레이어입니다.

## 주요 기능

- 🎵 **기본 플레이어 기능**: 재생, 일시정지, 볼륨 조절, 진행바, 웨이폼 시각화
- 📁 **폴더 기반 관리**: 폴더 단위로 노래 파일 관리
- 🏷️ **태그 시스템**: 노래에 태그를 지정하여 분류 및 필터링
- 📝 **메타데이터 관리**: 각 노래별 상세 정보 설정 및 편집
- 🎬 **비디오 동기화**: 노래와 함께 동영상 재생 (딜레이 설정 가능)
- 📋 **플레이리스트**: 정적/동적 플레이리스트 지원

## 기술 스택

### 프론트엔드
- **React** + **TypeScript**
- **Tailwind CSS** (스타일링)
- **Zustand** (상태 관리)
- **Tauri** (데스크톱 프레임워크)

### 백엔드
- **Rust** (Tauri)
- **SQLite** (데이터베이스)
- **rodio/hound** (오디오 재생)
- **ffmpeg-next** (다양한 포맷 지원, 선택)

## 프로젝트 상태

🚧 **현재 Tauri로 마이그레이션 중**

이 프로젝트는 기존 PyQt6 기반에서 Tauri 기반으로 전환 중입니다.

## 설계 문서

자세한 설계는 [TAURI_PROJECT_DESIGN.md](TAURI_PROJECT_DESIGN.md)를 참고하세요.

## 개발 시작하기

### 필수 요구사항

- **Node.js** 18+ 및 npm
- **Rust** (최신 안정 버전)
  - **Windows 필수**: Visual Studio Build Tools 또는 Visual Studio 2017+ (C++ 빌드 도구 포함) **반드시 설치 필요**
    - 다운로드: https://visualstudio.microsoft.com/downloads/
    - "Build Tools for Visual Studio 2022" 선택
    - 설치 시 "C++ 빌드 도구" 워크로드 선택
- **시스템 WebView** (Windows: Edge WebView2, macOS: WebKit, Linux: WebKitGTK)

### 설치 방법

```bash
# 저장소 클론
git clone <repository-url>
cd tag-mplay

# Tauri 프로젝트 초기화 (예정)
npm create tauri-app@latest .

# 의존성 설치
npm install

# 개발 서버 실행
# Windows에서는 Visual Studio 환경 변수가 필요하므로 배치 파일 사용 (권장)
.\run-tauri-dev.bat

# 또는 직접 실행 (PowerShell)
$vcvarsPath = "C:\Program Files\Microsoft Visual Studio\18\Insiders\VC\Auxiliary\Build\vcvars64.bat"
cmd /c "call `"$vcvarsPath`" && set PATH=%PATH%;%USERPROFILE%\.cargo\bin && npm run tauri dev"
```

## 프로젝트 구조

```
tag-mplay/
├── src/                    # React 프론트엔드
├── src-tauri/              # Rust 백엔드
├── data/                   # 데이터 디렉토리
│   ├── database.db        # SQLite 데이터베이스
│   └── config.json        # 설정 파일
├── electron-reference/     # Electron 레퍼런스 (디자인 참고)
├── TAURI_PROJECT_DESIGN.md # 프로젝트 설계 문서
└── README.md              # 이 파일
```

## 라이선스

MIT License
