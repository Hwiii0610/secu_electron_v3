# Phase 1.2: VideoCanvas 기본 구조 및 Props/Emits 정의 - 완료 보고서

> **작업 단계**: 1.2 (완료)
> **작업 내용**: VideoCanvas 컴포넌트 기본 구조 및 인터페이스 정의
> **완료 일자**: 2026-02-10

---

## ✅ 완료된 작업

### 1. VideoCanvas-new.vue 파일 생성
**경로**: `/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/src/components/VideoCanvas-new.vue`

### 2. Props 인터페이스 정의 (5개)

| Prop명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `videoSrc` | String | '' | 비디오 소스 URL |
| `selectedFile` | Object | null | 선택된 파일 정보 |
| `watermarkImage` | String | null | 워터마크 이미지 데이터 URL |
| `cachedWatermarkImage` | Image | null | 캐시된 Image 객체 |
| `watermarkImageLoaded` | Boolean | false | 이미지 로드 여부 |

### 3. Emits 인터페이스 정의 (9개)

| 이벤트명 | 파라미터 | 설명 | App.vue 처리 |
|----------|----------|------|-------------|
| `@canvas-click` | (event, coordinate, frame) | 캔버스 클릭 | 선택 탐지 트리거 |
| `@object-detect` | (payload) | 객체 탐지 요청 | API 호출 및 폴리핑 |
| `@masking-save` | (entry) | 마스킹 저장 | maskingLogs 업데이트 |
| `@masking-batch` | (entries) | 배치 동기화 | 서버로 전송 |
| `@context-menu` | (payload) | 우클릭 메뉴 | ContextMenu 표시 |
| `@video-loaded` | (videoInfo) | 비디오 로드 완료 | 파일 정보 업데이트 |
| `@video-ended` | () | 비디오 종료 | 마지막 동기화 |
| `@hover-change` | (trackId) | 호버 변경 | hoveredBoxId 업데이트 |
| `@frame-update` | (frame) | 프레임 업데이트 | currentFrame 업데이트 |
| `@error` | (error) | 에러 발생 | 에러 처리 |

### 4. 낭부 상태 (data) 정의

```javascript
video: null,                    // video 엘리먼트 참조
maskCanvas: null,               // maskPreview 캔버스
maskCtx: null,                  // maskPreview context
tmpCanvas: null,                // 임시 캔버스
tmpCtx: null,                   // 임시 캔버스 context
isMasking: false,               // 마스킹 프리뷰 상태
maskPreviewAnimationFrame: null, // 프리뷰 애니메이션 ID
animationFrameId: null,         // 메인 애니메이션 ID
lastHoveredBoxId: null,         // 마지막 호버 ID (최적화)
```

### 5. Store 연결 (computed)

| Store | Writable State | Read-only State |
|-------|---------------|-----------------|
| videoStore | currentTime, progress, videoPlaying, zoomLevel, frameRate, videoDuration, currentPlaybackRate, currentFrame, previousFrame, conversion | - |
| fileStore | files, selectedFileIndex | - |
| detectionStore | maskingLogs, maskingLogsMap, newMaskings, dataLoaded, detectionResults, isDetecting, hasSelectedDetection, manualBiggestTrackId, maskBiggestTrackId, hoveredBoxId | - |
| modeStore | currentMode, selectMode, isBoxPreviewing, exportAllMasking, maskMode, maskCompleteThreshold, maskingPoints, isDrawingMask, isPolygonClosed, manualBox, isDrawingManualBox, isDraggingManualBox, dragOffset, contextMenuVisible, contextMenuPosition, selectedShape, maskFrameStart, maskFrameEnd | - |
| configStore | allConfig, isWaterMarking | - |

### 6. Computed 헬퍼

| computed | 설명 |
|----------|------|
| `currentVideoName` | 현재 선택된 파일명 |
| `maskingTool` | 마스킹 툴 (mosaic/blur) |
| `maskingStrength` | 마스킹 강도 (1-5) |
| `watermarkLocation` | 워터마크 위치 (1-5) |
| `watermarkTransparency` | 워터마크 투명도 (0-100) |
| `watermarkText` | 워터마크 텍스트 |

### 7. Watch 설정

| 감시 대상 | 동작 |
|-----------|------|
| `videoSrc` | 비디오 로드 |
| `exportAllMasking` | 마스킹 프리뷰 토글 |
| `zoomLevel` | 비디오 스케일 업데이트 |

### 8. Lifecycle Hooks

| Hook | 동작 |
|------|------|
| `mounted` | video ref 설정, tmpCanvas 생성, resize 이벤트 등록, 비디오 로드 |
| `beforeUnmount` | 이벤트 제거, 애니메이션 정지, 배치 동기화, 캔버스 정리 |

### 9. 메서드 스텁 정의 (37개)

모든 메서드가 스텁으로 정의되어 있으며, 단계별로 구현 예정:
- Group A: 2개 (좌표 변환)
- Group B: 7개 (그리기)
- Group C: 3개 (마스킹 프리뷰)
- Group D: 5개 (마우스 이벤트)
- Group E: 7개 (데이터 관리)
- Group F: 5개 (유틸리티)
- Group G: 2개 (애니메이션)
- Group H: 3개 (비디오 생명주기)
- 유틸리티: 3개

---

## 📋 체크리스트 검증

- [x] VideoCanvas.vue 기본 뼈대 작성
- [x] Props 인터페이스 정의 (~5개)
- [x] Emits 인터페이스 정의 (~9개)
- [x] 낭부 refs 초기화 로직 설계
- [x] App.vue의 캔버스 템플릿 제거 계획 (template 주석으로 표시)
- [x] 이벤트 핸들러 연결 방식 확정 (emit 사용)
- [x] 애니메이션 루프 처리 방식 확정 (VideoCanvas 낭부 처리)

---

## 🔍 구현 상세

### Template 구조
```vue
<div class="video-container">
  <video ref="videoPlayer" @loadedmetadata="onVideoLoaded" @ended="onVideoEnded">
  <div v-if="conversion.inProgress" class="conversion-overlay">...</div>
  <canvas ref="maskPreview">...</canvas>
  <canvas ref="maskingCanvas" @click="onCanvasClick" ...>...</canvas>
</div>
```

### Store 연결 방식
```javascript
// Writable State (양방향 바인딩)
...mapWritableState(useVideoStore, ['currentTime', 'videoPlaying', ...])
...mapWritableState(useDetectionStore, ['maskingLogs', 'hoveredBoxId', ...])

// Read-only State
...mapState(useVideoStore, [...])
```

### 비디오 참조 처리
- `this.video = this.$refs.videoPlayer` (mounted에서 설정)
- VideoCanvas 낭부에서 직접 비디오 제어 (play, pause, currentTime 등)

---

## ⚠️ 주의사항 및 향후 작업

### 다음 단계에서 구현할 내용
1. **단계 1.3**: Group A (좌표 변환) - `convertToCanvasCoordinates`, `convertToOriginalCoordinates`
2. **단계 1.4**: Group F (유틸리티) - `checkHoveredBox`, `getCurrentFrameNormalized`, 등
3. **단계 1.5**: Group I (워터마크) - `drawWatermarkPreview`, `getScale`
4. **단계 1.6**: Group B (그리기) - `drawBoundingBoxes`, `drawCSVMasks` 등
5. **단계 1.7**: Group C (마스킹 프리뷰) - `startMaskPreview`, `stopMaskPreview`
6. **단계 1.8**: Group D (마우스 이벤트) - `onCanvasClick`, `onCanvasMouseDown` 등
7. **단계 1.9**: Group E (데이터 관리) - `logMasking`, `saveMaskingEntry` 등
8. **단계 1.10**: Group G (애니메이션) - `startAnimationLoop`, `stopAnimationLoop`
9. **단계 1.11**: Group H (비디오 생명주기) - `onVideoLoaded`, `onVideoEnded`, App.vue 연결
10. **단계 1.12**: 통합 테스트

### App.vue와의 연결 방식
- 현재 VideoCanvas-new.vue는 독립 파일로 생성됨
- 단계 1.11에서 App.vue의 template을 수정하여 VideoCanvas-new.vue로 교체 예정
- 기존 VideoCanvas.vue는 백업 후 삭제 예정

---

## 📝 코드 품질

### ESLint/Vite 호환성
- Vue 3 Options API 사용
- Pinia store 연결
- 이벤트 emit validation 포함
- JSDoc 주석 추가

### 성능 고려사항
- `lastHoveredBoxId`로 불필요한 redraw 방지
- `watch`로 필요한 경우에만 비디오 로드
- `beforeUnmount`에서 리소스 정리

---

## ✅ 검증 방법

### 빌드 테스트
```bash
cd secuwatcher_electron
npm run start
```

### 예상 결과
- VideoCanvas-new.vue 파일이 컴파일 에러 없이 로드됨
- (현재는 메서드가 스텁만 있어 기능은 동작하지 않음)

---

**단계 1.2 완료. 단계 1.3 진행 준비 완료.**
