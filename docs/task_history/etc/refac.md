# App.vue 버그 수정 및 리팩토링 계획

## Context
[App.vue](secuwatcher_electron/src/App.vue)가 **5054줄**의 모놀리식 컴포넌트로, 이전 수정 과정에서 발생한 버그들이 있고 유지보수가 어려운 상태. 먼저 버그를 수정한 후, 기능별 컴포넌트 분리 리팩토링을 진행한다.

---

## Phase 1: 버그 수정 (5건)

### Bug 1: 암호화 내보내기 폴링 - 완료 코드 도달 불가
- **파일**: [App.vue:4579-4581](secuwatcher_electron/src/App.vue#L4579-L4581)
- **문제**: `clearInterval`이 완료 조건 체크(`if` 블록) **밖에서** 매 폴링마다 실행됨. 정상 내보내기(4486-4531)는 올바르게 작성됐으나, 암호화 내보내기 경로에서 4579-4581 라인이 잘못 들여쓰기되어 if 블록 밖에 위치
- **수정**: 4579-4581 세 줄 삭제 (4584-4596의 완료 if 블록 안에 동일 로직이 이미 존재)

### Bug 2: `hasSelectedDetection` 미선언
- **파일**: [App.vue:778](secuwatcher_electron/src/App.vue#L778) (data), [App.vue:1548](secuwatcher_electron/src/App.vue#L1548), [App.vue:1557](secuwatcher_electron/src/App.vue#L1557), [App.vue:2887](secuwatcher_electron/src/App.vue#L2887)
- **문제**: `data()`에 선언되지 않아 Vue 반응성 동작 안 됨
- **수정**: `data()`의 `selectMode: false,` 뒤에 `hasSelectedDetection: false,` 추가

### Bug 3: 자동 탐지 폴링 내 `this`/`vm` 혼용
- **파일**: [App.vue:2763-2765](secuwatcher_electron/src/App.vue#L2763-L2765)
- **문제**: arrow function이라 런타임 오류는 아니지만, 같은 setInterval 콜백 내에서 `vm`과 `this`가 혼용되어 코드 일관성 문제. 리팩토링 시 일반 함수로 변경되면 즉시 버그화
- **수정**: `this.currentMode` → `vm.currentMode`, `this.selectMode` → `vm.selectMode`, `this.loadDetectionData()` → `vm.loadDetectionData()`

### Bug 4: `startMaskPreview` 가드 조건 반전
- **파일**: [App.vue:4238](secuwatcher_electron/src/App.vue#L4238)
- **문제**: `if (this.dataLoaded) return;` — 탐지 데이터가 로드된 상태에서 전체 마스킹 프리뷰가 차단됨. 일반 워크플로(탐지 → 마스킹 설정 → 프리뷰)에서 항상 실패
- **수정**: `if (!this.dataLoaded) return;`로 변경

### Bug 5: 애니메이션 루프에서 수동 마스킹 서버 동기화 누락
- **파일**: [App.vue:4904-4913](secuwatcher_electron/src/App.vue#L4904-L4913)
- **문제**: 재생 중 수동 박스 마스킹 엔트리가 `newMaskings`에 축적되지만 `sendBatchMaskingsToBackend()` 호출 없음. 중간에 종료/파일 전환 시 데이터 유실
- **수정**: 프레임 카운트 기반 스로틀링으로 주기적 동기화 추가 (매 30프레임, ~1초 간격)

```javascript
// Line 4911 뒤에 추가
if (this.newMaskings.length > 0 && currentFrame % 30 === 0) {
    this.sendBatchMaskingsToBackend();
}
```

---

## Phase 2: Pinia 스토어 도입

### 2.1: Pinia 설치 및 초기화
- `npm install pinia`
- [renderer.js](secuwatcher_electron/src/renderer.js)에 `createPinia()` 등록
- `src/stores/` 디렉토리 생성

### 2.2: 스토어 분리 (6개)

| 스토어 | 주요 상태 | 파일 |
|--------|-----------|------|
| `videoStore` | currentFrame, currentTime, progress, videoPlaying, zoomLevel, frameRate, playbackRate, conversion | `stores/videoStore.js` |
| `fileStore` | files[], selectedFileIndex, fileInfoItems, sessionCroppedFiles, selectedExportDir | `stores/fileStore.js` |
| `detectionStore` | maskingLogs, maskingLogsMap, newMaskings, dataLoaded, detectionResults, isDetecting, hasSelectedDetection | `stores/detectionStore.js` |
| `modeStore` | currentMode, selectMode, maskMode, manualBox, isDrawingManualBox, hoveredBoxId, contextMenu 관련 | `stores/modeStore.js` |
| `configStore` | allConfig, settingAutoClasses, drmInfo, isWaterMarking | `stores/configStore.js` |
| `exportStore` | exporting, exportProgress, exportMessage, isBatchProcessing, batchJobId, phase | `stores/exportStore.js` |

### 2.3: App.vue에서 스토어 연결
- `data()`의 프로퍼티들을 점진적으로 스토어로 이전
- `mapState`, `mapActions`로 App.vue의 computed/methods에서 참조

---

## Phase 3: 컴포넌트 분리 (리스크 낮은 순)

### 대상 구조
```
App.vue (오케스트레이터)
├── components/
│   ├── TopMenuBar.vue          ← 상단 9버튼 메뉴 (template 3-40)
│   ├── FilePanel.vue           ← 파일 목록/정보 (template 184-231)
│   ├── VideoControls.vue       ← 재생 컨트롤바 (template 112-181)
│   ├── VideoCanvas.vue         ← 캔버스 오버레이/바운딩박스 (가장 복잡)
│   ├── ContextMenu.vue         ← 우클릭 메뉴
│   └── modals/
│       ├── ProcessingModal.vue      ← 가장 단순
│       ├── FolderLoadingModal.vue
│       ├── MergeModal.vue
│       ├── MaskFrameModal.vue
│       ├── BatchProcessingModal.vue
│       ├── MultiDetectionModal.vue
│       ├── WatermarkModal.vue
│       ├── SettingsModal.vue
│       └── ExportModal.vue
```

### 추출 순서
1. **모달 컴포넌트** (가장 안전 - 자체 완결적 UI, 최소 결합)
   - ProcessingModal → FolderLoadingModal → MergeModal → MaskFrameModal → BatchProcessingModal → MultiDetectionModal → WatermarkModal → SettingsModal → ExportModal
2. **TopMenuBar** — 메뉴 클릭 이벤트만 emit
3. **FilePanel** — fileStore 소비
4. **VideoControls** — videoStore 소비
5. **ContextMenu** — modeStore 소비
6. **VideoCanvas** — 가장 복잡, 모든 스토어 참조 (마지막 추출)

---

## Phase 4: Composables 추출

| Composable | 역할 |
|-----------|------|
| `usePolling.js` | 자동탐지/내보내기/배치에서 공통 사용되는 setInterval 폴링 패턴 통합 |
| `useCanvasDrawing.js` | drawBoundingBoxes, drawCSVMasks, 좌표 변환 등 |
| `useWatermark.js` | 워터마크 렌더링, 이미지 프리로드 |
| `useVideoConversion.js` | 비디오 포맷 감지, IPC 변환, 캐시 관리 |

---

## Phase 5: 중복 코드 정리
- 일반 내보내기 폴링(4486-4531)과 암호화 내보내기 폴링(4555-4606)을 단일 `startExportPolling(jobId)` 메서드로 통합
- `getDetectObjValue` switch문 → 비트마스크 방식 간소화

---

## 검증 방법
1. **Phase 1 (버그 수정)**: 각 수정 후 해당 기능 수동 테스트
   - Bug 1: 암호화 내보내기 → 진행률 100%까지 진행 후 상태 초기화 확인
   - Bug 2: 선택 객체 탐지 모드에서 캔버스 클릭 → 중복 탐지 방지 확인
   - Bug 3: 자동 객체 탐지 완료 후 모드 리셋 확인
   - Bug 4: 탐지 데이터 로드 후 전체 마스킹 프리뷰 동작 확인
   - Bug 5: 수동 모드 재생 중 `newMaskings` 주기적 동기화 확인
2. **Phase 2-5 (리팩토링)**: 각 컴포넌트 추출마다 기존 기능이 동일하게 동작하는지 확인. 한 번에 하나씩 커밋
