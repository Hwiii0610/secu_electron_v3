# SecuWatcher Export UI/UX 개선 프로젝트 — 인수인계 문서

## 1. 프로젝트 개요

SecuWatcher는 영상 내 개인정보(얼굴, 차량, 번호판 등)를 탐지·마스킹·내보내기하는 Electron 데스크톱 앱입니다.
현재 **레이아웃 구현이 완료**되었으며, **UX 개선 12건의 실제 적용** 단계로 넘어가야 합니다.

**기술 스택**: Electron 36 + Vue 3.5 (Options API) + Vite 5 + Pinia + FastAPI
**프로젝트 경로**: `secu_electron_v3/secuwatcher_electron/`

---

## 2. 완료된 작업

### Phase 1 — 레이아웃 골격 ✅

| 작업 | 상태 | 주요 파일 |
|------|------|----------|
| App.vue 레이아웃 변경 (좌측사이드바+메인) | ✅ 완료 | `App.vue` |
| SideBar.vue 생성 (80px 아이콘 사이드바) | ✅ 완료 | `SideBar.vue` |
| FilePanel.vue 리팩토링 (토글 좌측 패널) | ✅ 완료 | `FilePanel.vue`, `file-panel.css` |
| 상단 컨텍스트바 (파일정보+로고+프레임정보) | ✅ 완료 | `ContextBar.vue`, `contextbar.css` |

### Phase 2 — 플로팅 컨트롤바 ✅

| 작업 | 상태 | 주요 파일 |
|------|------|----------|
| VideoControls.vue 플로팅 오버레이 전환 | ✅ 완료 | `VideoControls.vue`, `floating-controls.css` |
| 플레이 버튼 + 타임라인 + 액션 버튼 1열 | ✅ 완료 | 동일 |
| 네비게이션 버튼 (구간/전체 이동) | ✅ 완료 | 동일 |
| 분할 로직 수정 (hasSegments 기반) | ✅ 완료 | 동일 |
| 폰트 사이즈 13px 통일 | ✅ 완료 | `contextbar.css`, `floating-controls.css` |

### Phase 2.5 — 파일 패널 토글 개선 ✅

| 작업 | 상태 | 주요 파일 |
|------|------|----------|
| v-show/transition → CSS transform 토글 전환 | ✅ 완료 | `FilePanel.vue`, `file-panel.css`, `App.vue` |
| 탭 핸들 패널 우측 중앙 돌출 | ✅ 완료 | `file-panel.css` |

### UX 크리틱 및 목업 ✅

| 작업 | 상태 | 산출물 |
|------|------|--------|
| UX 디자인 크리틱 분석 | ✅ 완료 | `UX_CRITIQUE_REPORT.md` |
| 개선안 12건 Before/After 목업 | ✅ 완료 | `ux-improvement-mockup.html` |

---

## 3. 색상 체계 (Palette C — Logo Blue + Dark Label)

| 용도 | 값 | CSS변수 |
|------|-----|---------|
| 로고 블루 (주 액센트) | `#3A82C4` | `--color-accent-button` |
| 기본 배경 | `#121519` | `--color-bg-primary` |
| 사이드바/패널 배경 | `#1A1929` | `--color-bg-secondary` |
| 비디오 배경 | `#1C1E26` | `--color-bg-video` |
| 컨텍스트바 배경 | `#22222D` | `--color-bg-darkest` |
| 테두리 | `#40404D` | `--color-border-solid` |
| 주 텍스트 | `#E8E8E8` | `--color-text-primary` |
| 보조 텍스트 | `#A0A0A0` | `--color-text-secondary` |
| 뮤트 텍스트 | `#aaaaaa` | `--color-text-muted` |
| 주황색 (파일명, 세그먼트) | `#E67E22` | — |
| 삭제 빨간색 | `#EF4444` | — |

**다크 라벨 패턴** (배지/라벨 공통):
```css
background: rgba(18,21,25,0.88);
border: 1px solid rgba(58,130,196,0.4);
color: #3A82C4;
```

---

## 4. 핵심 구현 패턴

### 4-A. 파일 패널 토글 (CSS transform 방식)

`FilePanel.vue`는 `collapsed` prop을 받아 CSS `transform: translateX`로 토글합니다.
`v-show`/`<transition>` 대신 CSS 클래스 토글을 사용합니다.

```html
<!-- App.vue -->
<FilePanel
  :collapsed="!isFilePanelOpen"
  @toggle="toggleFilePanel"
  @select-file="..." @trigger-file-input="..." @delete-file="..." @close="..."
/>
```

```css
/* file-panel.css */
.file-panel-container {
  overflow: visible; /* 탭 핸들 돌출 허용 */
  transition: transform 0.3s ease;
}
.file-panel-container.file-panel-collapsed {
  transform: translateX(calc(-100% - 6px));
}
```

탭 핸들은 `.file-panel-toggle-tab`으로 패널 우측 중앙에 `position: absolute; right: -24px; top: 50%`로 위치합니다.

### 4-B. 플로팅 컨트롤바 토글 (동일 패턴)

```css
/* floating-controls.css */
.floating-controls-bar.fcb-collapsed {
  transform: translateY(calc(100% + 16px));
}
```

`.fcb-toggle-tab`이 컨트롤바 상단 중앙에 돌출 (`top: -20px; left: 50%`).

### 4-C. 세그먼트/타임라인 getter

```javascript
// videoStore.js — segmentsWithLayout getter
// 각 세그먼트에 isActive, leftPercent, widthPercent, startTime, endTime 제공
// progress → currentTime 변환: (videoStore.progress / 100) * videoStore.videoDuration
```

---

## 5. 다음 작업: UX 개선 12건 구현

### 5-A. 즉시 적용 가능 (코드 수정만으로 해결)

| # | 개선 항목 | 대상 파일 | 내용 |
|---|----------|----------|------|
| ❶ | "취소" 버튼 라벨 변경 | `VideoControls.vue` | 재생 토글이면 "정지", 분할 취소면 "분할 취소"로 변경 |
| ❷ | 로딩 인디케이터 추가 | `FilePanel.vue`, `file-panel.css` | "대기중..." → CSS 애니메이션 dot + "파일 분석 중..." |
| ❸ | 토글 탭 텍스트 라벨 | `file-panel.css` | 토글 탭에 "파일" 세로 텍스트 추가 |
| ❹ | 파일 패널 폰트 12px | `file-panel.css` | row-header/row-content 10-11px → 12px |

### 5-B. 단기 개선 (설계 조정 필요)

| # | 개선 항목 | 대상 파일 | 내용 |
|---|----------|----------|------|
| ❺ | 파일 선택 시 자동 패널 접기 | `FilePanel.vue`, `App.vue` | selectFile 후 0.5초 딜레이 패널 토글 |
| ❻ | 파일 정보 아코디언화 | `FilePanel.vue`, `file-panel.css` | 파일 정보 영역 접기/펼치기 |
| ❼ | 네비게이션 버튼 약어 라벨 | `VideoControls.vue`, `floating-controls.css` | 아이콘 아래 2글자 라벨 (처음/구간/구간/끝) |
| ❽ | 패널↔컨트롤바 시각 분리 | `file-panel.css` | 좌측 accent border 추가 |
| ❾ | 사이드바 아이콘 그룹핑 | `SideBar.vue` | "미리보기"를 구분선 위 "탐지" 그룹으로 이동 |

### 5-C. 중장기 개선 (아키텍처/레이아웃 변경)

| # | 개선 항목 | 내용 |
|---|----------|------|
| ❿ | 오버레이→인라인 전환 | 패널 오픈 시 비디오 영역 리사이즈 |
| ⓫ | 색상 체계 정리 | 주황색 이중 의미 해소 (파일명 vs 세그먼트) |
| ⓬ | 온보딩 가이드 | 첫 실행 시 주요 UI 하이라이트 투어 |

---

## 6. 코드 구조

### 6-A. 컴포넌트 (`src/components/`)

| 컴포넌트 | 역할 | 현재 상태 |
|----------|------|----------|
| `SideBar.vue` | 좌측 80px 아이콘 사이드바 | ✅ 신규 구현 완료 |
| `ContextBar.vue` | 상단 컨텍스트바 (파일정보+로고+프레임) | ✅ 신규 구현 완료 |
| `FilePanel.vue` | 토글 좌측 패널 (파일정보+목록) | ✅ 리팩토링 완료 |
| `VideoControls.vue` | 플로팅 컨트롤바 (타임라인+액션) | ✅ 전면 개편 완료 |
| `VideoCanvas.vue` | 비디오 + 캔버스 오버레이 | 레이아웃 대응 완료 |
| `ContextMenu.vue` | 우클릭 메뉴 (2단 구조) | 스타일 업데이트 필요 |
| `TrackMenu.vue` | 좌클릭 메뉴 | 스타일 업데이트 필요 |

### 6-B. 스타일 (`src/styles/`)

| 파일 | 역할 |
|------|------|
| `variables.css` | CSS Custom Properties (전체 색상/간격/z-index) |
| `floating-controls.css` | 플로팅 컨트롤바 전용 스타일 |
| `contextbar.css` | 상단 컨텍스트바 스타일 |
| `file-panel.css` | 파일 패널 + 토글 탭 스타일 |

### 6-C. 상태 관리 (`src/stores/`)

| 스토어 | 주요 상태 |
|--------|----------|
| `modeStore.js` | `currentMode`, `selectMode`, `isBoxPreviewing`, `maskMode` |
| `detectionStore.js` | `isDetecting`, `detectionProgress`, `isBusy` |
| `videoStore.js` | `currentTime`, `progress`, `frameRate`, `zoomLevel`, `segmentsWithLayout` |
| `fileStore.js` | `files[]`, `selectedFileIndex`, `fileInfoItems[]` |
| `configStore.js` | `allConfig`, `selectedSettingTab` |
| `exportStore.js` | `exporting`, `exportProgress`, `isBatchProcessing` |

---

## 7. 산출물 파일 목록

| 파일 | 설명 | 상태 |
|------|------|------|
| `layout-mockup.html` | 전체 레이아웃 목업 (Option A) | ✅ 참고용 |
| `feature-mockups.html` | 기능별 상세 목업 (10개 화면) | ✅ 참고용 |
| `ux-improvement-mockup.html` | **UX 개선 12건 Before/After 목업** | ✅ 최신 |
| `UX_CRITIQUE_REPORT.md` | UX 디자인 크리틱 분석 리포트 | ✅ 최신 |
| `color-template.html` | 색상 팔레트 3안 비교 | ✅ 참고용 |
| `bbox-mockup.html` | 바운딩 박스 디자인 3안 | ✅ 참고용 |
| `controlbar-mockup.html` | 초기 컨트롤바 목업 | ⚠️ 구버전 |
| `AGENT_OPERATION_PLAN.md` | 에이전트 작업 계획 | ✅ 참고용 |

---

## 8. 유저 교정 이력 (반복 실수 방지)

| # | 실수 내용 | 올바른 방향 |
|---|----------|------------|
| 1 | 임의 보라색(#8264ff) 사용 | `variables.css` 색상 체계 준수 |
| 2 | 순수 검정(#111) 배경 사용 | 보라-남색 틴트 배경 (#121519, #1A1929) |
| 3 | #3B82F6를 주 액센트로 사용 | 로고 블루 #3A82C4 사용 |
| 4 | 좌클릭=객체선택, 우클릭=메뉴 | 좌클릭=객체추적, 우클릭=마스크설정 |
| 5 | 메뉴 구조 임의 설계 | 기존 구현과 동일한 2단 메뉴 구조 유지 |

**핵심 원칙**: 색상/메뉴/기능은 반드시 기존 코드와 `variables.css`를 먼저 확인하고, 임의 값을 사용하지 않을 것.

---

## 9. 다음 세션 시작 시 권장 흐름

1. `ux-improvement-mockup.html`을 열어 12건 개선안 확인
2. 유저에게 어떤 항목부터 구현할지 확인 (즉시 적용 ❶~❹ 권장)
3. 해당 파일을 읽고 수정 후 `npm run build`로 검증
4. 빌드 시 `EPERM: emptyDir` 에러는 샌드박스 환경 제한이므로 무시 (155 modules transformed = 성공)

---

*최종 업데이트: 2026-03-06*
