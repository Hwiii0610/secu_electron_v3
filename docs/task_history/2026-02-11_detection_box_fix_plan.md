# 📋 자동 객체 탐지 바울딩박스 출력 이슈 개선 계획

## 📌 문서 정보
- **작성일**: 2026-02-11
- **대상 버전**: SecuWatcher Export v3.x
- **관련 컴포넌트**: `VideoCanvas.vue`, `canvasDrawing.js`, `detectionManager.js`, `canvasInteraction.js`

---

## 1. 현재 문제 요약

### 🔴 핵심 이슈
자동 객체 탐지 완료 후, 탐지된 객체의 바울딩박스가 화면에 출력되지 않습니다.

### 🔍 기술적 원인

| 문제 | 위치 | 설명 |
|------|------|------|
| **데이터 저장소 불일치** | `canvasDrawing.js:113` | `drawDetectionBoxes`가 `detectionResults`를 참조하나, 해당 배열은 항상 빈 상태 |
| **데이터 로드 미연결** | `detectionManager.js:54-114` | `loadDetectionData`는 `maskingLogsMap`에만 데이터를 저장하고 `detectionResults`를 업데이트하지 않음 |
| **렌더링 조건 제한** | `canvasDrawing.js:710-718` | `drawCSVBoundingBoxOutlines`는 `detection.dataLoaded && !mode.isBoxPreviewing` 조건에서만 실행 |
| **호버 즉시 반영 안됨** | `maskPreview.js:171-215` | 마우스 호버 변경 시 `drawBoundingBoxes`가 즉시 호출되지 않고 프레임 변경 시에만 갱신 |

---

## 2. 개선 목표

### 🎯 목표 1: 탐지 데이터 연결
- 자동 객체 탐지 완료 후 즉시 바울딩박스가 화면에 표시되도록 수정

### 🎯 목표 2: 데이터 저장소 통일
- `detectionResults`와 `maskingLogsMap` 간 데이터 동기화 또는 단일 소스 사용

### 🎯 목표 3: 호버 즉시 반응
- 마우스 커서 이동 시 바울딩박스 색상/채우기가 즉시 변경되도록 개선

### 🎯 목표 4: 미리보기 기능 정상화
- 마스킹 미리보기(블러/모자이크)와 바울딩박스 표시가 상황에 따라 올바르게 작동

---

## 3. 세부 개선 계획

### Phase 1: 긴급 수정 (Immediate Fix) - 1일

#### 작업 1-1: `drawDetectionBoxes` 데이터 소스 변경
**파일**: `src/composables/canvasDrawing.js`

**변경 내용**:
```javascript
// AS-IS: detectionResults 사용 (빈 배열)
function drawDetectionBoxes(ctx, video) {
  const { detection, video: videoStore } = getStores();
  const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);
  const currentFrameBoxes = detection.detectionResults.filter(item => item.frame === currentFrame);
  // ... 
}

// TO-BE: maskingLogsMap 사용 (실제 데이터)
function drawDetectionBoxes(ctx, video) {
  const { detection, video: videoStore } = getStores();
  const currentFrame = Math.floor(video.currentTime * videoStore.frameRate) + 1; // 1-based
  const currentFrameBoxes = detection.maskingLogsMap[currentFrame] || [];
  
  currentFrameBoxes.forEach(log => {
    try {
      const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
      // 사각형/다각형 처리 로직...
      // 색상: log.object === 1 ? 'red' : 'blue'
      // 호버: detection.hoveredBoxId === log.track_id ? 'orange' : baseColor
    } catch (error) {
      console.error('바울딩박스 그리기 오류:', error);
    }
  });
}
```

#### 작업 1-2: 탐지 완료 후 강제 리렌더링
**파일**: `src/composables/detectionManager.js`

**변경 내용**:
```javascript
// autoObjectDetection의 onComplete 콜백에 추가
onComplete: (data) => {
  detection.isDetecting = false;
  if (data.error) {
    showError(MESSAGES.DETECTION.ERROR_OCCURRED(data.error));
    return;
  }
  mode.currentMode = '';
  mode.selectMode = true;
  
  // 데이터 로드 후 즉시 렌더링
  loadDetectionData().then(() => {
    // VideoCanvas의 drawBoundingBoxes 강제 호출 필요
    // App.vue를 통해 이벤트 발생 또는 콜백 전달
    if (deps.onDetectionComplete) {
      deps.onDetectionComplete();
    }
  });
}
```

---

### Phase 2: 구조 개선 (Architecture Improvement) - 2일

#### 작업 2-1: 단일 데이터 소스 전환
**파일**: `src/stores/detectionStore.js`, `src/composables/canvasDrawing.js`

**변경 내용**:
```javascript
// detectionStore.js: detectionResults 제거 또는 maskingLogs와 동기화
actions: {
  setDetectionData(logs) {
    this.maskingLogs = logs;
    this.rebuildMaskingLogsMap();
    // 필요시 detectionResults도 동기화 (하위 호환성)
    this.detectionResults = logs.map(log => ({
      frame: log.frame,
      track_id: log.track_id,
      bbox: typeof log.bbox === 'string' ? log.bbox : JSON.stringify(log.bbox),
      // ...
    }));
  }
}
```

#### 작업 2-2: 호버 즉시 반영
**파일**: `src/composables/canvasInteraction.js`

**변경 내용**:
```javascript
function checkHoveredBox(event) {
  // ... 기존 로직 ...
  
  if (getLastHoveredBoxId() !== detection.hoveredBoxId) {
    setLastHoveredBoxId(detection.hoveredBoxId);
    emit('hover-change', detection.hoveredBoxId);
    
    // ✅ 추가: 즉시 다시 그리기
    requestAnimationFrame(() => {
      drawing.drawBoundingBoxes();
    });
  }
}
```

#### 작업 2-3: App.vue-VideoCanvas 연결 강화
**파일**: `src/App.vue`

**변경 내용**:
```javascript
// App.vue methods
handleDetectionComplete() {
  // VideoCanvas의 drawBoundingBoxes 호출
  this.$refs.videoCanvas.drawBoundingBoxes();
  showMessage('객체 탐지가 완료되었습니다. 바울딩박스를 확인하세요.');
},

// detectionManager 생성 시 콜백 전달
this._detection = createDetectionManager({
  getStores: stores,
  getVideo: () => this.$refs.videoCanvas?.videoPlayer,
  getVideoDir: () => this.videoDir,
  drawBoundingBoxes: () => {
    this.$refs.videoCanvas?.drawBoundingBoxes();
  },
  onDetectionComplete: () => {
    this.handleDetectionComplete();
  }
});
```

---

### Phase 3: UX 개선 (UX Enhancement) - 2일

#### 작업 3-1: 미리보기 모드 UX 개선
**파일**: `src/composables/canvasDrawing.js`

**변경 내용**:
```javascript
function drawBoundingBoxes() {
  // ... 기존 로직 ...
  
  // 3. 마스킹 데이터 그리기 (개선된 로직)
  const currentFrame = getCurrentFrameNormalized() + 1;
  if (detection.dataLoaded) {
    if (mode.isBoxPreviewing) {
      // ✅ 미리보기 모드: 마스킹 효과 + 테두리 표시
      drawCSVMasks(ctx, currentFrame);
      drawCSVBoundingBoxOutlines(ctx, currentFrame); // 테두리도 표시
    } else {
      // ✅ 일반 모드: 테두리만 표시
      drawCSVBoundingBoxOutlines(ctx, currentFrame);
    }
  }
}
```

#### 작업 3-2: 객체 유형별 가시성 개선
**파일**: `src/composables/canvasDrawing.js`

**변경 내용**:
```javascript
// 바울딩박스 스타일 개선
function getBoxStyle(log, isHovered) {
  const baseColor = log.object === 1 ? '#ff4444' : '#4444ff'; // 더 선명한 색상
  const hoverColor = '#ff8800';
  
  return {
    stroke: isHovered ? hoverColor : baseColor,
    fill: isHovered ? 'rgba(255, 136, 0, 0.3)' : 'transparent',
    lineWidth: isHovered ? 3 : 2
  };
}
```

#### 작업 3-3: 탐지 완료 알림 개선
**파일**: `src/composables/detectionManager.js`

**변경 내용**:
```javascript
// 탐지 완료 시 상세 알림
showDetectionCompleted('auto');
console.log(`탐지 완료: ${detection.maskingLogs.length}개 객체 발견`);

// 첫 프레임 바울딩박스 수 로깅
const firstFrame = Math.min(...Object.keys(detection.maskingLogsMap).map(Number));
const firstFrameCount = detection.maskingLogsMap[firstFrame]?.length || 0;
console.log(`첫 프레임(${firstFrame}) 객체 수: ${firstFrameCount}`);
```

---

## 4. 테스트 계획

### 테스트 시나리오

| TC-ID | 시나리오 | 예상 결과 | 검증 방법 |
|-------|----------|-----------|-----------|
| TC-01 | 단일 파일 자동 객체 탐지 | 탐지 완료 후 바울딩박스 즉시 표시 | 시각 확인, 콘솔 로그 |
| TC-02 | 마우스 호버 on 객체 | 테두리 색상 orange로 변경 | 시각 확인 |
| TC-03 | 마우스 호버 off 객체 | 원래 색상(red/blue)로 복귀 | 시각 확인 |
| TC-04 | 미리보기 버튼 클릭 | 블러/모자이크 + 테두리 표시 | 시각 확인 |
| TC-05 | 프레임 이동 (재생바) | 해당 프레임의 객체들 표시 | 시각 확인 |
| TC-06 | 다중 객체 탐지 | 모든 객체의 바울딩박스 표시 | 객체 수 == 박스 수 |
| TC-07 | 객체 유형별 색상 | 지정=빨강, 미지정=파랑 | 색상 확인 |

---

## 5. 리스크 및 대응책

| 리스크 | 가능성 | 영향도 | 대응책 |
|--------|--------|--------|--------|
| **프레임 인덱스 불일치** | 중간 | 높음 | 0-based vs 1-based 프레임 번호 통일 검증 |
| **bbox 데이터 포맷 차이** | 중간 | 높음 | 사각형 `[x0,y0,x1,y1]` vs 다각형 `[[x,y],...]` 분기 처리 유지 |
| **성능 저하 (렌더링)** | 낮음 | 중간 | requestAnimationFrame 사용, 과도한 redraw 방지 |
| **하위 호환성** | 중간 | 중간 | 기존 `detectionResults` 사용 코드 제거 전 영향 범위 검토 |
| **멀티파일 탐지** | 중간 | 높음 | 파일 전환 시 `dataLoaded` 상태 초기화 확인 |

---

## 6. 일정 계획

```
Day 1: Phase 1 (긴급 수정)
  ├── 오전: 작업 1-1 (drawDetectionBoxes 수정)
  ├── 오후: 작업 1-2 (강제 리렌더링)
  └── 저녁: TC-01, TC-02 테스트

Day 2-3: Phase 2 (구조 개선)
  ├── 작업 2-1 (단일 데이터 소스)
  ├── 작업 2-2 (호버 즉시 반영)
  ├── 작업 2-3 (App-VideoCanvas 연결)
  └── TC-03 ~ TC-06 테스트

Day 4-5: Phase 3 (UX 개선)
  ├── 작업 3-1 (미리보기 UX)
  ├── 작업 3-2 (스타일 개선)
  ├── 작업 3-3 (알림 개선)
  └── TC-07 및 전체 회귀 테스트
```

---

## 7. 성공 기준 (Acceptance Criteria)

- [ ] 자동 객체 탐지 완료 후 1초 이내 바울딩박스 표시
- [ ] 마우스 호버 시 객체 테두리가 orange로 즉시 변경
- [ ] object=1 (지정)은 빨간색, object=2 (미지정)은 파란색 표시
- [ ] 미리보기 모드에서 마스킹 효과 + 테두리 동시 표시
- [ ] 프레임 이동 시 해당 프레임의 객체들 정확히 표시
- [ ] 다중 파일 탐지 시 파일 전환에도 바울딩박스 정상 표시

---

## 8. 참고 자료

### 관련 파일 경로
- `secuwatcher_electron/src/components/VideoCanvas.vue`
- `secuwatcher_electron/src/composables/canvasDrawing.js`
- `secuwatcher_electron/src/composables/detectionManager.js`
- `secuwatcher_electron/src/composables/canvasInteraction.js`
- `secuwatcher_electron/src/composables/maskPreview.js`
- `secuwatcher_electron/src/stores/detectionStore.js`

### 키워드
`detectionResults`, `maskingLogsMap`, `drawDetectionBoxes`, `drawCSVBoundingBoxOutlines`, `hoveredBoxId`, `isBoxPreviewing`

---

**작성자**: AI Assistant  
**검토 필요**: Technical Lead  
**승인 후 Phase 1 즉시 시작 예정**
