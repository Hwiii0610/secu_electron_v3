# App.vue 리팩토링 상세 작업 계획

> **목표**: VideoCanvas 분리 및 Composables 추출을 안전하게 단계별로 진행
> **작업 원칙**: 각 단계별로 독립적이고 검증 가능하며, 실패 시 롤백 가능

---

## 📋 현재 상태 요약

### 완료된 작업 (Phase 1-3 일부)
- ✅ 버그 수정 6건
- ✅ Pinia 6개 스토어 도입
- ✅ 모달 컴포넌트 10개 분리
- ✅ TopMenuBar, ContextMenu, VideoControls, FilePanel 분리
- ✅ VideoCanvas.vue 파일 생성 (미사용 상태)

### 남은 작업
- ⏳ VideoCanvas.vue 실제 적용 (캔버스 관련 1,500+ lines)
- ⏳ Composables 추출 (4개)
- ⏳ 중복 코드 정리 (Phase 5)

---

## 🎯 Part 1: VideoCanvas 컴포넌트 완전 분리

### 개요
App.vue의 캔버스 관련 코드를 VideoCanvas.vue로 완전히 이전하고, App.vue는 orchestrator 역할만 하도록 정리

**예상 감소 라인**: ~1,500 lines
**위험도**: 🔴 높음 (캔버스 좌표 변환, 이벤트 처리 등 복잡한 로직)
**소요 시간**: 2-3일

---

### 단계 1.1: 캔버스 관련 메서드 분류 및 준비

**작업 내용**:
1. App.vue의 캔버스/마스킹 관련 메서드를 5개 그룹으로 분류
   - Group A: 좌표 변환 메서드 (convertToCanvasCoordinates, convertToOriginalCoordinates)
   - Group B: 그리기 메서드 (drawBoundingBoxes, drawCSVMasks, drawDetectionBoxes, drawPolygon, drawRectangle)
   - Group C: 마스킹 프리뷰 (startMaskPreview, stopMaskPreview, applyEffectFull)
   - Group D: 마우스 이벤트 핸들러 (onCanvasClick, onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp, onCanvasContextMenu)
   - Group E: 마스킹 데이터 관리 (logMasking, saveMaskingEntry, saveManualMaskingEntry 등)

2. 각 메서드가 사용하는 `refs`와 `data` 매핑 문서화
3. App.vue와 VideoCanvas 간에 emit/send 이벤트 인터페이스 설계

**검증 방법**:
- 코드 분석 결과를 문서화하여 리뷰
- 사용되는 ref 목록: videoPlayer, maskingCanvas, maskPreview, tmpCanvas 등
- 사용되는 store state 목록 추출

**롤백 전략**:
- 변경 없음 (분석 단계)

---

### 단계 1.2: VideoCanvas 기본 구조 및 Props/Emits 정의

**작업 내용**:
1. VideoCanvas.vue에 필요한 props 정의
   ```javascript
   props: {
     videoSrc: String,
     detectionResults: Array,
     maskingLogs: Array,
     // ... etc
   }
   ```

2. VideoCanvas → App.vue 이벤트 emit 인터페이스 정의
   - `@masking-start`: 마스킹 시작 시
   - `@masking-save`: 마스킹 저장 시
   - `@object-select`: 객체 선택 시
   - `@frame-update`: 프레임 변경 시 (선택적)

3. VideoCanvas 난에서 사용할 낭부 refs 설정
   - videoPlayer, maskingCanvas, maskPreview, tmpCanvas

**검증 방법**:
- VideoCanvas.vue 파일만 컴파일 에러 없는지 확인
- ESLint/Vite 빌드 테스트

**롤백 전략**:
- Git stash로 복원 가능

---

### 단계 1.3: 좌표 변환 메서드 이전 (Group A)

**작업 내용**:
1. `convertToCanvasCoordinates()`, `convertToOriginalCoordinates()`를 VideoCanvas로 이동
2. VideoCanvas 난부에서 videoPlayer ref에 직접 접근하도록 변경
3. App.vue에서는 좌표 변환 필요 시 emit으로 요청하거나, VideoCanvas에서 처리 후 결과만 전달

**변경 파일**:
- `VideoCanvas.vue`: 메서드 추가
- `App.vue`: 해당 메서드 제거, VideoCanvas에서 처리하도록 위임

**검증 방법**:
- 비디오 로드 후 클릭 시 좌표 변환이 정상 동작하는지 확인
- console.log로 좌표 값 확인

**롤백 전략**:
```bash
git checkout -- secuwatcher_electron/src/components/VideoCanvas.vue
git checkout -- secuwatcher_electron/src/App.vue
```

---

### 단계 1.4: 그리기 메서드 이전 (Group B)

**작업 내용**:
1. `drawBoundingBoxes()` 이전
   - videoStore, detectionStore, modeStore 사용
   - maskingLogsMap, detectionResults 등 접근

2. `drawCSVMasks()` 이전
   - 매우 복잡한 메서드 (~400 lines)
   - 모자이크/블러 효과 처리
   - 다각형/사각형 모두 지원

3. `drawDetectionBoxes()`, `drawPolygon()`, `drawRectangle()` 이전

**주의사항**:
- `tmpCanvas`, `tmpCtx` 접근 필요
- `allConfig` 설정값 사용 (mosaic/blur 강도 등)
- `isBoxPreviewing`, `exportAllMasking` 등 상태 확인

**검증 방법**:
- 비디오 로드 후 객체 탐지 결과가 화면에 표시되는지 확인
- 마스킹 모드에서 사각형/다각형 그리기 확인
- 미리보기 모드에서 마스킹 효과 확인

**롤백 전략**:
- Git으로 이전 커밋 복원

---

### 단계 1.5: 마스킹 프리뷰 메서드 이전 (Group C)

**작업 내용**:
1. `startMaskPreview()`, `stopMaskPreview()` 이전
2. `applyEffectFull()` 이전
3. 프리뷰용 캔버스(maskPreview) 참조 정리

**주의사항**:
- requestAnimationFrame 사용
- 비디오 재생 상태와 연동
- `isMasking` 상태 관리

**검증 방법**:
- "전체 마스킹" 토글 시 프리뷰 정상 동작 확인
- 모자이크/블러 효과 전환 확인
- 프리뷰 중지 시 캔버스 정리 확인

---

### 단계 1.6: 마우스 이벤트 핸들러 이전 (Group D)

**작업 내용**:
1. `onCanvasClick()` 이전
   - 선택 객체 탐지 로직 (API 호출 포함)
   - 마스킹 모드 (polygon/rectangle) 처리

2. `onCanvasMouseDown/Move/Up()` 이전
   - 수동 박스 드래그/드롭
   - 마스킹 영역 그리기

3. `onCanvasContextMenu()` 이전
   - 우클릭 메뉴 표시

**주의사항**:
- App.vue의 `handleContextMenuAction`과 연동 필요
- `checkHoveredBox` 호출 필요

**검증 방법**:
- 캔버스 클릭 시 선택 객체 탐지 동작 확인
- 수동 모드에서 박스 생성/이동 확인
- 우클릭 시 컨텍스트 메뉴 표시 확인

---

### 단계 1.7: 마스킹 데이터 관리 메서드 이전 (Group E)

**작업 내용**:
1. `logMasking()`, `saveMaskingEntry()`, `saveManualMaskingEntry()` 이전
2. `sendBatchMaskingsToBackend()` 호출 방식 변경
3. `checkBiggestTrackId()` 이전

**주의사항**:
- maskingLogs 데이터 동기화 문제
- App.vue의 maskingLogs와 VideoCanvas 간 양방향 바인딩

**검증 방법**:
- 마스킹 생성 후 JSON 파일 저장 확인
- track_id 정상 생성 확인

---

### 단계 1.8: App.vue Template 정리

**작업 내용**:
1. App.vue의 template에서 video/canvas 태그를 VideoCanvas 컴포넌트로 교체
   ```vue
   <!-- 기존 -->
   <video ref="videoPlayer">...</video>
   <canvas ref="maskingCanvas">...</canvas>
   
   <!-- 변경 -->
   <VideoCanvas 
     ref="videoCanvas"
     @canvas-click="handleCanvasClick"
     @masking-save="handleMaskingSave"
     ...
   />
   ```

2. App.vue에서 제거된 메서드 참조 정리
3. VideoCanvas에서 emit된 이벤트 핸들러 연결

**검증 방법**:
- 전체 기능 테스트
- 빌드 에러 확인

**롤백 전략**:
- Git으로 복원

---

### 단계 1.9: 애니메이션 루프 이전 및 통합

**작업 내용**:
1. App.vue의 `startAnimationLoop()` 분석
2. VideoCanvas에서 필요한 부분만 추출
3. `sendBatchMaskingsToBackend()` 호출 로직 조정

**주의사항**:
- 30프레임마다 서버 동기화하는 로직 유지
- 비디오 재생 상태와 연동

**검증 방법**:
- 재생 중 수동 마스킹 데이터가 주기적으로 저장되는지 확인

---

### 단계 1.10: 통합 테스트 및 버그 수정

**작업 내용**:
1. 전체 기능 테스트
   - 파일 로드/재생
   - 객체 탐지 (자동/선택)
   - 마스킹 (수동/영역)
   - 내보내기
   - 설정 변경

2. 성능 테스트
   - 대용량 비디오 재생 시 캔버스 성능
   - 메모리 누수 확인

**검증 방법**:
- 체크리스트 기반 테스트
- 콘솔 에러 모니터링

---

## 🎯 Part 2: Composables 추출

### 개요
반복되는 패턴을 composable 함수로 추출하여 재사용성과 테스트 용이성 향상

**예상 감소 라인**: ~500 lines
**위험도**: 🟡 중간
**소요 시간**: 1-2일
**의존성**: Part 1(VideoCanvas) 완료 후 진행 권장

---

### 단계 2.1: 폴링 패턴 분석 및 설계

**작업 내용**:
1. App.vue에서 setInterval을 사용하는 폴링 패턴 분석
   - 객체 탐지 진행률 폴링 (autoObjectDetection, onCanvasClick-select)
   - 내보내기 진행률 폴링 (sendExportRequest)
   - 배치 처리 폴링 (performAutoDetectionForFile)

2. 공통 패턴 추출
   - API 요청
   - 진행률 업데이트
   - 완료/에러 처리
   - interval 정리

3. `usePolling.js` 인터페이스 설계
   ```javascript
   export function usePolling(options) {
     // options: apiCall, onProgress, onComplete, onError, interval
     const start = () => { ... };
     const stop = () => { ... };
     return { start, stop, isRunning };
   }
   ```

**검증 방법**:
- 인터페이스 문서화 리뷰

---

### 단계 2.2: usePolling 구현 및 적용 (자동 탐지)

**작업 내용**:
1. `composables/usePolling.js` 생성
2. `autoObjectDetection()` 메서드에 적용
3. `performAutoDetectionForFile()` 메서드에 적용

**변경 파일**:
- `composables/usePolling.js`: 신규 생성
- `App.vue`: 기존 setInterval 로직 제거, usePolling 사용

**검증 방법**:
- 자동 객체 탐지 실행 시 진행률 정상 표시 확인
- 완료 시 콜백 정상 동작 확인

**롤백 전략**:
```bash
git checkout -- secuwatcher_electron/src/App.vue
```

---

### 단계 2.3: usePolling 적용 (선택 탐지 및 내보내기)

**작업 내용**:
1. `onCanvasClick()`의 선택 객체 탐지 폴링에 적용
2. `sendExportRequest()`의 내보내기 폴링에 적용
3. 일반 내보내기와 암호화 내보내기 코드 통합 검토

**주의사항**:
- 내보내기 폴링은 복잡한 UI 업데이트 포함 (progressBar, progressLabel)
- 에러 처리 방식 통일

**검증 방법**:
- 선택 객체 탐지 동작 확인
- 일반/암호화 내보내기 동작 확인

---

### 단계 2.4: 캔버스 드로잉 유틸리티 분석

**작업 내용**:
1. VideoCanvas(또는 App.vue)의 캔버스 관련 유틸리티 분석
   - 좌표 변환
   - 색상/스타일 설정
   - 클리핑 패스 생성

2. `useCanvasDrawing.js` 인터페이스 설계
   ```javascript
   export function useCanvasDrawing(canvasRef) {
     const drawMosaic = (ctx, region, level) => { ... };
     const drawBlur = (ctx, region, level) => { ... };
     const drawBoundingBox = (ctx, box, options) => { ... };
     return { drawMosaic, drawBlur, drawBoundingBox };
   }
   ```

**검증 방법**:
- 인터페이스 문서화 리뷰

---

### 단계 2.5: useCanvasDrawing 구현 및 적용

**작업 내용**:
1. `composables/useCanvasDrawing.js` 생성
2. `drawCSVMasks()` 내의 모자이크/블러 로직 분리
3. `drawBoundingBoxes()` 내의 박스 그리기 로직 분리

**변경 파일**:
- `composables/useCanvasDrawing.js`: 신규 생성
- `VideoCanvas.vue`: composable 사용하도록 변경

**검증 방법**:
- 마스킹 효과(모자이크/블러) 정상 동작 확인
- 바운딩 박스 정상 표시 확인

---

### 단계 2.6: 워터마크 관련 로직 분석

**작업 내용**:
1. `drawWatermarkPreview()` 메서드 분석
2. 워터마크 이미지 프리로드 로직 분석
3. `useWatermark.js` 인터페이스 설계

---

### 단계 2.7: useWatermark 구현 및 적용

**작업 내용**:
1. `composables/useWatermark.js` 생성
2. 워터마크 그리기 로직 이동
3. 이미지 프리로드 로직 이동

**변경 파일**:
- `composables/useWatermark.js`: 신규 생성
- `VideoCanvas.vue`: composable 사용

**검증 방법**:
- 워터마크 미리보기 정상 동작 확인
- 이미지/텍스트 워터마크 확인

---

### 단계 2.8: 비디오 변환 로직 분석

**작업 내용**:
1. `convertAndPlay()`, `convertAndPlayFromPath()` 분석
2. 변환 캐시 관리 로직 분석
3. `useVideoConversion.js` 인터페이스 설계

---

### 단계 2.9: useVideoConversion 구현 및 적용

**작업 내용**:
1. `composables/useVideoConversion.js` 생성
2. 비디오 변환 로직 이동
3. 캐시 관리 로직 이동

**변경 파일**:
- `composables/useVideoConversion.js`: 신규 생성
- `App.vue`: composable 사용

**검증 방법**:
- 비MP4 파일 로드 시 변환 동작 확인
- 캐시 히트 시 바로 재생 확인

---

## 🎯 Part 3: 중복 코드 정리 (Phase 5)

### 단계 3.1: 내보내기 폴링 로직 통합

**작업 내용**:
1. 일반 내보내기 폴링과 암호화 내보내기 폴링 비교
2. 공통 부분 추출하여 단일 메서드로 통합
3. 차이점만 분기 처리

**예상 변경**:
```javascript
// 통합 전: 두 개의 유사한 setInterval 블록
// 통합 후: startExportPolling(jobId, isEncrypted) 단일 메서드
```

**검증 방법**:
- 일반 내보내기 정상 동작 확인
- 암호화 내보내기 정상 동작 확인

---

### 단계 3.2: getDetectObjValue 비트마스크 변환

**작업 내용**:
1. 현재 switch문 기반 로직 분석 (~30개 case)
2. 비트마스크 방식으로 변환
   ```javascript
   // 0: person, 1: car, 2: motorcycle, 3: plate
   const value = (person ? 1 : 0) | (car ? 2 : 0) | ...
   ```
3. 기존 설정값과 호환성 확인

**검증 방법**:
- 각 조합별 설정 저장/로드 확인
- 서버로 전송되는 값 확인

---

## 📅 추진 일정 (권장)

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 1주차 | 단계 1.1 - 1.5 | 좌표/그리기/프리뷰 메서드 이전 완료 |
| 2주차 | 단계 1.6 - 1.10 | VideoCanvas 완전 분리, 통합 테스트 완료 |
| 3주차 | 단계 2.1 - 2.5 | usePolling, useCanvasDrawing 적용 |
| 4주차 | 단계 2.6 - 3.2 | 나머지 composables, 중복 코드 정리 |

---

## ⚠️ 위험도 및 주의사항

### 🔴 높은 위험도
1. **캔버스 좌표 변환**: 비디오 크기와 화면 표시 크기가 다를 때의 좌표 변환
2. **마스킹 데이터 동기화**: maskingLogs와 VideoCanvas 간 데이터 일관성
3. **이벤트 전파**: 캔버스 이벤트와 App.vue 간의 통신

### 🟡 중간 위험도
1. **폴링 로직 변경**: interval 정리 타이밍, 메모리 누수
2. **비디오 변환 캐시**: 캐시 키 관리, 메모리 해제

### 🟢 낮은 위험도
1. **getDetectObjValue 변환**: 단순 계산 로직 변경

---

## 🔧 개발 환경 설정

### 테스트용 임시 빌드 스크립트
```bash
# macOS/Linux용 build 스크립트
npm pkg set scripts.build="mkdir -p .vite/build && cp src/main.js .vite/build/main.js"
```

### 권장 IDE 설정
- Vetur 또는 Volar 확장 (Vue 3)
- ESLint + Prettier

---

## ✅ 체크리스트 템플릿

### 각 단계 완료 시 체크리스트
- [ ] 코드 작성 완료
- [ ] Vite 빌드 에러 없음 (`npm run start`)
- [ ] 콘솔 에러 없음
- [ ] 기능 테스트 완료
- [ ] 이전 단계와의 통합 확인
- [ ] Git 커밋 완료

---

## 📝 문서 변경 이력

| 날짜 | 버전 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| 2026-02-10 | 1.0 | 초안 작성 | AI Assistant |

---

**다음 작업**: 위 계획 중 선택한 단계부터 순차적으로 진행
