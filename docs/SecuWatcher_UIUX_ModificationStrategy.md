# SecuWatcher — UI/UX 우선순위별 코드 수정 전략

> **프로젝트**: SecuWatcher Export (Electron + Vue 3 + Vite)
> **작성일**: 2026-03-04
> **목적**: 리뷰 문서(v4.0) 기반 48개 개선항목의 실행 전략 및 기능 영향도 평가 (프론트엔드 + 백엔드)

---

## 목차

1. [기능 영향도(Risk) 분류 기준](#1-기능-영향도risk-분류-기준)
2. [Phase 1 — 긴급: 안정성 및 에러 처리 (1~2주)](#2-phase-1--긴급-안정성-및-에러-처리-12주)
3. [Phase 2 — 단기: 디자인 시스템 및 플랫폼 UX (2~4주)](#3-phase-2--단기-디자인-시스템-및-플랫폼-ux-24주)
4. [Phase 3 — 중기: 국제화 및 고급 기능 (1~2개월)](#4-phase-3--중기-국제화-및-고급-기능-12개월)
5. [테스트 전략](#5-테스트-전략)
6. [수정 전 체크리스트](#6-수정-전-체크리스트)

---

## 1. 기능 영향도(Risk) 분류 기준

각 수정 항목을 실제 기능에 미치는 영향 수준으로 분류합니다.

| Risk 등급 | 정의 | 예시 |
|-----------|------|------|
| **SAFE** (무영향) | CSS만 수정, 기존 로직 변경 없음 | 색상 변경, aria 속성 추가, 포커스 스타일 추가 |
| **LOW** (저위험) | 기존 코드에 추가만 하며, 기존 동작 수정 없음 | 에러 핸들러 추가, 새 컴포넌트 생성 |
| **MEDIUM** (중위험) | 기존 코드 흐름을 일부 변경하지만 핵심 로직 유지 | 이벤트 리스너에 throttle 래핑, Toast 구조 변경 |
| **HIGH** (고위험) | 핵심 비즈니스 로직이나 데이터 흐름 변경 | Store 구조 변경, App.vue 분리, i18n 전면 적용 |

---

## 2. Phase 1 — 긴급: 안정성 및 에러 처리 (1~2주)

### 항목 1: Vue 글로벌 에러 핸들러 설정

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** — 기존 코드 3줄 사이에 추가만 함, 기존 동작 변경 없음 |
| **대상 파일** | `src/renderer.js` (현재 7줄) |
| **기능 영향** | 없음. 현재 에러 발생 시 콘솔에만 출력되던 것이 사용자에게도 표시됨 |
| **의존성** | 없음 |

**수정 방법**:
```javascript
// renderer.js — 기존 코드 변경 없이 5~6행 사이에 삽입
const app = createApp(App);
app.use(createPinia());

// [추가] 글로벌 에러 핸들러
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, info);
  // 간단한 알림 (기존 toast 시스템 활용)
  const event = new CustomEvent('vue-error', { detail: { message: err.message } });
  window.dispatchEvent(event);
};

app.mount('#app');
```

**검증 방법**: 의도적으로 컴포넌트에서 에러를 발생시켜 핸들러 동작 확인. 정상 흐름에서는 핸들러가 호출되지 않으므로 기존 기능에 영향 없음.

---

### 항목 2: ARIA 레이블 추가

| 구분 | 내용 |
|------|------|
| **Risk** | **SAFE** — HTML 속성 추가만, 렌더링/로직 변경 없음 |
| **대상 파일** | `index.html`, `TopMenuBar.vue`, `FilePanel.vue`, `VideoControls.vue`, `SettingsModal.vue` 외 |
| **기능 영향** | **없음**. ARIA 속성은 스크린 리더에만 영향, 시각적 렌더링/이벤트 처리 변화 없음 |
| **의존성** | 없음 |

**수정 방법** (파일별):

```html
<!-- index.html: 윈도우 컨트롤 버튼 — 속성 추가만 -->
<button class="control-btn minimize-btn" id="minimize-btn" aria-label="창 최소화">
<button class="control-btn maximize-btn" id="maximize-btn" aria-label="창 최대화">
<button class="control-btn close-btn" id="close-btn" aria-label="창 닫기">
```

```vue
<!-- TopMenuBar.vue: 기존 div → 그대로 두고 role/tabindex만 추가 -->
<!-- ⚠️ 주의: div→button 변경이 아닌 속성 추가만 우선 진행 -->
<div role="menuitem" tabindex="0" aria-label="자동 객체 탐지"
     @click="onMenuClick('자동객체탐지')"
     @keydown.enter="onMenuClick('자동객체탐지')">
```

**⚠️ 주의사항**: `div`→`button` 태그 변경은 CSS에 영향을 줄 수 있으므로 Phase 1에서는 **태그 변경 없이 `role`/`aria-*`/`tabindex` 속성만 추가**합니다. 태그 변경은 Phase 2의 디자인 시스템 통합 시 함께 진행합니다.

**검증 방법**: 수정 전후 스크린샷 비교 → 시각적 차이 없음 확인. 키보드 Tab 이동 시 포커스 순서 확인.

---

### 항목 3: 키보드 포커스 인디케이터

| 구분 | 내용 |
|------|------|
| **Risk** | **SAFE** — CSS 추가만, 기존 스타일 덮어쓰기 없음 |
| **대상 파일** | `src/styles/base.css` |
| **기능 영향** | **없음**. `:focus-visible`은 키보드 사용 시에만 표시, 마우스 클릭에는 표시 안 됨 |
| **의존성** | 항목 2(ARIA) 완료 후 효과가 극대화됨 |

**수정 방법**:
```css
/* base.css 하단에 추가 (기존 규칙과 충돌 없음) */
button:focus-visible,
[role="menuitem"]:focus-visible,
[role="tab"]:focus-visible,
[role="option"]:focus-visible,
input:focus-visible,
select:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

**검증 방법**: Tab 키로 UI 탐색 시 파란 아웃라인 표시 확인. 마우스 클릭 시에는 표시되지 않는지 확인.

---

### 항목 4: Toast 메시지 유형별 색상 구분

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — Toast 호출부도 함께 수정 필요 |
| **대상 파일** | `src/styles/controls.css`, `src/App.vue` (showToast 관련 로직) |
| **기능 영향** | Toast 표시 로직 변경. `showToast(message)` → `showToast(message, type)` 시그니처 변경 |
| **의존성** | App.vue의 모든 `showToast` 호출부 확인 필요 |

**수정 전략**:

1단계 — CSS만 추가 (SAFE):
```css
/* controls.css — 기존 .toast 유지, 변형 클래스 추가 */
.toast--success { background: #059669; border-left: 4px solid #10B981; }
.toast--error   { background: #DC2626; border-left: 4px solid #EF4444; }
.toast--warning { background: #D97706; border-left: 4px solid #F59E0B; }
.toast--info    { background: #2563EB; border-left: 4px solid #3B82F6; }
```

2단계 — JS 수정 (MEDIUM):
```javascript
// App.vue: 기존 showToast 시그니처에 type 파라미터 추가 (기본값 설정으로 하위 호환성 유지)
showToast(message, type = 'info') {
  this.toastMessage = message;
  this.toastType = type;  // 추가
  this.showToast = true;
  setTimeout(() => { this.showToast = false; }, 3000);
}
```

**⚠️ 하위 호환성**: `type` 기본값을 `'info'`로 설정하여 기존 `showToast('메시지')` 호출이 모두 정상 동작하도록 보장합니다. 기존 호출부 수정 없이도 동작합니다.

**검증 방법**:
- 기존의 모든 Toast 호출이 기본 스타일(info)로 정상 표시되는지 확인
- 에러 발생 시 빨간색, 성공 시 녹색으로 표시되는지 확인

---

### 항목 5: ProcessingModal 취소 버튼 추가

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — 모달 템플릿 변경 + 취소 이벤트 상위 전파 필요 |
| **대상 파일** | `src/components/modals/ProcessingModal.vue`, `App.vue` (취소 핸들러) |
| **기능 영향** | 모달에 버튼 추가. 취소 시 진행 중인 작업 중단 로직 필요 |
| **의존성** | 백엔드 API에 작업 취소 엔드포인트가 있는지 확인 필요 |

**수정 전략**:
```vue
<!-- ProcessingModal.vue — 취소 버튼 추가 -->
<template>
  <div v-if="isProcessing" class="processing-modal">
    <div class="processing-modal-content">
      <div class="processing-text">{{ processingMessage }}</div>
      <div class="processing-spinner">
        <div class="spinner"></div>
      </div>
      <!-- [추가] 취소 버튼: cancellable prop이 true일 때만 표시 -->
      <button v-if="cancellable" class="action-button cancel"
              @click="$emit('cancel')" style="margin-top: 16px;">
        작업 취소
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ProcessingModal',
  props: {
    isProcessing: Boolean,
    processingMessage: String,
    cancellable: { type: Boolean, default: false },  // 기본값 false → 기존 동작 유지
  },
  emits: ['cancel'],
};
</script>
```

**⚠️ 기존 동작 보존**: `cancellable` prop 기본값이 `false`이므로, 기존에 `ProcessingModal`을 사용하는 모든 곳에서 취소 버튼이 표시되지 않습니다. 취소가 가능한 작업에만 선별적으로 `:cancellable="true"` 를 추가합니다.

**⚠️ 확인 필요**: Python 백엔드에 `/cancel/{job_id}` 엔드포인트 존재 여부. 없으면 프론트엔드 단에서만 polling 중단 처리.

**검증 방법**: 기존 ProcessingModal 사용 화면에서 취소 버튼이 표시되지 않는지 확인 → cancellable=true 시 버튼 표시 확인

---

### 항목 6: Progress Polling 백오프/최대 재시도

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — 에러 처리 흐름 변경, 기존 에러 시 무한 재시도가 유한 재시도로 변경 |
| **대상 파일** | `src/composables/progressPoller.js` (pollRecursive 함수) |
| **기능 영향** | 에러 10회 초과 시 polling 중단. 기존에는 무한 재시도 |
| **의존성** | `detectionManager.js`, `exportManager.js` 등 poller 사용처의 onError 콜백 확인 |

**수정 방법**:
```javascript
// progressPoller.js — pollRecursive 함수 내부만 수정
const pollRecursive = async (jobId) => {
  if (!isRunning) return;

  try {
    const data = await fetchProgress(jobId);
    retryCount = 0;  // [추가] 성공 시 카운터 리셋
    const done = handleResponse(data, null, null);

    if (!done && isRunning) {
      timerId = setTimeout(() => pollRecursive(jobId), interval);
    }
  } catch (err) {
    console.error('Progress polling error:', err);
    retryCount++;  // [추가]

    if (retryCount >= maxRetries) {  // [추가] 최대 재시도 초과
      isRunning = false;
      if (onError) onError(new Error('서버 응답 없음 (재시도 초과). 네트워크를 확인해주세요.'));
      return;
    }

    // [변경] 기존: 동일 interval → 변경: 지수 백오프 (최대 30초)
    const backoff = Math.min(interval * Math.pow(1.5, retryCount), 30000);
    if (isRunning) {
      timerId = setTimeout(() => pollRecursive(jobId), backoff);
    }
  }
};
```

**⚠️ 기존 동작 변경점**:
- 기존: 에러 발생해도 동일 간격으로 무한 재시도
- 변경: 최대 10회 재시도 후 onError 콜백 호출하고 중단
- `onError` 콜백이 이미 정의되어 있으므로 자연스럽게 전파됨

**⚠️ setInterval 모드(pollInterval)**는 이미 에러 시 즉시 중단하므로 수정 불필요. 재귀 모드만 수정.

**검증 방법**: 백엔드 서버를 일시 중지한 상태에서 polling 시작 → 10회 재시도 후 에러 메시지 표시 확인 → 서버 재시작 후 정상 동작 확인

---

### 항목 7: Silent Failure → 사용자 알림 전환

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** — catch 블록 내부에 알림 호출 추가만 |
| **대상 파일** | `objectManager.js`, `fileManager.js`, `videoEditor.js`, `maskingData.js` |
| **기능 영향** | 기존: console.error만 → 변경: console.error + Toast 알림. 로직 변경 없음 |
| **의존성** | Toast 시스템이 동작 중이어야 함 (항목 4 완료 후 더 효과적) |

**수정 패턴** (모든 대상 파일 공통):
```javascript
// 기존
} catch (error) {
  console.error('JSON 업데이트 실패:', error);
}

// 변경 — console.error 유지 + emit 추가
} catch (error) {
  console.error('JSON 업데이트 실패:', error);
  emit('show-message', '데이터 저장 중 오류가 발생했습니다.');  // [추가]
}
```

**검증 방법**: 각 catch 블록에서 의도적으로 에러 발생 → Toast 표시 확인 → 기존 에러 복구 흐름이 변경되지 않았는지 확인

---

### 항목 8: Single Instance Lock

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** — 앱 초기화 코드에 추가만, 기존 흐름 변경 없음 |
| **대상 파일** | `src/main/index.js` (상단) |
| **기능 영향** | 두 번째 인스턴스 실행 시 기존 인스턴스로 포커스 이동. 첫 번째 인스턴스 동작 변경 없음 |
| **의존성** | 없음 |

**수정 방법**:
```javascript
// index.js — Squirrel 이벤트 처리 다음에 추가 (line 47 이후)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();      // 두 번째 인스턴스 즉시 종료
} else {
  app.on('second-instance', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
```

**⚠️ 주의**: `app.quit()` 호출 후 `process.exit(0)` 불필요 (Electron이 자동 처리). `app.whenReady()` 전에 배치해야 함.

**검증 방법**: 앱 실행 중 다시 실행 시도 → 기존 윈도우 포커스 확인 → 두 번째 인스턴스 종료 확인

---

### 항목 9: Canvas 렌더링 rAF 스로틀링

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — 마우스 이벤트 처리 타이밍 변경 |
| **대상 파일** | `src/composables/canvasInteraction.js` (onCanvasMouseMove 함수) |
| **기능 영향** | 호버 감지가 프레임 단위(~16ms)로 제한됨. 기존: 모든 mousemove마다 즉시 처리 |
| **의존성** | `canvasDrawing.js`의 `drawBoundingBoxes()` 호출 빈도 변경 |

**수정 방법**:
```javascript
// canvasInteraction.js — 모듈 상단에 rAF 플래그 추가
let rafPending = false;
let pendingMouseEvent = null;

function onCanvasMouseMove(event) {
  if (event.button !== 0) return;
  const { mode, video: videoStore } = getStores();

  // [변경] rAF로 래핑 — 호버 감지를 프레임 단위로 제한
  pendingMouseEvent = event;
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => {
      if (pendingMouseEvent) {
        checkHoveredBox(pendingMouseEvent);
      }
      rafPending = false;

      // 사각형 마스킹 (기존 로직 그대로 유지)
      if (mode.currentMode === 'mask' && mode.maskMode === 'rectangle' && mode.isDrawingMask) {
        const point = drawing.convertToOriginalCoordinates(pendingMouseEvent);
        if (mode.maskingPoints.length === 1) {
          mode.maskingPoints.push(point);
        } else {
          mode.maskingPoints[1] = point;
        }
        drawing.drawBoundingBoxes();
      }
    });
  }
}
```

**⚠️ 기존 동작 변경점**:
- 호버 반응 최대 지연: ~16ms (60fps 기준) — 사용자가 체감하기 어려운 수준
- 사각형 마스킹 드래그도 rAF 내부에서 처리 → 드래그 중 미세한 지연 가능
- **만약 마스킹 드래그 반응이 느리게 느껴지면**: 마스킹 부분만 rAF 바깥으로 분리

**검증 방법**:
1. 다수(50+) 객체가 있는 프레임에서 마우스 이동 → 이전보다 부드러운지 확인
2. 호버 시 색상 변경이 자연스러운지 확인
3. **핵심**: 사각형/다각형 마스킹 드래그가 정상 동작하는지 확인
4. 우클릭 컨텍스트 메뉴 위치가 정확한지 확인

---

### 항목 39: [BE] 디버그 print문 → logging 전환

| 구분 | 내용 |
|------|------|
| **Risk** | **SAFE** — print를 logging 호출로 교체, 비즈니스 로직 변경 없음 |
| **대상 파일** | `routers/encryption.py`, `detector.py`, `sam2_detector.py`, `blur.py` 외 |
| **기능 영향** | **없음**. 출력 대상이 stdout → 로그 파일로 변경될 뿐 |
| **의존성** | `core/logging_setup.py` (이미 존재) |

**수정 패턴**:
```python
# 기존
print(f"Decryption end: {timeToStr(time.time(), 'datetime')}")

# 변경
import logging
logger = logging.getLogger(__name__)
logger.info(f"Decryption end: {timeToStr(time.time(), 'datetime')}")
```

**검증 방법**: 전체 `print(` 문 검색 후 교체 → 기존 기능 동작 확인

---

### 항목 40: [BE] 에러 응답 구조화

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — API 응답 포맷 변경, 프론트엔드 에러 파싱 코드도 수정 필요 |
| **대상 파일** | `routers/detection.py`, `routers/export.py`, `routers/encryption.py` |
| **기능 영향** | HTTPException `detail`이 문자열에서 딕셔너리로 변경 |
| **의존성** | 프론트엔드의 에러 메시지 표시 로직 (항목 7, 21과 연계) |

**수정 전략**:
```python
# 1단계: 에러 응답 헬퍼 함수 생성 (새 파일 core/errors.py)
def api_error(status_code, code, message, suggestion=None, context=None):
    detail = {"code": code, "message": message}
    if suggestion:
        detail["suggestion"] = suggestion
    if context:
        detail["context"] = context
    raise HTTPException(status_code=status_code, detail=detail)

# 2단계: 기존 raise HTTPException을 api_error로 교체
# 기존
raise HTTPException(status_code=400, detail=f"File not found: {video_path}")
# 변경
api_error(400, "FILE_NOT_FOUND", "영상 파일을 찾을 수 없습니다",
          suggestion="파일 경로를 확인해주세요",
          context={"path": video_path})
```

**⚠️ 하위 호환성**: `detail`이 문자열→딕셔너리로 변경되므로, 프론트엔드에서 `error.response.data.detail`이 string인지 object인지 체크하는 분기 필요

**검증 방법**: 모든 API 엔드포인트에 잘못된 파라미터 전송 → 에러 응답 포맷 확인

---

### 항목 41: [BE] 모델 로딩 progress 구간 추가

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** — 기존 progress 범위를 0-5%(로딩) + 5-100%(처리)로 분할 |
| **대상 파일** | `detector.py` (`_get_yolo_model`), `sam2_detector.py` |
| **기능 영향** | 진행률 시작점이 0→5%로 변경. 기존 프론트엔드 프로그레스 바에 영향 없음 (0~100 범위 내) |
| **의존성** | `util.py`의 `update_progress` 함수 |

**수정 방법**:
```python
# detector.py — 탐지 실행 함수 내
def run_detection(job_id, video_path, ...):
    jobs[job_id]['status'] = 'running'

    # [추가] 모델 로딩 단계 표시
    update_progress(job_id, 0, start_pct=0, end_pct=5)
    jobs[job_id]['phase'] = 'model_loading'  # 프론트에서 메시지 표시용

    model = _get_yolo_model()  # 실제 로딩

    update_progress(job_id, 1.0, start_pct=0, end_pct=5)  # 5% 도달
    jobs[job_id]['phase'] = 'processing'

    # 이후 기존 프레임 처리 로직 (5~100%)
    for frame_idx in range(total_frames):
        ...
        update_progress(job_id, frac, start_pct=5, end_pct=100)
```

**검증 방법**: 모델 미로딩 상태에서 탐지 실행 → 0~5% 구간 표시 확인 → 이후 5~100% 정상 진행 확인

---

## 3. Phase 2 — 단기: 디자인 시스템 및 플랫폼 UX (2~4주)

### 항목 10: 디자인 토큰 통합 (색상)

| 구분 | 내용 |
|------|------|
| **Risk** | **SAFE** — CSS 값 교체만, 로직 변경 없음 |
| **대상 파일** | `variables.css` + 전체 CSS 파일 (12개) + 인라인 스타일 포함 Vue 파일 |
| **기능 영향** | **없음** (시각적 미세 변경 가능 — 파란색 통일) |

**수정 전략**: 단계적 적용

```
1단계: variables.css에 누락된 토큰 추가
   --color-primary: #3B82F6;
   --color-primary-hover: #2563EB;
   --color-primary-light: rgba(59, 130, 246, 0.2);
   --color-success: #10B981;
   --color-error: #EF4444;
   --color-warning: #F59E0B;

2단계: CSS 파일에서 하드코딩 색상을 var()로 교체
   #3A82C4 → var(--color-primary)
   #3498db → var(--color-primary)
   #409eff → var(--color-primary)

3단계: Vue 파일 인라인 스타일의 색상을 CSS 클래스로 전환
```

**⚠️ 시각적 변경**: `#3A82C4`(어두운 파란)과 `#3B82F6`(밝은 파란)은 약간 다릅니다. 통일 후 미세한 색차가 발생하므로, 변경 전후 스크린샷 비교가 필요합니다.

**검증 방법**: 모든 화면 스크린샷 비교(변경 전/후), 모든 버튼/링크 호버 상태 확인

---

### 항목 11~13: 컴포넌트 통합 (Button, ProgressBar, ContextMenu)

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — 새 컴포넌트 생성 후 기존 요소 교체 |
| **기능 영향** | 시각적 변경만. 이벤트 핸들러 바인딩이 정확하게 유지되는지 확인 필요 |

**수정 전략**: 새 컴포넌트를 먼저 만들고, 기존 요소를 **한 곳씩** 교체하며 테스트

```
BaseButton.vue 생성 → controls.css의 .action-button 사용 위치부터 교체
ProgressBar.vue 생성 → DetectingPopup.vue의 진행바부터 교체
ContextMenu 다크 테마 → modals.css 수정만으로 해결 (SAFE)
```

---

### 항목 14: 워터마크 위치 선택기 UX 개선

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — 기존 radio 값(1~5)은 유지하되 시각적 표현 변경 |
| **기능 영향** | `allConfig.export.waterlocation` 값(1~5) 체계 유지 필요. 값 변경 시 내보내기 로직 영향 |

**⚠️ 핵심 확인**: 워터마크 위치 값(1~5)이 백엔드 Python 코드에서 어떻게 사용되는지 확인. 값 매핑이 변경되면 안 됨.

---

### 항목 15: 인라인 스타일 → CSS 클래스 전환

| 구분 | 내용 |
|------|------|
| **Risk** | **SAFE~LOW** — 스타일 이동만, 로직 변경 없음 |
| **기능 영향** | 없음. 단, 인라인 스타일이 동적 바인딩(`:style`)인 경우 주의 |

**⚠️ 주의**: `ExportModal.vue`의 일부 인라인 스타일은 **동적 바인딩**입니다:
```vue
<!-- 이것은 이동 가능 (고정값) -->
<div style="display: flex; align-items: center; gap: 10px;">

<!-- 이것은 이동 불가 (동적 바인딩) -->
<div :style="{ width: exportProgress + '%' }">
```

동적 `:style` 바인딩은 유지하고, 고정 `style` 속성만 CSS 클래스로 전환합니다.

---

### 항목 17: 윈도우 상태 저장/복원

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** — 기존 createWindow 시작부에 조건 추가 |
| **대상 파일** | `src/main/windowManager.js` |
| **기능 영향** | 없음. 저장된 상태가 없으면 기존 기본값(1400×900) 사용 |
| **의존성** | `electron-store` 패키지 설치 필요 (`npm install electron-store`) |

**⚠️ 엣지 케이스**:
- 듀얼 모니터에서 저장 후 모니터 분리 시: 화면 밖에 윈도우 표시될 수 있음
- **해결**: 복원 시 `screen.getDisplayMatching()` 으로 유효 범위 확인

---

### 항목 18: 앱 초기 로딩 스플래시

| 구분 | 내용 |
|------|------|
| **Risk** | **SAFE** — index.html에 정적 HTML 추가 |
| **기능 영향** | 없음. Vue 마운트 시 `#app` 내부가 교체되므로 스플래시는 자동 제거 |

---

### 항목 19: 이벤트 리스너 정리 + 디바운싱

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — 이벤트 등록/해제 패턴 변경 |
| **대상 파일** | `src/App.vue` (created, beforeUnmount) |
| **기능 영향** | mousemove 이벤트가 throttle(16ms)됨. 기존: 모든 이벤트 즉시 처리 |

**⚠️ 주의사항**:
- `onMarkerMouseMove`는 타임라인 마커 드래그에 사용됨 → throttle 적용 시 드래그 반응성 확인 필요
- `AbortController` 사용 시 `beforeUnmount`에서 `controller.abort()` 한 번으로 모든 리스너 해제 가능

---

### 항목 20~21: 비밀번호 강도 + 에러 메시지 개선

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** (강도 표시: UI 추가만), **LOW** (에러 메시지: 문자열 교체만) |
| **기능 영향** | 암호화 로직 변경 없음. UI 표시와 에러 메시지 텍스트만 변경 |

**⚠️ 확인**: 에러 메시지에 파일 경로가 포함되는 부분(`공개키 파일을 찾을 수 없습니다: ${path}`)에서 경로를 제거할 때, 디버깅용으로 `console.error`에는 원래 경로를 유지해야 합니다.

---

### 항목 22~26: 스크린샷 기반 시각적 UX 개선 (v3.0 추가)

> 실제 앱 실행 스크린샷 15장 분석으로 추가된 항목들입니다.

**항목 22: 다이얼로그 컴포넌트 통합**

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — 여러 다이얼로그의 버튼 배치/스타일 통일. 기존 버튼 인덱스(0,1,2...) 기반 응답 처리 변경 시 주의 |
| **대상 파일** | `windowManager.js` (showMessageBox 호출부 5곳), 모달 Vue 파일 |
| **기능 영향** | 다이얼로그 버튼 순서 변경 시 `result.response` 인덱스 매핑 확인 필수 |

**⚠️ 핵심 위험**: `mask-range-message`의 버튼이 `['전체','여기까지','여기서부터','여기만','취소']`로 인덱스 0~4를 사용합니다. 버튼 순서 변경 시 `canvasInteraction.js`의 `choice === 0/1/2/3/4` 분기를 반드시 동기화해야 합니다.

**항목 23: 내보내기 모달 정보 계층 개선**

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — 조건부 표시 로직 추가 (암호화 선택 시만 DRM 영역 노출) |
| **기능 영향** | "원본파일저장" 선택 시 DRM 필드가 숨겨짐. 기존에 기본값으로 설정되어 있던 DRM 값이 초기화되지 않도록 주의 |

**항목 24: 설정 모달 그룹화**

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** — 시각적 구분선/섹션 제목 추가, 레이아웃만 변경 |
| **기능 영향** | 없음 |

**항목 25: 메뉴 탭 활성/비활성 강화**

| 구분 | 내용 |
|------|------|
| **Risk** | **SAFE** — CSS 스타일 추가만 |
| **기능 영향** | 없음. 기존 `.active` / `.disabled` 클래스의 시각적 효과만 강화 |

**항목 26: 일괄처리 프로그레스 바 색상 통일**

| 구분 | 내용 |
|------|------|
| **Risk** | **SAFE** — CSS 색상 값 변경만 |
| **기능 영향** | 없음 |

**별도: 빈 상태(Empty State) UI (항목 10, Phase 2 첫 항목)**

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** — 조건부 렌더링 추가 (파일 미로드 시 안내 표시) |
| **대상 파일** | `App.vue` 또는 `VideoCanvas.vue` |
| **기능 영향** | `v-if="files.length === 0"` 조건으로 안내 UI 표시. 기존 영상 영역은 파일 로드 시 정상 표시 |

---

### 항목 42: [BE] 탐지/내보내기 ETA 제공

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** — progress 응답에 필드 추가만, 기존 필드 변경 없음 |
| **대상 파일** | `detector.py`, `routers/detection.py`, `util.py` |
| **기능 영향** | progress 응답에 `estimated_remaining_seconds` 필드 추가. 기존 필드 모두 유지 |

**수정 방법**:
```python
# util.py — update_progress에 ETA 계산 추가
def update_progress(job_id, frac, start_pct=0, end_pct=100):
    now = time.time()
    job = jobs[job_id]

    # 기존 progress 업데이트 유지
    job['progress_raw'] = start_pct/100 + (end_pct - start_pct)/100 * frac
    job['progress'] = job['progress_raw'] * 100

    # [추가] ETA 계산
    if 'start_time' not in job:
        job['start_time'] = now
    elapsed = now - job['start_time']
    if job['progress_raw'] > 0.01:
        total_estimated = elapsed / job['progress_raw']
        job['estimated_remaining_seconds'] = max(0, total_estimated - elapsed)
```

**검증 방법**: 탐지 실행 → `/progress/{id}` 응답에 `estimated_remaining_seconds` 포함 확인

---

### 항목 43: [BE] 취소 응답 개선

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — 워커 루프의 체크 빈도 변경 |
| **대상 파일** | `detector.py`, `sam2_detector.py`, `blur.py` |
| **기능 영향** | 취소 체크 빈도 증가로 미세한 성능 영향 가능 (무시 가능 수준) |

**수정 방법**: 프레임 처리 루프에서 N프레임마다가 아닌 매 프레임 체크 + 취소 시 즉시 cleanup

---

### 항목 44: [BE] 동시 작업 수 제한

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — 새 작업 제출 시 대기 큐 로직 추가 |
| **대상 파일** | `routers/detection.py`, `routers/export.py` |
| **기능 영향** | 동시 작업 초과 시 "대기 중" 상태 반환. 기존 단일 작업 시 변경 없음 |

**수정 방법**:
```python
# routers/detection.py
from concurrent.futures import ThreadPoolExecutor

# config.ini의 max_concurrent_jobs 값 활용
MAX_WORKERS = int(get_config('detect', 'max_concurrent_jobs', fallback='2'))
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)

@router.post("/autodetect")
async def autodetect(req: AutodetectRequest):
    # 기존 thread 직접 생성 대신 executor 사용
    future = executor.submit(run_detection, job_id, ...)
    return {"job_id": job_id, "status": "queued"}
```

---

## 4. Phase 3 — 중기: 국제화 및 고급 기능 (1~2개월)

### 항목 22: vue-i18n 도입

| 구분 | 내용 |
|------|------|
| **Risk** | **HIGH** — 전체 .vue 파일의 텍스트 추출 및 교체 |
| **기능 영향** | 모든 UI 텍스트가 `$t('key')` 함수 호출로 변경. 로직 변경 없으나 범위가 큼 |

**수정 전략**: 단계적 마이그레이션

```
1단계: vue-i18n 설치 및 기본 설정 (renderer.js)
2단계: 모달 1개(SettingsModal)에 먼저 적용하여 패턴 확립
3단계: 나머지 컴포넌트에 순차 적용
4단계: 동적 문자열(에러 메시지, 상태 텍스트) 적용
```

**⚠️ 핵심 위험**:
- 숫자 포맷팅 변경 주의 (`framerate`, `progress %` 등)
- 날짜 포맷팅 (DRM 기간 설정 관련)
- `window.electronAPI` 관련 다이얼로그 메시지도 i18n 필요 (main process 측)

---

### 항목 29: 시스템 트레이

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** — 새 모듈 추가, 기존 코드 최소 변경 |
| **기능 영향** | macOS에서 창 닫기 동작 변경 가능 (종료 → 트레이로 최소화) |

**⚠️ 주의**: macOS에서 `window-close` 동작을 변경하면 기존의 종료 확인 다이얼로그 흐름이 달라집니다. 사용자 설정으로 "닫기 시 트레이로 이동" 옵션을 제공하는 것이 안전합니다.

---

### 항목 31: App.vue 기능 단위 분리

| 구분 | 내용 |
|------|------|
| **Risk** | **HIGH** — 대규모 리팩토링, 모든 데이터/이벤트 흐름 재설계 |
| **기능 영향** | 컴포넌트 간 통신 패턴 변경 (props/emits, provide/inject, store 의존) |

**수정 전략**: 점진적 추출

```
1단계: VideoCanvas + VideoControls → VideoWorkspace.vue로 그룹화
2단계: ExportModal + 관련 데이터 → ExportPanel.vue로 분리
3단계: Detection 관련 로직 → DetectionControls.vue로 분리
4단계: App.vue → 레이아웃 + 라우팅만 담당
```

**⚠️ 각 단계마다 전체 기능 테스트 필수**:
- 파일 추가/삭제
- 자동/선택 객체탐지 실행 및 결과 확인
- 마스킹(사각형/다각형) 동작
- 내보내기(암호화 포함) 전체 플로우
- 영상 변환(trim/merge)

---

### 항목 45: [BE] 작업 상태 영속화 (SQLite)

| 구분 | 내용 |
|------|------|
| **Risk** | **MEDIUM** — jobs dict 접근 패턴을 DB 읽기/쓰기로 변경 |
| **대상 파일** | `core/state.py`, `core/database.py`, 모든 `routers/*.py` |
| **기능 영향** | 서버 재시작 후 진행 중이던 작업 복구 가능. 기존 인메모리 동작은 DB 래퍼로 대체 |
| **의존성** | 기존 `database.py`의 SQLite 인프라 활용 |

**⚠️ 핵심 위험**: 작업 상태 업데이트 빈도가 높음(프레임당 1회) → DB 쓰기 성능 병목 가능 → 인메모리 캐시 + 주기적 flush 패턴 필요

---

### 항목 46: [BE] 대용량 파일 스트리밍 복호화

| 구분 | 내용 |
|------|------|
| **Risk** | **HIGH** — 암호화/복호화 파이프라인 구조 변경 |
| **대상 파일** | `routers/encryption.py`, `lea_gcm_lib.py` |
| **기능 영향** | 복호화 메모리 사용량 대폭 감소. LEA-GCM의 청크 단위 처리 지원 여부 확인 필요 |

---

### 항목 47: [BE] SSE 기반 실시간 진행률 전환

| 구분 | 내용 |
|------|------|
| **Risk** | **HIGH** — API 통신 패턴 전면 변경 (polling → SSE) |
| **대상 파일** | `routers/detection.py`, `routers/export.py`, 프론트 `progressPoller.js` |
| **기능 영향** | 프론트엔드와 백엔드 양쪽 모두 수정 필요. 기존 polling 코드 유지하면서 SSE 옵션 추가 권장 |

**수정 전략**: 단계적 전환
```python
# FastAPI SSE 엔드포인트 추가 (기존 GET /progress 유지)
from sse_starlette.sse import EventSourceResponse

@router.get("/progress/{job_id}/stream")
async def progress_stream(job_id: str):
    async def event_generator():
        while True:
            job = jobs.get(job_id)
            if not job:
                break
            yield {"data": json.dumps(job)}
            if job['status'] in ('completed', 'error', 'cancelled'):
                break
            await asyncio.sleep(0.5)
    return EventSourceResponse(event_generator())
```

---

### 항목 48: [BE] 워터마크 세분화 진행률

| 구분 | 내용 |
|------|------|
| **Risk** | **LOW** — 콜백 호출 위치 추가만 |
| **대상 파일** | `watermarking.py` |
| **기능 영향** | 없음. 진행률 업데이트 빈도만 증가 |

---

## 5. 테스트 전략

### Risk별 테스트 범위

| Risk 등급 | 필수 테스트 | 테스트 방법 |
|-----------|------------|-------------|
| **SAFE** | 시각적 회귀 테스트 | 수정 전후 스크린샷 비교 |
| **LOW** | 해당 기능 수동 테스트 | 수정된 파일 관련 기능 1회 실행 확인 |
| **MEDIUM** | 관련 기능 전체 테스트 | 수정 영역 + 연관 기능 2~3개 교차 테스트 |
| **HIGH** | 전체 기능 회귀 테스트 | 모든 주요 워크플로우 재확인 |

### 주요 워크플로우 체크리스트

각 Phase 완료 시 아래 워크플로우를 모두 통과해야 합니다:

```
□ 영상 파일 추가 (파일 선택 / 폴더 선택)
□ 영상 재생, 일시정지, 프레임 이동 (↑↓ 모드 전환, ←→ 이동)
□ 재생 속도 변경 (0.5x ~ 3.5x)
□ 자동 객체 탐지 실행 → 진행률 표시 → 결과 바운딩 박스 표시
□ 선택 객체 탐지 실행 → 클릭 지점 기준 탐지
□ 바운딩 박스 호버 → 주황색 변경
□ 우클릭 컨텍스트 메뉴 → 객체 삭제/범위 삭제
□ 수동 마스킹 (사각형) → 범위 선택 다이얼로그 → 저장
□ 수동 마스킹 (다각형) → 닫기 → 범위 선택 → 저장
□ 내보내기 설정 (비밀번호, DRM, 워터마크)
□ 내보내기 실행 → 진행률 → 완료
□ 영상 트림/머지
□ 설정 변경 (GPU/CPU, 신뢰도, 마스킹 강도)
□ 앱 종료 확인 다이얼로그
```

---

## 6. 수정 전 체크리스트

각 항목 수정을 시작하기 전에 확인해야 할 사항:

```
□ 대상 파일의 최신 상태를 git에서 확인 (다른 작업과 충돌 없는지)
□ 수정 전 해당 화면 스크린샷 저장
□ 기존 vitest 테스트 통과 확인 (npm test)
□ Risk 등급에 맞는 테스트 범위 결정
□ 수정 후 시각적 회귀 확인 (스크린샷 비교)
□ 수정 후 해당 기능 수동 테스트
□ MEDIUM 이상 Risk인 경우 주요 워크플로우 체크리스트 실행
□ 커밋 메시지에 수정 항목 번호 및 Risk 등급 명시
```

**커밋 메시지 형식**:
```
[UIUX-{번호}] {설명} (Risk: {등급})

예: [UIUX-01] Vue 글로벌 에러 핸들러 설정 (Risk: LOW)
예: [UIUX-09] Canvas mousemove rAF throttling (Risk: MEDIUM)
```

---

## 부록: 전체 항목 Risk 매트릭스

| # | 항목 | Risk | Phase | 기존 코드 변경 여부 |
|---|------|------|-------|-------------------|
| 1 | Vue 에러 핸들러 | LOW | 1 | 추가만 |
| 2 | ARIA 레이블 | SAFE | 1 | HTML 속성 추가만 |
| 3 | 포커스 인디케이터 | SAFE | 1 | CSS 추가만 |
| 4 | Toast 색상 구분 | MEDIUM | 1 | CSS 추가 + JS 시그니처 변경 |
| 5 | Processing 취소 | MEDIUM | 1 | 템플릿 추가 + 이벤트 핸들러 |
| 6 | Polling 백오프 | MEDIUM | 1 | 에러 처리 흐름 변경 |
| 7 | Silent failure 알림 | LOW | 1 | catch 블록 내 추가 |
| 8 | Single Instance | LOW | 1 | 초기화 코드 추가 |
| 9 | Canvas rAF | MEDIUM | 1 | mousemove 처리 래핑 |
| 10 | 색상 토큰 통합 | SAFE | 2 | CSS 값 교체 |
| 11 | Button 컴포넌트 | MEDIUM | 2 | 기존 요소 → 컴포넌트 교체 |
| 12 | ProgressBar 통합 | MEDIUM | 2 | 기존 요소 → 컴포넌트 교체 |
| 13 | ContextMenu 테마 | SAFE | 2 | CSS 값 변경만 |
| 14 | 워터마크 위치 UX | MEDIUM | 2 | radio 시각 변경, 값 체계 유지 |
| 15 | 인라인 스타일 전환 | SAFE~LOW | 2 | 스타일 이동만 |
| 16 | z-index 토큰 | SAFE | 2 | CSS 값 교체 |
| 17 | 윈도우 상태 저장 | LOW | 2 | 코드 추가 + 패키지 |
| 18 | 스플래시 스크린 | SAFE | 2 | HTML 추가만 |
| 19 | 이벤트 리스너 정리 | MEDIUM | 2 | 등록/해제 패턴 변경 |
| 20 | 비밀번호 강도 | LOW | 2 | UI 추가만 |
| 21 | 에러 메시지 개선 | LOW | 2 | 문자열 교체만 |
| 22 | vue-i18n 도입 | HIGH | 3 | 전체 텍스트 교체 |
| 23 | 키보드 내비게이션 | MEDIUM | 3 | 이벤트 핸들러 추가 |
| 24 | 상태 스타일 통합 | SAFE | 3 | CSS 값 교체 |
| 25 | ETA 표시 | LOW | 3 | 계산 로직 + UI 추가 |
| 26 | 툴팁 추가 | SAFE | 3 | 속성 추가만 |
| 27 | Undo 기능 | HIGH | 3 | 상태 관리 로직 추가 |
| 28 | 색상 대비 | SAFE | 3 | CSS 값 변경만 |
| 29 | 시스템 트레이 | LOW | 3 | 새 모듈 + 닫기 동작 변경 |
| 30 | 크래시 복구 | MEDIUM | 3 | 체크포인트 로직 추가 |
| 31 | App.vue 분리 | HIGH | 3 | 대규모 리팩토링 |
| 32 | Store 구조 개선 | HIGH | 3 | 데이터 구조 변경 |
| 33 | 마스킹 다이얼로그 | MEDIUM | 3 | 다이얼로그 UI 변경 |
| **Python 백엔드 항목 (v4.0)** | | | | |
| 39 | [BE] print→logging | SAFE | 1 | 출력 대상 변경만 |
| 40 | [BE] 에러 응답 구조화 | MEDIUM | 1 | 응답 포맷 변경 |
| 41 | [BE] 모델 로딩 progress | LOW | 1 | progress 범위 분할 |
| 42 | [BE] 탐지 ETA 제공 | LOW | 2 | 필드 추가만 |
| 43 | [BE] 취소 응답 개선 | MEDIUM | 2 | 체크 빈도 변경 |
| 44 | [BE] 동시 작업 제한 | MEDIUM | 2 | 큐 로직 추가 |
| 45 | [BE] 작업 상태 영속화 | MEDIUM | 3 | 인메모리→DB |
| 46 | [BE] 스트리밍 복호화 | HIGH | 3 | 파이프라인 구조 변경 |
| 47 | [BE] SSE 진행률 | HIGH | 3 | 통신 패턴 변경 |
| 48 | [BE] 워터마크 진행률 | LOW | 3 | 콜백 추가만 |
| **스크린샷 기반 추가 항목 (v3.0)** | | | | |
| 10* | 빈 상태(Empty State) 안내 | LOW | 2 | 조건부 렌더링 추가 |
| 22* | 다이얼로그 통합 | MEDIUM | 2 | 버튼 인덱스 매핑 주의 |
| 23* | 내보내기 모달 계층 개선 | MEDIUM | 2 | 조건부 표시 + DRM 기본값 |
| 24* | 설정 모달 그룹화 | LOW | 2 | 시각적 구분선 추가만 |
| 25* | 메뉴 탭 시각 강화 | SAFE | 2 | CSS 추가만 |
| 26* | 일괄처리 프로그레스 바 | SAFE | 2 | CSS 색상 변경만 |

---

> **작성**: Claude AI
> **버전**: 2.0 (Python 백엔드 항목 추가)
> **최종 수정**: 2026-03-04
