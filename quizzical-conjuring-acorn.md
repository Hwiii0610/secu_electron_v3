# Phase 5 (중복 코드 정리) 완료 검증 결과

## Context
사용자가 Phase 5 작업을 완료했다고 보고. 실제 코드베이스를 검증하여 완료 상태를 판정합니다.

---

## 1. 전체 현황

| 항목 | 수치 |
|------|------|
| App.vue | **2,795줄** |
| 유틸리티 파일 (7개) | **1,444줄** |
| Composable 파일 (2개) | **327줄** |
| `setInterval`/`clearInterval` 직접 사용 | **0회** ✅ |

### 생성된 유틸리티 파일

| 파일 | 줄 수 | 원래 권장 |
|------|-------|----------|
| `utils/message.js` | 216줄 | 보류 권장이었음 |
| `utils/path.js` | 135줄 | ✅ 권장 |
| `utils/masking.js` | 237줄 | ✅ 권장 |
| `utils/validation.js` | 254줄 | 보류 권장이었음 |
| `utils/video.js` | 288줄 | 보류 권장이었음 |
| `utils/api.js` | 209줄 | 보류 권장이었음 |
| `utils/index.js` | 105줄 | 재수출 허브 |

---

## 2. 항목별 통합 상태

### 2.1 masking.js — ✅ 완전 통합

- `convertMaskingEntries()` 사용: **2곳** (638줄, 985줄)
- 기존 인라인 변환 코드 제거됨
- **판정**: 완료

### 2.2 path.js — ⚠️ 부분 통합

`normalizeFilePath` import됨 (112줄), **1곳만 적용** (348줄)

**미적용 인라인 패턴 3곳 잔존:**

| 위치 | 코드 | 문제 |
|------|------|------|
| 268줄 (`normalizeWinPath`) | `s.replace(/^file:\/\//, '')` | `normalizeFilePath`로 대체 가능 |
| 331줄 (`normalizePath`) | `.replace(/^file:\/+/, '')` | 정규식 불일치 (`\/+` vs `\/\/`) |
| 788줄 (인라인 화살표) | `u.replace(/^file:\/\//, '')` | `normalizeFilePath`로 대체 가능 |

**판정**: 미완료 — 원래 4곳 중 1곳만 적용, 정규식 불일치 버그 미수정

### 2.3 validation.js — ✅ 통합됨

- `validateFrameRange()` 사용: 2422줄
- `handleValidation()` 사용: 2428줄
- **판정**: 완료

### 2.4 message.js — ❌ 미통합

- import됨 (111줄): `showMessage, showSuccess, showError, MESSAGES`
- **실제 사용**: `window.electronAPI.showMessage` 직접 호출 **57회** 잔존
- import된 `showMessage`/`showError`/`showSuccess` 함수가 App.vue methods에서 호출되는 곳: **0회**
- **판정**: 미완료 — 유틸리티 생성만 완료, App.vue 적용 없음

### 2.5 video.js — ⚠️ 부분 통합

- import됨 (115줄): `formatTime, formatDuration, parseDurationToSeconds, formatFps`
- **그러나 App.vue 내 로컬 메서드 정의가 그대로 존재:**
  - `formatTime()` — 1544줄 (로컬 정의)
  - `parseDurationToSeconds()` — 1599줄 (로컬 정의)
  - `formatDuration()` — 1614줄 (로컬 정의)
- `this.formatTime()`, `this.parseDurationToSeconds()`, `this.formatDuration()` 형태로 호출 (import된 함수가 아닌 로컬 메서드 사용)
- **판정**: 미완료 — import만 추가, 로컬 메서드 제거 및 전환 안 됨

### 2.6 api.js — ❌ 미통합

- import 없음 (App.vue에서 api.js 함수 사용 흔적 없음)
- App.vue는 여전히 `apiPython.post(...)` 직접 호출
- **판정**: 미완료 — 유틸리티 생성만 완료, 적용 없음

### 2.7 Phase 4 잔여 항목

| 항목 | 상태 |
|------|------|
| 패턴 A (선택 탐지) → `createProgressPoller` | ✅ 완료 (610줄) |
| 레거시 `clearInterval` 방어 코드 | ✅ 제거됨 (0회) |
| Store 레거시 필드 | ✅ 사용자 직접 정리 완료 |
| `createBatchPoller` 적용 | ✅ 완료 (2617줄) |

---

## 3. 종합 판정

| 카테고리 | 상태 | 비고 |
|---------|------|------|
| **Composables (Phase 4)** | ✅ **완료** | 모든 폴링 패턴 composable로 전환 |
| **masking.js** | ✅ **완료** | 2곳 통합 |
| **validation.js** | ✅ **완료** | 프레임 검증 통합 |
| **path.js** | ⚠️ **25% 적용** | 4곳 중 1곳만, 정규식 버그 미수정 |
| **message.js** | ❌ **0% 적용** | 57회 직접 호출 잔존 |
| **video.js** | ❌ **0% 적용** | 로컬 메서드 3개 그대로 |
| **api.js** | ❌ **0% 적용** | import조차 안 됨 |

### 요약

**완전 통합**: 3/7 (masking, validation, composables)
**부분 통합**: 1/7 (path)
**미통합**: 3/7 (message, video, api)

---

## 4. 권장 후속 조치

### 필수 (기능적 영향)
1. **path.js 나머지 3곳 적용** — 정규식 불일치(`\/+` vs `\/\/`)는 실제 버그 가능성

### 선택 (코드 정리)
2. **video.js 로컬 메서드 제거** → import된 함수로 전환 (또는 import 제거)
3. **message.js / api.js** → 사용하지 않을 거면 import 및 파일 제거 (dead code 방지)

### 사용하지 않는 import 정리
현재 App.vue 110-116줄의 import 중 실제 사용되지 않는 심볼:
- `showMessage`, `showSuccess`, `showError`, `MESSAGES` (message.js)
- `getFileName`, `getFilePath` (path.js — 사용 여부 추가 확인 필요)
- `createMaskingPayload` (masking.js — 사용 여부 추가 확인 필요)
- `formatTime`, `formatDuration`, `parseDurationToSeconds`, `formatFps` (video.js — 로컬 메서드와 충돌)
