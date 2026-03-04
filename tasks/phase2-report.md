# SecuWatcher UI/UX 개선 — Phase 2 완료 보고서

> Operator Agent 작성 | 2026-03-04
> Phase 2: 디자인 시스템 및 플랫폼 UX

---

## 1. 요약

| 항목 | 값 |
|------|-----|
| 총 작업 수 | 21개 (SAFE 8 + LOW 4 + MEDIUM 6 + Backend 3) |
| 완료 | 21/21 (100%) |
| QA 코드 리뷰 | 21/21 PASS |
| 렌더러 빌드 | PASS (444 modules, 1.12s) |
| Python AST | 20/20 PASS |
| macOS 구동 확인 | 사용자 확인 완료 |

---

## 2. 사전 준비 (Phase 2 시작 전 완료)

### macOS 크로스플랫폼 호환성 (5건)
- `dirConfig.json` → `dirConfig.js` 동적 모듈 전환 (dev: `process.cwd()`, packaged: `app.getPath('userData')`)
- `config.ini` 상대경로 + `initialize_config_paths()` Python 측 절대경로 초기화
- `package.json` build 스크립트 크로스플랫폼화
- FFmpeg/FFprobe Apple Silicon + Intel Mac + MacPorts 경로 탐색
- fileStore.js / exportManager.js Windows 하드코딩 경로 제거

### 디자인 토큰 규격 (design-tokens-spec.md)
- 44개 CSS 커스텀 프로퍼티 정의: 색상 29 + z-index 9 + 간격 4 + radius 3 + transition 2
- 하드코딩 매핑 테이블 작성 (10개 주요 hex→토큰)

---

## 3. SAFE Risk 완료 항목 (8건)

| # | 항목 | 주요 변경 파일 | 내용 |
|---|------|---------------|------|
| #11 | 색상 토큰 통합 | variables.css + 7 CSS files | 150+ hex 참조 → var() 교체 |
| #13 | 컨텍스트 메뉴 다크 | export-controls.css | var(--color-bg-panel), --z-context-menu |
| #15 | 인라인 스타일 전환 | VideoCanvas.vue | 5개 인라인 색상 → 토큰 |
| #16 | z-index 토큰 | modals.css, detection.css 등 | 9개 z-index 레이어 토큰화 |
| #10* | Empty State UI | FilePanel.vue, file-panel.css | 파일 없을 때 안내 UI |
| #18 | 스플래시 스크린 | App.vue, export-progress.css | isLoading 상태 + 애니메이션 |
| #25* | 메뉴 탭 강화 | layout.css | 활성 탭 var(--color-accent) |
| #26* | 일괄처리 프로그레스 | export-progress.css | 배치/파일 진행률 바 |

---

## 4. LOW Risk 완료 항목 (4건)

| # | 항목 | 주요 변경 파일 | 내용 |
|---|------|---------------|------|
| #17 | 윈도우 상태 저장 | windowManager.js | JSON 파일에 크기/위치/최대화 저장 |
| #20 | 비밀번호 강도 | ExportModal.vue | 6점 채점 (weak/fair/good/strong) |
| #21 | 암호화 에러 | encryptHandlers.js, exportManager.js | 9개 에러 코드 매핑 |
| #24* | 설정 모달 그룹화 | SettingsModal.vue | 장치/탐지/마스킹/워터마크 fieldset |

---

## 5. MEDIUM Risk 완료 항목 (6건)

| # | 항목 | 주요 변경 파일 | 내용 |
|---|------|---------------|------|
| #11b | 버튼 시스템 | controls.css | .btn + primary/cancel/danger/sm/lg |
| #12 | 프로그레스 바 | export-progress.css | .progress + .progress__bar + --lg |
| #14 | 워터마크 위치 | WatermarkModal.vue | 3×3 시각적 위치 선택 그리드 |
| #19 | 이벤트 리스너 | App.vue | beforeUnmount에서 전역 리스너 해제 |
| #22* | 다이얼로그 통합 | utils/dialog.js (NEW) | 중앙화된 10개 다이얼로그 함수 |
| #23* | 모달 z-index | modals.css | 계층 문서화 + calc() 기반 stacking |

---

## 6. Backend 완료 항목 (3건)

| # | 항목 | 주요 변경 파일 | 내용 |
|---|------|---------------|------|
| #42 | ETA 계산 | util.py, detection.py | start_time 기록 → eta_seconds 응답 |
| #43 | 취소 응답 | detection.py | previous_status, progress_at_cancel |
| #44 | 동시 작업 제한 | core/state.py, detection.py, export.py | MAX_CONCURRENT_JOBS=2, threading.Lock |

---

## 7. QA 검수 결과

### 코드 리뷰: 21/21 PASS
- 구문 오류 없음
- 로직 버그 없음
- 디자인 토큰 규격 준수

### 빌드 검증
- **렌더러 (Vue/Vite)**: PASS — 444 modules, 68.18KB CSS, 463.54KB JS
- **Python AST**: 20/20 PASS (root 9 + core 7 + routers 4)
- **package.json `build` 스크립트**: 레거시 `src/main.js` 참조 → `vite build --config vite.renderer.config.mjs`로 수정

### 잔여 하드코딩 색상
- 14개 CSS 파일에 90+ hex 참조 잔존
- 대부분 modals.css (27건)에 집중 — Phase 3 #29 (상태 스타일 통합)에서 처리 예정
- variables.css 내 정의는 정상 (소스 오브 트루스)

---

## 8. Lessons Learned 추가

- `package.json`의 레거시 `build` 스크립트가 리팩토링 후 업데이트되지 않았음 → 진입점 변경 시 모든 빌드 스크립트 동시 갱신 필수
- 잔여 하드코딩 색상 90건은 한 번에 교체하면 리스크 높음 → Phase별 점진 교체가 안전

---

## 9. Phase 3 준비사항

Phase 3 (16건)의 Risk 분류:
- SAFE: #29 상태 스타일 통합, #31 설정 툴팁, #33 WCAG AA
- LOW: #30 ETA UI, #34 시스템 트레이, #48 [BE] 워터마크 진행률
- MEDIUM: #28 키보드 내비게이션, #35 크래시 복구, #38 마스킹 다이얼로그, #45 [BE] 작업 영속화
- HIGH: #27 vue-i18n, #32 Undo, #36 App.vue 분리, #37 Store 구조, #46 [BE] 스트리밍, #47 [BE] SSE

**권장**: macOS 구동 확인 후 Phase 3 SAFE → LOW 순으로 진행
