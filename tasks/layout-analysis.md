# SecuWatcher 레이아웃 구조 분석 문서

## 1. 전체 레이아웃 트리 구조

```
body
├── .title-bar (32px) - Electron 타이틀바
│
└── .container (100vh - 32px)
    ├── TopMenuBar (export-container) - 메뉴/툴 바
    │
    └── .wrapper (flex)
        ├── .video-wrapper (flex: 1, position: relative)  ← DetectingPopup 부모
        │   ├── .video-container
        │   │   └── VideoCanvas
        │   ├── ContextMenu
        │   ├── VideoControls
        │   └── DetectingPopup (absolute positioned)
        │
        └── FilePanel (.file-wrapper, 220px)
```

## 2. DetectingPopup 실제 구조

### 2.1 DOM 계층 구조

```html
<!-- App.vue -->
<div class="video-wrapper" style="position: relative;">
  <DetectingPopup v-if="isDetecting" />
</div>

<!-- DetectingPopup.vue -->
<div class="auto-detect-popup">
  <div class="auto-detect-content">
    <div class="auto-detect-text">{{ detectionLabel }}</div>
    <div class="auto-progress-bar-container">
      <div class="auto-progress-bar" :style="{ width: detectionProgress + '%' }"></div>
      <div class="auto-progress-label">{{ detectionProgress }}%</div>
    </div>
    <button class="auto-detect-cancel-btn">중단</button>
  </div>
</div>
```

### 2.2 CSS 실제 값 (modals.css) ✅ 업데이트됨

```css
/* 기본 스타일 - 라인 520-525 */
.auto-detect-popup {
  position: fixed;     /* 화면 기준 */
  top: 96px;           /* title-bar(32px) + export-container(64px) = FilePanel top */
  right: 250px;        /* container-padding(20px) + file-panel(220px) + gap(10px) */
  z-index: 100;
}

/* 팝업 내용물 스타일 - 라인 528-536 */
.auto-detect-content {
  background-color: #2c2c2c;
  padding: 16px 24px;
  border-radius: 8px;
  text-align: center;
  color: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  border: 1px solid #444;
}

/* 반응형 - 라인 780-784 */
@media screen and (max-width: 1366px) {
  .auto-detect-popup {
    right: 230px;    /* container-padding(20px) + file-panel(200px) + gap(10px) */
  }
}
```

## 3. 레이아웃 특성 분석

### 3.1 Positioning Context ✅ 변경됨
- **기준점**: **Viewport (화면)**
- **DetectingPopup**: `position: fixed` (화면 기준)
- **위치**: FilePanel과 같은 높이 96px (title-bar 32px + export-container 64px)
- **우측**: 컨테이너 패딩(20px) + 파일패널(220px) + gap(10px) = 250px

### 3.2 반응형 동작
- `@media (max-width: 1366px)`: `right: 230px`로 변경
- 파일패널이 220px → 200px로 줄어들 때 대응

### 3.3 시각적 표시
- `.auto-detect-popup`: 투명한 래퍼 (전체 너비)
- `.auto-detect-content`: 실제 보이는 팝업 (중앙 정렬됨)

## 4. 문제점 분석

### 4.1 현재 레이아웃 이슈
1. **top: 0** - 비디오 영역 최상단에 위치 (메뉴 바와 겹칠 수 있음)
2. **left: 0, right: 0** - 전체 너비 차지 (의도된 동작인지 확인 필요)
3. **right: 230px 미디어 쿼리** - 기본값과 충돌 가능성

### 4.2 ✅ 수정 완료 - 의도된 동작과 일치
| 속성 | 의도 | 실제 (수정 후) |
|------|------|----------------|
| position | fixed (화면 기준) | fixed |
| top | FilePanel과 같은 높이 96px | 96px |
| right | 파일 패널 왼쪽 250px | 250px |
| 위치 | 화면 우측 상단 (녹색 영역) | 화면 우측 상단 |

## 5. ✅ 적용된 수정사항

### 5.1 최종 선택: Fixed + 화면 기준 위치
```css
.auto-detect-popup {
  position: fixed;    /* 화면 기준 */
  top: 96px;          /* FilePanel과 같은 높이 (title-bar 32px + export-container 64px) */
  right: 250px;       /* file-panel 왼쪽 여백 */
  z-index: 100;
}

@media screen and (max-width: 1366px) {
  .auto-detect-popup {
    right: 230px;     /* file-panel 200px 기준 */
  }
}
```

**선택 이유:**
1. **정확한 위치**: 상단 툴 바 아래, 파일 패널 왼쪽에 고정
2. **화면 기준**: 비디오 영역과 무관하게 일관된 위치 유지
3. **반응형 대응**: 미디어쿼리로 파일패널 너비 변화 대응
4. **UX**: 탐지 중에도 다른 작업 가능한 비모달 팝업

## 6. 관련 파일 목록

| 파일 | 설명 | 중요 라인 |
|------|------|----------|
| App.vue | DetectingPopup 위치 | 13 (video-wrapper 난내) |
| DetectingPopup.vue | 팝업 컴포넌트 | 1-17 (템플릿) |
| modals.css | 팝업 스타일 | 519-526, 528-534, 780-784 |
| layout.css | video-wrapper 레이아웃 | - |

## 7. 수정 이력

| 날짜 | 수정 내용 | 파일 | 라인 |
|------|----------|------|------|
| 2026-02-25 | \n escape sequence 오류 수정 | modals.css | 522 |
| 2026-02-25 | 팝업 위치 변경: absolute + right alignment | modals.css | 520-526 |
| 2026-02-25 | 팝업 위치 변경: fixed positioning | modals.css | 520-525 |
| 2026-02-25 | 팝업 위치 수정: top 45px → 96px (FilePanel과 같은 높이) | modals.css | 522 |
| 2026-02-25 | 레이아웃 계산맵 생성 | tasks/layout-calculation-map.md | 신규 |

---

**참고**: `.auto-detect-popup`은 `position: fixed`로 설정되어 화면 기준으로 위치합니다. 정확한 계산은 `layout-calculation-map.md`을 참조하세요.
