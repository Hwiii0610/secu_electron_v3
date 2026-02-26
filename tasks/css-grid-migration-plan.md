# SecuWatcher CSS Grid 마이그레이션 계획서

## 개요

DetectingPopup의 위치 문제를 근본적으로 해결하기 위한 CSS Grid 기반 레이아웃 리팩토링 계획

**작성일**: 2026-02-25  
**담당자**: AI Assistant  
**상태**: 검토 대기

---

## 1. 현재 문제 상황

### 1.1 문제 증상
- DetectingPopup이 화면 해상도에 따라 의도한 위치(파일 패널 왼쪽 상단)에 표시되지 않음
- `position: fixed` + 고정값(`top: 96px`, `right: 250px`) 기반으로 인한 위치 불일치
- 1280px~1366px 해상도에서 35px 오차 발생

### 1.2 근본 원인
```
Viewport 기준 fixed positioning의 한계:
- 1280px: 정상 (10px gap)
- 1366px: 35px 오차 (미디어쿼리 불일치)
- 1920px: 정상 (10px gap)
```

### 1.3 기존 시도와 한계
| 시도 | 결과 | 한계 |
|------|------|------|
| top: 107px → 45px → 96px | 위치 미세 조정 | 해상도별 상대 위치 문제 해결 못함 |
| fixed positioning 유지 | viewport 기준 | FilePanel 실제 위치와 동기화 불가 |

---

## 2. 목표 구조

### 2.1 변경 전 (Current)
```html
<body>
  <div class="title-bar">...</div>
  <div class="container">
    <TopMenuBar class="export-container" />
    <div class="wrapper" style="display: flex;">
      <div class="video-wrapper" style="position: relative;">
        <DetectingPopup class="auto-detect-popup" />  <!-- 여기에 위치 -->
        <VideoCanvas />
        <VideoControls />
      </div>
      <FilePanel class="file-wrapper" />
    </div>
  </div>
</body>
```

### 2.2 변경 후 (Target)
```html
<body>
  <div class="title-bar">...</div>
  <div class="container">
    <TopMenuBar class="export-container" />
    <div class="wrapper" style="display: grid;">
      <DetectingPopup class="auto-detect-popup" />  <!-- 여기로 이동 -->
      <div class="video-wrapper">
        <VideoCanvas />
        <VideoControls />
      </div>
      <FilePanel class="file-wrapper" />
    </div>
  </div>
</body>
```

---

## 3. 상세 변경 사항

### 3.1 파일별 수정 내용

#### App.vue
**위치**: `/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/src/App.vue`  
**변경 라인**: 12-14, 48-56

```vue
<!-- 변경 전 -->
<div class="wrapper">
  <div class="video-wrapper" style="position: relative;">
    <DetectingPopup ref="detectingPopup" @cancel-detection="cancelDetection" />
    <!-- ... -->
  </div>
  <FilePanel ... />
</div>

<!-- 변경 후 -->
<div class="wrapper">
  <DetectingPopup ref="detectingPopup" @cancel-detection="cancelDetection" />
  <div class="video-wrapper">
    <!-- ... -->
  </div>
  <FilePanel ... />
</div>
```

**변경 사항**:
- DetectingPopup을 `.wrapper`의 직계 자식으로 이동
- `.video-wrapper`의 `style="position: relative;"` 인라인 스타일 제거

---

#### layout.css
**위치**: `/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/src/styles/layout.css`  
**변경 라인**: 19-34, 85-91

```css
/* 변경 전 */
.wrapper {
  display: flex;
  justify-content: space-between;
  flex: 1;
  min-height: 0;
  gap: 10px;
}

.video-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 800px;
}

.file-wrapper {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

/* 변경 후 */
.wrapper {
  display: grid;
  grid-template-columns: 1fr 220px;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "detecting-popup file-panel"
    "video-wrapper   file-panel";
  flex: 1;
  min-height: 0;
  gap: 10px;
}

.video-wrapper {
  grid-area: video-wrapper;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 800px;
}

.file-wrapper {
  grid-area: file-panel;
  display: flex;
  flex-direction: column;
}
```

**미디어쿼리 변경 (layout.css: 195-241)**:

```css
/* 1366px 이하 */
@media (max-width: 1366px) {
  .wrapper {
    grid-template-columns: 1fr 200px;
  }
  /* .file-wrapper width: 200px 제거 (grid에서 제어) */
}

/* 1280px 이하 */
@media (max-width: 1280px) {
  .wrapper {
    grid-template-columns: 1fr 180px;
  }
  /* .file-wrapper width: 180px 제거 (grid에서 제어) */
}
```

---

#### modals.css
**위치**: `/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/src/styles/modals.css`  
**변경 라인**: 520-525, 780-783

```css
/* 변경 전 */
.auto-detect-popup {
  position: fixed;
  top: 96px;
  right: 250px;
  z-index: 100;
}

/* 반응형 */
@media screen and (max-width: 1366px) {
  .auto-detect-popup {
    right: 230px;
  }
}

/* 변경 후 - 최종 상태 */
.auto-detect-popup {
  grid-area: detecting-popup;
  justify-self: end;
  align-self: start;
  z-index: 100;
}
```

---

#### export-layout.css
**위치**: `/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/src/styles/export-layout.css`  
**확인 라인**: 35-67

**주의 사항**:
```css
@media (max-width: 768px) {
  .wrapper {
    flex-direction: column;  /* ⚠️ Grid와 충돌 가능 */
  }
}
```

**현재 상태**: `min-width: 1280px` 제한으로 인해 768px 미디어쿼리가 실제로는 적용되지 않음  
**대응**: 현재로서는 문제 없으나, 향후 모바일 대응 시 Grid로 변경 필요

---

### 3.2 DOM 순서 및 위치 고려사항

**핵심**: DetectingPopup이 video-wrapper보다 **먼저** 와야 함

```html
<!-- 올바른 순서 -->
<div class="wrapper">
  <DetectingPopup />        <!-- grid-row: 1 -->
  <div class="video-wrapper">  <!-- grid-row: 2 -->
    <VideoCanvas />
    <ContextMenu />         <!-- video-wrapper 난내 유지 -->
    <VideoControls />       <!-- video-wrapper 난내 유지 -->
  </div>
  <FilePanel />             <!-- grid-column: 2, span 2 rows -->
</div>
```

**영향**:
- Tab 순서: DetectingPopup → VideoCanvas → ... (변경됨)
- ContextMenu/VideoControls: 위치 변화 없음 (video-wrapper 난내)
- FilePanel margin-top: 10px이 DetectingPopup 상단 정렬에 영향 가능성 있음

---

### 3.3 CSS Grid 레이아웃 상세

```
┌─────────────────────────────────────────────────────────┐
│  Grid Template: 2 columns x 2 rows                      │
├──────────────────┬──────────────────────────────────────┤
│  Column 1 (1fr)  │  Column 2 (220px/200px/180px)       │
├──────────────────┼──────────────────────────────────────┤
│  detecting-popup │  file-panel                          │
│  (auto height)   │  (span 2 rows)                       │
├──────────────────┤                                      │
│  video-wrapper   │                                      │
│  (1fr height)    │                                      │
└──────────────────┴──────────────────────────────────────┘
```

---

## 4. 리스크 분석 및 대응

### 4.1 리스크 매트릭스

| 항목 | 위험도 | 영향 | 대응책 |
|------|--------|------|--------|
| **Video 영역 높이 감소** | 높음 | VideoCanvas/Controls 크기 | `grid-template-rows: auto 1fr`로 비디오 영역에 남은 공간 할당 |
| **반응형 레이아웃** | 중간 | 1366px, 1280px 대응 | 미디어쿼리에서 `grid-template-columns`만 수정 |
| **z-index context** | 낮음 | 모달 겹침 | DetectingPopup z-index: 100 유지, 다른 모달(1000+)과 충돌 없음 |
| **이벤트 버블링** | 낮음 | 취소 기능 | DOM 이동필도 emit 동작 유지 |
| **DetectingPopup 겹침** | 중간 | 비디오와 겹침 | 의도된 동작 (비모달 팝업), 투명도 조정 가능 |

### 4.2 상세 대응책

#### Video 영역 높이 문제
**문제**: DetectingPopup이 row 1을 차지하면 비디오가 아래로 밀림  
**해결**:
```css
.wrapper {
  grid-template-rows: auto 1fr;  /* auto: DetectingPopup, 1fr: 나머지 */
}

.video-wrapper {
  /* flex: 1; 유지 - 남은 공간 모두 차지 */
}
```

#### 반응형 대응
**문제**: 해상도별 FilePanel 너비 변경 (220px → 200px → 180px)  
**해결**:
```css
/* layout.css 미디어쿼리 */
@media (max-width: 1366px) {
  .wrapper {
    grid-template-columns: 1fr 200px;  /* 220px → 200px */
  }
}

@media (max-width: 1280px) {
  .wrapper {
    grid-template-columns: 1fr 180px;  /* 200px → 180px */
  }
}

/* modals.css에서는 별도 조정 불필요 (grid가 자동 대응) */
```

---

## 5. 구현 단계 (Phase)

### Phase 1: 준비 (예상 5분)
- [ ] layout.css 백업 생성
- [ ] 현재 레이아웃 스크린샷 저장 (1280px, 1366px, 1920px)
- [ ] Git 커밋 (변경 전 상태 저장)

### Phase 2: Grid 기본 구조 (예상 10분)
- [ ] `.wrapper` flex → grid 변경
- [ ] `grid-template-columns: 1fr 220px` 설정
- [ ] `grid-template-rows: auto 1fr` 설정
- [ ] `grid-template-areas` 정의
- [ ] `.video-wrapper`, `.file-wrapper` grid-area 할당

### Phase 3: DetectingPopup 이동 (예상 10분)
- [ ] App.vue: DetectingPopup을 wrapper 직계로 이동
- [ ] modals.css: `.auto-detect-popup` 수정
  - [ ] `position: fixed` 제거
  - [ ] `top/right` 제거
  - [ ] `grid-area: detecting-popup` 추가
  - [ ] `justify-self: end` 추가
  - [ ] `align-self: start` 추가
- [ ] `.video-wrapper` 인라인 스타일 제거 테스트

### Phase 3.5: export-layout.css 점검 (예상 5분)
- [ ] 768px 미디어쿼리 확인 (`flex-direction: column`)
- [ ] `min-width: 1280px`로 인해 현재는 문제없음 확인
- [ ] 향후 모바일 대응 시 Grid로 변경 필요 메모

### Phase 4: 반응형 대응 (예상 15분)
- [ ] 1366px 미디어쿼리 수정 (layout.css)
  - [ ] `grid-template-columns: 1fr 200px`
- [ ] 1280px 미디어쿼리 수정 (layout.css)
  - [ ] `grid-template-columns: 1fr 180px`
- [ ] modals.css 미디어쿼리 제거 또는 간소화

### Phase 5: 검증 (예상 10분)
- [ ] 기본 레이아웃 확인 (1280px, 1366px, 1920px)
- [ ] DetectingPopup 위치 확인 (파일 패널 왼쪽 상단)
- [ ] 탐지 기능 테스트 (자동 객체 탐지)
- [ ] 진행률 표시 확인
- [ ] 중단 버튼 동작 확인
- [ ] 다른 모달과 겹침 확인 (Settings, Export 등)
- [ ] 반응형 동작 확인 (창 크기 조절)

### Phase 6: 정리 (예상 5분)
- [ ] 불필요한 CSS 제거 (주석 처리된 old code)
- [ ] 최종 스크린샷 저장
- [ ] Git 커밋

**총 예상 시간: 60분** (Phase 3.5 추가됨)

---

## 6. 롤백 계획

### 롤백 조건
- 탐지 기능 오작동
- 레이아웃 심각한 깨짐
- 해상도별 위치 불일치 해결 실패

### 롤백 절차
1. Git stash 또는 이전 커밋으로 복원
2. 개발 서버 재시작
3. 기능 테스트

---

## 7. 대안 방안

### 대안 A: 현재 구조 유지 + 개선 (30분)
```css
.auto-detect-popup {
  position: absolute;  /* fixed → absolute */
  top: 10px;
  right: 10px;  /* video-wrapper 기준 */
}
```
- **장점**: 최소 변경, 안정성 높음
- **단점**: 목표 구조 미달성 (파일 패널 기준 위치 불가)

### 대안 B: Grid + Absolute 하이브리드 (40분)
```css
.wrapper {
  display: grid;
  /* ... */
  position: relative;  /* absolute 기준 */
}

.auto-detect-popup {
  position: absolute;
  top: 10px;
  right: 230px;  /* file-panel + gap */
}
```
- **장점**: grid 마이그레이션 완료 + 위치 계산 단순화
- **단점**: 여전히 absolute positioning 사용

### 대안 C: JavaScript 동적 계산 (45분)
```javascript
function updatePopupPosition() {
  const filePanel = document.querySelector('.file-wrapper');
  const filePanelRect = filePanel.getBoundingClientRect();
  popup.style.right = `${window.innerWidth - filePanelRect.left + 10}px`;
}
```
- **장점**: 모든 해상도에서 정확한 위치
- **단점**: JS 의존성 증가, 성능 이슈 가능

---

## 8. 검증 체크리스트

### 기능 검증
- [ ] 자동 객체 탐지 시작
- [ ] 진행률 표시 (0% → 100%)
- [ ] 중단 버튼 클릭 → 탐지 중지
- [ ] 선택 객체 탐지
- [ ] 마스킹 반출

### UI 검증
- [ ] 1280px: DetectingPopup이 파일 패널 왼쪽에 위치
- [ ] 1366px: 동일
- [ ] 1920px: 동일
- [ ] 창 크기 조절 시 실시간 위치 조정
- [ ] 비디오 영역 깨짐 없음
- [ ] FilePanel 높이 정상 (전체 높이 차지)
- [ ] **ContextMenu 정상 표시 (비디오 위)**
- [ ] **VideoControls 정상 표시 (비디오 아래)**
- [ ] **FilePanel margin-top: 10px이 DetectingPopup 정렬에 미치는 영향 확인**
- [ ] **Tab 순서: DetectingPopup → VideoCanvas → ... (의도한 순서인지 확인)**

### 모달 검증
- [ ] Settings 모달 열림 (z-index 1200)
- [ ] Export 모달 열림 (z-index 1400)
- [ ] DetectingPopup이 다른 모달 뒤로 숨지 않음
- [ ] DetectingPopup이 비디오 위에 표시됨

---

## 9. 참고 자료

### 관련 파일
- `/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/src/App.vue`
- `/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/src/styles/layout.css`
- `/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/src/styles/modals.css`
- `/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/src/styles/export-layout.css` ⚠️ (768px 미디어쿼리 확인 필요)
- `/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/src/components/modals/DetectingPopup.vue`

### 참고 문서
- `/Users/workHwiii/Desktop/secu_electron_v3/tasks/layout-analysis.md`
- `/Users/workHwiii/Desktop/secu_electron_v3/tasks/layout-calculation-map.md`

---

## 10. 결론

**권장 사항**: CSS Grid 마이그레이션 (옵션 A)
**이유**: 근본적인 해결책, 미래 유지보수성 우수, CSS 표준 활용
**단점**: 구조 변경으로 인한 초기 리스크 (Phase별 검증으로 mitigable)
**브라우저 지원**: Electron(Chromium) 기반으로 CSS Grid 완벽 지원 - 호환성 문제 없음

**다음 단계**: 본 계획서 검토 후 Phase 1부터 순차적 구현

---

**검토 내역**:

| 일자 | 검토자 | 내용 | 상태 |
|------|--------|------|------|
| 2026-02-25 | | 초안 작성 | ✅ |
| | | | |
| | | | |

**승인**: _________________ 날짜: _________________
