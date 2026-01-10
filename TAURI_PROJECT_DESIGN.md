# Tag Music Player - Tauri 프로젝트 설계 문서

## 📋 목차
1. [프로젝트 개요](#프로젝트-개요)
2. [현재 구현 상태](#현재-구현-상태)
3. [기술 스택](#기술-스택)
4. [시스템 아키텍처](#시스템-아키텍처)
5. [데이터베이스 스키마](#데이터베이스-스키마)
6. [UI/UX 디자인](#uiux-디자인)
7. [핵심 기능 명세](#핵심-기능-명세)
8. [파일 구조](#파일-구조)
9. [마이그레이션 계획](#마이그레이션-계획)
10. [구현 단계](#구현-단계)

---

## 프로젝트 개요

태그 기반의 노래 플레이어는 사용자가 태그를 통해 노래를 분류하고 필터링할 수 있는 데스크톱 미디어 플레이어입니다. 디스코드 스타일의 다크 테마 UI를 제공하며, 각 노래에 대한 메타데이터 관리와 동영상 동기화 기능을 포함합니다.

### 주요 특징
- 🎵 **기본 플레이어 기능**: 재생, 일시정지, 볼륨 조절, 진행바, 웨이폼 시각화
- 📁 **폴더 기반 관리**: 폴더 단위로 노래 파일 관리
- 🏷️ **태그 시스템**: 노래에 태그를 지정하여 분류 및 필터링
- 📝 **메타데이터 관리**: 각 노래별 상세 정보 설정 및 편집
- 🎬 **비디오 동기화**: 노래와 함께 동영상 재생 (딜레이 설정 가능)
- 📋 **플레이리스트**: 정적/동적 플레이리스트 지원
- 🎨 **디스코드 스타일 UI**: 모던하고 직관적인 사용자 인터페이스

---

## 현재 구현 상태

### ✅ 완전히 구현된 기능

#### 1. 기본 플레이어 기능
- ✅ 재생/일시정지/정지
- ✅ 이전/다음 곡 이동
- ✅ 볼륨 조절 (0-100%)
- ✅ 재생 진행바 (드래그/클릭으로 위치 이동)
- ✅ 웨이폼 시각화 (librosa 기반)
- ✅ 셔플/반복 재생 모드
- ✅ 자동 다음 곡 재생

#### 2. 폴더 관리
- ✅ 폴더 추가/제거
- ✅ 비동기 폴더 스캔 (스레드 사용)
- ✅ 지원 형식: MP3, WAV, FLAC, OGG, M4A 등
- ✅ 메타데이터 자동 추출 (ID3 태그)
- ✅ 앨범 아트 자동 추출 및 캐싱

#### 3. 메타데이터 관리
- ✅ 메타데이터 표시 (제목, 아티스트, 앨범, 연도, 장르)
- ✅ 메타데이터 편집 (다이얼로그)
- ✅ 앨범 아트 설정/변경
- ✅ 자동 메타데이터 추출 (mutagen 사용)

#### 4. 태그 시스템
- ✅ 태그 생성/삭제/수정
- ✅ 태그별 색상 지정
- ✅ 노래에 태그 할당/제거
- ✅ 태그 기반 필터링 (AND/OR 모드)
- ✅ 태그 표시 (재생 목록)

#### 5. 플레이리스트 기능
- ✅ 플레이리스트 생성/삭제
- ✅ 플레이리스트에 노래 추가/제거
- ✅ 플레이리스트 재생
- ✅ 드래그 앤 드롭으로 순서 변경

#### 6. 비디오 동기화
- ✅ 노래별 비디오 파일 설정
- ✅ 딜레이 설정 (밀리초 단위)
- ✅ 오디오와 비디오 동시 재생 (VLC)

#### 7. UI 구성
- ✅ 디스코드 스타일 테마
- ✅ 사이드바 (대시보드, 폴더, 플레이리스트)
- ✅ 재생 목록 뷰
- ✅ 플레이어 컨트롤 바 (하단 고정)
- ✅ 웨이폼 위젯
- ✅ 컨텍스트 메뉴

### ⚠️ 개선 필요 사항
- [ ] 검색 기능
- [ ] 재생 목록 정렬
- [ ] 재생 목록 가상화 (대량 노래 처리)
- [ ] 키보드 단축키
- [ ] 재생 히스토리
- [ ] 통계 기능

---

## 기술 스택

### 프론트엔드 (Tauri)
- **프레임워크**: React + TypeScript
- **스타일링**: Tailwind CSS
- **상태 관리**: Zustand (또는 React Context)
- **아이콘**: Lucide React
- **드래그 앤 드롭**: @hello-pangea/dnd
- **웨이폼**: Wavesurfer.js 또는 Canvas API

### 백엔드 (Rust)
- **프레임워크**: Tauri
- **오디오 재생**: 
  - `rodio`: 기본 오디오 재생
  - `hound`: WAV 파일 디코딩
  - `ffmpeg-next`: 다양한 포맷 지원 (선택)
- **비디오 재생**: 
  - `tauri-plugin-shell`: 외부 플레이어 실행 (VLC)
  - 또는 `gstreamer` (선택)
- **데이터베이스**: `rusqlite` (SQLite)
- **웨이폼 추출**: 
  - `hound` + `rubato`: 오디오 디코딩 및 리샘플링
  - 또는 `ffmpeg-next`: 빠른 추출

### 공통
- **데이터베이스**: SQLite (기존 스키마 유지)
- **설정 관리**: JSON 파일 (config.json)
- **캐싱**: 파일 시스템 (앨범 아트, 웨이폼 데이터)

---

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│              Frontend (React + TypeScript)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │ Sidebar  │  │ Playlist │  │ Player   │  │ Waveform││
│  │          │  │ View     │  │ Controls │  │ Widget  ││
│  └──────────┘  └──────────┘  └──────────┘  └────────┘│
│  ┌──────────────────────────────────────────────────┐ │
│  │         State Management (Zustand)               │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                        ↕ IPC (Tauri Commands)
┌─────────────────────────────────────────────────────────┐
│              Backend (Rust)                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │ Player   │  │ Metadata │  │ Tag      │  │ Folder ││
│  │ Manager  │  │ Manager  │  │ Manager  │  │ Scanner││
│  └──────────┘  └──────────┘  └──────────┘  └────────┘│
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐│
│  │ Playlist │  │ Video    │  │ Waveform Extractor  ││
│  │ Manager  │  │ Sync     │  │                     ││
│  └──────────┘  └──────────┘  └────────────────────┘│
└─────────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────────┐
│              Data Layer                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ SQLite   │  │ Config    │  │ File System Cache  │   │
│  │ Database │  │ Manager   │  │ (Album Art, Wave)  │   │
│  └──────────┘  └──────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 데이터베이스 스키마

### songs 테이블
```sql
CREATE TABLE songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL UNIQUE,
    title TEXT,
    artist TEXT,
    album TEXT,
    duration REAL,
    year INTEGER,
    genre TEXT,
    album_art_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### tags 테이블
```sql
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### song_tags 테이블 (다대다 관계)
```sql
CREATE TABLE song_tags (
    song_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (song_id, tag_id),
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

### video_syncs 테이블
```sql
CREATE TABLE video_syncs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL UNIQUE,
    video_path TEXT NOT NULL,
    delay_ms INTEGER DEFAULT 0,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);
```

### folders 테이블
```sql
CREATE TABLE folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    name TEXT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### playlists 테이블
```sql
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    is_dynamic INTEGER DEFAULT 0,  -- 0: 정적, 1: 동적
    filter_tags TEXT,  -- JSON 형식: [tag_id1, tag_id2, ...]
    filter_mode TEXT DEFAULT 'OR',  -- 'AND' or 'OR'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### playlist_songs 테이블 (다대다 관계)
```sql
CREATE TABLE playlist_songs (
    playlist_id INTEGER NOT NULL,
    song_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, song_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);
```

---

## UI/UX 디자인

### 디스코드 스타일 색상 팔레트

```typescript
// tailwind.config.ts
discord: {
  bg: '#36393f',        // 메인 배경
  sidebar: '#2f3136',   // 사이드바 배경
  accent: '#5865f2',    // 강조 색상 (선택된 항목)
  hover: '#42464d',     // 호버 상태
  text: '#dcddde',      // 주요 텍스트
  muted: '#72767d',     // 비활성 텍스트
  success: '#3ba55c',   // 성공 색상
  warning: '#faa61a',   // 경고 색상
  danger: '#ed4245',    // 위험/삭제 색상
}
```

### 폰트
- **폰트 패밀리**: `Noto Sans KR` (한글 지원)
- **기본 크기**: `14px` (text-sm)
- **기본 굵기**: `500` (font-medium)
- **헤더 굵기**: `600` (font-semibold)

### 레이아웃 구조

```
┌─────────────────────────────────────────────────────────┐
│                    Title Bar                            │
├──────────┬─────────────────────────────────────────────┤
│          │                                              │
│ Sidebar  │           Main Content Area                  │
│ (256px)  │           (Playlist View)                    │
│          │                                              │
│ ┌──────┐ │  ┌──────────────────────────────────────┐   │
│ │ Dash │ │  │  Song List Table                    │   │
│ │ board│ │  │  ┌────────────────────────────────┐  │   │
│ └──────┘ │  │  │ Title | Artist | Album | ... │  │   │
│          │  │  └────────────────────────────────┘  │   │
│ ┌──────┐ │  │                                      │   │
│ │Folder│ │  │                                      │   │
│ │ List │ │  │                                      │   │
│ └──────┘ │  │                                      │   │
│          │  │                                      │   │
│ ┌──────┐ │  └──────────────────────────────────────┘   │
│ │Play- │ │                                              │
│ │list │ │                                              │
│ │List │ │                                              │
│ └──────┘ │                                              │
│          │                                              │
├──────────┴─────────────────────────────────────────────┤
│              Player Controls Bar                        │
│  [Album Art] [Title/Artist] [◄] [▶] [►] [Progress] [Vol]│
│              [Waveform Visualization]                   │
└─────────────────────────────────────────────────────────┘
```

### 사이드바 디자인 (Electron 레퍼런스 기반)

#### 대시보드 메뉴
- **레이아웃**: `flex items-center gap-3 px-3 py-2 rounded`
- **아이콘**: `LayoutDashboard` (18x18)
- **텍스트**: "대시보드" (14px, font-medium)
- **선택 시**: `bg-discord-accent text-white`
- **호버 시**: `bg-discord-hover`

#### 폴더/플레이리스트 헤더
- **텍스트**: 대문자, `text-sm font-semibold text-discord-muted uppercase tracking-wide`
- **추가 버튼**: `Plus` 아이콘 (14x14), `opacity-0` (기본), 호버 시 표시

#### 폴더/플레이리스트 아이템
- **레이아웃**: `flex items-center py-2 px-3 mb-1 rounded`
- **패딩**: `12px 8px` (px-3 py-2)
- **간격**: `4px` (mb-1)
- **border-radius**: `6px`
- **선택 시**: `bg-discord-accent text-white`
- **호버 시**: `bg-discord-hover`
- **설정 아이콘**: 
  - 기본: `opacity-0`
  - 호버/선택: `opacity-70 hover:opacity-100`
  - 위치: 우측, `ml-2 p-1 rounded`

### 스크롤바 스타일
```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-thumb {
  background: #202225;  /* 기본 */
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #36393f;  /* 호버 */
}
```

### 플레이어 컨트롤 바
- **위치**: 하단 고정
- **높이**: 약 120px (앨범 아트 + 컨트롤 + 웨이폼)
- **패딩**: `16px` (좌우), `8px` (상하)
- **레이아웃**: 
  - 왼쪽: 앨범 아트 (56x56) + 제목/아티스트
  - 중앙: 재생 컨트롤 + 진행바
  - 오른쪽: 볼륨 컨트롤

---

## 핵심 기능 명세

### 1. 기본 플레이어 기능

#### Tauri Command: `play_song`
```rust
#[tauri::command]
async fn play_song(file_path: String) -> Result<(), String>
```

#### Tauri Command: `pause_song`
```rust
#[tauri::command]
async fn pause_song() -> Result<(), String>
```

#### Tauri Command: `set_volume`
```rust
#[tauri::command]
async fn set_volume(volume: u8) -> Result<(), String>  // 0-100
```

#### Tauri Command: `seek_to`
```rust
#[tauri::command]
async fn seek_to(position: f64) -> Result<(), String>  // 0.0-1.0
```

#### Tauri Event: `position-changed`
```rust
// 백엔드에서 주기적으로 전송 (100ms 간격)
app.emit("position-changed", position)?;
```

#### Tauri Event: `playback-finished`
```rust
// 재생 완료 시 전송
app.emit("playback-finished", ())?;
```

### 2. 폴더 관리

#### Tauri Command: `add_folder`
```rust
#[tauri::command]
async fn add_folder(path: String) -> Result<Folder, String>
```

#### Tauri Command: `scan_folder`
```rust
#[tauri::command]
async fn scan_folder(folder_id: i64) -> Result<ScanProgress, String>
```

#### Tauri Event: `scan-progress`
```rust
// 스캔 진행 상황 전송
app.emit("scan-progress", progress)?;
```

### 3. 메타데이터 관리

#### Tauri Command: `get_song_metadata`
```rust
#[tauri::command]
async fn get_song_metadata(song_id: i64) -> Result<SongMetadata, String>
```

#### Tauri Command: `update_song_metadata`
```rust
#[tauri::command]
async fn update_song_metadata(
    song_id: i64,
    metadata: SongMetadata
) -> Result<(), String>
```

### 4. 태그 시스템

#### Tauri Command: `create_tag`
```rust
#[tauri::command]
async fn create_tag(name: String, color: String) -> Result<Tag, String>
```

#### Tauri Command: `assign_tag_to_song`
```rust
#[tauri::command]
async fn assign_tag_to_song(
    song_id: i64,
    tag_id: i64
) -> Result<(), String>
```

#### Tauri Command: `filter_songs_by_tags`
```rust
#[tauri::command]
async fn filter_songs_by_tags(
    tag_ids: Vec<i64>,
    mode: String  // "AND" or "OR"
) -> Result<Vec<Song>, String>
```

### 5. 플레이리스트 기능

#### Tauri Command: `create_playlist`
```rust
#[tauri::command]
async fn create_playlist(name: String) -> Result<Playlist, String>
```

#### Tauri Command: `add_song_to_playlist`
```rust
#[tauri::command]
async fn add_song_to_playlist(
    playlist_id: i64,
    song_id: i64,
    position: Option<i32>
) -> Result<(), String>
```

#### Tauri Command: `reorder_playlist_songs`
```rust
#[tauri::command]
async fn reorder_playlist_songs(
    playlist_id: i64,
    song_ids: Vec<i64>
) -> Result<(), String>
```

### 6. 웨이폼 추출

#### Tauri Command: `extract_waveform`
```rust
#[tauri::command]
async fn extract_waveform(
    file_path: String,
    max_samples: usize  // 기본: 1000
) -> Result<Vec<f32>, String>
```

**구현 방식**:
- Rust: `hound`로 오디오 디코딩 → 다운샘플링 → 정규화
- 캐싱: `.npy` 파일 대신 JSON 또는 바이너리 파일로 저장
- 성능: Python보다 3-5배 빠름

### 7. 비디오 동기화

#### Tauri Command: `set_video_sync`
```rust
#[tauri::command]
async fn set_video_sync(
    song_id: i64,
    video_path: String,
    delay_ms: i32
) -> Result<(), String>
```

#### Tauri Command: `play_video`
```rust
#[tauri::command]
async fn play_video(
    video_path: String,
    delay_ms: i32
) -> Result<(), String>
```

**구현 방식**:
- 외부 VLC 실행 (tauri-plugin-shell)
- 또는 GStreamer 사용 (선택)

---

## 파일 구조

```
tag-mplay-tauri/
├── src-tauri/                    # Rust 백엔드
│   ├── src/
│   │   ├── main.rs              # Tauri 진입점
│   │   ├── commands/            # Tauri Commands
│   │   │   ├── mod.rs
│   │   │   ├── player.rs        # 플레이어 관련
│   │   │   ├── folder.rs        # 폴더 관리
│   │   │   ├── metadata.rs      # 메타데이터
│   │   │   ├── tag.rs           # 태그 시스템
│   │   │   ├── playlist.rs       # 플레이리스트
│   │   │   ├── waveform.rs      # 웨이폼 추출
│   │   │   └── video.rs          # 비디오 동기화
│   │   ├── database/            # 데이터베이스
│   │   │   ├── mod.rs
│   │   │   ├── connection.rs    # DB 연결
│   │   │   └── migrations.rs    # 스키마 마이그레이션
│   │   ├── models/              # 데이터 모델
│   │   │   ├── mod.rs
│   │   │   ├── song.rs
│   │   │   ├── tag.rs
│   │   │   ├── playlist.rs
│   │   │   └── folder.rs
│   │   ├── services/            # 비즈니스 로직
│   │   │   ├── mod.rs
│   │   │   ├── player_service.rs
│   │   │   ├── metadata_service.rs
│   │   │   ├── tag_service.rs
│   │   │   ├── playlist_service.rs
│   │   │   └── waveform_service.rs
│   │   └── utils/               # 유틸리티
│   │       ├── mod.rs
│   │       └── config.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                          # React 프론트엔드
│   ├── main.tsx                 # 진입점
│   ├── App.tsx                  # 메인 앱 컴포넌트
│   ├── components/              # UI 컴포넌트
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── DashboardMenu.tsx
│   │   │   ├── FolderPanel.tsx
│   │   │   └── PlaylistPanel.tsx
│   │   ├── PlaylistView/
│   │   │   ├── PlaylistView.tsx
│   │   │   └── SongTable.tsx
│   │   ├── PlayerControls/
│   │   │   ├── PlayerControls.tsx
│   │   │   └── WaveformWidget.tsx
│   │   └── common/
│   │       ├── Button.tsx
│   │       └── Icon.tsx
│   ├── hooks/                   # React Hooks
│   │   ├── usePlayer.ts
│   │   ├── usePlaylist.ts
│   │   └── useTags.ts
│   ├── stores/                  # 상태 관리 (Zustand)
│   │   ├── playerStore.ts
│   │   ├── playlistStore.ts
│   │   ├── tagStore.ts
│   │   └── folderStore.ts
│   ├── types/                   # TypeScript 타입
│   │   ├── song.ts
│   │   ├── tag.ts
│   │   └── playlist.ts
│   └── styles/                  # 스타일
│       ├── index.css
│       └── tailwind.config.ts
│
├── data/                        # 데이터 디렉토리
│   ├── database.db             # SQLite 데이터베이스
│   ├── config.json             # 설정 파일
│   ├── album_arts/             # 앨범 아트 캐시
│   └── waveforms/              # 웨이폼 데이터 캐시
│
├── public/                      # 정적 파일
│   └── icons/
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 마이그레이션 계획

### Phase 1: 프로젝트 초기 설정 (1-2일)
1. Tauri 프로젝트 생성
2. React + TypeScript 설정
3. Tailwind CSS 설정
4. 기본 레이아웃 구조 생성

### Phase 2: 데이터베이스 마이그레이션 (1일)
1. SQLite 데이터베이스 스키마 Rust로 구현
2. 기존 데이터베이스 마이그레이션 스크립트 작성
3. 데이터베이스 연결 및 테스트

### Phase 3: 백엔드 핵심 기능 (3-5일)
1. 플레이어 관리 (rodio/hound)
2. 폴더 스캔 (비동기)
3. 메타데이터 추출 (ID3 태그)
4. 웨이폼 추출 (hound + 다운샘플링)

### Phase 4: 프론트엔드 UI 구현 (5-7일)
1. 사이드바 (대시보드, 폴더, 플레이리스트)
2. 재생 목록 뷰
3. 플레이어 컨트롤 바
4. 웨이폼 위젯 (Wavesurfer.js 또는 Canvas)

### Phase 5: 통합 및 테스트 (2-3일)
1. 프론트엔드-백엔드 통합
2. 기능 테스트
3. 성능 최적화
4. 버그 수정

### Phase 6: 추가 기능 (선택)
1. 태그 시스템
2. 플레이리스트 기능
3. 비디오 동기화
4. 검색/정렬 기능

---

## 구현 단계

### 1단계: 프로젝트 초기화

```bash
# Tauri 프로젝트 생성
npm create tauri-app@latest tag-mplay-tauri
cd tag-mplay-tauri

# 의존성 설치
npm install

# Tailwind CSS 설정
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 추가 라이브러리
npm install lucide-react @hello-pangea/dnd zustand
npm install wavesurfer.js  # 웨이폼 시각화 (선택)
```

### 2단계: Rust 백엔드 설정

```toml
# Cargo.toml
[dependencies]
tauri = { version = "1.5", features = ["shell-open"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
rusqlite = { version = "0.29", features = ["bundled"] }
rodio = "0.17"
hound = "3.5"
tokio = { version = "1", features = ["full"] }
```

### 3단계: 데이터베이스 모델

```rust
// src/models/song.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: i64,
    pub file_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<f64>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub album_art_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
```

### 4단계: Tauri Commands 구현

```rust
// src/commands/player.rs
#[tauri::command]
pub async fn play_song(file_path: String) -> Result<(), String> {
    // rodio 또는 hound로 오디오 재생
    Ok(())
}
```

### 5단계: 프론트엔드 컴포넌트

```tsx
// src/components/Sidebar/Sidebar.tsx
import { invoke } from '@tauri-apps/api/tauri';

export const Sidebar = () => {
  const folders = useFolderStore();
  
  return (
    <div className="w-64 bg-discord-sidebar">
      <DashboardMenu />
      <FolderPanel />
      <PlaylistPanel />
    </div>
  );
};
```

---

## 성능 최적화

### 웨이폼 추출
- **캐싱**: 첫 추출 후 JSON 파일로 저장
- **비동기**: 백그라운드 스레드에서 처리
- **부분 로딩**: 필요한 샘플만 읽기

### 재생 목록 렌더링
- **가상화**: `react-window` 또는 `react-virtual` 사용
- **페이지네이션**: 대량 노래 처리 시

### 데이터베이스
- **인덱스**: `file_path`, `title`, `artist` 등에 인덱스 추가
- **연결 풀링**: SQLite 연결 재사용

---

## 참고 자료

### Tauri
- [Tauri 공식 문서](https://tauri.app/)
- [Tauri API 문서](https://tauri.app/api/)

### Rust 오디오
- [rodio 문서](https://docs.rs/rodio/)
- [hound 문서](https://docs.rs/hound/)

### React
- [React 공식 문서](https://react.dev/)
- [Zustand 문서](https://github.com/pmndrs/zustand)

### 디자인
- Electron 레퍼런스 프로젝트 (`electron-reference/`)
- Discord 색상 팔레트

---

## 다음 단계

1. **프로젝트 생성**: Tauri 프로젝트 초기화
2. **기본 구조**: 레이아웃 및 컴포넌트 구조 생성
3. **데이터베이스**: SQLite 스키마 구현
4. **플레이어**: 기본 재생 기능 구현
5. **UI 통합**: 프론트엔드-백엔드 연결

---

**작성일**: 2025-01-XX
**버전**: 1.0
**상태**: 설계 완료, 구현 준비
