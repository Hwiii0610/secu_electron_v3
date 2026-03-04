# SecuWatcher UI/UX 개선 — TODO

> Phase 1 → Phase 2 → Phase 3 순서로 진행
> SAFE → LOW → MEDIUM → HIGH 순서로 진행 (같은 Phase 내)

---

## Phase 1: 긴급 — 안정성 및 에러 처리 (1~2주)

### SAFE Risk
- [x] #39 [BE] print→logging 전환 — Backend Agent ✅
- [x] #2 ARIA 레이블 추가 — Frontend Agent ✅
- [x] #3 포커스 인디케이터 추가 — Frontend Agent ✅

### LOW Risk
- [x] #1 Vue 글로벌 에러 핸들러 — Frontend Agent ✅
- [x] #8 Single Instance Lock — Frontend Agent ✅
- [x] #7 Silent failure → 사용자 알림 — Frontend Agent ✅
- [x] #41 [BE] 모델 로딩 progress 구간 — Backend Agent ✅

### MEDIUM Risk
- [x] #4 Toast 메시지 색상 구분 — Frontend Agent ✅
- [x] #5 ProcessingModal 취소 버튼 — Frontend Agent ✅
- [x] #6 Progress polling 백오프 — Frontend Agent ✅
- [x] #9 Canvas rAF 스로틀링 — Frontend Agent ✅
- [x] #40 [BE] 에러 응답 구조화 — Backend Agent ✅

### Phase 1 검수
- [x] QA: Phase 1 전체 워크플로우 테스트 ✅ (12/12 PASS)
- [x] QA: 접근성 감사 (#2, #3) ✅
- [x] Operator: Phase 1 보고서 작성 ✅

---

## Phase 2: 단기 — 디자인 시스템 및 플랫폼 UX (2~4주)

### 사전 준비: macOS 호환성 (P0/P1)
- [x] dirConfig.json → dirConfig.js 동적 모듈 전환 ✅
- [x] config.ini video_path 상대경로 + initialize_config_paths() ✅
- [x] package.json build 크로스플랫폼화 ✅
- [x] FFmpeg/FFprobe Intel Mac + MacPorts 경로 추가 ✅
- [x] fileStore.js / exportManager.js Windows 하드코딩 제거 ✅

### 사전 준비: 디자인 시스템
- [x] Operator: design-tokens-spec.md 작성 (44 토큰 정의) ✅

### SAFE Risk
- [x] #10* 빈 상태(Empty State) UI — Frontend Agent ✅
- [x] #11 디자인 토큰 통합 (색상) — Frontend Agent ✅
- [x] #13 컨텍스트 메뉴 다크 테마 — Frontend Agent ✅
- [x] #15 인라인 스타일 전환 — Frontend Agent ✅
- [x] #16 z-index 토큰 적용 — Frontend Agent ✅
- [x] #18 스플래시 스크린 — Frontend Agent ✅
- [x] #25* 메뉴 탭 시각 강화 — Frontend Agent ✅
- [x] #26* 일괄처리 프로그레스 바 — Frontend Agent ✅

### LOW Risk
- [x] #17 윈도우 상태 저장 — Frontend Agent ✅
- [x] #20 비밀번호 강도 표시 — Frontend Agent ✅
- [x] #21 암호화 에러 메시지 — Frontend Agent ✅
- [x] #24* 설정 모달 그룹화 — Frontend Agent ✅

### MEDIUM Risk
- [x] #11b 버튼 컴포넌트 통합 — Frontend Agent ✅
- [x] #12 프로그레스 바 통합 — Frontend Agent ✅
- [x] #14 워터마크 위치 UX — Frontend Agent ✅
- [x] #19 이벤트 리스너 정리 — Frontend Agent ✅
- [x] #22* 다이얼로그 통합 — Frontend Agent ✅
- [x] #23* 내보내기 모달 계층 — Frontend Agent ✅

### Backend
- [x] #42 [BE] ETA 제공 — Backend Agent ✅
- [x] #43 [BE] 취소 응답 개선 — Backend Agent ✅
- [x] #44 [BE] 동시 작업 제한 — Backend Agent ✅

### Phase 2 검수
- [x] QA: Phase 2 전체 코드 리뷰 ✅ (21/21 PASS)
- [x] QA: 렌더러 빌드 검증 ✅ (Vite 444 modules, 1.12s)
- [x] QA: Python AST 검증 ✅ (20/20 PASS)
- [x] QA: 디자인 토큰 검증 ✅ (44 tokens in variables.css)
- [x] Operator: Phase 2 보고서 작성 ✅

---

## Phase 3: 중기 — 국제화 및 고급 기능 (1~2개월)

- [ ] #27 vue-i18n 도입 (ko/en) — Frontend Agent (HIGH)
- [ ] #28 키보드 내비게이션 — Frontend Agent (MEDIUM)
- [ ] #29 상태 스타일 통합 — Frontend Agent (SAFE)
- [ ] #30 ETA 표시 UI — Frontend Agent (LOW)
- [ ] #31 설정 툴팁 — Frontend Agent (SAFE)
- [ ] #32 Undo 기능 — Frontend Agent (HIGH)
- [ ] #33 색상 대비 WCAG AA — Frontend Agent (SAFE)
- [ ] #34 시스템 트레이 — Frontend Agent (LOW)
- [ ] #35 크래시 복구 — Frontend+Backend (MEDIUM)
- [ ] #36 App.vue 분리 — Frontend Agent (HIGH)
- [ ] #37 Store 구조 개선 — Frontend Agent (HIGH)
- [ ] #38 마스킹 다이얼로그 UX — Frontend Agent (MEDIUM)
- [ ] #45 [BE] 작업 상태 영속화 — Backend Agent (MEDIUM)
- [ ] #46 [BE] 스트리밍 복호화 — Backend Agent (HIGH)
- [ ] #47 [BE] SSE 진행률 — Backend Agent (HIGH)
- [ ] #48 [BE] 워터마크 진행률 — Backend Agent (LOW)

### Phase 3 검수
- [ ] QA: 전체 회귀 테스트
- [ ] QA: 접근성 전면 감사
- [ ] QA: Cross-platform (Windows/macOS) 확인
- [ ] Operator: 최종 보고서 작성
