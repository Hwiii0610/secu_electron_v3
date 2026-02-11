# SecuWatcher Export - 에이전트 구성 전략 (v2)

> 작성일: 2026-02-11 | 대상: Electron(Vue) / Electron(JS) / Python 3-layer 아키텍처
> 범위: Phase 0~3 리팩토링 + Phase 4 통합 테스트/디버깅 (기능 추가·배포는 범위 외)

---

## 1. 현황 진단 요약

### 1.1 리팩토링 대상 파일 (1,000줄 초과)

| 파일 | 줄 수 | 레이어 | 핵심 문제 |
|------|--------|--------|-----------|
| `main.js` | 2,578 | Electron Main | IPC 50+개, 윈도우/라이선스/로깅/파이썬스폰 혼재 |
| `App.vue` | 1,867 | Vue Renderer | 59개 메서드, 100+ 상태변수 모놀리식 |
| `VideoCanvas.vue` | 703→2,110* | Vue Renderer | 캔버스/마스킹/인터랙션 혼재 |
| `main.py` | 1,194 | Python Backend | 20+ 엔드포인트, DB/로깅/암호화 혼재 |
| `index.css` | 1,372 | Styles | 컴포넌트별 분리 미흡 |

> *VideoCanvas.vue는 refac_plan에 2,110줄로 기록 (최근 기능 추가로 증가)

### 1.2 기존 리팩토링 계획 (refac_plan_1) 커버리지

| 대상 | 계획 존재 | 상태 |
|------|----------|------|
| App.vue → 8개 컴포저블 추출 | ✅ Phase 5 | 부분 실행됨 |
| VideoCanvas.vue → 4개 컴포저블 추출 | ✅ Phase 1-4 | 부분 실행됨 |
| **main.js 분할** | ❌ 미계획 | 신규 필요 |
| **main.py 분할** | ❌ 미계획 | 신규 필요 |
| **테스트 인프라** | ❌ 미계획 | 신규 필요 |

---

## 2. 프로젝트 범위 및 목표

### 2.1 범위 한정

```
✅ 범위 내 (이번 전략)
  Phase 0: 인프라 구축 (린트, 테스트 환경, 보안 정비)
  Phase 1: 프론트엔드 리팩토링 (App.vue, VideoCanvas.vue)
  Phase 2: Electron Main 리팩토링 (main.js)
  Phase 3: Python 백엔드 리팩토링 (main.py)
  Phase 4: 통합 테스트 및 디버깅 (기존 기능 정상 동작 검증)

❌ 범위 외 (차기 전략으로 이관)
  - 신규 기능 추가
  - CI/CD 파이프라인 구축
  - 크로스 플랫폼 패키징/배포
```

### 2.2 Phase 4 목표 정의

Phase 0~3의 리팩토링이 완료된 시점에서, **기존 기능이 깨짐 없이 동작하는지** 전수 검증합니다.

```
[Phase 4 검증 대상 - 기능별 체크리스트]

1. 파일 관리
   □ 비디오 파일 추가 (파일 선택 → videos/org 복사)
   □ 파일 목록 표시 및 선택
   □ 파일 삭제
   □ 폴더 스캔/로딩

2. 비디오 재생
   □ 비디오 로드 및 재생/정지
   □ 프레임 단위 이동 (앞/뒤)
   □ 타임라인 시크
   □ 비디오 정보 표시

3. 객체 탐지
   □ 자동 객체 탐지 (YOLO) 실행 → 결과 수신
   □ 선택적 탐지 (프레임+좌표 지정)
   □ 다중 파일 탐지
   □ 진행률 폴링 정상 동작
   □ CSV 결과 파일 생성 확인

4. 마스킹/블러
   □ 탐지 기반 자동 마스킹
   □ 수동 영역 마스킹 (사각형/다각형)
   □ 바운딩박스 호버 효과 (주황색 하이라이트)
   □ 마스킹 프리뷰

5. 반출/내보내기
   □ 일반 반출 (마스킹 적용 비디오)
   □ 암호화 반출 (LEA-GCM .sphereax)
   □ 일괄 처리 (배치)
   □ 워터마크 적용

6. 설정
   □ 설정 저장/로드
   □ 탐지 임계값 변경
   □ 마스킹 도구/강도 변경
   □ 디렉토리 경로 설정

7. 레이어 간 통신
   □ Electron ↔ Vue IPC 전 채널 정상
   □ Vue ↔ Python REST API 전 엔드포인트 정상
   □ 라이선스 검증 플로우
   □ Python 프로세스 스폰/종료
```

---

## 3. 에이전트 아키텍처 설계

### 3.1 설계 원칙

```
┌─────────────────────────────────────────────┐
│              Orchestrator Agent              │
│        (작업 분배 + 품질 게이트)               │
└──────┬──────────┬──────────┬────────────────┘
       │          │          │
  ┌────▼───┐ ┌───▼────┐ ┌──▼─────┐
  │ Layer  │ │ Layer  │ │ Layer  │
  │ Agent  │ │ Agent  │ │ Agent  │
  │  (E-M) │ │ (E-R)  │ │  (Py)  │
  └────┬───┘ └───┬────┘ └──┬─────┘
       │         │         │
       └─────────┼─────────┘
                 │
          ┌──────▼──────┐
          │  QA Agent   │
          │ (테스트+디버깅) │
          └─────────────┘
```

**핵심 전략**: 레이어별 전문 에이전트(3) + QA 에이전트(1) + 오케스트레이터(1) = **총 5개**
> 기능 추가/배포가 범위 외이므로 DevOps Agent와 Security Agent는 축소하여 Orchestrator에 통합

### 3.2 에이전트 구성표

#### A. 오케스트레이터 (Orchestrator)

| 항목 | 설정 |
|------|------|
| **역할** | 작업 분배, 품질 게이트, 보안 정비(Security 흡수), 인프라 설정(DevOps 흡수) |
| **참고 프레임워크** | `obra/superpowers` (품질 게이트 + 병렬 워크플로우) |
| **스킬셋** | Task Decomposition, Dependency Graph, Conflict Detection, Lint/Git Setup |
| **Phase 0 담당** | ESLint/Prettier 설정, .gitignore 정비, 하드코딩 경로 정리, AGENTS.md 업데이트 |

```
[Orchestrator 워크플로우]

1. 요구사항 수신
2. 영향 범위 분석 (어떤 레이어에 영향?)
3. 의존성 그래프 기반 작업 순서 결정
4. 레이어 에이전트에 작업 분배 (병렬 가능 시 병렬)
5. 각 에이전트 결과물에 품질 게이트 적용
6. Phase 4에서 QA Agent와 함께 통합 검증 주도
```

---

#### B. 레이어별 전문 에이전트 (3개)

##### B-1. Electron Main Agent (`agent-electron-main`)

| 항목 | 설정 |
|------|------|
| **담당 파일** | `main.js`, `preload.js`, `forge.config.mjs`, `vite.*.config.mjs` |
| **핵심 작업** | main.js 2,578줄 → 모듈 분할 |
| **참고 프레임워크** | `claude-code-skills` (체계적 리팩토링) |
| **필요 스킬** | Electron IPC, Node.js FS, Child Process, Window Management |

**main.js 분할 계획**:
```
src/main.js (2,578줄)
    ↓ 분할
src/main/
├── index.js              (~200줄)  진입점 + 앱 라이프사이클
├── windowManager.js      (~300줄)  윈도우 생성/관리/프로토콜
├── ipcHandlers/
│   ├── fileHandlers.js   (~400줄)  파일 다이얼로그/스캔/복사
│   ├── videoHandlers.js  (~350줄)  트림/머지/변환/워터마크
│   ├── settingsHandlers.js (~200줄)  설정 로드/저장
│   ├── licenseHandlers.js  (~150줄)  라이선스 검증/HW ID
│   └── encryptHandlers.js  (~150줄)  암호화/복호화
├── pythonBridge.js       (~200줄)  Python 프로세스 스폰/관리
├── logger.js             (~150줄)  로깅 인프라
└── installer.js          (~100줄)  Squirrel 이벤트 처리
```

##### B-2. Vue Renderer Agent (`agent-vue-renderer`)

| 항목 | 설정 |
|------|------|
| **담당 파일** | `App.vue`, `VideoCanvas.vue`, `components/`, `composables/`, `stores/`, `utils/` |
| **핵심 작업** | 기존 refac_plan_1 Phase 1-5 실행 완료 |
| **참고 프레임워크** | `claude-code-skills` (Agile 파이프라인) |
| **필요 스킬** | Vue 3 Composition API, Pinia, Canvas API, CSS Architecture |

**실행 로드맵**: 기존 `refac_plan_1_260211.md`의 Phase 1→5 순서대로 실행
- Phase 1: maskingData 통합 (중복 제거)
- Phase 2: canvasDrawing 추출
- Phase 3: canvasInteraction 추출
- Phase 4: maskPreview 추출
- Phase 5A-D: fileManager/detectionManager/exportManager/settingsManager 추출

##### B-3. Python Backend Agent (`agent-python-backend`)

| 항목 | 설정 |
|------|------|
| **담당 파일** | `main.py`, `detector.py`, `blur.py`, `watermarking.py`, `lea_gcm_lib.py`, `util.py` |
| **핵심 작업** | main.py 1,194줄 → 모듈 분할 |
| **참고 프레임워크** | `everything-claude-code` (프론트/백엔드 분리) |
| **필요 스킬** | FastAPI, YOLO/PyTorch, OpenCV, SQLite, asyncio |

**main.py 분할 계획**:
```
secuwatcher_python/
├── main.py               (~150줄)  FastAPI 앱 생성 + 라이프사이클
├── routers/
│   ├── detection.py      (~200줄)  /autodetect, /progress 엔드포인트
│   ├── export.py         (~200줄)  /autoexport 엔드포인트
│   ├── encryption.py     (~150줄)  /encrypt, /decrypt 엔드포인트
│   └── settings.py       (~100줄)  설정 관련 엔드포인트
├── services/
│   ├── detection_service.py  (~150줄)  탐지 비즈니스 로직
│   ├── export_service.py     (~150줄)  반출 비즈니스 로직
│   └── drm_service.py        (~100줄)  DRM/DB 관리
├── models/
│   └── schemas.py        (~100줄)  Pydantic 모델 통합
├── core/
│   ├── config.py         (~80줄)   설정 관리 (config.ini 파싱)
│   ├── logging.py        (~80줄)   로깅 설정
│   └── database.py       (~60줄)   SQLite 연결 관리
├── detector.py           (유지)    YOLO 탐지 엔진
├── blur.py               (유지)    마스킹 엔진
├── watermarking.py       (유지)    워터마크 엔진
└── lea_gcm_lib.py        (유지)    암호화 라이브러리
```

---

#### C. QA/Test Agent (`agent-qa`)

| 항목 | 설정 |
|------|------|
| **역할** | Phase 1-3 각 단계별 회귀 검증 + Phase 4 전수 테스트/디버깅 주도 |
| **참고 프레임워크** | `obra/superpowers` (품질 게이트) |
| **필요 스킬** | Vitest, pytest, Electron IPC 테스트, REST API 테스트 |
| **Phase 4 주도** | 기존 기능 전수 체크리스트 검증 + 발견 버그 수정 조율 |

**Phase별 QA 역할**:
```
Phase 0: 테스트 인프라 구축 (Vitest, pytest 설정)
Phase 1: Vue 컴포저블 추출 후 UI 기능 회귀 테스트
Phase 2: Electron 모듈 분할 후 IPC 채널 전수 검증
Phase 3: Python Router 분할 후 API 엔드포인트 전수 검증
Phase 4: ★ 전 레이어 통합 테스트 + 버그 헌팅 + 수정 ★
```

---

## 4. 프레임워크 매핑 및 채택 전략

### 4.1 프레임워크별 적용 영역

| 프레임워크 | 채택 영역 | 적용 방식 | 우선순위 |
|-----------|----------|----------|---------|
| **obra/superpowers** | Orchestrator + QA | 품질 게이트 패턴, 병렬 워크플로우 구조 직접 채택 | ⭐⭐⭐ |
| **claude-code-skills** | 레이어 에이전트 전체 | Agile 파이프라인 (Sprint 단위 리팩토링 + 검증) | ⭐⭐⭐ |
| **everything-claude-code** | Python Backend | 프론트/백엔드 분리 패턴 참고 | ⭐⭐ |
| **awesome-subagents** | 에이전트 템플릿 | 역할별 에이전트 프롬프트/스킬 정의 참고 | ⭐⭐ |
| **skill-factory** | 커스텀 스킬 | 프로젝트 전용 스킬 생성 (범위 축소: 3개) | ⭐⭐ |
| **awesome-agent-skills** | 스킬 탐색 | 부족한 스킬 발견 시 디렉토리에서 검색 | ⭐ |
| **wshobson/agents** | 참고용 | 올인원 세팅 구조 참고 (전체 채택은 과잉) | ⭐ |

### 4.2 권장 조합

```
                    ┌──────────────────────┐
                    │   obra/superpowers   │
                    │  (품질 게이트 엔진)    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
     │ claude-code-  │ │ claude-code- │ │ everything-  │
     │ skills        │ │ skills       │ │ claude-code  │
     │ (프론트엔드)   │ │ (Electron)   │ │ (백엔드)     │
     └───────┬───────┘ └──────┬───────┘ └──────┬───────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                    ┌──────────▼───────────┐
                    │   skill-factory      │
                    │  (커스텀 스킬 3개)     │
                    └──────────────────────┘
```

---

## 5. 실행 로드맵

### Phase 0: 인프라 구축 (Day 1-2)

| 작업 | 담당 에이전트 | 산출물 |
|------|-------------|--------|
| ESLint + Prettier 설정 | Orchestrator | `.eslintrc.js`, `.prettierrc` |
| Vitest 설정 (프론트엔드) | QA | `vitest.config.js`, 샘플 테스트 |
| pytest 인프라 구축 (백엔드) | QA | `pytest.ini`, `conftest.py` |
| .gitignore 정비 (키 파일 제외) | Orchestrator | `.gitignore` 업데이트 |
| AGENTS.md에 에이전트 프롬프트 추가 | Orchestrator | `AGENTS.md` 업데이트 |
| 하드코딩 경로 → 동적 경로 정리 | Orchestrator | `dirConfig.json` 리팩토링 |

**Phase 0 완료 기준**: lint 실행 가능, 테스트 프레임워크 동작 확인, 기존 앱 정상 기동

---

### Phase 1: 프론트엔드 리팩토링 (Day 3-7)

| 작업 | 담당 | 검증 |
|------|------|------|
| VideoCanvas.vue → maskingData 컴포저블 추출 | Vue Agent | 마스킹 CRUD 동작 확인 |
| VideoCanvas.vue → canvasDrawing 컴포저블 추출 | Vue Agent | 바운딩박스/폴리곤 그리기 확인 |
| VideoCanvas.vue → canvasInteraction 컴포저블 추출 | Vue Agent | 클릭/호버/드래그 동작 확인 |
| VideoCanvas.vue → maskPreview 컴포저블 추출 | Vue Agent | 마스크 프리뷰/애니메이션 확인 |
| App.vue → fileManager 컴포저블 추출 | Vue Agent | 파일 추가/선택/삭제 확인 |
| App.vue → detectionManager 컴포저블 추출 | Vue Agent | 자동/선택 탐지 실행 확인 |
| App.vue → exportManager 컴포저블 추출 | Vue Agent | 반출/배치 처리 확인 |
| App.vue → settingsManager 컴포저블 추출 | Vue Agent | 설정 저장/로드 확인 |
| CSS 컴포넌트별 정리 | Vue Agent | 레이아웃 깨짐 검증 |
| 프론트엔드 단위 테스트 작성 | QA Agent | Vitest 통과 확인 |

**Phase 1 완료 기준**: App.vue ≤1,050줄, VideoCanvas.vue ≤990줄, UI 전 기능 정상

---

### Phase 2: Electron Main 리팩토링 (Day 8-10)

| 작업 | 담당 | 검증 |
|------|------|------|
| main.js → index.js (진입점) 분리 | Electron Agent | 앱 기동 정상 |
| main.js → windowManager.js 분리 | Electron Agent | 윈도우 생성/최소화/최대화 정상 |
| main.js → ipcHandlers/ 5개 모듈 분리 | Electron Agent | IPC 50+ 채널 전수 검증 |
| main.js → pythonBridge.js 분리 | Electron Agent | Python 서버 스폰/종료 정상 |
| main.js → logger.js 분리 | Electron Agent | 3종 로그 파일 생성 정상 |
| preload.js 구조 정리 | Electron Agent | contextBridge API 전체 검증 |
| Electron 모듈 단위 테스트 | QA Agent | 모듈별 테스트 통과 |

**Phase 2 완료 기준**: main.js 제거(또는 index.js로 대체), 모든 모듈 ≤400줄, IPC 정상

---

### Phase 3: Python 백엔드 리팩토링 (Day 11-14)

| 작업 | 담당 | 검증 |
|------|------|------|
| main.py → FastAPI Router 4개 분리 | Python Agent | 전체 엔드포인트 curl 테스트 |
| Pydantic 스키마 통합 (schemas.py) | Python Agent | 요청/응답 타입 검증 |
| 서비스 레이어 분리 (services/) | Python Agent | 비즈니스 로직 단위 테스트 |
| core/ 모듈 분리 (config, logging, db) | Python Agent | 설정 로드, 로깅, DB 접근 정상 |
| pytest 테스트 작성 | QA Agent | pytest 통과 확인 |

**Phase 3 완료 기준**: main.py ≤150줄, Router별 ≤200줄, API 전체 정상 응답

---

### Phase 4: 통합 테스트 및 디버깅 (Day 15-20) ★ 최종 목표 ★

> 목적: Phase 0~3 리팩토링 후 **기존 기능이 100% 정상 동작하는지** 전수 검증 및 버그 수정

| 작업 | 담당 | 세부 내용 |
|------|------|----------|
| **IPC 통합 테스트** | QA + Electron | Electron ↔ Renderer 50+ IPC 채널 전수 검증 |
| **API 통합 테스트** | QA + Python | Renderer ↔ Python REST API 전 엔드포인트 검증 |
| **E2E 시나리오 테스트** | QA (주도) | 아래 7개 핵심 워크플로우 순차 검증 |
| **버그 트리아지** | Orchestrator | 발견 버그 분류 → 담당 레이어 에이전트에 할당 |
| **버그 수정** | 해당 레이어 Agent | 버그 수정 후 QA Agent 재검증 |
| **회귀 방지** | QA | 수정된 버그에 대한 테스트 케이스 추가 |

#### Phase 4 핵심 워크플로우 검증 (7개)

```
Workflow 1: 파일 → 재생
  파일 선택 → videos/org 복사 → 파일 목록 표시 → 비디오 로드
  → 재생/정지 → 프레임 이동 → 비디오 정보 표시

Workflow 2: 자동 객체 탐지
  비디오 로드 → 자동 탐지 실행 → 진행률 폴링 → CSV 생성
  → 바운딩박스 표시 → 프레임별 결과 확인

Workflow 3: 선택/수동 마스킹
  탐지 결과 로드 → 객체 선택(호버/클릭) → 수동 영역 그리기
  (사각형/다각형) → 마스킹 데이터 저장

Workflow 4: 마스킹 반출
  마스킹 설정 → 반출 요청 → 진행률 → 결과 파일 확인

Workflow 5: 암호화 반출
  DRM 설정 → 암호화 반출 → .sphereax 파일 생성 → 복호화 검증

Workflow 6: 워터마크
  이미지 업로드 → 위치/투명도 설정 → 프리뷰 → 적용 반출

Workflow 7: 일괄 처리
  다중 파일 선택 → 배치 시작 → 개별 진행률 → 전체 완료
```

#### Phase 4 버그 수정 프로세스

```
[발견] QA Agent가 워크플로우 실행 중 버그 발견
    ↓
[분류] Orchestrator가 버그를 레이어별로 분류
    │
    ├── IPC 관련 → Electron Agent
    ├── UI/상태 관련 → Vue Agent
    └── API/처리 관련 → Python Agent
    ↓
[수정] 담당 에이전트가 수정
    ↓
[재검증] QA Agent가 해당 워크플로우 재실행
    ↓
[테스트 추가] 수정된 버그에 대한 자동 테스트 추가
    ↓
[완료] 7개 워크플로우 전체 Pass → Phase 4 완료
```

**Phase 4 완료 기준**:
- 7개 핵심 워크플로우 전체 Pass
- P0(크래시/데이터 손실) 버그 0건
- P1(기능 미작동) 버그 0건
- P2(UX 이슈) 허용 (차기 작업으로 이관)

---

## 6. 에이전트 간 통신 프로토콜

### 6.1 파일 변경 충돌 방지

```
규칙 1: 각 에이전트는 자신의 담당 레이어 파일만 수정
규칙 2: 레이어 경계 파일(preload.js, apiRequest.js, config.json)은
         Orchestrator 승인 후 수정
규칙 3: 모든 변경은 Git 브랜치로 격리

브랜치 전략:
  main
  ├── refactor/vue-renderer     ← Vue Agent (Phase 1)
  ├── refactor/electron-main    ← Electron Agent (Phase 2)
  ├── refactor/python-backend   ← Python Agent (Phase 3)
  └── test/integration          ← QA Agent (Phase 4)
```

### 6.2 품질 게이트 (obra/superpowers 패턴)

```
[Gate 1] 코드 리뷰 - 각 Phase 종료 시
  □ 분할된 파일 모두 1,000줄 미만
  □ 단일 책임 원칙 준수
  □ 기존 API 계약 유지 (IPC 채널명, REST 엔드포인트 변경 없음)
  □ 한국어 주석 유지

[Gate 2] 단위 테스트 - 각 Phase 종료 시
  □ 해당 레이어 단위 테스트 통과
  □ 기존 기능 회귀 없음 (수동 스모크 테스트)

[Gate 3] 통합 검증 - Phase 4
  □ npm run start → 앱 정상 기동
  □ Python 서버 정상 기동 (port 5001)
  □ Electron ↔ Python 통신 정상
  □ 7개 핵심 워크플로우 전체 Pass
```

---

## 7. 커스텀 스킬 정의 (skill-factory 활용)

범위 축소에 따라 핵심 3개 스킬만 생성합니다.

| 스킬명 | 설명 | 대상 에이전트 | 활용 Phase |
|--------|------|-------------|-----------|
| `secuwatcher-composable-factory` | Vue 팩토리 컴포저블 생성 패턴 (`createXxxManager`) | Vue Agent | Phase 1 |
| `secuwatcher-ipc-pattern` | Electron IPC 핸들러 등록/분리 패턴 (main ↔ preload ↔ renderer) | Electron Agent | Phase 2 |
| `secuwatcher-fastapi-router` | FastAPI Router + Service 분리 패턴 | Python Agent | Phase 3 |

---

## 8. 리스크 및 대응

| 리스크 | 영향도 | 대응 방안 |
|--------|-------|----------|
| IPC 채널 이름 변경 시 통신 단절 | 🔴 높음 | preload.js를 단일 진실 원천(SSOT)으로 유지, 채널명 상수화 |
| 리팩토링 중 기존 기능 회귀 | 🔴 높음 | Phase별 스모크 테스트 + Phase 4 전수 검증으로 이중 방어 |
| Python 모듈 분리 시 import 순환 | 🟡 중간 | 서비스 레이어 패턴으로 의존성 방향 단일화 |
| Phase 4에서 대량 버그 발견 | 🟡 중간 | 버그 심각도 분류(P0/P1/P2) 후 P0→P1 순서로 수정, P2는 이관 |
| 에이전트 간 파일 충돌 | 🟡 중간 | Git 브랜치 격리 + Orchestrator 머지 관리 |

---

## 9. 타임라인 요약

```
Day  1-2   ▓▓░░░░░░░░░░░░░░░░░░  Phase 0: 인프라 구축
Day  3-7   ░░▓▓▓▓▓░░░░░░░░░░░░░  Phase 1: Vue 프론트엔드 리팩토링
Day  8-10  ░░░░░░░▓▓▓░░░░░░░░░░  Phase 2: Electron Main 리팩토링
Day 11-14  ░░░░░░░░░░▓▓▓▓░░░░░░  Phase 3: Python 백엔드 리팩토링
Day 15-20  ░░░░░░░░░░░░░░▓▓▓▓▓▓  Phase 4: 통합 테스트 + 디버깅
           ─────────────────────
           리팩토링 (14일)  검증 (6일)
```

---

## 10. 요약: 최종 에이전트 구성

```
총 5개 에이전트 (범위 한정에 따라 7→5개로 최적화)

[Orchestrator Layer]
  1. Orchestrator Agent     → obra/superpowers 기반
     (Security/DevOps 역할 흡수: 인프라 셋업, 보안 정비)

[Domain Layer - 3개]
  2. Electron Main Agent   → claude-code-skills 기반    (Phase 2)
  3. Vue Renderer Agent    → claude-code-skills 기반    (Phase 1)
  4. Python Backend Agent  → everything-claude-code 기반 (Phase 3)

[QA Layer - 1개]
  5. QA/Test Agent          → obra/superpowers 품질 게이트 (Phase 0-4 상주)
```

**핵심 원칙**:
- 각 에이전트는 자신의 레이어만 수정 (책임 분리)
- 모든 변경은 품질 게이트를 통과 (회귀 방지)
- 리팩토링은 Phase 순서대로 점진적 실행 (안정성 우선)
- **Phase 4가 최종 목표**: 기존 기능 100% 정상 동작 확인 후 완료

---

## 부록: Phase 4 이후 추진 방향 (참고)

Phase 4 완료 후 후속 전략에서 다룰 항목:
- 신규 기능 추가 (별도 요구사항 수집 필요)
- CI/CD 파이프라인 구축
- 크로스 플랫폼 빌드/배포 자동화
- DevOps Agent, Security Agent 독립 운영 재검토
