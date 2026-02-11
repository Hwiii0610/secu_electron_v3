# SecuWatcher Export — Phase 1B 리팩토링 기능 점검 보고서

**점검일**: 2026-02-11
**비교 기준**: `fd45d29` (리팩토링 전) vs `78af9d1` (2차 리팩토링 후)
**점검 범위**: App.vue 111+ 메소드 + VideoCanvas.vue 46 메소드 + Composables 62 함수

---

## 1. 점검 결과 요약

| 구분 | 상태 | 비고 |
|------|------|------|
| 메소드 총 매핑 | **111/111** | 모든 원본 메소드 위임/이전 확인 |
| 치명적 로직 누락 | **3건 발견 → 수정 완료** | 아래 상세 내역 참조 |
| computed 속성 | **7/7** | Pinia store getter로 이전 |
| 유틸리티 함수 | **전부 이전** | `utils/`, `utils/geometry.js`, `utils/video.js` |

---

## 2. 발견된 누락 및 수정 내역

### 2.1 [CRITICAL] drawCSVMasks — 마스킹 범위 분기 로직 전체 누락

**파일**: `composables/canvasDrawing.js` → `drawCSVMasks()`

**원본 로직** (fd45d29):
```
settingExportMaskRange 값에 따른 switch 분기:
├── 'none'       → 마스킹 없음
├── 'selected'   → object===1 (지정 객체)만 블러/모자이크
├── 'bg'         → 전체 프레임 마스킹 후 객체 영역 원본 복원
└── 'unselected' → object===2 (미지정 객체)만 블러/모자이크
```

**리팩토링 후**: switch 분기 전체가 삭제되고 모든 로그에 무조건 마스킹 적용
**영향**: 설정에서 마스킹 범위를 변경해도 미리보기에 반영되지 않음
**상태**: ✅ 수정 완료 — 원본 switch 4분기 + bg 케이스의 다각형 클리핑 복원 포함

---

### 2.2 [CRITICAL] drawCSVBoundingBoxOutlines — 호버/미지정 색상 로직 누락

**파일**: `composables/canvasDrawing.js` → `drawCSVBoundingBoxOutlines()`

**원본 로직** (fd45d29, drawCSVMasks의 else 분기):
```
색상 결정: isHovered ? 'orange' : (log.object === 1 ? 'red' : 'blue')
├── 호버 시  → 주황색 테두리 + rgba(255,165,0,0.3) 반투명 채우기
├── 지정(1) → 빨간색 테두리
└── 미지정(2) → 파란색 테두리
```

**리팩토링 후**: 새로 생성된 함수에 빨간색만 적용, 호버/미지정 색상 없음
**상태**: ✅ 수정 완료 — 원본 색상 로직 복원

---

### 2.3 [ERROR] rebuildMaskingLogsMap — this 바인딩 오류

**파일**: `App.vue:333`

**원인**: `getCallbacks`에서 `() => this.rebuildMaskingLogsMap()` 호출 시 `this` 컨텍스트 문제
**에러**: `TypeError: this.rebuildMaskingLogsMap is not a function`
**상태**: ✅ 수정 완료 — `useDetectionStore().rebuildMaskingLogsMap()` 직접 호출로 변경

---

## 3. 정상 매핑 확인된 기능 카테고리

### App.vue 메소드 → Composable 위임 매핑

| 카테고리 | 메소드 수 | 위임 대상 | 상태 |
|----------|-----------|-----------|------|
| 비디오 재생 제어 | 9 | videoController.js | ✅ |
| 줌/캔버스 | 4 | canvasDrawing.js (VideoCanvas) | ✅ |
| 파일 경로/선택 | 8 | fileManager.js | ✅ |
| 비디오 변환 | 2 | fileManager.js | ✅ |
| 파일 정보 | 6 | fileManager.js | ✅ |
| 설정/구성 | 7 | settingsManager.js | ✅ |
| 키보드/입력 | 4 | videoController.js + App.vue | ✅ |
| 캔버스 인터랙션 | 7 | canvasInteraction.js | ✅ |
| 드로잉/렌더링 | 6 | canvasDrawing.js | ✅ |
| 좌표 변환 | 2 | canvasDrawing.js | ✅ |
| 탐지 데이터 | 4 | detectionManager.js + App.vue | ✅ |
| 마스킹 작업 | 9 | maskingData.js + maskPreview.js | ✅ |
| 프레임 범위 | 2 | App.vue (인라인) | ✅ |
| 워터마크 | 7 | settingsManager.js | ✅ |
| 트림/크롭 | 4 | videoEditor.js | ✅ |
| 병합 | 2 | videoEditor.js | ✅ |
| 객체 탐지 | 5 | detectionManager.js | ✅ |
| 배치 작업 | 5 | exportManager.js | ✅ |
| 내보내기 | 1 | exportManager.js | ✅ |
| 객체 관리 | 5 | objectManager.js | ✅ |
| 컨텍스트 메뉴 | 2 | objectManager.js + App.vue | ✅ |
| 모달/UI | 4 | App.vue (인라인) | ✅ |
| 선택/세션 | 4 | videoEditor.js + App.vue | ✅ |
| 유틸리티/기하 | 3 | utils/geometry.js | ✅ |
| 애니메이션 | 1 | maskPreview.js | ✅ |

### Computed 속성 → Pinia Store 이전

| 속성 | 이전 위치 | 상태 |
|------|-----------|------|
| sliderBackground | videoStore.js | ✅ |
| trimStartPosition | videoStore.js | ✅ |
| trimEndPosition | videoStore.js | ✅ |
| phaseText | exportStore.js | ✅ |
| overallProgress | exportStore.js | ✅ |
| allAutoDetectionSelected | detectionStore.js | ✅ |
| allVideoSelected | App.vue (유지) | ✅ |

### 유틸리티 함수 → utils/ 이전

| 함수 | 이전 위치 | 상태 |
|------|-----------|------|
| normalizeWinPath / normalizePath | main.js (Electron) + utils/path.js | ✅ |
| formatTime | utils/video.js | ✅ |
| parseDurationToSeconds | utils/video.js | ✅ |
| formatDuration | utils/video.js | ✅ |
| isPointInPolygon | utils/geometry.js | ✅ |
| getBBoxString | utils/geometry.js | ✅ |

---

## 4. 수정 파일 목록

| 파일 | 수정 내용 |
|------|-----------|
| `composables/canvasDrawing.js` | drawCSVBoundingBoxOutlines 추가 (호버/미지정 색상), drawCSVMasks range 분기 복원 |
| `App.vue:333` | rebuildMaskingLogsMap 콜백을 store 직접 호출로 변경 |

---

## 5. 주의 사항

- `drawCSVMasks`의 원본 코드에는 다각형 마스킹 시 임시 캔버스를 이용한 클리핑 처리가 `selected`/`unselected` 케이스에 동일하게 중복 존재 → 현재 `applyMaskToLog` 헬퍼로 통합하여 코드 중복 제거
- CSS 세미콜론 누락 4건은 이전에 수정 완료 (video.css, modals.css×2, export-layout.css)
