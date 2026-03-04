# SecuWatcher Export — UI/UX 종합 검토 보고서

> **프로젝트**: SecuWatcher Export (Electron + Vue 3 + Vite)
> **검토일**: 2026-03-04
> **검토 범위**: 접근성, 디자인 일관성, 사용성, UX 카피, 인터랙션 패턴

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [이슈 요약 대시보드](#2-이슈-요약-대시보드)
3. [접근성(WCAG) 이슈](#3-접근성wcag-이슈)
4. [디자인 일관성 이슈](#4-디자인-일관성-이슈)
5. [사용성 및 인터랙션 이슈](#5-사용성-및-인터랙션-이슈)
6. [UX 카피 및 메시지 이슈](#6-ux-카피-및-메시지-이슈)
7. [에러 처리 및 피드백 이슈](#7-에러-처리-및-피드백-이슈)
8. [Electron 플랫폼 특화 UX 이슈](#8-electron-플랫폼-특화-ux-이슈) *(추가)*
9. [성능 UX 이슈](#9-성능-ux-이슈) *(추가)*
10. [보안 UX 이슈](#10-보안-ux-이슈) *(추가)*
11. [상태관리 및 아키텍처 이슈](#11-상태관리-및-아키텍처-이슈) *(추가)*
12. [비디오 재생 UX 이슈](#12-비디오-재생-ux-이슈) *(추가)*
13. [스크린샷 기반 시각적 UX 이슈](#13-스크린샷-기반-시각적-ux-이슈) *(추가 — v3.0)*
14. [Python 백엔드 UX 이슈](#14-python-백엔드-ux-이슈) *(추가 — v4.0)*
15. [개선 방안 로드맵](#15-개선-방안-로드맵) *(갱신)*
16. [권장 도구 및 플러그인](#16-권장-도구-및-플러그인)
17. [참고 자료](#17-참고-자료)

---

## 1. 프로젝트 개요

SecuWatcher Export는 영상 보안 처리를 위한 데스크톱 애플리케이션입니다.

| 항목 | 내용 |
|------|------|
| **프레임워크** | Electron 36 + Vue 3.5 + Vite 5 |
| **상태관리** | Pinia |
| **백엔드** | FastAPI (Python, YOLOv8 객체탐지) |
| **주요 기능** | 영상 파일 관리, 자동/선택 객체탐지, 마스킹, 워터마크, 암호화 내보내기 |
| **UI 구조** | 단일 App.vue + 7개 컴포넌트 + 10개 모달 + 14개 composable + 6개 store |

---

## 2. 이슈 요약 대시보드

| 카테고리 | 심각도 | 발견 건수 | 핵심 영향 |
|----------|--------|-----------|-----------|
| ARIA 레이블 누락 | **Critical** | 20+ | 스크린 리더 사용 불가 |
| 키보드 내비게이션 | **Critical** | 10+ | 키보드 전용 사용자 차단 |
| Vue 글로벌 에러 핸들러 미설정 | **High** | 1 | 앱 크래시 시 무응답 *(추가)* |
| 크래시 복구 부재 | **High** | 1 | 비정상 종료 시 데이터 소실 *(추가)* |
| 시스템 트레이 미지원 | **High** | 1 | 장시간 작업 모니터링 불가 *(추가)* |
| 색상 대비 부족 | **High** | 5+ | WCAG AA 미충족 |
| 색상 불일치 | **High** | 15+ | 비전문적 외관 |
| 하드코딩 값 | **High** | 50+ | 유지보수 곤란, 테마 변경 불가 |
| Canvas 렌더링 미스로틀링 | **Medium** | 3+ | 다수 객체 시 UI 지연 *(추가)* |
| 이벤트 리스너 메모리 누수 | **Medium** | 4+ | 장시간 사용 시 성능 저하 *(추가)* |
| 비밀번호 강도 미표시 | **Medium** | 1 | 약한 암호화 위험 *(추가)* |
| IPC 동시 호출 방지 없음 | **Medium** | 5+ | 파일 손상 가능 *(추가)* |
| 로딩 상태 문자열 관리 | **Medium** | 3+ | 시스템 상태 파악 곤란 *(추가)* |
| App.vue 모놀리식 (31KB) | **Medium** | 1 | 유지보수/테스트 곤란 *(추가)* |
| 언어 혼용 (한/영) | **Medium** | 30+ | 사용자 혼란, i18n 불가 |
| 인라인 스타일 | **Medium** | 25+ | 유지보수 곤란 |
| z-index 혼재 | **Medium** | 8+ | 모달 스택 충돌 |
| 툴팁 부재 | **Medium** | 15+ | 기능 이해도 저하 |
| 에러 피드백 미흡 | **Medium** | 10+ | 사용자 신뢰도 저하 |
| 빈 상태(Empty State) 안내 없음 | **High** | 1 | 신규 사용자 이탈 *(스크린샷 v3.0)* |
| 다이얼로그 레이아웃 불일치 | **Medium** | 5+ | UX 일관성 저하 *(스크린샷 v3.0)* |
| 내보내기 모달 정보 계층 | **Medium** | 5+ | 설정 혼란 *(스크린샷 v3.0)* |
| 설정 모달 그룹화/설명 부족 | **Medium** | 5+ | 설정 의미 파악 곤란 *(스크린샷 v3.0)* |
| 일괄처리 프로그레스 바 색상 | **Medium** | 2 | 진행상태 혼동 *(스크린샷 v3.0)* |
| 메뉴 탭 활성/비활성 구분 미약 | **Medium** | 1 | 현재 모드 인지 어려움 *(스크린샷 v3.0)* |
| 앱 초기 로딩 UX 부재 | **Low** | 1 | 시작 시 빈 화면 *(추가)* |
| 윈도우 상태 비저장 | **Low-Medium** | 1 | 매번 창 재배치 *(추가)* |
| **[BE] 모델 로딩 무피드백** | **High** | 1 | 0%에서 30초+ 정지 *(백엔드 v4.0)* |
| **[BE] 작업 상태 인메모리 한정** | **High** | 1 | 서버 재시작 시 작업 소실 *(백엔드 v4.0)* |
| **[BE] ETA 미제공 (탐지/내보내기)** | **Medium** | 1 | 남은 시간 알 수 없음 *(백엔드 v4.0)* |
| **[BE] 에러 응답 비구조화** | **Medium** | 5+ | 프론트에서 유의미한 에러 표시 불가 *(백엔드 v4.0)* |
| **[BE] 취소 응답 지연** | **Medium** | 1 | 취소 후 수 초 대기 *(백엔드 v4.0)* |
| **[BE] 동시 작업 무제한** | **Medium** | 1 | GPU 메모리 부족 위험 *(백엔드 v4.0)* |
| **[BE] 대용량 복호화 메모리 이슈** | **Medium** | 1 | 1GB+ 파일 시 멈춤 *(백엔드 v4.0)* |
| **[BE] 디버그 print문 잔존** | **Low** | 10+ | 로그 오염/보안 노출 *(백엔드 v4.0)* |

---

## 3. 접근성(WCAG) 이슈

### 3.1 ARIA 레이블 전면 부재 (Critical)

**현황**: 앱 전체에 ARIA 속성이 거의 없어 스크린 리더로 사용이 불가능합니다.

**주요 발견 사항**:

**index.html — 윈도우 컨트롤 버튼**
```html
<!-- 현재: aria-label 없음 -->
<button class="control-btn minimize-btn" id="minimize-btn">
  <img src="/src/assets/window_minimize.png" alt="minimize">
</button>
```
```html
<!-- 개선안 -->
<button class="control-btn minimize-btn" id="minimize-btn" aria-label="창 최소화">
  <img src="/src/assets/window_minimize.png" alt="" role="presentation">
</button>
```

**TopMenuBar.vue — 메뉴 항목이 div 태그**
```html
<!-- 현재: div + @click, role 없음 -->
<div @click="onMenuClick('자동객체탐지')">
  <img src="autodetect.png" alt="icon">
  <span>자동객체탐지</span>
</div>
```
```html
<!-- 개선안 -->
<button role="menuitem" aria-label="자동 객체 탐지" @click="onMenuClick('자동객체탐지')">
  <img src="autodetect.png" alt="" role="presentation">
  <span>자동객체탐지</span>
</button>
```

**FilePanel.vue — 파일 목록에 role 없음**
```html
<!-- 현재 -->
<div v-for="(file, index) in files" class="file-item" @click="$emit('select-file', index)">
```
```html
<!-- 개선안 -->
<div role="listbox" aria-label="비디오 파일 목록">
  <div v-for="(file, index) in files" role="option"
       :aria-selected="selectedFileIndex === index"
       :tabindex="selectedFileIndex === index ? 0 : -1"
       @click="$emit('select-file', index)"
       @keydown.enter="$emit('select-file', index)">
```

**VideoControls.vue — 이미지 버튼에 접근성 정보 없음**
```html
<!-- 현재: img 태그를 버튼처럼 사용 -->
<img @click="$emit('zoom-in')" src="plus.png" alt="zoomIn">
```
```html
<!-- 개선안 -->
<button aria-label="확대" @click="$emit('zoom-in')">
  <img src="plus.png" alt="" role="presentation">
</button>
```

### 3.2 키보드 내비게이션 미지원 (Critical)

**영향받는 컴포넌트**:

| 컴포넌트 | 문제 | 개선 방향 |
|----------|------|-----------|
| TopMenuBar | div 기반 메뉴, Tab/Enter 불가 | button + role="menuitem" + Arrow 키 |
| SettingsModal 탭 | div 기반 탭, 키보드 전환 불가 | role="tablist" + role="tab" + Arrow 키 |
| VideoControls | img 태그 클릭, focus 불가 | button 래핑 + tabindex + Enter/Space |
| FilePanel | div 기반 목록, 키보드 선택 불가 | role="listbox" + Arrow 키 + Enter |
| ContextMenu | 키보드 탐색 불가 | role="menu" + Arrow + Escape |

**전체 포커스 인디케이터 부재**: 앱 전체에 `:focus-visible` 스타일이 없습니다.

```css
/* 모든 인터랙티브 요소에 추가 필요 */
button:focus-visible,
[role="menuitem"]:focus-visible,
[role="tab"]:focus-visible,
[role="option"]:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

### 3.3 색상 대비 미충족 (High)

| 요소 | 전경색 | 배경색 | 대비율 | WCAG AA 기준 |
|------|--------|--------|--------|-------------|
| 진행률 라벨 (`auto-progress-label`) | #333 | #f0f0f0 | ~3.5:1 | 4.5:1 필요 — **미충족** |
| 파일 크기 (`merge-file-size`) | #bbbbbb | dark bg | ~4.5:1 | 12px 기준 — **경계값** |
| 비활성 탭 텍스트 | #A0A0A0 | #2C2B37 | ~3.8:1 | 4.5:1 필요 — **미충족** |

---

## 4. 디자인 일관성 이슈

### 4.1 색상 토큰 불일치 (High)

**핵심 문제**: `variables.css`에 디자인 토큰이 정의되어 있으나, 실제 코드 전반에서 사용되지 않고 하드코딩 값이 산재합니다.

**Primary Blue 변형 5종 발견**:

| 파일 | 색상값 | 사용처 |
|------|--------|--------|
| `variables.css` | `#3B82F6` | 정의된 accent 색상 |
| `controls.css` | `#3A82C4` | action-button 배경 |
| `modals.css` | `#3498db` | progress bar, upload 버튼 |
| `ExportModal.vue` (inline) | `#3383e2` | "찾기" 버튼 |
| `export-forms.css` | `#409eff` | focus ring, detection progress |

```css
/* variables.css에 통합 정의 후 일괄 적용 필요 */
:root {
  --color-primary: #3B82F6;
  --color-primary-hover: #2563EB;
  --color-primary-light: rgba(59, 130, 246, 0.2);
}
```

### 4.2 버튼 스타일 불일치 (High)

앱 전체에서 최소 4가지 이상의 버튼 스타일이 혼재합니다.

| 위치 | padding | border-radius | font-size | 정의 방식 |
|------|---------|---------------|-----------|-----------|
| `controls.css` .action-button | 8px 15px | 3px | 14px | CSS 클래스 |
| `modals.css` .watermark-upload-button | 2px 10px | 7px | 미지정 | CSS 클래스 |
| `ExportModal.vue` "찾기" 버튼 | 7px 18px | 5px | 15px | **인라인 스타일** |
| `modals.css` .close-button | 없음 | 없음 | 24px | CSS 클래스 |

**개선안**: 버튼 디자인 토큰 정의 후 재사용 가능한 컴포넌트 구축

```css
/* 버튼 통합 디자인 토큰 */
:root {
  --btn-padding-sm: 4px 12px;
  --btn-padding-md: 8px 16px;
  --btn-padding-lg: 12px 24px;
  --btn-radius: 6px;
  --btn-font-size: 14px;
}
```

### 4.3 프로그레스 바 3종 혼재 (Medium)

동일 앱 내에서 3가지 다른 프로그레스 바가 사용됩니다:

| 용도 | 색상 | transition | 스타일 |
|------|------|-----------|--------|
| 객체탐지 진행 | `#409eff` (파란) | 0.3s ease | 단색 |
| 내보내기 진행 | `#3498db` (파란, 다른 값) | 0.2s ease | 단색 |
| 변환 진행 | `#4CAF50→#45a049` (초록) | 0.3s ease | **그래디언트** |

**개선안**: 단일 ProgressBar 컴포넌트로 통합

### 4.4 z-index 관리 혼재 (Medium)

`variables.css`에 z-index 토큰이 정의되어 있으나, 모달 관련 z-index는 하드코딩:

```
정의됨: --z-modal-base: 1000, --z-context-menu: 2000, --z-processing: 9999
하드코딩: z-index: 1100, 1200, 1300, 1400 (각 모달에서)
```

### 4.5 컨텍스트 메뉴 라이트 테마 (Medium)

앱 전체가 다크 테마인데, 컨텍스트 메뉴만 화이트 배경 + 검은 텍스트:

```css
/* 현재: 라이트 테마 */
.context-menu { background-color: white; }
.context-menu li { color: black; }
.context-menu li:hover { background-color: #f0f0f0; }
```
```css
/* 개선안: 다크 테마 통일 */
.context-menu { background-color: var(--color-bg-secondary); border: 1px solid #444; }
.context-menu li { color: var(--color-text-primary); }
.context-menu li:hover { background-color: rgba(255, 255, 255, 0.08); }
```

---

## 5. 사용성 및 인터랙션 이슈

### 5.1 ProcessingModal에 취소 버튼 없음 (High)

장시간 작업(객체탐지, 인코딩) 중 사용자가 작업을 중단할 방법이 없습니다.

```vue
<!-- 현재: 스피너만 표시 -->
<div class="processing-modal-content">
  <div class="processing-text">{{ processingMessage }}</div>
  <div class="processing-spinner"><div class="spinner"></div></div>
</div>
```
```vue
<!-- 개선안: 취소 버튼 + 예상 시간 추가 -->
<div class="processing-modal-content">
  <div class="processing-text">{{ processingMessage }}</div>
  <div class="processing-spinner"><div class="spinner"></div></div>
  <div class="processing-eta">예상 소요 시간: {{ estimatedTime }}</div>
  <button class="cancel-button" @click="cancelProcessing">작업 취소</button>
</div>
```

### 5.2 워터마크 위치 선택기 UX 불명확 (High)

라디오 버튼 5개가 격자 형태로 배치되어 있으나, 각 위치를 나타내는 레이블이 전혀 없습니다.

```vue
<!-- 현재: 값만 1~5, 레이블 없음 -->
<input type="radio" value="1" v-model="allConfig.export.waterlocation" />
<input type="radio" value="2" v-model="allConfig.export.waterlocation" />
```
```vue
<!-- 개선안: 시각적 위치 프리뷰 -->
<div class="watermark-position-grid" role="radiogroup" aria-label="워터마크 위치 선택">
  <label class="position-cell top-left" :class="{ selected: waterlocation === '1' }">
    <input type="radio" value="1" v-model="waterlocation" />
    <span class="position-label">좌상단</span>
  </label>
  <!-- ... 나머지 위치들 -->
</div>
```

### 5.3 Hover/Active/Selected 상태 불일치 (Medium)

| 요소 | hover 스타일 | 방식 |
|------|-------------|------|
| 내보내기 탭 | `background-color: #3A82C4` (불투명) | 강한 색상 변경 |
| 파일 목록 | `rgba(255,255,255,0.05)` (미세) | 거의 안 보임 |
| 비디오 목록 | `background-color: #2c2c2c` (회색) | 중간 강도 |
| 바운딩 박스 | `orange + rgba(255,165,0,0.3)` 채우기 | 별도 로직 |

**개선안**: hover/active/selected 상태 디자인 토큰 정의

```css
:root {
  --state-hover: rgba(255, 255, 255, 0.08);
  --state-active: rgba(59, 130, 246, 0.15);
  --state-selected: rgba(59, 130, 246, 0.25);
}
```

### 5.4 비활성(Disabled) 상태 표현 미흡 (Medium)

```css
/* 현재: opacity만 변경 */
.export-container div.disabled {
  opacity: 0.35;
  pointer-events: none;
}
```
```css
/* 개선안: 색상 채도 감소 + 커서 + 툴팁 */
.export-container div.disabled {
  opacity: 0.4;
  filter: grayscale(60%);
  pointer-events: none;
  cursor: not-allowed;
  position: relative;
}
.export-container div.disabled::after {
  content: attr(data-disabled-reason);
  /* 비활성 사유를 표시하는 툴팁 */
}
```

### 5.5 폴더 로딩 시 "대기중.." 표시 (Low)

```vue
<!-- 현재: 텍스트만 표시 -->
<div class="row-content">{{ info.value ? info.value : '대기중..' }}</div>
```
```vue
<!-- 개선안: 스켈레톤 UI -->
<div class="row-content">
  <template v-if="info.value">{{ info.value }}</template>
  <div v-else class="skeleton-text"></div>
</div>
```

### 5.6 Undo/Redo 기능 부재 (Medium)

객체 삭제, 마스킹 수정 등 파괴적 작업에 대한 되돌리기 기능이 없습니다.

```javascript
// 현재: 삭제 후 복구 불가
detection.maskingLogs = detection.maskingLogs.filter(log => !toDeleteSet.has(log));
```

**개선안**: 최소 1단계 Undo 구현 (이전 상태 스냅샷 저장)

---

## 6. UX 카피 및 메시지 이슈

### 6.1 한/영 혼용 (Medium)

| 위치 | 한국어 | 영어 | 문제 |
|------|--------|------|------|
| SettingsModal 탭 | 자동객체탐지설정, 내보내기설정 | **Info** | 마지막 탭만 영어 |
| App.vue 컴포넌트명 | (전체 UI 한국어) | `name: 'Export'` | 내부 이름 영어 |
| 워터마크 버튼 | (주변 한국어) | **IMAGE** | 버튼 텍스트만 영어 |
| FilePanel | 대기중.. | — | 문맥 없는 텍스트 |

### 6.2 불명확한 레이블/버튼 텍스트 (Medium)

| 현재 텍스트 | 문제 | 개선안 |
|------------|------|--------|
| "찾기" (ExportModal) | 무엇을 찾는지 불분명 | "폴더 선택" 또는 "저장 위치 선택" |
| "IMAGE" (WatermarkModal) | 기능 불명 | "이미지 업로드" |
| "X 1.5" (재생속도) | 일반적 표기와 다름 | "1.5x" |
| "Info" (SettingsModal) | 무슨 정보인지 불분명 | "프로그램 정보" 또는 "앱 정보" |

### 6.3 i18n(국제화) 시스템 부재 (Medium)

모든 UI 텍스트가 하드코딩되어 있어 다국어 지원이 불가능합니다.

**개선안**: `vue-i18n` 도입

```javascript
// locales/ko.json
{
  "menu": {
    "autoDetect": "자동객체탐지",
    "selectDetect": "선택객체탐지",
    "manualMask": "수동 마스킹"
  },
  "settings": {
    "autoDetectSettings": "자동객체탐지 설정",
    "exportSettings": "내보내기 설정",
    "appInfo": "앱 정보"
  }
}
```

### 6.4 설정 항목 설명 부재 (Low)

| 설정 항목 | 현재 설명 | 필요 사항 |
|----------|-----------|-----------|
| CPU/GPU 선택 | 없음 | GPU 사용 시 장점/요구사항 안내 |
| 동시 실행 작업 수 | 없음 | 값 변경 시 영향 설명 |
| 마스킹 강도 (1~5) | "연하게/진하게" | 각 단계별 미리보기 또는 수치 표시 |
| 신뢰도 임계값 | 없음 | 값의 의미와 권장 범위 |

---

## 7. 에러 처리 및 피드백 이슈

### 7.1 Toast 메시지 유형 구분 없음 (High)

```css
/* 현재: 단일 스타일 (검은 배경) */
.toast {
  background: rgba(0,0,0,0.8);
  color: #fff;
}
```
```css
/* 개선안: 유형별 색상 구분 */
.toast--success { background: #059669; border-left: 4px solid #10B981; }
.toast--error   { background: #DC2626; border-left: 4px solid #EF4444; }
.toast--warning { background: #D97706; border-left: 4px solid #F59E0B; }
.toast--info    { background: #2563EB; border-left: 4px solid #3B82F6; }
```

### 7.2 무음 실패(Silent Failure) 다수 존재 (High)

| 파일 | 실패 상황 | 현재 처리 | 사용자 인지 |
|------|-----------|-----------|------------|
| `objectManager.js` | JSON 업데이트 실패 | `console.error()` | **불가** |
| `fileManager.js` | 비디오 정보 조회 실패 | "알 수 없음" 표시 | **간접적** |
| `videoEditor.js` | 자르기 범위 오류 | `console.error()` | **불가** |
| `fileManager.js` | 임시 파일 삭제 실패 | `console.error()` | **불가** |

### 7.3 Progress Polling 무한 재시도 (High)

```javascript
// progressPoller.js — 에러 시 무제한 재시도, 백오프 없음
} catch (err) {
  if (isRunning) {
    timerId = setTimeout(() => pollRecursive(jobId), interval); // 동일 간격 재시도
  }
}
```

**개선안**: 지수 백오프 + 최대 재시도 횟수

```javascript
const MAX_RETRIES = 10;
const BASE_INTERVAL = 1000;
let retryCount = 0;

} catch (err) {
  retryCount++;
  if (retryCount >= MAX_RETRIES) {
    onError(new Error('서버 응답 없음. 네트워크 상태를 확인해주세요.'));
    return;
  }
  const backoff = Math.min(BASE_INTERVAL * Math.pow(2, retryCount), 30000);
  timerId = setTimeout(() => pollRecursive(jobId), backoff);
}
```

### 7.4 내보내기 실패 시 즉각 상태 리셋 (Medium)

```javascript
// 현재: 실패 시 즉시 exporting = false
} catch (err) {
  exportStore.exporting = false;
  showMessage("내보내기 요청 실패: " + err.message);
}
```

**개선안**: "실패" 상태를 2~3초 유지 후 리셋

```javascript
} catch (err) {
  exportStore.exportStatus = 'failed';
  exportStore.exportMessage = "내보내기 실패: " + err.message;
  setTimeout(() => {
    exportStore.exporting = false;
    exportStore.exportStatus = '';
  }, 3000);
}
```

### 7.5 예상 소요 시간(ETA) 미표시 (Medium)

객체탐지, 내보내기 등 장시간 작업에서 진행률(%)만 표시하고, 남은 시간 추정이 없습니다.

### 7.6 "정체" 감지 없음 (Medium)

Progress polling이 진행률 변화 없이 60초 이상 지속되어도 사용자에게 알리지 않습니다.

---

## 8. Electron 플랫폼 특화 UX 이슈

> **1차 검토에서 누락된 Electron 데스크톱 앱 고유의 UX 문제들입니다.**

### 8.1 윈도우 상태 비저장 (Medium)

**파일**: `src/main/windowManager.js`

앱 종료 후 재실행 시 윈도우 크기/위치가 초기값(1400×900)으로 리셋됩니다. 사용자가 매번 윈도우를 재배치해야 합니다.

```javascript
// 현재: 고정값
const mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 1280, minHeight: 720 });
```
```javascript
// 개선안: electron-store로 윈도우 상태 저장/복원
const Store = require('electron-store');
const store = new Store();

function getWindowBounds() {
  const defaults = { width: 1400, height: 900, x: undefined, y: undefined };
  return store.get('windowBounds', defaults);
}

mainWindow.on('close', () => {
  store.set('windowBounds', mainWindow.getBounds());
});
```

### 8.2 시스템 트레이 미지원 (High)

트레이 아이콘이 없어 장시간 작업(객체탐지, 내보내기) 중 앱을 최소화하면 진행 상태를 확인할 방법이 없습니다. macOS에서는 창을 닫으면 앱이 종료되어 진행 중인 작업이 소실될 수 있습니다.

**개선안**: 트레이 아이콘 + 진행률 배지 + "작업 중 닫기 방지" 경고

### 8.3 네이티브 메뉴 바 미구현 (Medium)

커스텀 HTML 타이틀 바만 존재하고 표준 애플리케이션 메뉴(파일/편집/보기/도움말)가 없습니다.

**영향**:
- macOS 사용자가 기대하는 Cmd+Q, Cmd+, (설정) 등 표준 단축키 미작동
- "편집 > 실행 취소" 등 표준 메뉴를 통한 기능 접근 불가
- 도움말 메뉴가 없어 키보드 단축키 안내 불가

### 8.4 크래시 복구 메커니즘 부재 (High)

`crashReporter`가 설정되지 않았고, FFmpeg 프로세스 비정상 종료 시 복구 로직이 없습니다.

```javascript
// 현재: before-quit 이벤트에서만 임시파일 정리
app.on('before-quit', () => { cleanupTempFiles(); });
// 문제: 크래시 시 before-quit이 호출되지 않아 임시파일 잔존
```

**개선안**:
- `crashReporter.start()` 설정으로 크래시 덤프 수집
- 앱 시작 시 "비정상 종료 감지 → 자동 복구" 플로우 구현
- 진행 중이던 작업 상태를 주기적으로 디스크에 저장 (checkpoint)

### 8.5 다중 인스턴스 방지 없음 (Medium)

`app.requestSingleInstanceLock()`이 구현되지 않아 앱을 여러 번 실행할 수 있습니다. 동일 비디오 파일에 대한 동시 접근으로 파일 잠금 충돌이 발생할 수 있습니다.

### 8.6 종료 확인 다이얼로그 정보 부족 (Low)

```javascript
// 현재: 일반적 메시지
message: '정말로 종료하시겠습니까?',
detail: '진행 중인 작업이 있다면 저장 후 종료하시기 바랍니다.'
```
```javascript
// 개선안: 구체적 상태 표시
message: '정말로 종료하시겠습니까?',
detail: `진행 중인 작업: ${runningTasks.join(', ')}\n미저장 변경사항: ${unsavedCount}건`
```

### 8.7 마스킹 범위 다이얼로그 선택지 불명확 (Medium)

**파일**: `src/main/windowManager.js`

마스킹 범위 선택 시 5개 버튼이 표시되나 각 옵션의 의미가 불분명합니다:

| 현재 버튼 텍스트 | 사용자 혼란 요인 | 개선안 |
|-----------------|----------------|--------|
| '전체' | 어디부터 어디까지? | '전체 프레임에 적용' |
| '여기까지' | 시작점은 어디? | '처음부터 현재 프레임까지' |
| '여기서부터' | 끝점은 어디? | '현재 프레임부터 끝까지' |
| '여기만' | 현재 프레임 1개만? | '현재 프레임만 적용' |

**개선안**: 시각적 타임라인 프리뷰로 적용 범위를 표시

---

## 9. 성능 UX 이슈

### 9.1 Canvas 렌더링 스로틀링 없음 (Medium)

**파일**: `src/composables/canvasDrawing.js`, `canvasInteraction.js`

마우스 이동 시 `checkHoveredBox()` → `drawBoundingBoxes()`가 매 프레임 호출되며, `requestAnimationFrame` 래핑 없이 직접 실행됩니다.

```javascript
// 현재: mousemove마다 즉시 실행 (초당 60~120회)
onCanvasMouseMove(e) {
  this.checkHoveredBox(e);  // O(n) 충돌 감지
  this.drawBoundingBoxes(); // 전체 캔버스 다시 그림
}
```
```javascript
// 개선안: requestAnimationFrame으로 프레임 단위 제한
onCanvasMouseMove(e) {
  this.pendingMouseEvent = e;
  if (!this.rafPending) {
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.checkHoveredBox(this.pendingMouseEvent);
      this.drawBoundingBoxes();
      this.rafPending = false;
    });
  }
}
```

**UX 영향**: 다수 객체가 있는 프레임에서 마우스 이동 시 눈에 띄는 UI 지연

### 14.2 이벤트 리스너 메모리 누수 (Medium)

**파일**: `src/App.vue`

전역 이벤트 리스너(`mousemove`, `mouseup`, `mousedown`, `keydown`)가 등록되나, Hot Reload 시 중복 등록될 수 있습니다.

```javascript
// created()에서 등록
window.addEventListener('mousemove', this.onMarkerMouseMove); // 디바운싱 없음
window.addEventListener('mouseup', this.onMarkerMouseUp);

// beforeUnmount()에서 제거 — 그러나 HMR 시 beforeUnmount가
// 호출되기 전에 created()가 다시 실행될 수 있음
```

**개선안**: `{ once: false }` 대신 AbortController 패턴 사용, `mousemove`에 `throttle(16ms)` 적용

### 14.3 대용량 파일 목록 가상화 없음 (Low-Medium)

FilePanel에서 모든 파일을 DOM에 렌더링합니다. 100개 이상의 파일이 추가되면 스크롤 성능이 저하됩니다.

**개선안**: `vue-virtual-scroller` 적용 또는 자체 가상 스크롤 구현

### 14.4 애니메이션 프레임 미정리 (Medium)

**파일**: `src/composables/maskPreview.js`

`requestAnimationFrame` ID가 컴포넌트 언마운트 시 자동 취소되지 않습니다. 명시적으로 `stopAnimationLoop()`을 호출해야 하며, 누락 시 백그라운드에서 불필요한 렌더링이 계속됩니다.

### 14.5 앱 초기 로딩 UX 부재 (Low)

**파일**: `src/renderer.js`

Vue 앱 마운트 전 빈 화면(백색 또는 검은색)이 표시됩니다. 스플래시 스크린이나 로딩 인디케이터가 없습니다.

```html
<!-- 개선안: index.html에 인라인 로딩 UI 추가 -->
<div id="app">
  <div id="splash-screen" style="display:flex; align-items:center; justify-content:center;
    height:100vh; background:#121519; color:#fff;">
    <img src="logo.png" alt="SecuWatcher" />
    <span>로딩 중...</span>
  </div>
</div>
```

---

## 10. 보안 UX 이슈

### 10.1 비밀번호 강도 표시 없음 (Medium)

**파일**: `src/main/ipcHandlers/encryptHandlers.js`, `ExportModal.vue`

비밀번호 입력 필드에 강도 인디케이터가 없고, 최대 32자 제한만 존재합니다. 사용자가 약한 비밀번호를 설정하더라도 경고가 없습니다.

```vue
<!-- 현재: 길이만 표시 -->
<span :class="exportFilePassword.length >= 8 ? 'password-length-valid' : 'password-length-invalid'">
```
```vue
<!-- 개선안: 강도 바 + 요구사항 체크리스트 -->
<div class="password-strength-bar" :class="passwordStrength">
  <div class="strength-fill" :style="{ width: strengthPercent + '%' }"></div>
</div>
<ul class="password-requirements">
  <li :class="{ met: hasMinLength }">최소 8자 이상</li>
  <li :class="{ met: hasUppercase }">대문자 포함</li>
  <li :class="{ met: hasNumber }">숫자 포함</li>
</ul>
```

### 10.2 암호화 에러 메시지 불명확 (Medium)

**파일**: `src/main/ipcHandlers/encryptHandlers.js`

| 현재 에러 메시지 | 문제 | 개선안 |
|-----------------|------|--------|
| "서버에서 에러가 발생했습니다. 다시 시도해주세요." | 원인 불명, 일시적인지 영구적인지 불분명 | "암호화 서버 연결 실패. Python 백엔드가 실행 중인지 확인해주세요." |
| "비밀번호 암호화 실패" | 사용자 조치 불명 | "비밀번호 암호화에 실패했습니다. 특수문자를 제거하고 다시 시도해주세요." |
| "Python 서버에 연결할 수 없습니다." | 기술적 용어 | "백그라운드 서비스가 응답하지 않습니다. 앱을 재시작해주세요." |
| "공개키 파일을 찾을 수 없습니다: {path}" | 파일 경로 노출 | "암호화 시스템 구성 오류. 앱을 재설치해주세요." |

### 10.3 라이선스 검증 비활성 상태 미안내 (Low)

개발/테스트용으로 라이선스 검증이 주석 처리되어 있으나, 사용자에게 "개발 모드" 안내가 없습니다.

### 10.4 preload.js IPC 동시 호출 방지 없음 (Medium)

**파일**: `src/preload.js`

`saveJson()` 등 파일 조작 IPC가 동시에 여러 번 호출될 경우 파일 손상 가능성이 있습니다. Rate limiting이나 큐잉이 없습니다.

---

## 11. 상태관리 및 아키텍처 이슈

### 11.1 로딩 상태가 문자열로 관리됨 (Medium)

**파일**: `src/composables/videoEditor.js`, `src/stores/fileStore.js`

```javascript
// 현재: 로딩 상태를 문자열 텍스트로 표현
duration: '분석 중...',
resolution: '분석 중...',
frameRate: '분석 중...',
```
```javascript
// 개선안: 구조화된 상태 객체
{
  duration: { value: null, status: 'loading' },    // 'idle' | 'loading' | 'error' | 'loaded'
  resolution: { value: null, status: 'loading' },
  frameRate: { value: null, status: 'loading' },
}
```

**UX 영향**: 스켈레톤 UI나 로딩 스피너 대신 텍스트만 표시되어 사용자가 시스템 상태를 파악하기 어려움

### 11.2 에러 상태 비저장 (Low)

모든 Store에 `lastError` 필드가 없어 에러 발생 후 Toast가 사라지면 어떤 오류가 있었는지 재확인이 불가능합니다.

### 11.3 컴포넌트 언마운트 시 Store 리셋 없음 (Medium)

Hot Reload 또는 컴포넌트 재생성 시 이전 세션의 탐지 데이터가 잔존할 수 있습니다.

### 11.4 App.vue 모놀리식 구조 (Medium)

**파일**: `src/App.vue` (31,314 bytes, ~850줄)

단일 컴포넌트에 14개 composable, 6개 store 연결, 다수의 computed/watch/method가 집중되어 있습니다. 테스트, 디버깅, 유지보수가 어렵습니다.

**개선 방향**: 기능 단위로 분리 (예: `VideoWorkspace.vue`, `ExportPanel.vue`, `DetectionControls.vue`)

### 11.5 Vue 글로벌 에러 핸들러 미설정 (High)

**파일**: `src/renderer.js`

```javascript
// 현재: 에러 핸들러 없음
const app = createApp(App);
app.use(createPinia());
app.mount('#app');
```
```javascript
// 개선안: 전역 에러 경계 설정
app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Error:', err);
  // 사용자에게 친화적 에러 모달 표시
  showErrorModal('예기치 않은 오류가 발생했습니다. 앱을 재시작해주세요.');
  // Sentry/로그 서버에 에러 전송
};
```

**UX 영향**: Vue 컴포넌트 에러 발생 시 앱이 조용히 깨지고 사용자는 빈 화면만 보게 됨

---

## 12. 비디오 재생 UX 이슈

### 12.1 프레임 이동 모드 표시 불명확 (Low)

**파일**: `src/composables/videoController.js`, `App.vue`

프레임 이동 모드(1프레임/1초/5초/10초)가 화면 상단에 작은 텍스트로만 표시됩니다. "▲▼" 유니코드 화살표로 모드 전환을 암시하지만, 사용자가 이 기능의 존재를 인지하기 어렵습니다.

**개선안**: 초기 사용 시 툴팁 또는 온보딩 힌트로 모드 전환 방법 안내

### 12.2 재생 속도 제한 사유 미안내 (Low)

```javascript
// 짧은 영상(< 10초)은 최대 2.5x, 그 외 3.5x 제한
// 그러나 사용자에게 제한 사유를 알리지 않음
```

**개선안**: 최대 속도 도달 시 "짧은 영상에서는 최대 2.5배속까지 지원됩니다" 안내

### 12.3 확대(Zoom) 상태 비저장 (Low)

`videoStore.zoomLevel`이 세션 간 저장되지 않아 앱 재시작 시 항상 기본 확대율로 돌아갑니다.

### 12.4 A/D 키 점프 시 시각적 피드백 없음 (Low)

A/D 키로 객체 시작/끝 프레임으로 점프할 때 타임라인 상에 시각적 애니메이션이 없어 갑작스러운 위치 변경으로 느껴집니다.

**개선안**: 타임라인 커서에 짧은 이동 애니메이션 또는 하이라이트 효과 추가

---

## 13. 스크린샷 기반 시각적 UX 이슈

> **v3.0 추가**: 실제 앱 실행 스크린샷 15장(`refo/secu_electron_v3_screenshot/`)을 기반으로 코드 분석만으로는 발견하기 어려운 시각적·레이아웃·흐름 이슈를 추가로 식별했습니다.

### 13.1 빈 상태(Empty State) UX 부재 (High)

**참고 화면**: `01_메인화면_자동객체탐지탭_전체UI.png`

영상 파일이 로드되지 않은 초기 화면에서 큰 검은색 영역만 표시됩니다. 사용자에게 다음 행동을 유도하는 안내가 전혀 없습니다.

| 현재 상태 | 문제점 | 개선안 |
|----------|--------|--------|
| 검은색 빈 영역 | 사용자가 무엇을 해야 하는지 모름 | 중앙에 아이콘 + "영상 파일을 추가하세요" 안내 텍스트 |
| 파일 정보 패널: 모두 "대기중.." | 의미 없는 정보 나열 | 파일 미로드 시 패널 비활성 또는 숨김 |
| 하단 컨트롤 활성 상태 | 재생할 영상이 없는데 재생 버튼 활성 | 파일 미로드 시 컨트롤 비활성화 |

**개선안 예시**:
```
┌─────────────────────────────────┐
│                                 │
│        📂 (드래그앤드롭 아이콘)  │
│                                 │
│   영상 파일을 추가해주세요        │
│   파일을 여기에 드래그하거나       │
│   [추가] 버튼을 클릭하세요        │
│                                 │
└─────────────────────────────────┘
```

### 13.2 상단 메뉴바 활성/비활성 상태 불명확 (Medium)

**참고 화면**: `01`, `05`, `06` 비교

메뉴 탭(자동객체탐지, 선택객체탐지, 수동 마스킹, 전체마스킹, 미리보기, 내보내기, 일괄처리, 설정)의 활성/비활성 상태가 시각적으로 구분되지 않습니다. `01`에서는 아이콘만 약간 밝아지는 정도이며, 현재 어떤 모드에 있는지 빠르게 인지하기 어렵습니다.

| 현재 | 개선안 |
|------|--------|
| 활성 탭과 비활성 탭의 차이가 미미 | 활성 탭 하단에 accent 색상 밑줄 + 아이콘 색상 변경 |
| 비활성 상태(파일 미로드 시)도 동일 외관 | 비활성 메뉴는 opacity 0.4 + 커서 not-allowed |

### 13.3 일괄처리 모달 — 프로그레스 바 색상 불일치 (Medium)

**참고 화면**: `13_일괄처리_진행중_상태표시.png`

단일 화면 내에서 2개의 프로그레스 바가 **서로 다른 색상**을 사용합니다:
- "전체 진행률": **초록-노란 그래디언트** (`linear-gradient(#4CAF50, #45a049)`)
- "현재 파일 진행률": **파란색** (`#3498db`)

동일 화면에서 진행률 표시의 시각적 언어가 다르면 사용자가 두 바의 관계를 직관적으로 파악하기 어렵습니다.

**개선안**: 두 바 모두 동일 accent 색상(`var(--color-primary)`) 사용하되, 전체 진행률은 밝은 톤, 현재 파일은 기본 톤으로 차등

### 13.4 일괄처리 모달 — 취소 버튼 스타일 불일치 (Low)

**참고 화면**: `13_일괄처리_진행중_상태표시.png`

일괄처리 모달의 "취소" 버튼이 **빨간색 배경**으로 되어 있어, 다른 모달의 버튼 스타일(파란색 계열)과 일관성이 없습니다. 또한 "취소"가 아닌 "작업 중단"이 더 명확한 레이블입니다.

### 13.5 내보내기 모달 — 레이아웃 및 정보 계층 이슈 (Medium)

**참고 화면**: `12_내보내기_설정_DRM_경로지정.png`

| 이슈 | 상세 | 개선안 |
|------|------|--------|
| 라디오 "원본파일저장 / 암호화 파일저장" 구분 미약 | 작은 라디오 버튼만으로 중요 결정을 함 | 카드형 선택기로 변경 (각 옵션의 결과 설명 포함) |
| DRM 섹션이 항상 표시 | "원본파일저장" 선택 시에도 DRM 필드가 보임 | 조건부 표시: 암호화 선택 시에만 DRM/비밀번호 영역 노출 |
| "찾기" 버튼 | 위치 선택 기능이지만 레이블이 모호 | "폴더 선택" 또는 "저장 위치 변경" |
| 폴더 경로 아이콘 | 📁 이모지 사용 — 해상도/OS별 렌더링 불일치 | SVG 아이콘으로 교체 |
| "재생횟수" / "재생기간" 라벨 | DRM 의미가 불명확 | "최대 재생 횟수" / "재생 만료일" 로 명확화 |

### 13.6 설정 모달 — 정보 계층 및 그룹화 부족 (Medium)

**참고 화면**: `14_설정_자동객체탐지_CPU_GPU_탐지대상.png`, `15_설정_내보내기_마스킹형식_워터마크.png`

**자동객체탐지 설정 탭**:
- "CPU / GPU" 라디오 바로 아래에 탐지 대상 체크박스가 나열됨. 두 설정 그룹 사이에 시각적 구분선이 없음
- "다중파일 객체탐지" 옵션이 하단에 있으나 상위 설정과의 관계가 불명확
- "동시 실행 가능한 객체탐지 작업 수" 설정에 대한 설명 없음

**내보내기 설정 탭**:
- "마스킹 범위 설정" 드롭다운이 무엇을 의미하는지 설명 없음 ("지정 객체 마스킹 처리" 선택값의 의미?)
- "마스킹 형식 설정": 모자이크/블러 라디오 버튼만 있고 시각적 미리보기 없음
- 마스킹 강도 슬라이더: "연하게" / "진하게" 레이블만 있고 **현재 값이 표시되지 않음**
- "워터마킹 설정": "워터마킹" 체크박스 옆에 "워터마킹" 버튼 — **동일 이름 반복**, 역할 구분 불명

### 13.7 설정 모달 — "Setting" 영문 타이틀 (Low)

**참고 화면**: `14`, `15`

모달 상단 타이틀이 "Setting"(영어)으로 되어 있으나, 내부 탭 레이블은 한국어("자동객체탐지설정", "내보내기설정")입니다. 일관성을 위해 "설정"으로 통일 필요.

### 13.8 객체탐지 진행 팝업 — 위치 및 스타일 이슈 (Medium)

**참고 화면**: `06_자동객체탐지_진행중_프로그레스바.png`, `09_선택객체탐지_진행중_바운딩박스표시.png`

| 이슈 | 상세 |
|------|------|
| 팝업 위치가 영상 위에 겹침 | 탐지 진행 중 영상 확인이 어려움. 우측 상단이나 별도 패널로 이동 고려 |
| "중지" 버튼 스타일 | 빨간색 배경 버튼이 다른 UI와 불일치. 또한 클릭 가능한 영역이 작음 |
| 진행률 텍스트 위치 | 프로그레스 바 내부에 % 텍스트가 있으나, 작아서 읽기 어려움 |

### 13.9 확인/취소 다이얼로그 — 일관성 부족 (Medium)

**참고 화면**: `07`, `08`, `10`, `11` 비교

여러 화면에서 확인 다이얼로그가 등장하지만 **레이아웃이 제각각**입니다:

| 화면 | 버튼 배치 | 스타일 |
|------|-----------|--------|
| `07` 탐지 완료 알림 | "확인" 단일 버튼 (파란) | 중앙 정렬 |
| `08` 선택탐지 확인 | "취소" + "확인" (취소=텍스트, 확인=파란) | 좌우 배치 |
| `10` 마스킹 방식 | "다각형" + "사각형" + "취소" (3버튼) | 세로 정렬 |
| `11` 전체마스킹 확인 | "확인" 단일 버튼 (파란) | 중앙 정렬 |
| `03` 영상 추가 방식 | "파일 선택" + "폴더 선택" + "취소" (3버튼) | 세로 정렬 |

**개선안**: 다이얼로그 컴포넌트 통합
- 단일 확인: 중앙 파란 버튼
- 확인/취소: 좌측 회색 취소 + 우측 파란 확인 (항상 이 순서)
- 다중 선택: 카드형 또는 세로 버튼 (primary 구분 명확)

### 13.10 파일 정보 패널 — 정보 가독성 이슈 (Medium)

**참고 화면**: `05_영상로드완료_재생중_파일정보패널.png`

| 이슈 | 상세 |
|------|------|
| 파일 정보 표의 값 열이 너무 좁음 | 해상도, 파일명이 잘려서 보임 |
| "원본 파일 정보" 제목이 패널 내에서 시각적 무게 부족 | 제목과 데이터 사이 구분이 불명확 |
| 파일 목록에 파일 선택 시 하이라이트가 파란색 | 선택 상태 색상이 accent와 동일하여 "활성 기능"과 혼동 가능 |
| 하단 "추가"/"삭제" 버튼 | "추가"는 파란 배경, "삭제"는 흰 테두리 — 스타일 차이는 좋으나 "삭제"가 위험 동작임에도 경고 색상(빨강) 미사용 |

### 13.11 타임라인 컨트롤 — 시작/끝 마커 인지 어려움 (Low)

**참고 화면**: `05`, `06`

타임라인에 초록색(시작)과 빨간색(끝) 원형 마커가 있으나, 크기가 작고 기능에 대한 레이블/툴팁이 없습니다. 트림(잘라내기) 기능의 시작/끝 지점 설정용으로 보이나, 사용자가 이 마커를 드래그할 수 있다는 것을 인지하기 어렵습니다.

### 13.12 축소 뷰에서 메뉴 탭 텍스트 잘림 (Low)

**참고 화면**: `02_메인화면_축소뷰.png`

창 크기를 줄이면 상단 메뉴 탭의 텍스트가 잘리거나 아이콘만 표시됩니다. 텍스트가 일부만 보여 어떤 기능인지 구분이 어렵습니다.

**개선안**: 축소 시 아이콘만 표시 + 호버 시 툴팁으로 기능명 표시 (현재 툴팁 없음)

### 13.13 영상 정보 오버레이 — 좌상단 텍스트 가독성 (Low)

**참고 화면**: `05`, `06`, `09`

영상 좌상단에 "1920, 1080P25, FV" 등의 정보가 작은 녹색 텍스트로 표시됩니다. 영상 내용에 따라 배경과 겹쳐 읽기 어려울 수 있습니다.

**개선안**: 반투명 배경 + 흰색 텍스트, 또는 텍스트에 그림자 효과 추가

---

## 14. Python 백엔드 UX 이슈

> **v4.0 추가**: FastAPI Python 백엔드(`secuwatcher_python/`) 전체 코드(~4,100줄) 분석을 통해 프론트엔드 UX에 영향을 미치는 백엔드 이슈를 식별했습니다.

### 14.1 백엔드 아키텍처 개요

| 항목 | 내용 |
|------|------|
| **프레임워크** | FastAPI (Python 3), 비동기 백그라운드 작업 |
| **코어 파일** | `main.py`(115줄), `routers/`(detection, export, encryption), `core/`(config, state, security, database) |
| **AI 모듈** | `detector.py`(609줄, YOLOv8), `sam2_detector.py`(593줄, SAM2) |
| **영상 처리** | `blur.py`(581줄, 마스킹), `watermarking.py`(257줄) |
| **암호화** | `lea_gcm_lib.py`(271줄, LEA-GCM C 라이브러리 래퍼) |
| **상태 관리** | 인메모리 `jobs` 딕셔너리 (polling 기반, WebSocket/SSE 없음) |
| **API 포트** | `localhost:5001` |

### 14.2 모델 로딩 무피드백 (High)

**파일**: `detector.py`, `sam2_detector.py`

YOLOv8/SAM2 모델이 첫 호출 시 lazy-loading되며, 30초 이상 소요될 수 있습니다. 이 기간 동안 프론트엔드에서 progress는 0%로 표시됩니다.

```python
# detector.py — 모델 로딩 시 progress 업데이트 없음
MODEL = None
_MODEL_LOCK = threading.Lock()

def _get_yolo_model():
    global MODEL
    with _MODEL_LOCK:
        if MODEL is None:
            MODEL = YOLO(model_path)  # 30초+ 소요, 프론트엔드에 알림 없음
    return MODEL
```

**UX 영향**: 사용자는 "자동 객체 탐지" 실행 후 0%에서 30초 이상 멈춘 것처럼 보임

**개선안**: 모델 로딩 단계를 progress 0~5%로 매핑하고, 프론트엔드에 "AI 모델 로딩 중..." 상태 메시지 전달

### 14.3 ETA(예상 완료 시간) 부분 지원 (Medium)

**파일**: `routers/encryption.py`, `routers/detection.py`

| 엔드포인트 | ETA 제공 | 상태 |
|-----------|---------|------|
| `/encrypt` | `estimated_completion_time` 제공 | ✅ 지원 |
| `/decrypt` | `estimated_completion_time` 제공 | ✅ 지원 |
| `/autodetect` | **미제공** | ❌ |
| `/autoexport` | **미제공** | ❌ |

**UX 영향**: 객체 탐지(가장 빈번한 작업)에서 남은 시간을 알 수 없음

**개선안**: 프레임 처리 속도(FPS) 기반으로 ETA 계산, progress 응답에 `estimated_remaining_seconds` 추가

### 14.4 에러 응답 상세도 부족 (Medium)

**파일**: 모든 `routers/*.py`

에러 발생 시 HTTPException의 `detail`에 단순 문자열만 전달됩니다.

```python
# 현재: 구조화되지 않은 에러
raise HTTPException(status_code=500, detail=str(ex))

# 개선안: 구조화된 에러 응답
raise HTTPException(status_code=500, detail={
    "code": "DETECTION_FRAME_ERROR",
    "message": "프레임 처리 중 오류 발생",
    "context": {"frame": current_frame, "total": total_frames},
    "suggestion": "영상 파일이 손상되었을 수 있습니다. 다른 파일로 시도해주세요."
})
```

**UX 영향**: 프론트엔드에서 사용자에게 유의미한 에러 메시지를 표시할 수 없음

### 14.5 작업 상태 인메모리 한정 (High)

**파일**: `core/state.py`

```python
# 전역 인메모리 상태 — 서버 재시작 시 소실
jobs: dict = {}
log_queue: deque = deque(maxlen=1000)
```

**UX 영향**:
- Python 백엔드 크래시/재시작 시 진행 중인 모든 작업 상태 소실
- 프론트엔드의 `progressPoller`가 404 에러 수신 → 사용자에게 "작업이 사라짐" 현상
- 장시간 작업(대용량 비디오 암호화 등) 중 특히 위험

**개선안**: SQLite(기존 `database.py` 활용) 또는 파일 기반 작업 상태 저장

### 14.6 취소 응답 지연 (Medium)

**파일**: `routers/detection.py`, `detector.py`

`/cancel/{job_id}` 호출 시 `jobs[job_id]['status'] = 'cancelled'` 로 플래그만 설정합니다. 실제 작업 중단은 워커 루프에서 프레임 처리 후 확인합니다.

```python
# detector.py — 프레임 단위로만 취소 체크
for frame_idx in range(total_frames):
    if jobs[job_id].get('status') == 'cancelled':
        break  # 현재 프레임 처리 완료 후에야 확인
    process_frame(frame)  # 1프레임 처리: 0.1~2초
```

**UX 영향**: "취소" 버튼 클릭 후 실제 중단까지 최대 수 초 지연

### 14.7 동시 작업 제한 없음 (Medium)

**파일**: `routers/detection.py`, `routers/export.py`

여러 탐지/내보내기 요청이 동시에 들어와도 스레드 풀이나 큐 제한 없이 모두 백그라운드 스레드로 실행됩니다.

**UX 영향**: GPU 메모리 부족, 시스템 과부하로 전체 앱 성능 저하

**개선안**: 동시 작업 수 제한 (config.ini의 설정값 활용) + 대기 큐 구현 + 프론트엔드에 "대기 중(n번째)" 상태 표시

### 14.8 Polling 기반 진행률 — 실시간성 부족 (Low-Medium)

**아키텍처**: 프론트엔드가 `GET /progress/{job_id}`를 주기적으로 호출하는 polling 방식

| 방식 | 지연 | 서버 부하 | 현재 적용 |
|------|------|----------|----------|
| Polling (현재) | interval 만큼 지연 (1~3초) | 높음 (불필요한 요청) | ✅ |
| SSE (Server-Sent Events) | 거의 실시간 | 낮음 | ❌ |
| WebSocket | 실시간 양방향 | 중간 | ❌ |

**UX 영향**: 프로그레스 바가 1~3초 간격으로 계단식 업데이트, 부드럽지 않음

**개선안 (단기)**: polling interval을 500ms로 줄이고 프론트엔드에서 CSS transition으로 보간
**개선안 (중기)**: FastAPI의 SSE 지원(`StreamingResponse`)으로 전환

### 14.9 디버그 print문 잔존 (Low)

**파일**: `routers/encryption.py`, `detector.py` 외 다수

```python
# 프로덕션 코드에 print문 산재
print(f"Decryption end: {timeToStr(time.time(), 'datetime')}")
print(f"job_id: {job_id}, progress: {progress}")
```

**UX 영향**: 직접적 UX 영향 없으나, 로그 품질 저하 및 잠재적 보안 정보 노출

### 14.10 대용량 파일 업로드/복호화 메모리 이슈 (Medium)

**파일**: `routers/encryption.py`

복호화(`/decrypt`) 시 전체 파일을 `UploadFile`로 수신한 후 메모리에서 처리합니다.

**UX 영향**: 1GB+ 영상 파일 복호화 시 메모리 스파이크, 앱 멈춤 현상 가능

**개선안**: 스트리밍 복호화 (청크 단위 읽기/쓰기)

### 14.11 Config 변경 사항 실시간 미반영 (Low)

**파일**: `core/config.py`

설정이 `config.ini` 파일에서 매 작업 시작 시 읽힙니다. 프론트엔드에서 설정 변경 후 즉시 반영되는지의 여부가 타이밍에 따라 달라질 수 있습니다.

### 14.12 워터마크 진행률 불연속 (Low)

**파일**: `watermarking.py`

워터마크 적용은 파일 I/O 위주라 진행 콜백이 0% → 100%로 점프합니다. 프론트엔드에서 프로그레스 바가 갑자기 건너뜀.

---

## 15. 개선 방안 로드맵

### Phase 1: 긴급 — 안정성 및 에러 처리 (1~2주)

| # | 항목 | 에이전트 | 파일 | 예상 공수 |
|---|------|---------|------|-----------|
| 1 | **Vue 글로벌 에러 핸들러 설정** *(추가)* | Frontend | `renderer.js` | 0.5일 |
| 2 | 모든 인터랙티브 요소에 ARIA 레이블 추가 | Frontend | 전체 .vue 파일 | 3일 |
| 3 | 키보드 포커스 인디케이터 전역 추가 | Frontend | `base.css` | 0.5일 |
| 4 | Toast 메시지 유형별 색상 구분 | Frontend | `controls.css`, `App.vue` | 1일 |
| 5 | ProcessingModal 취소 버튼 추가 | Frontend | `ProcessingModal.vue` | 1일 |
| 6 | Progress polling 백오프/최대 재시도 적용 | Frontend | `progressPoller.js` | 0.5일 |
| 7 | Silent failure → 사용자 알림 전환 | Frontend | `objectManager.js` 외 4개 | 2일 |
| 8 | **다중 인스턴스 방지(Single Instance Lock)** *(추가)* | Frontend | `src/main/index.js` | 0.5일 |
| 9 | **Canvas 렌더링 rAF 스로틀링** *(추가)* | Frontend | `canvasDrawing.js`, `canvasInteraction.js` | 1일 |
| 39 | **[BE] 디버그 print문 → logging 전환** *(백엔드 v4.0)* | Backend | `routers/*.py`, `detector.py` 외 | 0.5일 |
| 40 | **[BE] 에러 응답 구조화** *(백엔드 v4.0)* | Backend | `routers/*.py` | 1일 |
| 41 | **[BE] 모델 로딩 progress 구간 추가** *(백엔드 v4.0)* | Backend | `detector.py`, `sam2_detector.py` | 1일 |

### Phase 2: 단기 — 디자인 시스템 및 플랫폼 UX (2~4주)

| # | 항목 | 에이전트 | 파일 | 예상 공수 |
|---|------|---------|------|-----------|
| 10 | **빈 상태(Empty State) 안내 UI 추가** *(스크린샷 v3.0)* | Frontend | `App.vue`, `VideoCanvas.vue` | 1일 |
| 11 | 디자인 토큰 통합 (색상 5종→1종) | Frontend | `variables.css` + 전체 CSS | 3일 |
| 11 | 버튼 컴포넌트 통합 | Frontend | 새 `BaseButton.vue` + 전체 | 2일 |
| 12 | 프로그레스 바 컴포넌트 통합 | Frontend | 새 `ProgressBar.vue` + 모달 | 1일 |
| 13 | 컨텍스트 메뉴 다크 테마 통일 | Frontend | `modals.css` | 0.5일 |
| 14 | 워터마크 위치 선택기 UX 개선 | Frontend | `WatermarkModal.vue` | 1일 |
| 15 | 인라인 스타일 → CSS 클래스 전환 | Frontend | `ExportModal.vue`, `VideoControls.vue` 외 | 3일 |
| 16 | z-index 토큰 일괄 적용 | Frontend | `modals.css` | 0.5일 |
| 17 | **윈도우 상태 저장/복원** *(추가)* | Frontend | `windowManager.js` | 1일 |
| 18 | **앱 초기 로딩 스플래시 스크린** *(추가)* | Frontend | `index.html`, `renderer.js` | 0.5일 |
| 19 | **이벤트 리스너 정리 + 디바운싱** *(추가)* | Frontend | `App.vue`, composables | 1일 |
| 20 | **비밀번호 강도 인디케이터** *(추가)* | Frontend | `ExportModal.vue`, `encryptHandlers.js` | 1일 |
| 21 | **암호화 에러 메시지 개선** *(추가)* | Frontend | `encryptHandlers.js` | 0.5일 |
| 22 | **다이얼로그 컴포넌트 통합 (버튼 배치 일관성)** *(스크린샷 v3.0)* | Frontend | `windowManager.js`, 모달 Vue | 2일 |
| 23 | **내보내기 모달 정보 계층 개선** *(스크린샷 v3.0)* | Frontend | `ExportModal.vue` | 1일 |
| 24 | **설정 모달 그룹화 및 설명 추가** *(스크린샷 v3.0)* | Frontend | `SettingsModal.vue` | 1.5일 |
| 25 | **메뉴 탭 활성/비활성 시각적 강화** *(스크린샷 v3.0)* | Frontend | `TopMenuBar.vue`, `layout.css` | 1일 |
| 26 | **일괄처리 프로그레스 바 색상 통일** *(스크린샷 v3.0)* | Frontend | `BatchProcessingModal.vue`, CSS | 0.5일 |
| 42 | **[BE] 탐지/내보내기 ETA 제공** *(백엔드 v4.0)* | Backend | `detector.py`, `routers/detection.py` | 1.5일 |
| 43 | **[BE] 취소 응답 개선 (즉시 ACK)** *(백엔드 v4.0)* | Backend | `detector.py`, `sam2_detector.py` | 1일 |
| 44 | **[BE] 동시 작업 수 제한 + 대기 큐** *(백엔드 v4.0)* | Backend | `routers/detection.py`, `export.py` | 2일 |

### Phase 3: 중기 — 국제화 및 고급 기능 (1~2개월)

| # | 항목 | 에이전트 | 파일 | 예상 공수 |
|---|------|---------|------|-----------|
| 27 | vue-i18n 도입 (기본: ko, 추가: en / Windows·macOS 배포) | Frontend | 전체 .vue 파일 | 4일 |
| 28 | 키보드 내비게이션 전면 구현 | Frontend | TopMenuBar, SettingsModal 외 | 5일 |
| 29 | Hover/Active/Selected 상태 통합 | Frontend | 전체 CSS | 2일 |
| 30 | ETA(예상 소요 시간) 표시 기능 | Frontend+Backend | `progressPoller.js`, 모달 | 2일 |
| 31 | 설정 항목별 도움말/툴팁 추가 | Frontend | `SettingsModal.vue` | 2일 |
| 32 | 1단계 Undo 기능 구현 | Frontend | `objectManager.js`, `maskingData.js` | 5일 |
| 33 | 색상 대비 WCAG AA 전면 충족 | Frontend | 전체 CSS | 2일 |
| 34 | **시스템 트레이 + 진행률 배지** *(추가)* | Frontend | `src/main/` (새 파일) | 3일 |
| 35 | **크래시 복구 + 작업 상태 체크포인트** *(추가)* | Frontend+Backend | `src/main/index.js`, stores | 3일 |
| 36 | **App.vue 기능 단위 분리** *(추가)* | Frontend | `App.vue` → 3~4개 하위 컴포넌트 | 5일 |
| 37 | **Store 구조 개선 (로딩/에러 상태 추가)** *(추가)* | Frontend | 전체 stores | 3일 |
| 38 | **마스킹 범위 다이얼로그 UX 개선** *(추가)* | Frontend | `windowManager.js` | 2일 |
| 45 | **[BE] 작업 상태 영속화 (SQLite)** *(백엔드 v4.0)* | Backend | `core/state.py`, `core/database.py` | 2일 |
| 46 | **[BE] 대용량 파일 스트리밍 복호화** *(백엔드 v4.0)* | Backend | `routers/encryption.py` | 2일 |
| 47 | **[BE] SSE 기반 실시간 진행률 전환** *(백엔드 v4.0)* | Backend | `routers/detection.py`, 프론트 poller | 3일 |
| 48 | **[BE] 워터마크 세분화 진행률** *(백엔드 v4.0)* | Backend | `watermarking.py` | 0.5일 |

---

## 16. 권장 도구 및 플러그인

### 16.1 접근성 검사 도구

| 도구 | 용도 | 적용 방법 |
|------|------|-----------|
| **vue-axe** | Vue 컴포넌트 런타임 접근성 감사 | `npm install vue-axe --save-dev` 후 개발 빌드에 플러그인 추가 |
| **eslint-plugin-vuejs-accessibility** | .vue 파일 정적 접근성 검사 | ESLint 설정에 플러그인 추가, CI/CD에 통합 |
| **Accessibility Insights for Web** | 브라우저 확장 기반 접근성 감사 | Electron 개발 모드에서 DevTools로 실행 |
| **Pa11y** | CLI 기반 자동 접근성 테스트 | 테스트 스크립트에 통합, CI에서 자동 실행 |

### 16.2 디자인 시스템 및 UI 컴포넌트 라이브러리

| 라이브러리 | 장점 | 적합도 |
|-----------|------|--------|
| **Naive UI** | Vue 3 전용, 내장 다크 모드, TypeScript 타입 안전 테마 시스템, 80+ 컴포넌트 | ★★★★★ |
| **Vuetify 3** | Material Design, 다크 모드 내장, 접근성 기본 제공, 가장 큰 커뮤니티 | ★★★★☆ |
| **Element Plus** | 현재 프로젝트에서 일부 색상(#409eff)이 이미 사용 중, 다크 테마 지원 | ★★★★☆ |
| **Quasar** | Electron 직접 지원, SPA→데스크톱 동일 코드베이스 | ★★★☆☆ |

**권장**: 현재 프로젝트 규모와 커스텀 다크 테마를 고려하면 **Naive UI** 또는 **자체 디자인 시스템 구축**이 적합합니다. 전면 라이브러리 교체보다는 개별 컴포넌트(Button, Modal, Toast, ProgressBar)를 자체 제작하는 것을 우선 권장합니다.

### 16.3 국제화(i18n)

| 도구 | 용도 |
|------|------|
| **vue-i18n** (v10+) | Vue 3 Composition API 지원, 지연 로딩, 복수형 처리 |
| **Lokalise / Phrase** | 번역 관리 플랫폼 (팀 규모 확대 시) |

### 16.4 개발 품질 도구

| 도구 | 용도 | 적용 |
|------|------|------|
| **Storybook** | 컴포넌트 단위 개발/문서화/테스트 | 디자인 시스템 구축 시 필수 |
| **Stylelint** | CSS 일관성 검사 (하드코딩 색상 탐지) | `.stylelintrc`에 규칙 추가 |
| **postcss-custom-properties** | CSS 변수 폴백 자동 생성 | Vite 빌드에 통합 |

### 16.5 Electron 특화 고려사항

| 영역 | 권장 사항 |
|------|-----------|
| **Context Isolation** | preload 스크립트를 통한 안전한 IPC 유지 (현재 잘 구현됨) |
| **성능 모니터링** | `electron-log` + Sentry 연동으로 크래시 및 성능 추적 |
| **자동 업데이트** | `electron-updater`로 UX 개선 (업데이트 알림/자동 적용) |
| **시작 시간 최적화** | Lazy loading 강화, 무거운 모듈 지연 로드 |

---

## 17. 참고 자료

### Electron 개발 가이드

- [Electron Official Documentation](https://www.electronjs.org/docs/latest)
- [Electron Development Guide 2025 - Brainhub](https://brainhub.eu/guides/electron-development)
- [Electron Desktop App Guide for Business 2026 - Fora Soft](https://www.forasoft.com/blog/article/electron-desktop-app-development-guide-for-business)
- [Cross-Platform Electron Best Practices - Edana](https://edana.ch/en/2025/11/27/building-a-cross-platform-desktop-application-with-electron-complete-guide-and-best-practices/)

### Vue 3 접근성

- [Vue.js Accessibility Standards](https://v3.vuejs.org/guide/a11y-standards.html)
- [vue-axe - Accessibility Auditing for Vue.js](https://github.com/vue-a11y/vue-axe)
- [How to Build Accessible Vue.js Applications - Vue Mastery](https://www.vuemastery.com/blog/how-to-build-accessible-vuejs-applications/)
- [Vue Accessibility Blueprint - alexop.dev](https://alexop.dev/posts/vue-accessibility-blueprint-8-steps/)

### Vue 3 UI 라이브러리

- [Naive UI - Vue 3 Component Library](https://www.naiveui.com/)
- [Element Plus - Vue 3 UI Framework](https://element-plus.org/)
- [PrimeVue - Accessibility-First Component Library](https://primevue.org/guides/accessibility/)
- [Top Vue Component Libraries 2026 - Prismic](https://prismic.io/blog/vue-component-libraries)

### 국제화(i18n)

- [Vue I18n Official Documentation](https://vue-i18n.intlify.dev/)
- [Vue 3 i18n Complete Guide - OneSky](https://www.onesky.ai/blog/vue-3-i18n)
- [Vue Localization Guide - Phrase](https://phrase.com/blog/posts/ultimate-guide-to-vue-localization-with-vue-i18n/)

### 접근성 테스트 도구

- [W3C Web Accessibility Evaluation Tools](https://www.w3.org/WAI/test-evaluate/tools/list/)
- [Best Accessibility Testing Tools 2025 - WallyAX](https://wallyax.com/blog/best-accessibility-testing-tools-wcag-ada-compliance)

---

> **작성**: Claude AI (UI/UX Review Agent)
> **버전**: 4.0 (Python 백엔드 분석 반영)
> **최종 수정**: 2026-03-04
> **변경 이력**:
> - v1.0: 초기 코드 기반 검토 (7개 섹션, 20개 로드맵 항목)
> - v2.0: Electron 플랫폼 UX, 성능 UX, 보안 UX, 상태관리/아키텍처, 비디오 재생 UX 섹션 추가 (12개 섹션, 33개 항목)
> - v3.0: 실제 앱 스크린샷 15장 기반 시각적 UX 이슈 13건 추가 (13개 섹션, 38개 항목)
> - v4.0: FastAPI Python 백엔드(~4,100줄) 전체 분석, UX 영향 백엔드 이슈 12건 추가 (14개 섹션, 48개 항목)
