# Phase 5 (중복 코드 정리) 전략 문서

> **최종 수정일**: 2026-02-10
> **상태**: 코드 대조 검증 완료 후 수정됨

## 개요

Phase 4 완료 후 App.vue는 **2,822줄**로 여전히 대규모 파일입니다. 이 문서는 중복 코드를 식별하고 정리하기 위한 전략을 제시합니다.

> **Phase 4 잔여 정리**: Store 레거시 필드(`detectionIntervalId`, `exportProgressTimer`, `batchIntervalId`, `stopBatchPolling`)는 정리 완료됨.

---

## 1. 현재 상태 분석

### 코드 통계 (검증 완료)

| 항목 | 수량 | 비고 |
|------|------|------|
| App.vue 총 줄 수 | 2,822줄 | |
| Methods 수 | 45+개 | |
| `try-catch` 블록 | **35개** | ~~62개~~ (수정) |
| `window.electronAPI.showMessage` 호출 | **61회** | ~~54회~~ (수정) |
| API 호출 (`apiPython.post`) | 5회 | |

### 주요 중복 패턴 (검증 결과)

```
┌─────────────────────────────────────────────────────────────┐
│  ✅ 실효성 높음 — 진행 대상                                  │
│                                                              │
│  1. 파일 경로 변환 (4곳)                       [우선순위 1]   │
│     → 정규식 불일치 버그 포함, 일관성 확보 필요               │
│                                                              │
│  2. 마스킹 데이터 변환 (2곳, 완전 동일 코드)   [우선순위 2]   │
│     → entries.map(entry => ({...})) 패턴 통합                │
│                                                              │
│  3. Phase 4 잔여: 선택 탐지 폴링 (1곳)        [우선순위 3]   │
│     → 인라인 setTimeout → composable 전환                    │
├─────────────────────────────────────────────────────────────┤
│  ⚠️ 실효성 낮음 — 보류                                       │
│                                                              │
│  4. 메시지 표시 (61회) → 거의 모두 고유 문자열               │
│  5. API 에러 처리 (5회) → 모두 다른 컨텍스트                 │
│  6. 폼 유효성 검사 → 중복 아님 (단일 구현)                   │
│  7. 비디오 메타데이터 → 중복 아님 (단일 정의)                │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 리팩토링 전략

### 2.1 파일 경로 유틸리티 [우선순위 1] ✅

**문제**: `file://` URL → 로컬 경로 변환 로직이 4곳에 산재하며, **정규식이 불일치**

**현재 코드 (4곳의 불일치)**:
```javascript
// Line 261: decodeURI + /^file:\/\//
if (s.startsWith('file:///')) s = decodeURI(s.replace(/^file:\/\//, ''));

// Line 341: decodeURI + /^file:\/+/  ← 다른 정규식!
const p = decodeURI(sel.url).replace(/^file:\/+/, '');

// Line 434: decodeURI 없음 + /^file:\/\//  ← decodeURI 누락!
const originalPath = file.file || file.path || file.url?.replace(/^file:\/\//, '') || file.name;

// Line 790: decodeURI 없음 + /^file:\/\//  ← decodeURI 누락!
const fileUrlToPath = (u) => (u ? u.replace(/^file:\/\//, '') : '');
```

**해결**: `src/utils/path.js` 생성

```javascript
/**
 * file:// URL을 로컬 경로로 변환
 * - decodeURI 적용 (한글/공백 경로 대응)
 * - 플랫폼 독립적 file:// 접두사 제거
 * @param {string} url - file:// URL 또는 경로
 * @returns {string} 정규화된 로컬 경로
 */
export function fileUrlToPath(url) {
  if (!url) return '';
  let path = url;
  if (path.startsWith('file://')) {
    path = decodeURI(path).replace(/^file:\/\//, '');
  }
  return path;
}
```

**기대 효과**: 4곳 일관성 확보 + **decodeURI 누락 버그 수정** + ~10줄 절감

---

### 2.2 마스킹 데이터 변환기 [우선순위 2] ✅

**문제**: 마스킹 엔트리 변환 로직이 2곳에서 **완전 동일**하게 중복

**현재 코드 (2곳, 동일 구조)**:
```javascript
// Line 631 (handleMaskingBatch)
const data = entries.map(entry => ({
  frame: entry.frame,
  track_id: entry.track_id,
  bbox: typeof entry.bbox === 'string' ? JSON.parse(entry.bbox) : entry.bbox,
  bbox_type: entry.bbox_type || 'rect',
  score: entry.score ?? null,
  class_id: entry.class_id ?? null,
  type: entry.type,
  object: entry.object ?? 1
}));

// Line 987 (sendBatchMaskingsToBackend 호출부) — 동일 구조
```

**해결**: `src/utils/masking.js` 생성

```javascript
/**
 * 마스킹 엔트리 배열을 백엔드/IPC 전송 형식으로 변환
 * @param {Array} entries - 원본 마스킹 엔트리 배열
 * @returns {Array} 변환된 엔트리 배열
 */
export function convertMaskingEntries(entries) {
  return entries.map(entry => ({
    frame: entry.frame,
    track_id: entry.track_id,
    bbox: typeof entry.bbox === 'string' ? JSON.parse(entry.bbox) : entry.bbox,
    bbox_type: entry.bbox_type || 'rect',
    score: entry.score ?? null,
    class_id: entry.class_id ?? null,
    type: entry.type,
    object: entry.object ?? 1
  }));
}
```

**기대 효과**: 2곳 동일 코드 통합, ~15줄 절감

---

### 2.3 Phase 4 잔여 정리 [우선순위 3] ✅

#### 3a. 선택 탐지 폴링 composable 전환
- **위치**: `App.vue:603-624`
- **현황**: 인라인 `setTimeout` 재귀 패턴 (다른 5개 폴링은 모두 composable 전환 완료)
- **처리**: `createProgressPoller({...}, { useInterval: false })` 로 전환

#### 3b. 레거시 clearInterval 방어 코드 제거
- **위치**: `App.vue:2367-2370`
- **현황**: `exportProgressTimer`에 대한 `clearInterval` — 이미 `_exportPoller` 사용으로 실행 불가능한 코드
- **처리**: 4줄 제거

---

### 보류 항목 (실효성 낮음)

#### ~~2.1 메시지 유틸리티~~ → 보류

**보류 사유**: 61회 호출이지만 거의 모든 메시지가 **고유 문자열** (에러 컨텍스트별 다른 내용). 카탈로그 객체로 추출 시 메시지와 로직이 분리되어 **가독성 오히려 저하**. `showError(msg)` 래퍼만으로는 `window.electronAPI.` 접두사 20자 절약에 그침.

#### ~~2.3 API 래퍼~~ → 보류

**보류 사유**: 5개 API 호출 모두 **서로 다른 페이로드, 에러 처리, 후속 로직** 수행. 범용 래퍼 도입 시 각 호출의 특수 로직을 옵션으로 전달해야 해서 **복잡도 증가**.

#### ~~2.4 폼 검증~~ → 보류

**보류 사유**: 프레임 범위 검증은 `confirmMaskFrameRange` 내부에서 **1회만 수행** (중복 아님).

#### ~~2.6 비디오 메타데이터~~ → 보류

**보류 사유**: `formatFileSize`, `formatTime`, `formatDuration`, `parseDurationToSeconds` 모두 App.vue 내 **단일 정의**. 정의가 중복된 것이 아니라 호출만 다수.

---

## 3. 작업 순서

```
우선순위 1: 파일 경로 유틸리티 (path.js)
  → 4곳 정규식 불일치 + decodeURI 누락 버그 수정
  ↓ 빌드 테스트

우선순위 2: 마스킹 데이터 변환기 (masking.js)
  → 2곳 완전 동일 코드 통합
  ↓ 빌드 테스트

우선순위 3: Phase 4 잔여 정리
  → 선택 탐지 폴링 composable 전환 + 레거시 코드 제거
  ↓ 빌드 테스트
```

---

## 4. 예상 코드 규모 변화

| 단계 | App.vue 줄 수 | 유틸리티 파일 | 효과 |
|------|--------------|---------------|------|
| 현재 (Phase 4 완료) | 2,822줄 | - | - |
| Phase 5 완료 시 | ~2,790줄 | +2개 (~30줄) | 버그 수정 + 일관성 확보 |

> **참고**: 원본 문서의 -113줄 목표는 과대 추정. 실효성 있는 항목만 진행 시 코드량 변화보다 **코드 품질(일관성, 버그 수정)** 향상에 중점.

---

## 5. 파일 구조 변경

```
src/
├── utils/                    # 새로 생성
│   ├── path.js              # 파일 경로 처리 (file:// URL → 로컬 경로)
│   └── masking.js           # 마스킹 데이터 변환
├── composables/             # 기존 (Phase 4)
│   ├── progressPoller.js
│   └── conversionHelper.js
├── stores/                  # 기존 (Phase 2, 레거시 필드 정리 완료)
│   ├── detectionStore.js
│   └── exportStore.js
└── App.vue                  # 정리 후 ~2,790줄
```

---

## 6. 리스크 및 주의사항

| 리스크 | 완화책 |
|--------|--------|
| 경로 처리 오류 | `decodeURI` 적용 범위 통일, macOS/Windows 경로 테스트 |
| 마스킹 변환 필드 누락 | 기존 코드 그대로 추출, 필드 변경 없음 |
| Phase 4 잔여 폴링 전환 | `createProgressPoller`의 `useInterval: false` 모드 검증 완료 |

---

## 7. 검증 계획

```bash
# 1. 빌드 검증
npx vite build --config vite.renderer.config.mjs

# 2. 주요 기능 수동 테스트 체크리스트
□ 파일 선택 및 로드 (경로 유틸리티 검증)
□ 객체 탐지 - 선택 탐지 (Phase 4 잔여 폴링 검증)
□ 객체 탐지 - 자동/다중
□ 마스킹 적용 및 배치 동기화 (마스킹 변환기 검증)
□ 내보내기 (일반/암호화)
□ 일괄 처리
```

---

## 결론

Phase 5는 원본 계획(6개 유틸리티, -113줄)에서 **실효성 검증 후 2개 유틸리티 + Phase 4 잔여 정리**로 범위를 조정합니다. 코드량 감소보다 **경로 처리 정규식 불일치 버그 수정**과 **코드 일관성 확보**에 초점을 맞춥니다.

**다음 작업**: 우선순위 1 (파일 경로 유틸리티) 구현 시작
