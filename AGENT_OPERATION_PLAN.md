# SecuWatcher UI/UX 개선 — 에이전트 운영 계획서

## 1. 오퍼레이터 역할 정의

**오퍼레이터(나)**는 코드를 직접 작성하지 않습니다. 대신:

| 역할 | 설명 |
|------|------|
| **지침 설계** | 각 에이전트에게 전달할 상세 프롬프트 작성 |
| **라운드 관리** | 의존성 순서에 따라 에이전트 실행 순서 통제 |
| **충돌 파일 조율** | 여러 에이전트가 동일 파일을 수정할 경우 통합 전략 수행 |
| **품질 게이트** | 각 라운드 완료 후 빌드 검증, diff 검토 |
| **결과 보고** | 유저에게 변경 사항 요약 및 파일 링크 제공 |

---

## 2. 파일 소유권 매트릭스 (충돌 방지의 핵심)

각 파일은 **단 하나의 에이전트만 PRIMARY 소유**합니다. 다른 에이전트가 같은 파일을 건드려야 할 경우, 오퍼레이터가 후속 패치로 통합합니다.

### 신규 생성 파일 (충돌 없음)

| 파일 | 소유 에이전트 |
|------|-------------|
| `src/composables/keyboardManager.js` | A0 |
| `src/components/SideBar.vue` | A1 |
| `src/components/ContextBar.vue` | A1 |
| `src/styles/sidebar.css` | A1 |
| `src/styles/contextbar.css` | A1 |
| `src/components/FloatingToolPanel.vue` | A3 |
| `src/styles/floating-controls.css` | A3 |

### 기존 파일 수정 (소유권 지정)

| 파일 | PRIMARY 소유 | 수정 내용 | 타 에이전트 의존 |
|------|-------------|----------|----------------|
| `src/styles/variables.css` | **A0** | z-index 변수, 트랜지션 변수 추가 | A1, A3 읽기만 |
| `src/App.vue` | **A1** | 레이아웃 grid 전환, TopMenuBar→SideBar 교체 | A0 선행 패치 후 A1이 작업 |
| `src/styles/layout.css` | **A1** | grid 구조 전면 재작성 | — |
| `src/components/FilePanel.vue` | **A2** | 토글 로직 추가 | A1의 App.vue 변경 후 |
| `src/styles/file-panel.css` | **A2** | 토글 애니메이션 | — |
| `src/components/VideoControls.vue` | **A3** | 플로팅 오버레이 전환 | A1 레이아웃 완료 후 |
| `src/styles/video.css` | **A3** | 컨테이너/컨트롤 위치 변경 | — |
| `src/styles/controls.css` | **A3** | 플로팅 버튼 스타일 | — |
| `src/components/modals/MaskingAreaModal.vue` | **A3** | FloatingToolPanel 추출 후 잔여 정리 | — |
| `src/components/ContextMenu.vue` | **A4** | Palette C 스타일 적용 | — |
| `src/components/TrackMenu.vue` | **A4** | Palette C 스타일 적용 | — |
| `src/components/modals/DetectingPopup.vue` | **A4** | 목업 반영 스타일 | — |
| `src/styles/detection.css` | **A4** | 팝업 스타일 보강 | — |
| `src/components/modals/ExportModal.vue` | **A5** | Palette C 스타일 | — |
| `src/components/modals/SettingsModal.vue` | **A5** | Palette C 스타일 | — |
| `src/components/modals/BatchProcessingModal.vue` | **A5** | Palette C 스타일 | — |
| `src/styles/modals.css` | **A5** | 다크 라벨 패턴 통일 | — |

### 공유 파일 충돌 해결 전략

**`App.vue`** (가장 높은 충돌 위험):
- A0: 이벤트 리스너 버그 수정 + keyboardManager import 추가 (라인 단위 패치)
- A1: 템플릿 구조 전면 변경 (PRIMARY 소유)
- 전략: **A0이 먼저 패치 → A1이 패치된 버전 위에서 작업**

**`variables.css`** (낮은 충돌 위험):
- A0: 새 변수 추가 (파일 끝에 append)
- A1, A3: 읽기만 (새 변수 참조)
- 전략: **A0이 먼저 추가 → 나머지는 참조만**

**`src/styles/index.css`** (import 추가):
- A1: sidebar.css, contextbar.css import 추가
- A3: floating-controls.css import 추가
- 전략: **A1이 먼저 → 오퍼레이터가 A3 완료 후 추가 import 병합**

---

## 3. 실행 라운드 및 품질 게이트

```
┌──────────────────────────────────────────────────────────┐
│ Round 0: Pre-flight (A0)                                 │
│  • keyboardManager.js 신규 생성                           │
│  • variables.css 변수 추가                                │
│  • App.vue 이벤트 리스너 버그 수정                          │
├──────────────┬───────────────────────────────────────────┤
│ ★ Gate 0: 오퍼레이터 diff 검토 + vite build 검증           │
├──────────────┴───────────────────────────────────────────┤
│ Round 1: Layout (A1 → A2 순차)                            │
│  A1: SideBar.vue + ContextBar.vue + App.vue + layout.css │
│  A2: FilePanel.vue 토글 + file-panel.css                  │
│  (A2는 A1의 App.vue 변경 결과를 읽어야 하므로 순차 실행)     │
├──────────────┬───────────────────────────────────────────┤
│ ★ Gate 1: 오퍼레이터 diff 검토 + vite build 검증           │
│            + 레이아웃 구조 검증 (grid 확인)                  │
├──────────────┴───────────────────────────────────────────┤
│ Round 2: Components (A3, A4, A5 병렬)                     │
│  A3: FloatingControls + FloatingToolPanel + video.css     │
│  A4: ContextMenu + TrackMenu + DetectingPopup             │
│  A5: ExportModal + SettingsModal + BatchModal + modals.css│
│  (모두 독립 파일 작업 → worktree 병렬 실행)                 │
├──────────────┬───────────────────────────────────────────┤
│ ★ Gate 2: 오퍼레이터 3개 worktree diff 통합                │
│            + index.css import 병합                         │
│            + vite build 검증                               │
├──────────────┴───────────────────────────────────────────┤
│ Round 3: QA (A6)                                          │
│  전수 검증: 빌드, IPC 보존, API 보존, 색상 일관성,           │
│  키보드 단축키, z-index, 포커스 관리                         │
├──────────────┬───────────────────────────────────────────┤
│ ★ Gate 3: 최종 결과 유저 보고                               │
└──────────────┴───────────────────────────────────────────┘
```

### 품질 게이트 체크리스트

**매 Gate 공통:**
1. `cd secuwatcher_electron && npx vite build` 성공 여부
2. `git diff --stat` 으로 변경 파일 목록 확인
3. 변경된 Vue 파일에서 `window.electronAPI` 호출 보존 확인
4. 변경된 composable에서 `apiPython` 호출 보존 확인
5. `variables.css`에 임의 색상 추가 여부 확인

**Gate 1 추가:**
- App.vue template에서 TopMenuBar 제거 + SideBar 추가 확인
- grid-template-columns: 52px 1fr 적용 확인
- keyboardManager.js가 App.vue mounted에서 호출되는지 확인

**Gate 2 추가:**
- A3/A4/A5 worktree 간 파일 충돌 없음 확인
- index.css에 신규 CSS import 모두 포함 확인
- z-index 스택 순서 정합성 확인

---

## 4. 에이전트별 상세 지침 요약

### A0: Pre-flight Fixer

**목표**: 후속 에이전트들이 안전하게 작업할 수 있는 기반 마련
**격리**: 없음 (메인 브랜치에서 직접 작업)
**산출물**:
1. `src/composables/keyboardManager.js` — TopMenuBar.vue에서 9개 단축키 로직 추출
2. `src/styles/variables.css` — `--z-floating-controls: 50`, `--z-sidebar: 30`, `--z-contextbar: 25`, `--transition-floating` 추가
3. `src/App.vue` — trigger-file-input 이벤트 리스너를 named function으로 수정 (메모리 누수 해결)

**수정 금지**: 템플릿 구조, 컴포넌트 import, grid 레이아웃

### A1: Layout Architect

**목표**: 전체 레이아웃 골격을 새 구조로 전환
**격리**: 없음 (A0 완료 후 순차)
**참조 필수**: `layout-mockup.html` (디자인 소스)
**산출물**:
1. `SideBar.vue` — 52px 아이콘 사이드바, menuHandler 호출, 파일 아이콘 토글 이벤트 emit
2. `ContextBar.vue` — 36px, fileStore에서 파일명/메타 바인딩, 다크 라벨 배지
3. `App.vue` — grid 전환 (52px 1fr), TopMenuBar 제거, SideBar/ContextBar 추가, keyboardManager 연결
4. `layout.css` — 새 grid 구조, 사이드바 영역, 컨텍스트바 영역
5. `sidebar.css`, `contextbar.css` — 전용 스타일
6. `index.css` — 새 CSS import 추가

**수정 금지**: composable 내부 로직, 모달 컴포넌트, canvasDrawing.js

### A2: Panel Engineer

**목표**: FilePanel을 토글 가능한 좌측 오버레이로 전환
**격리**: 없음 (A1 완료 후 순차)
**산출물**:
1. `FilePanel.vue` — v-show 토글, 오버레이 포지셔닝, 사이드바 옆에 위치
2. `file-panel.css` — 슬라이드 애니메이션, 오버레이 스타일

**수정 금지**: App.vue 템플릿 구조 (A1이 이미 완료), 파일 관련 IPC 호출

### A3: Controls Engineer (worktree)

**목표**: 영상 컨트롤을 플로팅 오버레이로 전환 + 마스킹 도구 패널 추출
**격리**: worktree (A4, A5와 병렬)
**참조 필수**: `layout-mockup.html` (컨트롤바), `feature-mockups.html` (수동 마스킹 ③)
**산출물**:
1. `VideoControls.vue` — absolute 포지셔닝, backdrop-filter blur, 1열 레이아웃
2. `FloatingToolPanel.vue` — MaskingAreaModal에서 도구 선택 UI 추출, 좌상단 플로팅
3. `MaskingAreaModal.vue` — 추출 후 잔여 정리 (범위 선택만 남김)
4. `video.css` — 컨테이너 마진 조정
5. `controls.css` — 플로팅 버튼 스타일
6. `floating-controls.css` — 전용 스타일

### A4: Menu/Popup Styler (worktree)

**목표**: 메뉴와 팝업 컴포넌트에 Palette C 스타일 적용
**격리**: worktree (A3, A5와 병렬)
**참조 필수**: `feature-mockups.html` (공통-1,2,3 + ①-1)
**산출물**:
1. `ContextMenu.vue` — 다크 라벨 패턴, 2단 구조 스타일
2. `TrackMenu.vue` — 다크 라벨 패턴
3. `DetectingPopup.vue` — 우측 상단 팝업, 프로그레스+ETA, backdrop blur
4. `detection.css` — 팝업 스타일 보강

### A5: Modal Styler (worktree)

**목표**: 주요 모달 3개에 Palette C + 다크 라벨 패턴 통일
**격리**: worktree (A3, A4와 병렬)
**참조 필수**: `feature-mockups.html` (⑤ 내보내기, ⑥ 설정, ⑦ 일괄처리)
**산출물**:
1. `ExportModal.vue` — 파일유형/비밀번호/DRM 스타일
2. `SettingsModal.vue` — 3탭 스타일
3. `BatchProcessingModal.vue` — 단계/진행률/파일목록 스타일
4. `modals.css` — 공통 모달 스타일 업데이트

### A6: QA Integrator

**목표**: 전체 통합 검증
**검증 항목**:
1. `npx vite build` 성공
2. `window.electronAPI` 호출 보존 (grep 전수 검사)
3. `apiPython` HTTP 호출 보존
4. 키보드 단축키 9개 동작 확인 (keyboardManager 코드 리뷰)
5. z-index 스택 정합성
6. 임의 색상 사용 여부 (#3A82C4 외 하드코딩 검출)
7. composable 초기화 순서 보존
8. 다크 라벨 패턴 일관 적용

---

## 5. Worktree 병합 전략 (Round 2)

Round 2에서 A3/A4/A5가 worktree로 병렬 실행됩니다.

**병합 순서**: A3 → A4 → A5 (파일 겹침 없으므로 충돌 없음)

**오퍼레이터 병합 절차**:
```
1. A3 worktree diff 확인 → 메인에 적용
2. A4 worktree diff 확인 → 메인에 적용
3. A5 worktree diff 확인 → 메인에 적용
4. index.css에 floating-controls.css import 추가 (A3이 worktree에서 추가했을 것)
5. vite build 검증
```

**충돌 예방**: 파일 소유권 매트릭스에 따라 각 에이전트가 **독립 파일만 수정**하므로 git merge 충돌 없음.

---

## 6. 에이전트에게 전달할 공통 컨텍스트

모든 에이전트 프롬프트에 포함할 내용:

```
[공통 컨텍스트]
- 프로젝트: /sessions/optimistic-happy-ritchie/mnt/secu_electron_v3/secuwatcher_electron/
- 기술스택: Electron 36 + Vue 3.5 (Options API) + Vite 5 + Pinia
- 디자인 소스: ../layout-mockup.html, ../feature-mockups.html
- 색상 체계: variables.css의 CSS Custom Properties 엄수
- 주 액센트: --color-accent-button (#3A82C4)
- 다크 라벨: bg rgba(18,21,25,0.88), border rgba(58,130,196,0.4), text #3A82C4
- 수정 금지: canvasDrawing.js, 모든 store 파일, preload.js, main process 파일
- 보존 필수: window.electronAPI 호출, apiPython HTTP 호출, composable 초기화 순서
- 편집 도구: .hashline/ 디렉터리 존재 시 hashline 명령 사용
```

---

## 7. 롤백 전략

| 상황 | 대응 |
|------|------|
| Gate 실패 (빌드 에러) | 해당 에이전트 재실행 (에러 메시지 포함) |
| 잘못된 색상 사용 발견 | 오퍼레이터가 직접 hashline으로 패치 |
| IPC 호출 누락 발견 | A6 결과를 기반으로 오퍼레이터가 패치 |
| 전체 구조 문제 | git stash → Round 단위로 롤백 |

---

## 8. 예상 산출물 총정리

### 신규 파일 (7개)
- `src/composables/keyboardManager.js`
- `src/components/SideBar.vue`
- `src/components/ContextBar.vue`
- `src/components/FloatingToolPanel.vue`
- `src/styles/sidebar.css`
- `src/styles/contextbar.css`
- `src/styles/floating-controls.css`

### 수정 파일 (16개)
- `src/App.vue` — 레이아웃 전면 재구성
- `src/styles/variables.css` — 새 변수 추가
- `src/styles/layout.css` — grid 구조 재작성
- `src/styles/index.css` — 새 CSS import
- `src/components/FilePanel.vue` — 토글 로직
- `src/styles/file-panel.css` — 오버레이 스타일
- `src/components/VideoControls.vue` — 플로팅 전환
- `src/styles/video.css` — 컨테이너 조정
- `src/styles/controls.css` — 플로팅 버튼
- `src/components/modals/MaskingAreaModal.vue` — 도구 패널 추출 후 정리
- `src/components/ContextMenu.vue` — Palette C
- `src/components/TrackMenu.vue` — Palette C
- `src/components/modals/DetectingPopup.vue` — 목업 반영
- `src/styles/detection.css` — 팝업 스타일
- `src/components/modals/ExportModal.vue` — Palette C
- `src/components/modals/SettingsModal.vue` — Palette C
- `src/components/modals/BatchProcessingModal.vue` — Palette C
- `src/styles/modals.css` — 다크 라벨 통일

### 제거 대상 (1개)
- `src/components/TopMenuBar.vue` — SideBar.vue로 대체 (A1에서 App.vue import 제거)

---

*최종 작성: 2026-03-05*
