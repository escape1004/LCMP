# Electron 프로젝트 디자인 분석 결과

## 색상 팔레트 비교

### Electron 프로젝트 (tailwind.config.ts)
```typescript
discord: {
  bg: '#36393f',        // 메인 배경
  sidebar: '#2f3136',   // 사이드바 배경
  accent: '#5865f2',    // 강조 색상
  hover: '#42464d',      // 호버 상태 ⚠️ 현재와 다름
  text: '#dcddde',      // 주요 텍스트
  muted: '#72767d',      // 비활성 텍스트
}
```

### 현재 PyQt6 프로젝트
```python
COLORS = {
    "background": "#36393f",    # 동일
    "sidebar": "#2f3136",      # 동일
    "hover": "#40444b",         # ⚠️ 다름 (#42464d로 변경 필요)
    "accent": "#5865f2",        # 동일
    "text_primary": "#dcddde",  # 동일
    "text_muted": "#72767d",    # 동일
}
```

## 사이드바 아이템 스타일

### Electron 프로젝트 (Sidebar.tsx)
- **패딩**: `py-2 px-3` (8px 상하, 12px 좌우)
- **border-radius**: `rounded` (6px)
- **선택된 항목**: `bg-discord-accent text-white` (#5865f2 배경, 흰색 텍스트)
- **호버**: `hover:bg-discord-hover` (#42464d)
- **설정 아이콘**: 
  - 기본: `opacity-0` (숨김)
  - 호버/선택 시: `opacity-70 hover:opacity-100`
  - 위치: 우측, `ml-2 p-1 rounded`

### 현재 PyQt6 프로젝트
- **패딩**: `12px 10px` (상하 10px, 좌우 12px) ⚠️ 조정 필요
- **border-radius**: 6px ✅
- **선택된 항목**: #5865f2 배경, 흰색 텍스트 ✅
- **호버**: #36393f ⚠️ #42464d로 변경 필요
- **설정 아이콘**: 
  - 기본: `hide()` ✅
  - 선택 시: `show()` ✅
  - 위치: 우측 ✅

## 헤더 스타일

### Electron 프로젝트
```tsx
<h2 className="text-sm font-semibold text-discord-muted uppercase tracking-wide">
  카테고리
</h2>
```
- **색상**: `#72767d` (discord-muted)
- **크기**: `text-sm` (14px)
- **굵기**: `font-semibold` (600)
- **대문자**: `uppercase`
- **자간**: `tracking-wide`

### 현재 PyQt6 프로젝트
- **색상**: `#b9bbbe` ⚠️ #72767d로 변경 필요
- **크기**: 14px ✅
- **굵기**: 500 ⚠️ 600으로 변경 필요
- **대문자**: 없음 ⚠️ 추가 필요
- **자간**: 없음 ⚠️ 추가 필요

## 스크롤바 스타일

### Electron 프로젝트 (index.css)
```css
.discord-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.discord-scrollbar::-webkit-scrollbar-thumb {
  background: #202225;  /* 기본 */
  border-radius: 4px;
}

.discord-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #36393f;  /* 호버 */
}
```

### 현재 PyQt6 프로젝트
- **width**: 12px ⚠️ 8px로 변경 필요
- **thumb 기본**: #40444b ⚠️ #202225로 변경 필요
- **thumb 호버**: #72767d ⚠️ #36393f로 변경 필요
- **border-radius**: 6px ⚠️ 4px로 변경 필요

## 적용할 개선 사항

1. **hover 색상**: #40444b → #42464d
2. **헤더 텍스트 색상**: #b9bbbe → #72767d
3. **헤더 텍스트 스타일**: 대문자, 자간 추가, 굵기 600
4. **스크롤바**: width 8px, thumb 색상 조정
5. **패딩**: 상하 8px로 조정 (현재 10px)
