# SecuWatcher Export UI/UX 개선 프로젝트 — 인수인계 문서

## 1. 프로젝트 개요

SecuWatcher는 영상 내 개인정보(얼굴, 차량, 번호판 등)를 탐지·마스킹·내보내기하는 Electron 데스크톱 앱입니다.
현재 UI/UX 전면 개선 작업을 진행 중이며, **목업 설계 단계가 완료**되어 **실제 Vue 컴포넌트 구현 단계**로 넘어가야 합니다.

**기술 스택**: Electron 36 + Vue 3.5 + Vite 5 + Pinia
**프로젝트 경로**: `secu_electron_v3/secuwatcher_electron/`

---

## 2. 완료된 작업

### 2-A. 색상 체계 확정 (Palette C — Logo Blue + Dark Label)

SECUWATCHER 로고 기반으로 색상 팔레트를 추출하여 **Palette C**가 최종 선택됨.

**핵심 색상**:

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

**다크 라벨 패턴** (바운딩 박스, 배지 등에 공통 적용):
- 배경: `rgba(18,21,25,0.88)`
- 테두리: `rgba(58,130,196,0.4)`
- 텍스트: `#3A82C4`

### 2-B. 바운딩 박스 스타일 적용 완료

`canvasDrawing.js`에 Palette C 기반 바운딩 박스 스타일이 **이미 구현되어 있음**.

```javascript
// canvasDrawing.js 내 BBOX_STYLES 상수
const BBOX_STYLES = {
  default: {  // 기본 상태 — 로고 블루
    border: 'rgba(58,130,196,0.5)',
    fill: 'rgba(58,130,196,0.03)',
    glowColor: 'rgba(58,130,196,0.2)',
    labelBorder: 'rgba(58,130,196,0.4)',
    labelColor: '#3A82C4',
  },
  selected: { // 선택 상태 — 레드
    border: 'rgba(239,68,68,0.5)',
    labelColor: '#EF4444',
  },
  hover: {    // 호버 상태 — 앰버
    border: 'rgba(251,191,36,0.55)',
    labelColor: '#FBBF24',
  },
};
```

**구현된 함수들**:
- `drawStyledBBox()` — 글로우 보더 + 다크 라벨 배지 + 흰색 엣지
- `drawStyledPolygon()` — 폴리곤 버전
- `drawStyledBBox_labelOnly()` — 라벨만 표시 (폴리곤용)
- `drawCSVMasks()` — 마스크 영역: `rgba(44,43,55,0.75)` 필 + `rgba(58,130,196,0.35)` 보더

### 2-C. 레이아웃 재설계 목업 완료

**선택된 레이아웃**: Option A — 좌측 아이콘 사이드바 (Figma/VS Code 스타일)

**핵심 구조 변경**:
- 기존 상단 탭바(72px) 제거 → **좌측 52px 아이콘 사이드바**
- 기존 우측 정보 패널(260px) 제거 → **상단 컨텍스트바(36px)** 통합
- 기존 하단 컨트롤(150px) → **플로팅 컨트롤바** (영상 위 오버레이)
- 영상 영역: 기존 ~55% → **~78%** 최대화

**사이드바 메뉴 구조** (위→아래):
1. 📄 **파일** (최상단) — 클릭 시 파일 목록 패널 토글
2. ─ 구분선 ─
3. ⊕ 자동탐지
4. ◎ 선택탐지
5. ─ 구분선 ─
6. ✦ 수동 (마스킹)
7. ─ 구분선 ─
8. ▷ 미리보기
9. ↗ 내보내기
10. (스페이서)
11. ─ 구분선 ─
12. ⊞ 일괄
13. ⚙ 설정

### 2-D. 기능별 상세 목업 완료

총 **10개 화면 상태**가 목업으로 설계됨:

| # | 모드 | 상태 | 주요 UI 요소 |
|---|------|------|-------------|
| ①-1 | 자동 객체 탐지 | 진행 중 | 우측 상단 탐지 팝업(프로그레스+ETA), 타임라인 하이라이트, pulse 인디케이터 |
| ①-2 | 자동 객체 탐지 | 완료 | 바운딩 박스(블루/레드/앰버 3색), 완료 배지 |
| ② | 선택 객체 탐지 | 진행 중 | 클릭 마커(빨간 십자선+펄스), 앰버 추적 박스, 탐지 팝업(+중단 버튼) |
| 공통-1 | 좌클릭 트랙 메뉴 | (모드 무관) | "시작 프레임으로 이동 (A)" / "끝 프레임으로 이동 (D)" |
| 공통-2 | 우클릭 마스크설정 | (모드 무관) | 1단 "마스크설정" (블루 하이라이트+▶) → 2단 "전체/여기서부터/여기까지" |
| 공통-3 | 우클릭 마스크해제 | (모드 무관) | 1단 "마스크해제" (블루 하이라이트+▶) → 2단 "전체/여기서부터/여기까지" |
| ③ | 수동 마스킹 | 그리기 중 | 좌측 도구 패널(형태/범위 선택), 캔버스 점/선/다각형, 완료된 마스크 영역 |
| ④ | 미리보기 | 마스크 적용 | 상단 배지, 모자이크 패턴 시뮬레이션, 마스킹 정보 오버레이 |
| ⑤ | 내보내기 | 모달 | 파일유형(일반/암호화), 저장경로, 비밀번호 강도, DRM 설정 |
| ⑥ | 설정 | 모달 | 3탭(자동탐지/내보내기/정보), 디바이스, 탐지대상, 동시처리 슬라이더 |
| ⑦ | 일괄처리 | 진행 중 | 단계 표시, 파일별/전체 진행률, 파일 목록 상태(완료/진행/대기), 취소 |

**공통 인터랙션** (자동탐지/선택탐지/미리보기 모드에서 동일):
- **좌클릭**: 트랙 메뉴 → 시작/끝 프레임 이동 (A/D 단축키)
- **우클릭 (마스크 미설정)**: "마스크설정 ▶" → 서브메뉴 "전체 / 여기서부터 / 여기까지"
- **우클릭 (마스크 설정됨)**: "마스크해제 ▶" → 서브메뉴 "전체 / 여기서부터 / 여기까지"

---

## 3. 목업 파일 목록

프로젝트 루트(`secu_electron_v3/`)에 위치:

| 파일 | 설명 | 상태 |
|------|------|------|
| `layout-mockup.html` | 전체 레이아웃 재설계 (Option A + 파일 패널) | ✅ 최종 확정 |
| `feature-mockups.html` | 기능별 상세 목업 (10개 화면 상태) | ✅ 최종 확정 |
| `color-template.html` | 색상 팔레트 3안 비교 (Palette C 선택) | ✅ 참고용 |
| `bbox-mockup.html` | 바운딩 박스 디자인 3안 (Option C 선택) | ✅ 참고용 |
| `controlbar-mockup.html` | 초기 컨트롤바 목업 (layout-mockup에 통합됨) | ⚠️ 구버전 |

---

## 4. 기존 코드 구조

### 4-A. 컴포넌트 (`src/components/`)

| 컴포넌트 | 역할 | 개선 대상 |
|----------|------|----------|
| `TopMenuBar.vue` | 상단 8탭 메뉴 | **→ 좌측 사이드바로 전면 교체** |
| `FilePanel.vue` | 우측 파일 정보 + 파일 목록 | **→ 토글 가능한 좌측 패널로 재구성** |
| `VideoCanvas.vue` | 비디오 + 캔버스 오버레이 | 레이아웃 변경 대응 필요 |
| `VideoControls.vue` | 하단 타임라인 + 버튼 | **→ 플로팅 컨트롤바로 전면 교체** |
| `ContextMenu.vue` | 우클릭 메뉴 | 스타일 업데이트 (2단 구조 유지) |
| `TrackMenu.vue` | 좌클릭 메뉴 | 스타일 업데이트 |

### 4-B. 모달 (`src/components/modals/`)

| 모달 | 용도 |
|------|------|
| `DetectingPopup.vue` | 탐지 진행 팝업 |
| `ExportModal.vue` | 내보내기 설정 |
| `SettingsModal.vue` | 설정 (3탭) |
| `BatchProcessingModal.vue` | 일괄처리 진행 |
| `MaskingAreaModal.vue` | 수동 마스킹 형태/범위 선택 |
| `WatermarkModal.vue` | 워터마크 설정 |
| `MergeModal.vue` | 영상 합병 |
| `MultiDetectionModal.vue` | 다중 파일 탐지 선택 |
| `ProcessingModal.vue` | 범용 처리 중 |
| `FolderLoadingModal.vue` | 폴더 로딩 |
| `MaskFrameModal.vue` | 마스크 프레임 |

### 4-C. 상태 관리 (`src/stores/`)

| 스토어 | 주요 상태 |
|--------|----------|
| `modeStore.js` | `currentMode`, `selectMode`, `isBoxPreviewing`, `maskMode`, `maskingPoints` |
| `detectionStore.js` | `isDetecting`, `detectionProgress`, `detectionEventType`, `detectionEta` |
| `videoStore.js` | `currentTime`, `progress`, `frameRate`, `zoomLevel`, `frameStepMode` |
| `fileStore.js` | `files[]`, `selectedFileIndex`, `fileInfoItems[]` |
| `configStore.js` | `allConfig`, `selectedSettingTab`, `settingAutoClasses` |
| `exportStore.js` | `exporting`, `exportProgress`, `isBatchProcessing`, `phase` |

### 4-D. Composables (`src/composables/`)

| 파일 | 역할 |
|------|------|
| `canvasDrawing.js` | **바운딩 박스/마스크 그리기 (Palette C 적용 완료)** |
| `canvasInteraction.js` | 캔버스 마우스 이벤트 처리 |
| `menuHandler.js` | 메뉴(탭) 클릭 핸들러 |
| `detectionManager.js` | 탐지 시작/중단/완료 로직 |
| `videoController.js` | 재생/일시정지/탐색 제어 |
| `maskingData.js` | 마스킹 데이터 관리 |
| `exportManager.js` | 내보내기 로직 |
| `videoEditor.js` | 트림/분할/합병 |
| `maskPreview.js` | 전체 마스킹 미리보기 |

### 4-E. 스타일 (`src/styles/`)

| 파일 | 역할 |
|------|------|
| `variables.css` | **CSS Custom Properties (전체 색상/간격/z-index 정의)** |

---

## 5. 다음 작업: 실제 Vue 컴포넌트 구현

### 5-A. 구현 우선순위 (권장)

**Phase 1 — 레이아웃 골격**
1. `App.vue` 레이아웃 변경: 상단탭+우측패널 → 좌측사이드바+메인
2. 새 컴포넌트 `SideBar.vue` 생성 (52px 아이콘 사이드바)
3. `FilePanel.vue` 리팩토링 (토글 가능한 좌측 패널)
4. 상단 컨텍스트바 추가 (36px, 파일정보+솔루션 로고+프레임정보)

**Phase 2 — 플로팅 컨트롤바**
5. `VideoControls.vue` → 플로팅 오버레이 스타일로 재설계
6. 플레이 버튼 + 타임라인 + 액션 버튼 1열 배치

**Phase 3 — 모드별 UI 개선**
7. `DetectingPopup.vue` 스타일 업데이트 (목업 반영)
8. `ContextMenu.vue` / `TrackMenu.vue` 스타일 업데이트
9. 수동 마스킹 도구 패널 (현재 모달 → 플로팅 패널)

**Phase 4 — 모달 스타일 통일**
10. `ExportModal.vue` 스타일 업데이트
11. `SettingsModal.vue` 스타일 업데이트
12. `BatchProcessingModal.vue` 스타일 업데이트

### 5-B. 주의사항

- **`canvasDrawing.js`는 이미 완료** — 바운딩 박스/마스크 스타일 수정 불필요
- **`variables.css`의 `--color-accent`(`#3B82F6`)와 `--color-accent-button`(`#3A82C4`) 구분 필요**
  - 목업/바운딩 박스에서는 `#3A82C4` (로고 블루) 사용
  - 기존 UI 요소 중 `--color-accent` 쓰는 곳은 점진적 마이그레이션
- **menuHandler.js의 모드 전환 로직은 유지** — 사이드바 아이콘 클릭 시 동일 함수 호출
- 기존 키보드 단축키(Ctrl+Shift+A, Ctrl+M 등) 유지 필요
- **다크 라벨 패턴**을 모든 배지/라벨 UI에 일관 적용:
  ```css
  background: rgba(18,21,25,0.88);
  border: 1px solid rgba(58,130,196,0.4);
  color: #3A82C4;
  ```

---

## 6. 유저 교정 이력 (반복 실수 방지)

| # | 실수 내용 | 유저 피드백 | 올바른 방향 |
|---|----------|-----------|------------|
| 1 | 임의 보라색(#8264ff) 사용 | "원래 프로젝트 톤으로 맞춰야" | `variables.css` 색상 체계 준수 |
| 2 | 순수 검정(#111) 배경 사용 | "다시 한번 확인해주세요" | 보라-남색 틴트 배경 (#121519, #1A1929) |
| 3 | #3B82F6를 주 액센트로 사용 | 로고 이미지 제공 | 로고 블루 #3A82C4 사용 |
| 4 | 좌클릭=객체선택, 우클릭=메뉴 | 실제 스크린샷 제공 | 좌클릭=객체추적, 우클릭=마스크설정 |
| 5 | 메뉴 구조 임의 설계 | 실제 스크린샷 3장 제공 | 기존 구현과 동일한 2단 메뉴 구조 유지 |

**핵심 원칙**: 색상/메뉴/기능은 반드시 기존 코드와 `variables.css`를 먼저 확인하고, 임의 값을 사용하지 않을 것.

---

## 7. 파일 변경 이력 요약

### 수정된 소스 파일
- `src/composables/canvasDrawing.js` — BBOX_STYLES 추가, drawStyledBBox/Polygon/labelOnly 함수, drawCSVMasks 스타일 변경

### 생성된 목업 파일 (프로젝트 루트)
- `layout-mockup.html` — 전체 레이아웃 목업
- `feature-mockups.html` — 기능별 상세 목업
- `color-template.html` — 색상 팔레트 비교
- `bbox-mockup.html` — 바운딩 박스 디자인
- `controlbar-mockup.html` — 초기 컨트롤바 (구버전)

---

*최종 업데이트: 2026-03-05*
