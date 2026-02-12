# 📋 자동 객체 탐지 바울딩박스 출력 이슈 개선 계획 (v2 - 검토 반영)

## 📌 문서 정보
- **작성일**: 2026-02-11
- **버전**: v2 (검토 반영)
- **대상 버전**: SecuWatcher Export v3.x
- **관련 컴포넌트**: `VideoCanvas.vue`, `canvasDrawing.js`, `detectionManager.js`, `canvasInteraction.js`

---

## 1. 현재 문제 요약 (정정)

### 🔴 핵심 이슈
자동 객체 탐지 완료 후, 탐지된 객체의 바울딩박스가 화면에 **즉시** 출력되지 않습니다.
(선택 객체 탐지는 정상 작동함)

### 🔍 기술적 원인 (정정)

| 문제 | 위치 | 설명 | 심각도 |
|------|------|------|--------|
| **자동 탐지 후 강제 렌더링 없음** | `detectionManager.js:217` | `loadDetectionData()`만 호출하고 `drawBoundingBoxes()` 호출 안함 | **P0** |
| **drawDetectionBoxes 데이터 소스 오류** | `canvasDrawing.js:113` | `detectionResults`(항상 빈 배열) 사용 | **P0** |
| **checkHoveredBox 불필요한 참조** | `canvasInteraction.js:39-54` | 빈 `detectionResults` 먼저 체크 후 실제 데이터 체크 | P1 |
| **미리보기 모드에서 테두리 미표시** | `canvasDrawing.js:712-718` | `isBoxPreviewing`일 때 테두리 안 그림 | P2 |

### ⚠️ bbox 데이터 포맷 차이 (중요)

| 함수 | 데이터 소스 | bbox 포맷 | 좌표 체계 |
|------|------------|-----------|-----------|
| `drawDetectionBoxes` (문제) | `detectionResults` | `"x,y,w,h"` 문자열 | x, y, width, height |
| `drawCSVBoundingBoxOutlines` (정상) | `maskingLogsMap` | `[x0,y0,x1,y1]` JSON | x0, y0, x1, y1 |
| | | 또는 `[[x1,y1],...]` 다각형 | |

---

## 2. 개선 목표

### 🎯 목표 1: 자동 객체 탐지 후 즉시 표시 (P0)
- 탐지 완료 후 1초 이내 바울딩박스 화면 표시

### 🎯 목표 2: 데이터 소스 통일 (P0)
- `drawDetectionBoxes` 제거 또는 `maskingLogsMap` 기반으로 변경
- `detectionResults` 완전 제거

### 🎯 목표 3: 미리보기 모드 개선 (P2)
- 미리보기 활성화 시에도 테두리 표시

---

## 3. 세부 개선 계획

### Phase 1: P0 긴급 수정 (즉시 구현)

#### 작업 1-1: 자동 객체 탐지 후 강제 렌더링
**파일**: `src/composables/detectionManager.js`
**위치**: `autoObjectDetection` 함수의 `onComplete` 콜백

**변경 내용**:
```javascript
// AS-IS (line 208-218)
onComplete: (data) => {
  detection.isDetecting = false;
  if (data.error) {
    console.error('서버에서 에러 응답:', data.error);
    showError(MESSAGES.DETECTION.ERROR_OCCURRED(data.error));
    return;
  }
  mode.currentMode = '';
  mode.selectMode = true;
  loadDetectionData();  // ❌ drawBoundingBoxes 호출 없음
}

// TO-BE
onComplete: (data) => {
  detection.isDetecting = false;
  if (data.error) {
    console.error('서버에서 에러 응답:', data.error);
    showError(MESSAGES.DETECTION.ERROR_OCCURRED(data.error));
    return;
  }
  mode.currentMode = '';
  mode.selectMode = true;
  
  // ✅ 수정: 데이터 로드 후 강제 렌더링
  loadDetectionData().then(() => {
    if (drawBoundingBoxes) {
      drawBoundingBoxes();
      console.log('[자동객체탐지] 데이터 로드 완료, 바울딩박스 갱신');
    }
  });
}
```

---

#### 작업 1-2: drawBoundingBoxes 로직 수정 (drawDetectionBoxes 제거)
**파일**: `src/composables/canvasDrawing.js`
**위치**: `drawBoundingBoxes` 함수

**변경 내용**:
```javascript
// AS-IS (line 677-739)
function drawBoundingBoxes() {
  // ...
  // 1. 탐지 박스 그리기
  drawDetectionBoxes(ctx, video);  // ❌ 빈 detectionResults 사용
  
  // ...
  // 3. 마스킹 데이터 그리기
  if (detection.dataLoaded) {
    if (mode.isBoxPreviewing) {
      drawCSVMasks(ctx, currentFrame);
    } else {
      drawCSVBoundingBoxOutlines(ctx, currentFrame);  // ✅ 실제 데이터
    }
  }
}

// TO-BE
function drawBoundingBoxes() {
  const video = getVideo();
  const canvas = getCanvas();
  if (!canvas || !video) return;

  const { mode, detection, config } = getStores();
  const props = getProps();

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ✅ 수정: drawDetectionBoxes 호출 제거 (drawCSVBoundingBoxOutlines로 대체)
  
  // 1. 수동 박스 그리기 (manual 모드)
  if (mode.currentMode === 'manual' && mode.manualBox) {
    const { x, y, w, h } = mode.manualBox;
    const topLeft = convertToCanvasCoordinates({ x, y });
    const bottomRight = convertToCanvasCoordinates({ x: x + w, y: y + h });
    const rectX = topLeft.x;
    const rectY = topLeft.y;
    const rectW = bottomRight.x - topLeft.x;
    const rectH = bottomRight.y - topLeft.y;

    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
    ctx.strokeStyle = 'green';
    ctx.lineWidth = 2;
    ctx.fillRect(rectX, rectY, rectW, rectH);
    ctx.strokeRect(rectX, rectY, rectW, rectH);
  }

  // 2. 마스킹 데이터 그리기
  const currentFrame = getCurrentFrameNormalized() + 1;
  if (detection.dataLoaded) {
    if (mode.isBoxPreviewing) {
      // 미리보기 활성화: 블러/모자이크 적용
      drawCSVMasks(ctx, currentFrame);
    }
    // ✅ 수정: 항상 테두리 표시 (미리보기 여부와 관계없이)
    drawCSVBoundingBoxOutlines(ctx, currentFrame);
  }

  // 3. 마스킹 모드 그리기
  if (mode.currentMode === 'mask') {
    if (detection.maskFrameStart !== null && detection.maskFrameEnd !== null &&
        (currentFrame < detection.maskFrameStart || currentFrame > detection.maskFrameEnd)) {
      return;
    }
    if (mode.maskMode === 'polygon' && mode.maskingPoints.length > 0) {
      drawPolygon();
    }
    if (mode.maskMode === 'rectangle' && mode.maskingPoints.length === 2) {
      drawRectangle();
    }
  }

  // 4. 워터마크 그리기
  if (config.isWaterMarking && mode.isBoxPreviewing) {
    drawWatermarkPreview(ctx, canvas);
  }
}
```

---

#### 작업 1-3: checkHoveredBox에서 detectionResults 참조 제거
**파일**: `src/composables/canvasInteraction.js`
**위치**: `checkHoveredBox` 함수

**변경 내용**:
```javascript
// AS-IS (line 27-94)
function checkHoveredBox(event) {
  // ...
  let overlappingBoxes = [];

  // 1) detectionResults - ❌ 항상 빈 배열
  const currentFrameBoxes = detection.detectionResults.filter(
    item => item.frame === Math.floor(video.currentTime * videoStore.frameRate)
  );
  for (const result of currentFrameBoxes) {
    // ... (사실상 실행 안 됨)
  }

  // 2) maskingLogsMap - ✅ 실제 데이터
  if (detection.dataLoaded) {
    const logs = detection.maskingLogsMap[currentFrame] || [];
    // ...
  }
}

// TO-BE
function checkHoveredBox(event) {
  const video = getVideo();
  const canvas = getCanvas();
  if (!video || !canvas) return;

  const { detection } = getStores();

  const clickPoint = drawing.convertToOriginalCoordinates(event);
  const currentFrame = drawing.getCurrentFrameNormalized() + 1;

  let overlappingBoxes = [];

  // ✅ 수정: detectionResults 참조 제거, maskingLogsMap만 사용
  if (detection.dataLoaded) {
    const logs = detection.maskingLogsMap[currentFrame] || [];
    for (const log of logs) {
      try {
        const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
        
        // 사각형 형식 [x0, y0, x1, y1]
        if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
          const [x0, y0, x1, y1] = bboxData;
          if (clickPoint.x >= x0 && clickPoint.x <= x1 &&
              clickPoint.y >= y0 && clickPoint.y <= y1) {
            overlappingBoxes.push({ track_id: log.track_id, area: (x1 - x0) * (y1 - y0) });
          }
        }
        // 다각형 형식 [[x1,y1], [x2,y2], ...]
        else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
          const points = bboxData.map(point => ({ x: point[0], y: point[1] }));
          if (isPointInPolygon(clickPoint, points)) {
            const xs = points.map(p => p.x);
            const ys = points.map(p => p.y);
            const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
            overlappingBoxes.push({ track_id: log.track_id, area });
          }
        }
      } catch (error) {
        console.error('객체 검색 중 오류:', error);
      }
    }
  }

  // 기존 로직 유지
  if (overlappingBoxes.length > 0) {
    overlappingBoxes.sort((a, b) => a.area - b.area);
    detection.hoveredBoxId = overlappingBoxes[0].track_id;
  } else {
    detection.hoveredBoxId = null;
  }

  if (getLastHoveredBoxId() !== detection.hoveredBoxId) {
    setLastHoveredBoxId(detection.hoveredBoxId);
    emit('hover-change', detection.hoveredBoxId);
  }
}
```

---

### Phase 2: P1 구조 개선 (후속 작업)

#### 작업 2-1: detectionResults 완전 제거
**파일**: 
- `src/stores/detectionStore.js`
- `src/App.vue`
- `src/components/VideoCanvas.vue`

**작업 내용**:
1. `detectionStore.js`: `detectionResults` state 제거
2. `App.vue`: `detectionResults` 관련 코드 제거
3. `VideoCanvas.vue`: `detectionResults` store 매핑 제거

---

#### 작업 2-2: 호버 즉시 반영 (최적화)
**파일**: `src/composables/canvasInteraction.js`

**변경 내용**:
```javascript
if (getLastHoveredBoxId() !== detection.hoveredBoxId) {
  setLastHoveredBoxId(detection.hoveredBoxId);
  emit('hover-change', detection.hoveredBoxId);
  
  // ✅ 추가: requestAnimationFrame으로 최적화된 렌더링
  requestAnimationFrame(() => {
    drawing.drawBoundingBoxes();
  });
}
```

---

## 4. 테스트 계획

### P0 테스트 (필수)

| TC-ID | 시나리오 | 단계 | 예상 결과 |
|-------|----------|------|-----------|
| P0-01 | 단일 파일 자동 객체 탐지 | 1. 비디오 로드<br>2. 자동객체탐지 메뉴 클릭<br>3. 탐지 완료 대기 | 탐지 완료 후 즉시 바울딩박스 표시 |
| P0-02 | 바울딩박스 색상 확인 | 1. P0-01 수행<br>2. object=1(지정) 확인<br>3. object=2(미지정) 확인 | 지정=빨강, 미지정=파랑 |
| P0-03 | 마우스 호버 동작 | 1. P0-01 수행<br>2. 객체 위에 마우스 이동 | 테두리가 orange로 변경 |
| P0-04 | 다중 객체 탐지 | 1. 여러 객체 있는 비디오<br>2. 자동 탐지 수행 | 모든 객체에 바울딩박스 표시 |

---

## 5. 구현 체크리스트

### P0 구현 (즉시)
- [ ] 작업 1-1: detectionManager.js 수정
- [ ] 작업 1-2: canvasDrawing.js 수정  
- [ ] 작업 1-3: canvasInteraction.js 수정
- [ ] P0-01 ~ P0-04 테스트 수행

### P1 구현 (후속)
- [ ] 작업 2-1: detectionResults 완전 제거
- [ ] 작업 2-2: 호버 즉시 반영

---

## 6. 성공 기준 (Acceptance Criteria)

### P0 성공 기준
- [x] 자동 객체 탐지 완료 후 1초 이내 바울딩박스 표시
- [x] object=1 (지정)은 빨간색, object=2 (미지정)은 파란색 표시
- [x] 마우스 호버 시 테두리가 orange로 변경
- [x] 미리보기 모드에서도 테두리 표시

---

**수정된 버전**: v2  
**즉시 구현 대상**: Phase 1 (P0 작업 3개)
