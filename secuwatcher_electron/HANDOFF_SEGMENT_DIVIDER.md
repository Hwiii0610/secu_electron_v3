# 세그먼트 구분선(Divider) 이슈 핸즈오프

**날짜**: 2026-03-06
**상태**: 미해결 — 분할 후 구분선이 시각적으로 정상 출력되지 않음

---

## 1. 프로젝트 개요

- **앱**: SecuWatcher Electron (Electron 36 + Vue 3.5 Options API + Vite 5 + Pinia + FastAPI)
- **타임라인 구조**: "Playhead-fixed, content-dragging" — 플레이헤드는 항상 strip 중앙(50%)에 고정, 썸네일 레이어가 `translateX(50 - progress%)`로 이동
- **분할(Split) 흐름**: `✂ 분할` 버튼 → `videoEditor.trimVideo()` → FFmpeg로 영상 자르기 → `videoStore.splitSegmentAt(trimEndTime)` → 세그먼트 배열 분할 → 구분선 렌더링

---

## 2. 핵심 파일 & 역할

| 파일 | 역할 |
|------|------|
| `src/stores/videoStore.js` | `segments[]` 상태, `segmentsWithLayout` getter (레이아웃 계산), `splitSegmentAt()` action |
| `src/components/VideoControls.vue` | 플로팅 컨트롤바 — `segmentDividers` / `segmentDurationOverlays` computed, `stripWidth` 반응형 데이터, ResizeObserver |
| `src/styles/floating-controls.css` | `.fcb-strip` (overflow:hidden), `.fcb-segment`, `.fcb-segment-divider`, `.fcb-duration-overlay` 스타일 |
| `src/composables/videoEditor.js` | `trimVideo()` — FFmpeg 호출 후 `splitSegmentAt()` 실행 |

---

## 3. 현재 아키텍처

### 3.1 세그먼트 데이터 흐름

```
videoStore.segments[]
  ↓ (getter)
videoStore.segmentsWithLayout[]  ← progress 의존 (isActive 계산)
  ↓ (mapState)
VideoControls.vue computed: segmentDividers[], segmentDurationOverlays[]
  ↓ (v-for)
DOM: .fcb-segment-divider 요소들 (fcb-strip 직접 자식)
```

### 3.2 좌표 계산 (segmentDividers computed)

```javascript
const sw = this.stripWidth;                     // 반응형 데이터 (ResizeObserver 동기화)
const offsetPx = (50 - this.progress) / 100 * sw;  // 플레이헤드 중앙 고정 오프셋

// 각 세그먼트(마지막 제외)의 우측 끝에 구분선
const boundaryX = ((seg.leftPercent + seg.widthPercent) / 100) * sw + offsetPx;
// → { left: boundaryX + 'px' } 로 렌더링
```

### 3.3 DOM 구조

```html
<div ref="stripRef" class="fcb-strip">          <!-- overflow: hidden -->
  <div class="fcb-thumbnail-layer" :style="translateX(50-progress%)">
    <div v-for="segment" class="fcb-segment">   <!-- 세그먼트 썸네일 -->
  </div>
  <div class="fcb-playhead"></div>               <!-- 항상 left: 50% -->
  <div v-for="divider" class="fcb-segment-divider"></div>  <!-- 구분선: strip 직접 자식 -->
  <span v-for="overlay" class="fcb-duration-overlay"></span> <!-- 시간 라벨 -->
</div>
```

**핵심**: 구분선은 `.fcb-thumbnail-layer` **밖**에 있으므로 `translateX` 영향 받지 않음.
→ `offsetPx`를 직접 계산하여 플레이헤드 중앙 고정과 동기화해야 함.

---

## 4. 이전 세션에서 시도한 수정 & 현재 상태

### 4.1 완료된 수정

1. **`::after` 방식 → 별도 Vue 요소**: 세그먼트의 `::after` pseudo-element가 인접 세그먼트에 가려지는 문제 → `.fcb-segment-divider`를 `.fcb-strip` 직접 자식으로 렌더링
2. **`$refs` 비반응성 수정**: `this.$refs.stripRef.clientWidth` 대신 `stripWidth` reactive data + ResizeObserver
3. **watcher 최적화**: `segmentsWithLayout` deep watcher → `'segmentsWithLayout.length'` 감시로 변경
4. **viewport 필터링 제거**: `boundaryX < -2 || boundaryX > sw + 2` 조건 제거 → CSS overflow:hidden에 위임

### 4.2 해결되지 않은 문제

**구분선이 여전히 시각적으로 정상 출력되지 않음.**

콘솔 로그에서 확인된 사실:
- `splitSegmentAt()` 정상 동작: 세그먼트 1개 → 2개 분할 성공
- `segmentDividers` computed는 dividers 배열을 정상 반환 (length >= 1)
- 하지만 사용자 테스트 환경에서 시각적 출력에 문제가 있음

---

## 5. 근본 원인 분석 (추정)

### 5.1 테스트 케이스의 특수성

사용자 테스트: `demo1.mp4` (135.266초), `trimEndTime=135`로 분할
→ 세그먼트 A: [0→135] (99.8%), 세그먼트 B: [135→135.266] (0.2%)
→ 구분선 위치가 전체 스트립의 99.8% 지점에 존재

이 극단적 분할은 구분선이 거의 우측 끝에만 존재하여 대부분의 progress에서 스트립 뷰포트 밖(overflow:hidden으로 잘림)일 수 있음.

### 5.2 근본적 의문: 좌표계 정확성

현재 계산:
```
boundaryX = ((seg.leftPercent + seg.widthPercent) / 100) * sw + offsetPx
         = (절대 비율 위치 * 스트립 너비) + (중앙고정 오프셋)
```

이 공식이 정확한지 검증 필요:
- `seg.leftPercent + seg.widthPercent`는 세그먼트 우측 끝의 **비디오 전체 대비 백분율**
- `offsetPx`는 `(50 - progress) / 100 * sw`
- 결합하면: `(segEndPercent / 100 * sw) + ((50 - progress) / 100 * sw)`
  = `(segEndPercent + 50 - progress) / 100 * sw`

progress = 50일 때 offsetPx = 0 → boundaryX = segEndPercent / 100 * sw (정상)
progress = 0일 때 offsetPx = 0.5 * sw → boundaryX = (segEndPercent/100 + 0.5) * sw
  - 99.8% 분할점: (0.998 + 0.5) * sw = 1.498 * sw → 스트립 밖! (overflow:hidden으로 안 보임)

**이것이 예상 동작임** — 타임라인 시작(progress=0)에서는 99.8% 지점이 화면에 보이지 않는 게 정상.

### 5.3 진짜 문제가 무엇인지

가능한 시나리오:

1. **구분선이 보여야 할 progress에서도 안 보임** → 좌표 계산 오류 또는 CSS z-index/visibility 문제
2. **구분선은 보이지만 너무 작거나 색이 안 보임** → 스타일 문제 (2px 흰색 선이 배경과 구별 안됨)
3. **사용자가 중앙 부분에서 분할하는 일반 케이스를 아직 테스트하지 않음** → 99.8% 분할만 테스트
4. **구분선은 렌더링되지만 다른 요소(플레이헤드, 트림마커 등)에 가려짐** → z-index 계층 문제

---

## 6. 다음 세션에서 수행할 작업

### 6.1 우선순위 1: 디버그 시각화 추가

구분선 위치를 확인하기 위한 임시 디버그:
```javascript
// segmentDividers computed에 디버그 로그 추가
console.log('[divider]', {
  segEnd: seg.leftPercent + seg.widthPercent,
  boundaryX,
  sw,
  progress: this.progress,
  offsetPx,
  visible: boundaryX >= 0 && boundaryX <= sw
});
```

### 6.2 우선순위 2: 중앙 분할 테스트

극단적 99.8% 분할이 아닌, 영상 중간(예: 60초/135초 = 44% 지점)에서 분할하여 정상 동작 확인. 구분선이 progress 변화에 따라 스트립 내에서 정상 이동하는지 검증.

### 6.3 우선순위 3: CSS/z-index 계층 검증

```
z-index 계층:
  .fcb-playhead: 10  (파란색, left: 50%)
  .fcb-segment-divider: 8  (흰색/주황색, left: boundaryX px)
  .fcb-thumbnail-layer 내부:
    .fcb-segment: z-index 없음 (position: absolute)
```

플레이헤드(z:10)가 구분선(z:8) 위에 있어, 두 위치가 겹칠 경우 구분선이 가려질 수 있음. 구분선이 활성 상태(주황색)일 때 플레이헤드와 겹치는지 확인.

### 6.4 우선순위 4: 구분선 시각적 강화 고려

현재 2px 흰색 선이 충분히 눈에 띄는지 확인. 필요시:
- 너비 3~4px으로 확대
- 배경색 대비가 높은 색상 사용 (밝은 주황 또는 빨강)
- 구분선 상단에 삼각형 마커 추가 (플레이헤드처럼)

### 6.5 우선순위 5: stripWidth 초기화 타이밍

`mounted()`에서 `updateStripWidth()` 호출 시 `.fcb-strip`이 아직 최종 크기를 갖지 못할 수 있음. `$nextTick` 또는 약간의 지연 후 재측정이 필요할 수 있음.

---

## 7. 관련 코드 스니펫 (빠른 참조)

### videoStore.js — segmentsWithLayout getter (라인 60-77)

```javascript
segmentsWithLayout(state) {
  if (!state.videoDuration || state.segments.length === 0) return [];
  const currentSec = (state.progress / 100) * state.videoDuration;
  return state.segments.map(seg => {
    const duration = seg.endTime - seg.startTime;
    const m = Math.floor(duration / 60).toString().padStart(2, '0');
    const s = Math.floor(duration % 60).toString().padStart(2, '0');
    const isActive = currentSec >= seg.startTime && currentSec < seg.endTime;
    return {
      ...seg,
      leftPercent: (seg.startTime / state.videoDuration) * 100,
      widthPercent: ((seg.endTime - seg.startTime) / state.videoDuration) * 100,
      durationLabel: `${m}:${s}`,
      isActive,
    };
  });
},
```

### VideoControls.vue — segmentDividers computed (라인 210-228)

```javascript
segmentDividers() {
  const sw = this.stripWidth;
  if (!sw || this.segmentsWithLayout.length <= 1) return [];
  const offsetPx = (50 - this.progress) / 100 * sw;
  const dividers = [];
  for (let i = 0; i < this.segmentsWithLayout.length - 1; i++) {
    const seg = this.segmentsWithLayout[i];
    const boundaryX = ((seg.leftPercent + seg.widthPercent) / 100) * sw + offsetPx;
    dividers.push({
      id: seg.id,
      left: boundaryX,
      activeLeft: seg.isActive,
    });
  }
  return dividers;
},
```

### VideoControls.vue — Template (라인 71-77)

```html
<div
  v-for="divider in segmentDividers"
  :key="'div-' + divider.id"
  class="fcb-segment-divider"
  :class="{ 'active-left': divider.activeLeft }"
  :style="{ left: divider.left + 'px' }"
></div>
```

### floating-controls.css — 구분선 스타일 (라인 171-184)

```css
.fcb-segment-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.7);
  z-index: 8;
  pointer-events: none;
}
.fcb-segment-divider.active-left {
  background: #E67E22;
  box-shadow: 0 0 4px rgba(230, 126, 34, 0.5);
}
```

---

## 8. 이전 세션에서 완료된 다른 작업

### JSON/CSV 경로 통일 (완료)

모든 IPC 핸들러가 `resolveVideoDataDir(videoName, videoPath)`를 사용하여 탐지 데이터를 분할 영상과 같은 위치에 저장. Windows `path.join()`/`path.dirname()` 호환성 확보.

수정된 파일:
- `src/main/ipcHandlers/fileHandlers.js` — resolveVideoDataDir() 추가, update-json/update-filtered-json/save-json/check-file-data/delete-file-data 수정
- `src/preload.js` — checkFileData/deleteFileData에 videoPath 전달
- `src/composables/detectionManager.js` — videoPath 추출 및 전달
- `src/composables/objectManager.js` — 5개 updateFilteredJson 호출에 videoPath 추가
- `src/composables/maskingData.js` — sendBatchMaskingsToBackend에 videoPath 추가
- `src/App.vue` — handleMaskingBatch에 videoPath 추가
- `src/composables/fileManager.js` — checkFileData/deleteFileData에 videoPath 전달

---

## 9. 빌드 참고사항

- **EPERM 에러**: `dist/` 디렉토리가 샌드박스에서 잠길 수 있음. `--outDir dist_verify` 등 대안 사용
- **빌드 명령**: `npx vite build --config vite.renderer.config.mjs`
- **모듈 수**: 155 modules transformed (정상)
