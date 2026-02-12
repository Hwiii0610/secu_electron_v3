# 📋 개선 계획 상세 검토 보고서

## 📌 문서 정보
- **원본 문서**: `2026-02-11_detection_box_fix_plan.md`
- **검토일**: 2026-02-11
- **검토 결과**: ⚠️ 일부 수정 필요

---

## 1. 잘못 파악된 내용

### ❌ 오류 1: 자동 객체 탐지 vs 선택 객체 탐지 콜백 차이

**잘못된 파악**:
> "선택 객체 탐지와 자동 객체 탐지 모두 drawBoundingBoxes를 호출하지 않음"

**정확한 사실**:
```javascript
// 선택 객체 탐지 (detectionManager.js:335-341) - drawBoundingBoxes 호출함 ✅
onComplete: async () => {
  detection.isDetecting = false;
  await loadDetectionData();
  drawBoundingBoxes();  // ✅ 호출됨
  showDetectionCompleted('select');
}

// 자동 객체 탐지 (detectionManager.js:208-218) - drawBoundingBoxes 호출 안함 ❌
onComplete: (data) => {
  detection.isDetecting = false;
  mode.currentMode = '';
  mode.selectMode = true;
  loadDetectionData();  // drawBoundingBoxes 호출 없음
}
```

**영향**: 자동 객체 탐지 후에만 즉시 렌더링이 안 되는 문제가 있음

---

### ❌ 오류 2: checkHoveredBox의 데이터 소스

**잘못된 파악**:
> "checkHoveredBox는 maskingLogsMap만 사용"

**정확한 사실**:
```javascript
// canvasInteraction.js:39-80
checkHoveredBox(event) {
  // 1) detectionResults 먼저 체크 (빈 배열)
  const currentFrameBoxes = detection.detectionResults.filter(...);
  
  // 2) maskingLogsMap 체크 (실제 데이터)
  if (detection.dataLoaded) {
    const logs = detection.maskingLogsMap[currentFrame] || [];
  }
}
```

**영향**: detectionResults는 비어있어 실제로는 maskingLogsMap만 동작하지만, 코드상 불필요한 체크가 존재

---

### ❌ 오류 3: bbox 데이터 포맷 차이 간과

**간과된 사실**:
두 함수의 bbox 데이터 포맷이 완전히 다름

| 함수 | 데이터 소스 | bbox 포맷 | 좌표 체계 |
|------|------------|-----------|-----------|
| `drawDetectionBoxes` | detectionResults | `"x,y,w,h"` 문자열 | 좌상단 + 너비/높이 |
| `drawCSVBoundingBoxOutlines` | maskingLogsMap | `[x0,y0,x1,y1]` JSON 배열 | 좌상단/우하단 좌표 |

**영향**: 단순히 detectionResults를 maskingLogsMap으로 교체할 수 없음 (파싱 로직도 함께 변경 필요)

---

## 2. 누락된 중요 내용

### ⚠️ 누락 1: drawDetectionBoxes의 색상 로직 차이

**누락 내용**:
```javascript
// drawDetectionBoxes (line 107-110, 125-127)
ctx.strokeStyle = 'red';  // 항상 red
ctx.fillStyle = 'red';
// ...
const isHovered = detection.hoveredBoxId === result.track_id;
ctx.strokeStyle = isHovered ? 'orange' : 'red';  // object 타입 구분 없음

// drawCSVBoundingBoxOutlines (line 174-178)
const baseColor = log.object === 1 ? 'red' : 'blue';  // object 타입 구분
ctx.strokeStyle = isHovered ? 'orange' : baseColor;
```

**수정 필요사항**: drawDetectionBoxes를 수정할 때 object 타입별 색상 구분 로직 추가 필요

---

### ⚠️ 누락 2: 프레임 번호 체계 불일치

**누락 내용**:
```javascript
// 애니메이션 루프 (maskPreview.js:181)
const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);  // 0-based
videoStore.currentFrame = currentFrame;

// drawBoundingBoxes (canvasDrawing.js:710)
const currentFrame = getCurrentFrameNormalized() + 1;  // 1-based

// drawDetectionBoxes (canvasDrawing.js:112)
const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);  // 0-based

// checkHoveredBox (canvasInteraction.js:35)
const currentFrame = drawing.getCurrentFrameNormalized() + 1;  // 1-based
```

**문제점**: 
- drawDetectionBoxes는 0-based 프레임으로 detectionResults 필터링
- drawCSVBoundingBoxOutlines는 1-based 프레임으로 maskingLogsMap 조회
- JSON 데이터의 frameKey는 1-based ("1", "2", "3"...)

**수정 필요사항**: 통일된 프레임 체계 필요

---

### ⚠️ 누락 3: 다각형(polygon) bbox 지원

**누락 내용**:
```javascript
// drawCSVBoundingBoxOutlines는 다각형 지원 (line 201-223)
if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
  // 다각형 처리
}

// drawDetectionBoxes는 사각형만 지원 (line 117-140)
const coords = result.bbox.split(',').map(Number);
if (coords.length === 4) {
  // 사각형만 처리
}
```

**영향**: 수정 시 다각형 bbox도 지원해야 함

---

### ⚠️ 누락 4: 렌더링 트리거 조건

**누락 내용**:
```javascript
// 애니메이션 루프 (maskPreview.js:192-195)
if (currentFrame !== videoStore.previousFrame) {
  videoStore.previousFrame = currentFrame;
  drawing.drawBoundingBoxes();  // 프레임 변경 시에만 호출
}
```

**문제점**: 
- 탐지 완료 후 같은 프레임에 있으면 drawBoundingBoxes가 호출되지 않음
- 이것이 "바운딩박스가 안 보인다"는 현상의 주요 원인 중 하나

---

## 3. 수정된 개선 계획

### Phase 1 수정사항

#### 작업 1-1 수정: drawDetectionBoxes 완전 대체 (통합)

**기존 제안**:
> drawDetectionBoxes를 maskingLogsMap 기반으로 수정

**수정된 제안**:
> drawDetectionBoxes와 drawCSVBoundingBoxOutlines를 통합하여 하나의 함수로 만듦

**이유**:
1. 두 함수가 하는 일이 중복됨 (바운딩박스 그리기)
2. 데이터 소스만 다를 뿐 로직은 유사
3. 유지보수를 위해 단일 함수로 통합 필요

**구현 방향**:
```javascript
// drawDetectionBoxes 제거 또는 내부에서 drawCSVBoundingBoxOutlines 호출하도록 변경
function drawBoundingBoxes() {
  // ...
  // 1. 마스킹 데이터 그리기 (통합된 함수로 변경)
  const currentFrame = getCurrentFrameNormalized() + 1;
  if (detection.dataLoaded) {
    if (mode.isBoxPreviewing) {
      drawCSVMasks(ctx, currentFrame);
    }
    // 항상 아웃라인 표시 (미리보기 여부와 관계없이)
    drawCSVBoundingBoxOutlines(ctx, currentFrame);
  }
  // ...
}
```

---

#### 작업 1-2 수정: 자동 객체 탐지 콜백에 강제 렌더링 추가

**추가 필요사항**:
```javascript
// detectionManager.js: autoObjectDetection의 onComplete
onComplete: (data) => {
  detection.isDetecting = false;
  if (data.error) { ... }
  
  mode.currentMode = '';
  mode.selectMode = true;
  
  // 수정: loadDetectionData 후 강제 렌더링
  loadDetectionData().then(() => {
    if (drawBoundingBoxes) {
      drawBoundingBoxes();  // 즉시 렌더링
    }
  });
}
```

**추가 고려사항**: deps에 drawBoundingBoxes 콜백 전달 필요

---

### Phase 2 수정사항

#### 작업 2-1 수정: detectionResults 완전 제거

**기존 제안**:
> detectionResults와 maskingLogs 동기화

**수정된 제안**:
> detectionResults 완전 제거 및 모든 참조 코드를 maskingLogsMap 기반으로 변경

**변경 필요 위치**:
1. `detectionStore.js`: detectionResults state 제거
2. `canvasDrawing.js: drawDetectionBoxes`: 제거 또는 로직 변경
3. `canvasInteraction.js: checkHoveredBox`: detectionResults 참조 제거 (line 39-54)
4. `App.vue`: detectionResults 관련 코드 제거

---

#### 작업 2-2 수정: 호버 즉시 반영 (requestAnimationFrame 사용)

**기존 제안**:
```javascript
requestAnimationFrame(() => {
  drawing.drawBoundingBoxes();
});
```

**수정된 제안**:
```javascript
// 호버 변경 시에만 다시 그리기 (최적화)
if (getLastHoveredBoxId() !== detection.hoveredBoxId) {
  setLastHoveredBoxId(detection.hoveredBoxId);
  emit('hover-change', detection.hoveredBoxId);
  
  // requestAnimationFrame 사용하여 성능 최적화
  requestAnimationFrame(() => {
    drawing.drawBoundingBoxes();
  });
}
```

---

## 4. 새로 발견된 위험 요소

### 🚨 위험 1: bbox 데이터 포맷 불일치로 인한 파싱 오류

**상황**:
- detectionResults: `"100,200,50,60"` (x,y,w,h 문자열)
- maskingLogsMap: `[100, 200, 150, 260]` 또는 `[[100,200], [150,200], [150,260], [100,260]]` (JSON)

**위험도**: 높음
**대응책**: 
- drawCSVBoundingBoxOutlines의 파싱 로직만 사용
- "x,y,w,h" 포맷의 데이터가 있다면 JSON 배열로 변환하여 저장

---

### 🚨 위험 2: 다중 파일 탐지 시 데이터 섞임

**상황**:
```javascript
// detectionManager.js:277-306
async function performAutoDetectionForFile(file, isMulti = false) {
  // 각 파일별로 탐지 진행
  // loadDetectionData는 현재 선택된 파일 기준으로만 동작
}
```

**위험도**: 중간
**대응책**:
- 파일 전환 시 dataLoaded 초기화
- loadDetectionData 호출 시 파일명 검증

---

### 🚨 위험 3: manual 모드와의 충돌

**상황**:
```javascript
// drawBoundingBoxes (line 691-707)
if (mode.currentMode === 'manual' && mode.manualBox) {
  // 수동 박스 그리기
}
```

**위험도**: 낮음
**대응책**:
- manual 모드와 탐지 결과 표시는 병행 가능해야 함
- 둘 다 그려지도록 순서 조정 (z-index 고려)

---

## 5. 최종 권장사항

### 우선순위 재조정

| 우선순위 | 작업 | 사유 |
|---------|------|------|
| P0 | drawDetectionBoxes 제거 및 drawCSVBoundingBoxOutlines만 사용 | 핵심 버그 |
| P0 | 자동 객체 탐지 완료 후 drawBoundingBoxes 강제 호출 | 사용자 경험 |
| P1 | canvasInteraction.js의 detectionResults 참조 제거 | 일관성 |
| P1 | detectionStore에서 detectionResults 제거 | 데이터 정리 |
| P2 | 호버 즉시 반영 최적화 | UX 개선 |
| P2 | 미리보기 모드에서도 테두리 표시 | UX 개선 |

### 수정 범위 요약

**필수 수정 파일** (4개):
1. `canvasDrawing.js`: drawDetectionBoxes 로직 변경 또는 제거
2. `detectionManager.js`: autoObjectDetection 콜백에 drawBoundingBoxes 호출 추가
3. `canvasInteraction.js`: checkHoveredBox에서 detectionResults 참조 제거
4. `detectionStore.js`: detectionResults state 제거 (선택사항)

**예상 코드 변경량**: 약 100~150줄 (삭제 및 수정)

---

## 6. 검토 결론

**원본 개선 계획 평가**: 80% 정확
- 핵심 원인 파악은 정확함
- 세부 구현 방향에 일부 수정 필요

**핵심 수정사항**:
1. **drawDetectionBoxes 완전 제거**가 아닌 **drawCSVBoundingBoxOutlines와 통합** 필요
2. **bbox 데이터 포맷 차이**를 반드시 고려해야 함
3. **자동 객체 탐지 후 강제 렌더링**이 가장 시급함

**권장 다음 단계**:
1. Phase 1의 작업 1-2 (자동 객체 탐지 후 렌더링)을 가장 먼저 구현
2. 즉시 테스트하여 바운딩박스 표시 확인
3. 이후 구조 개선 (Phase 2) 진행

---

**검토자**: AI Assistant  
**검토 완료일**: 2026-02-11
