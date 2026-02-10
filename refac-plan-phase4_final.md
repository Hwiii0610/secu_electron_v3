# Phase 4 (Composables 추출) 검증 결과 보고서

## Context
App.vue 리팩토링 5단계 계획 중 Phase 4의 완료 여부를 코드베이스와 대조 검증합니다.
원본 계획서 수정사항: `.ts` → `.js`, `setup()` 제거, `useCanvasDrawing`/`useWatermark` 삭제, 2개 유틸리티 모듈만 추출.

---

## 전체 진행률

```
Phase 1: 버그 수정          [████████████████████] 100% ✅
Phase 2: Pinia Store 도입   [████████████████████] 100% ✅
Phase 3: 컴포넌트 분리      [████████████████████] 100% ✅
Phase 4: Composables 추출   [████████████████░░░░]  85% ⚠️ 미정리 항목 4개
Phase 5: 중복 코드 정리     [░░░░░░░░░░░░░░░░░░░░]   0% ⏳
```

---

## Phase 4 상세 검증

### ✅ 완료된 항목

**Composable 파일 생성**

| 파일 | 줄 수 | 내보내기 함수 |
|------|-------|-------------|
| `src/composables/progressPoller.js` | 268줄 | `createProgressPoller`, `pollAsPromise`, `createBatchPoller` |
| `src/composables/conversionHelper.js` | 59줄 | `setupConversionProgress`, `createConversionOptions` |

**App.vue import 연결** (108-109줄) ✅

**폴링 패턴 리팩토링** (6개 중 5개 완료)

| 패턴 | 리팩토링 결과 | App.vue 위치 | 상태 |
|------|-------------|-------------|------|
| A: 선택 탐지 | **미변경** (인라인 setTimeout 유지) | 603-624줄 | ⚠️ |
| B: 자동 탐지 | `this._detectionPoller = createProgressPoller(...)` | 1063줄 | ✅ |
| C: 다중파일 탐지 | `pollAsPromise(jobId, {...})` | 1162줄 | ✅ |
| D+E: 내보내기 | `_startExportPolling(jobId, extraOnComplete)` 통합 | 2395, 2419, 2485줄 | ✅ |
| F: 배치 처리 | `this._batchPoller = createBatchPoller(...)` | 2644줄 | ✅ |

**비디오 변환 리팩토링** (2개 모두 완료)

| 메서드 | 사용 | App.vue 위치 |
|--------|------|-------------|
| `convertAndPlayFromPath` | `setupConversionProgress(this.conversion, file.name)` | 432줄 ✅ |
| `convertAndPlay` | `setupConversionProgress(this.conversion, file.name)` | 1640줄 ✅ |

**setInterval 직접 사용**: App.vue에서 **0건** (모두 composable로 이전) ✅

---

### ⚠️ 미정리 항목 4개

#### 1. 패턴 A (선택 탐지) 미리팩토링
- **위치**: `App.vue:603-624`
- **현황**: 인라인 `setTimeout` 재귀 패턴 유지
- **처리**: `createProgressPoller({...}, { useInterval: false })` 로 전환
- **영향도**: 낮음 (동작 문제 없음, 일관성 이슈)

#### 2. 레거시 clearInterval 방어 코드
- **위치**: `App.vue:2367-2370`
- **현황**: `exportProgressTimer`에 대한 `clearInterval` — `_exportPoller` 사용 이후 실행 불가능한 코드
- **처리**: 해당 4줄 제거

#### 3. Store 레거시 타이머 ID 필드
- `detectionStore.js:11` — `detectionIntervalId: null` (App.vue에서 미참조)
- `exportStore.js:7` — `exportProgressTimer: null` (레거시 코드에서만 참조)
- `exportStore.js:20` — `batchIntervalId: null` (App.vue에서 미참조)
- **처리**: 3개 필드 제거

#### 4. exportStore.js `stopBatchPolling()` 레거시 액션
- **위치**: `exportStore.js:55-60`
- **현황**: `clearInterval(this.batchIntervalId)` 사용하지만 `batchIntervalId`는 항상 null
- **처리**: 빈 메서드로 변경 또는 `resetBatchState()`에서 호출 정리

---

## 코드 규모 변화

| 파일 | Phase 3 후 | Phase 4 후 | 변화 |
|------|-----------|-----------|------|
| App.vue | ~2,955줄 | ~2,822줄 | -133줄 |
| composables/ | 0 파일 | 2 파일 (327줄) | +327줄 (재사용 모듈) |

---

## 미정리 항목 처리 계획

### 대상 파일 (3개)
1. **`src/App.vue`** — 패턴 A 리팩토링 (603-624줄) + 레거시 clearInterval 제거 (2367-2370줄)
2. **`src/stores/exportStore.js`** — `exportProgressTimer`, `batchIntervalId` 필드 제거 + `stopBatchPolling()` 정리
3. **`src/stores/detectionStore.js`** — `detectionIntervalId` 필드 제거

### 검증
- `npx vite build --config vite.renderer.config.mjs` — 빌드 성공 확인
- 선택 탐지 / 자동 탐지 / 내보내기 / 배치 처리 동작 확인
