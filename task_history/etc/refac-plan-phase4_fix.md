# Phase 4 수정 구현 계획서

## Context
원본 Phase 4 계획서(`refac-plan-phase4.md`)를 코드베이스와 대조 검증한 결과, 3가지 핵심 문제가 발견되어 수정합니다:
1. `.ts` 확장자 → 프로젝트는 **순수 JavaScript** (TypeScript 없음)
2. `setup()` 혼합 패턴 → 프로젝트는 **순수 Options API** (`setup()` 사용처 없음)
3. `useCanvasDrawing`/`useWatermark` → VideoCanvas.vue 내부에서만 사용, 중복 없음 → **제거**

---

## 범위 변경 요약

| 원본 계획 | 수정 후 | 사유 |
|----------|---------|------|
| usePolling.ts | **progressPoller.js** | .js 확장자, 팩토리 함수 패턴 |
| useVideoConversion.ts | **conversionHelper.js** | 공유 보일러플레이트만 추출 |
| useCanvasDrawing.ts | **삭제** | VideoCanvas.vue 내부 전용, 중복 없음 |
| useWatermark.ts | **삭제** | VideoCanvas.vue 내부 전용, 중복 없음 |

---

## Step 1: `progressPoller.js` 생성 (핵심 — 높은 가치)

### 대상 파일
- **생성**: `src/composables/progressPoller.js`
- **수정**: `src/App.vue` (폴링 패턴 6개 리팩토링)
- **수정**: `src/stores/exportStore.js` (타이머 ID 필드 정리)

### 현재 폴링 패턴 6개 (App.vue)

| 패턴 | 위치 | 방식 | 특수사항 |
|------|------|------|---------|
| A: 선택 탐지 | 611-632 | 재귀 setTimeout | progress 없이 status만 체크 |
| B: 자동 탐지 | 1073-1113 | setInterval + vm | DOM ref 직접 업데이트 |
| C: 다중파일 탐지 | 1186-1211 | setInterval + Promise | Promise 래핑, 로컬 intervalId |
| D: 일반 내보내기 | 2452-2497 | setInterval + vm | progress + message 업데이트 |
| E: 암호화 내보내기 | 2521-2568 | setInterval + this | D와 95% 동일 (중복!) |
| F: 배치 처리 | 2752-2797 | setInterval + this | 다중 필드 업데이트 |

### `progressPoller.js` API 설계

```javascript
// src/composables/progressPoller.js
import apiPython from '../apiRequest';
import config from '../resources/config.json';

/**
 * 진행률 폴링 팩토리 함수
 * @param {Object} callbacks - { onProgress, onComplete, onError }
 * @param {Object} options - { interval, useInterval, isComplete, isFailed }
 * @returns {{ start(jobId), stop(), isActive }}
 */
export function createProgressPoller(callbacks, options = {}) { ... }

/**
 * Promise 기반 폴링 (패턴 C용)
 * @returns {Promise} - 완료 시 resolve, 에러 시 reject
 */
export function pollAsPromise(jobId, callbacks, options = {}) { ... }
```

- `useInterval: true` (기본값) → setInterval 모드 (패턴 B~F)
- `useInterval: false` → 재귀 setTimeout 모드 (패턴 A)
- `pollAsPromise()` → Promise 래핑 (패턴 C)

### 리팩토링 순서 (각 단계 후 빌드 검증)

**1-1. 패턴 A 리팩토링** (611-632줄, 가장 단순)
```javascript
// Before: 22줄의 재귀 poll 함수
// After:
const poller = createProgressPoller({
  onComplete: async () => {
    this.isDetecting = false;
    await this.loadDetectionData();
    this.$refs.videoCanvas?.drawBoundingBoxes?.();
    window.electronAPI.showMessage('선택 객체 탐지가 완료되었습니다.');
  },
  onError: (err) => {
    this.isDetecting = false;
    window.electronAPI.showMessage('선택 객체 탐지 실패: ' + (err.message || err));
  },
}, { useInterval: false });
poller.start(jobId);
```

**1-2. 패턴 B 리팩토링** (1073-1113줄)
- `this.detectionIntervalId = setInterval(...)` → `this._detectionPoller = createProgressPoller(...)`
- `clearInterval(vm.detectionIntervalId)` → `this._detectionPoller.stop()`
- 콜백에서 `vm.progress`, `vm.$refs.progressBar` 등 업데이트

**1-3. 패턴 C 리팩토링** (1186-1211줄)
```javascript
// Before: 26줄의 Promise + setInterval 래퍼
// After:
return pollAsPromise(jobId, {
  onProgress: (data) => {
    this.fileProgressMap[file.name] = Math.floor(data.progress);
  },
  onError: () => { this.fileProgressMap[file.name] = -1; },
});
```

**1-4. 패턴 D+E 통합 리팩토링** (2452-2568줄, **~116줄 → ~30줄**)
- D와 E는 95% 동일한 중복 코드
- 공통 헬퍼 메서드 `_startExportPolling(jobId, extraOnComplete)` 생성
- D는 `this._startExportPolling(jobId)`
- E는 `this._startExportPolling(jobId, () => { this.exportFilePassword = ''; })`

**1-5. 패턴 F 리팩토링** (2752-2797줄)
- `startBatchPolling()` → createProgressPoller 사용
- `stopBatchPolling()` → `this._batchPoller.stop()`

### Store 정리
- `exportStore.js`의 `stopBatchPolling()` 액션: `clearInterval(this.batchIntervalId)` → 폴러 객체 참조로 변경
- `detectionIntervalId`, `exportProgressTimer`, `batchIntervalId` 필드: 폴러 객체로 대체되므로 제거 가능

---

## Step 2: `conversionHelper.js` 생성 (보조 — 중간 가치)

### 대상 파일
- **생성**: `src/composables/conversionHelper.js`
- **수정**: `src/App.vue` (변환 메서드 2개의 보일러플레이트 추출)

### 현재 코드 분석

두 메서드의 **공통 보일러플레이트** (~15줄씩):
```javascript
// 양쪽 모두 동일한 패턴:
this.conversion.inProgress = true;
this.conversion.progress = 0;
this.conversion.currentFile = file.name;
const progressHandler = (event, data) => { this.conversion.progress = data.progress; };
window.electronAPI.onConversionProgress(progressHandler);
// ... 변환 로직 ...
window.electronAPI.removeConversionProgressListener(progressHandler);
this.conversion.inProgress = false;
```

### `conversionHelper.js` API 설계

```javascript
/**
 * 변환 진행률 리스너 생명주기 관리
 * @param {Object} conversionState - { inProgress, progress, currentFile }
 * @param {string} fileName
 * @returns {{ cleanup(), fail() }}
 */
export function setupConversionProgress(conversionState, fileName) { ... }
```

### 리팩토링

**2-1. `convertAndPlay`** (1681-1743줄)
```javascript
const conv = setupConversionProgress(this.conversion, file.name);
try {
  // ... 기존 변환 로직 (리스너 등록/해제 코드 제거) ...
  conv.cleanup();
} catch (error) {
  conv.fail();
  window.electronAPI.showMessage('파일 변환 중 오류가 발생했습니다: ' + error.message);
}
```

**2-2. `convertAndPlayFromPath`** (429-538줄) — 동일 패턴 적용

> 참고: 두 메서드는 근본적으로 다른 변환 방식(Blob vs 경로 기반)이므로 **통합하지 않음**. 공유 보일러플레이트만 추출.

---

## 검증 계획

각 단계 완료 후:
1. `npx vite build --config vite.renderer.config.mjs` — 빌드 성공 확인
2. 기능별 수동 검증:
   - Step 1 후: 객체 탐지 → 진행률 표시 → 완료 확인 / 내보내기 → 진행률 → 완료 / 일괄처리
   - Step 2 후: 비지원 코덱 영상 로드 → 변환 진행률 → 재생

## 예상 코드 변화량

| 항목 | 변화 |
|------|------|
| App.vue | ~300줄 폴링 코드 → ~80줄 (약 -220줄) |
| 신규 파일 2개 | progressPoller.js (~80줄) + conversionHelper.js (~25줄) |
| 순감소 | **약 -115줄**, 중복 제거 + 가독성 향상 |
