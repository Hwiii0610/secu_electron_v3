# SecuWatcher Export - AI 코딩 에이전트 가이드

## 프로젝트 개요

SecuWatcher Export는 비디오 보안 처리 애플리케이션으로, 두 가지 주요 구성 요소로 이루어져 있습니다:

1. **secuwatcher_python**: AI 객체 탐지, 비디오 마스킹, 워터마킹, LEA-GCM 암호화를 위한 FastAPI 기반 Python 백엔드
2. **secuwatcher_electron**: 사용자 인터페이스를 위한 Electron + Vue.js 프론트엔드 데스크톱 애플리케이션

이 시스템은 자동 객체 탐지, 마스킹/블러, 워터마킹, DRM 암호화를 통한 개인정보 보호 기능을 제공하는 CCTV 비디오 반출 기능을 제공합니다.

**언어**: 코드 주석, 문서, UI에는 한국어(한국어)를 사용합니다.

---

## 프로젝트 구조

```
secu_electron_v3/
├── agent_strategy_260211.md     # 에이전트 구성 전략 문서
├── AGENTS.md                    # 이 파일 (AI 코딩 에이전트 가이드)
├── MEMORY.md                    # 프로젝트 메모리 (교훈, 버그 기록)
│
├── secuwatcher_python/          # Python FastAPI 백엔드
│   ├── main.py                  # FastAPI 서버 진입점 (1,194줄 → Phase 3 분할 대상)
│   ├── detector.py              # YOLO 모델 및 객체 탐지
│   ├── blur.py                  # 비디오 마스킹/블러
│   ├── watermarking.py          # 비디오 워터마킹
│   ├── lea_gcm_lib.py           # LEA-GCM 암호화 래퍼
│   ├── util.py                  # 공통 유틸리티 (로그, 시간)
│   ├── config.ini               # 애플리케이션 설정
│   ├── requirements.txt         # Python 의존성
│   ├── pytest.ini               # pytest 설정
│   ├── conftest.py              # 테스트 공유 fixture
│   ├── tests/                   # 백엔드 테스트
│   │   ├── __init__.py
│   │   └── test_health.py       # 헬스체크 테스트
│   ├── tracker/                 # 객체 추적기 설정
│   │   ├── deepsort.yaml
│   │   └── strong_sort.yaml
│   └── ultralytics/             # YOLO ultralytics 설정
│
└── secuwatcher_electron/        # Electron 프론트엔드
    ├── package.json             # NPM 설정
    ├── forge.config.mjs         # Electron Forge 빌드 설정
    ├── index.html               # 메인 HTML 진입점
    ├── vite.*.config.mjs        # Vite 빌드 설정
    ├── vitest.config.js         # Vitest 테스트 설정
    ├── .eslintrc.cjs            # ESLint 설정
    ├── .prettierrc              # Prettier 설정
    └── src/
        ├── main.js              # Electron 메인 프로세스 (2,578줄 → Phase 2 분할 대상)
        ├── preload.js           # 프리로드 스크립트 (IPC 브릿지)
        ├── renderer.js          # Vue 앱 진입점
        ├── App.vue              # 메인 Vue 컴포넌트 (744줄)
        ├── apiRequest.js        # Axios API 클라이언트
        ├── dirConfig.json       # 디렉토리 경로 설정
        ├── export.css           # 반출 스타일 (→ styles/export.css 임포트)
        ├── index.css            # 메인 스타일 (→ styles/index.css 임포트)
        ├── styles/              # 모듈화된 CSS
        │   ├── index.css        # 메인 CSS 임포트 허브
        │   ├── base.css         # body, 타이틀바, 전역 변수
        │   ├── layout.css       # 컨테이너, 래퍼, 그리드
        │   ├── video.css        # 비디오 플레이어, 캔버스
        │   ├── file-panel.css   # 파일 패널, 목록
        │   ├── modals.css       # 모달 공통 + 개별
        │   ├── controls.css     # 버튼, 폼, 입력
        │   ├── detection.css    # 바운딩박스, 탐지 UI
        │   ├── export.css       # 반출 CSS 임포트 허브
        │   ├── export-layout.css
        │   ├── export-forms.css
        │   ├── export-progress.css
        │   └── export-controls.css
        ├── composables/         # 팩토리 컴포저블 (createXxxManager 패턴)
        │   ├── maskingData.js     # 마스킹 데이터 관리
        │   ├── canvasDrawing.js   # 캔버스 렌더링
        │   ├── canvasInteraction.js # 캔버스 인터랙션
        │   ├── maskPreview.js     # 마스킹 프리뷰
        │   ├── fileManager.js     # 파일 관리
        │   ├── detectionManager.js # 탐지 데이터 관리
        │   ├── exportManager.js   # 반출 관리
        │   ├── settingsManager.js # 설정 관리
        │   ├── videoController.js # 비디오 재생/줌/키보드 (신규)
        │   ├── objectManager.js   # 객체 선택/삭제 (신규)
        │   ├── videoEditor.js     # 트림/머지/마커 (신규)
        │   ├── conversionHelper.js # 변환 헬퍼
        │   └── progressPoller.js  # 진행률 폴러
        ├── stores/              # Pinia 상태 관리
        │   ├── videoStore.js      # 비디오 상태
        │   ├── fileStore.js       # 파일 상태
        │   ├── detectionStore.js  # 탐지 상태
        │   ├── modeStore.js       # 모드 상태
        │   ├── configStore.js     # 설정 상태
        │   └── exportStore.js     # 반출 상태
        ├── utils/               # 유틸리티
        ├── components/          # Vue 컴포넌트
        │   ├── VideoCanvas.vue    # 비디오 캔버스 (703줄)
        │   ├── VideoControls.vue  # 비디오 컨트롤 바
        │   ├── FilePanel.vue      # 파일 목록 패널
        │   ├── TopMenuBar.vue     # 상단 메뉴
        │   ├── ContextMenu.vue    # 컨텍스트 메뉴
        │   └── modals/            # 모달 컴포넌트
        ├── __tests__/           # 프론트엔드 테스트
        │   ├── setup.js           # 테스트 셋업 (mock electronAPI)
        │   └── composables/       # 컴포저블 테스트
        ├── license/             # 라이선스 검증
        └── resources/           # 앱 리소스
```

---

## 기술 스택

### 백엔드 (secuwatcher_python)
- **프레임워크**: FastAPI 0.115.12
- **AI/ML**: YOLOv8 (ultralytics 8.3.121), PyTorch 2.3.0+cu118
- **추적**: DeepSORT, StrongSORT, ByteTrack
- **비디오 처리**: OpenCV 4.11.0.86, PyAV 14.4.0
- **암호화**: LEA-GCM (ctypes를 통한 커스텀 C 라이브러리), pycryptodome
- **데이터베이스**: SQLite3 (local.db), 외부용 PyMySQL
- **서버**: Uvicorn 0.34.0

### 프론트엔드 (secuwatcher_electron)
- **프레임워크**: Electron 36.4.0 + Vue 3.5.17
- **빌드 도구**: Vite 5.4.19 + Electron Forge 7.9.0
- **UI**: 바닐라 CSS (커스텀)
- **HTTP 클라이언트**: Axios 1.10.0
- **암호화**: crypto-js 4.2.0
- **날짜**: dayjs, date-fns, vue-datepicker
- **엑셀**: xlsx 0.18.5

---

## 빌드 명령어

### 백엔드 (secuwatcher_python)

```bash
cd secuwatcher_python

# 가상 환경 생성
python -m venv venv

# Windows
venv\Scripts\activate

# 의존성 설치 (GPU용 CUDA 11.8)
pip install torch==2.3.0+cu118 torchvision==0.18.0+cu118 torchaudio==2.3.0+cu118 --index-url https://download.pytorch.org/whl/cu118
pip install -r requirements.txt

# 서버 실행
python main.py
```

**서버 설정** (`config.ini`):
- 호스트: `0.0.0.0`
- 포트: `5001`
- 로그 경로, 비디오 경로, 모델 경로 설정 가능

### 프론트엔드 (secuwatcher_electron)

```bash
cd secuwatcher_electron

# 의존성 설치
npm install

# 개발 모드
npm run start

# 배포용 빌드
npm run make

# 패키징만 (설치 프로그램 없음)
npm run package
```

**중요 디렉토리 설정** (`src/dirConfig.json`):
```json
{
  "exportConfig": "C:/swfc/export/_internal/",
  "videoDir": "C:/swfc/download/videos/org",
  "MaskingDir": "C:/swfc/download/videos/masking",
  "shortcutDir": "C:/swfc/export",
  "logDir": "C:/swfc/log"
}
```

---

## API 엔드포인트

Python 백엔드가 제공하는 REST API:

| 엔드포인트 | 메서드 | 설명 |
|----------|--------|-------------|
| `/` | GET | 헬스 체크 |
| `/autodetect` | POST | 객체 탐지/마스킹 작업 시작 |
| `/progress/{job_id}` | GET | 작업 진행 상태 조회 |
| `/encrypt` | POST | LEA-GCM으로 비디오 암호화 |
| `/decrypt` | POST | .sphereax 파일 복호화 |

### /autodetect용 이벤트 유형
- `Event=1`: 자동 객체 탐지 + 추적
- `Event=2`: 선택적 탐지 (프레임 + 좌표)
- `Event=3`: 마스킹 반출 (탐지 기반 또는 전체 프레임)
- `Event=4`: 영역 마스킹

---

## 코드 스타일 가이드라인

### Python (secuwatcher_python)
- **언어**: Python 3.x
- **주석**: 한국어
- **로깅**: 비동기 로깅을 위해 `util.log_writer`와 `log_queue` 사용
- **설정**: PyInstaller 호환성을 위해 `configparser`와 `get_resource_path()` 사용
- **에러 처리**: 한국어로 상세한 에러 메시지와 함께 try-except 사용
- **진행률 추적**: `util.update_progress(job_id, fraction, start_pct, end_pct)` 사용

### JavaScript (secuwatcher_electron)
- **언어**: 모듈 임포트가 있는 ES6+
- **프레임워크**: Vue 3 컴포지션 API (App.vue에서 추론)
- **IPC**: preload.js의 `contextBridge`를 통해 `ipcRenderer` 사용
- **주석**: 한국어
- **파일 작업**: IPC를 통해 Electron의 `dialog`, `fs` 모듈 사용

---

## 주요 설정 파일

### Python 백엔드 (`config.ini`)
```ini
[fastapi]
host = 0.0.0.0
port = 5001

[path]
log = ./log
video_path = ./videos/org
video_masking_path = ./videos/masking
model = ./model/secuwatcher_best.pt
auto_tracker = ./tracker/deepsort.yaml
select_tracker = ./tracker/strong_sort.yaml
enc = key.pem

[detect]
device = gpu          ; gpu 또는 cpu
multifiledetect = no
threshold = 0.5       ; 탐지 신뢰도
detectobj = 10        ; 클래스 매핑 인덱스 (0-14)

[export]
maskingrange = 2      ; 마스킹 범위
maskingtool = 1       ; 0=모자이크, 1=블러
maskingstrength = 5   ; 1-5
watermarking = no
watertext = Secuwatcher
watertransparency = 100
waterimgpath = SECUWATCHER_1.png
waterlocation = 3     ; 1-5 위치
drm = no
play_date = 30
play_count = 99
```

### Electron 프론트엔드
- `package.json`: NPM 스크립트 및 의존성
- `forge.config.mjs`: Electron Forge 패키징 설정
- `vite.renderer.config.mjs`: Vue 플러그인 설정
- `src/dirConfig.json`: Windows 배포를 위한 고정 디렉토리 경로

---

## 테스트 방법

### 자동화 테스트

**프론트엔드 (Vitest)**:
```bash
cd secuwatcher_electron
npm install           # devDependencies에 vitest, jsdom 포함
npm test              # 단일 실행
npm run test:watch    # 감시 모드
npm test -- --coverage  # 커버리지 포함
```

**백엔드 (pytest)**:
```bash
cd secuwatcher_python
pip install pytest httpx
pytest                # 전체 테스트
pytest -v             # 상세 출력
pytest --tb=short     # 짧은 트레이스백
```

### 수동 테스트

1. **백엔드 테스트**:
   ```bash
   curl -X POST "http://localhost:5001/autodetect" \
     -H 'Content-Type: application/json' \
     -d '{"Event":"1","VideoPath":"test.mp4"}'
   curl "http://localhost:5001/progress/{job_id}"
   ```

2. **프론트엔드 테스트**:
   - `npm run start`로 개발 모드 실행
   - 비디오 로딩 → 탐지 → 마스킹 → 반출 플로우 순차 검증

### 린트/포맷팅
```bash
cd secuwatcher_electron
npm run lint          # ESLint 검사
npm run lint:fix      # ESLint 자동 수정
npm run format        # Prettier 포맷팅
```

---

## 보안 고려사항

### 암호화
- **알고리즘**: LEA-GCM (128/192/256비트 키 지원)
- **구현**: ctypes를 통해 로드되는 커스텀 C 라이브러리 (DLL/SO)
- **키 교환**: 대칭키 암호화를 위한 RSA-OAEP
- **출력 형식**: 논스, 암호문, 태그, DRM 메타데이터가 포함된 `.sphereax` 파일

### 라이선스 검증
- `node-machine-id`를 사용한 하드웨어 ID 바인딩
- 임베디드 공개키를 사용한 RSA 서명 검증
- 만료일 확인
- 첫 실행 감지 및 강제 실행

### DRM 메타데이터
SQLite (`local.db`)에 저장:
- 파일 해시 (SHA-256)
- 원본 파일명 및 경로
- 마스킹 상태
- 암호화 상태
- 재생 날짜 및 횟수 제한

### 파일 작업
- 디렉토리 탐색 방지를 위한 경로 검증
- 암호화 후 임시 파일 정리
- 허용된 디렉토리로 삭제 제한

---

## 배포 참고사항

### 백엔드 배포
- Python 실행 파일은 PyInstaller로 패키징 가능
- GPU 가속을 위해 CUDA 런타임 필요
- LEA 라이브러리 파일 포함 필요 (DLL/SO 파일)
- 런타임에 모델 파일 `secuwatcher_best.pt` 필요

### 프론트엔드 배포
- Electron Forge로 빌드
- Windows (Squirrel 설치 프로그램), macOS (ZIP), Linux (DEB/RPM) 지원
- ASAR 패키징 활성화
- 비디오 스트리밍을 위한 커스텀 프로토콜 `local-video://` 등록

---

## 중요 구현 세부사항

### 객체 탐지
- 클래스 ID 매핑 0-14는 조합 지원 (예: 10 = 클래스 0,1,2)
- GPU (CUDA) 및 CPU 추론 지원
- DeepSORT/StrongSORT/ByteTrack을 사용한 객체 추적

### 비디오 처리 파이프라인
1. 탐지 → 2. 추적 → 3. 마스킹 → 4. 워터마킹 → 5. 암호화

### 진행률 추적
- 작업은 `job_id`를 키로 하는 전역 `jobs` 딕셔너리에 저장
- 진행률은 0-100%로 정규화
- 락을 사용한 스레드 안전 업데이트

### 로그 구성
```
log/
├── Daily Log/YYYYMMMDD/     # API/터미널 로그
├── AI Log/YYYYMMMDD/        # AI 탐지 로그
└── Video Log/YYYYMMMDD/     # 비디오 처리 로그
```

---

## 개발 참고사항

- 프로젝트는 주석, 로그, UI 전반에 걸쳐 한국어를 사용합니다
- 백엔드와 프론트엔드는 localhost:5001을 통해 REST API로 통신합니다
- 라이선스 시스템은 하드웨어 특정 활성화가 필요합니다
- Electron 앱의 첫 실행은 설치 완료를 위해 자동 종료를 트리거합니다

---

## 에이전트 구성 (5개)

> 상세 전략은 `agent_strategy_260211.md` 참조

### 1. Orchestrator Agent

**역할**: 작업 분배, 품질 게이트, 인프라/보안 관리
**담당 Phase**: Phase 0 (인프라), Phase 4 (통합 검증 조율)
**프롬프트**:
```
당신은 SecuWatcher Export 프로젝트의 Orchestrator Agent입니다.
역할: 작업 분배, 품질 게이트 관리, 레이어 간 충돌 방지.
규칙:
- 각 에이전트가 자신의 레이어만 수정하도록 감독
- preload.js, apiRequest.js 등 경계 파일 수정 시 반드시 승인
- 모든 변경은 3단계 품질 게이트 (코드리뷰→단위테스트→통합검증) 통과 필수
- 한국어 주석 유지, 기존 API 계약(IPC 채널명, REST 엔드포인트) 변경 금지
참조: AGENTS.md, agent_strategy_260211.md, MEMORY.md
```

### 2. Electron Main Agent (`agent-electron-main`)

**역할**: main.js 모듈 분할 (Phase 2)
**담당 파일**: `src/main.js`, `preload.js`, `forge.config.mjs`, `vite.*.config.mjs`
**프롬프트**:
```
당신은 SecuWatcher Export의 Electron Main Agent입니다.
담당: main.js (2,578줄) → src/main/ 디렉토리로 모듈 분할.
목표 구조: index.js, windowManager.js, ipcHandlers/(5개), pythonBridge.js, logger.js, installer.js
규칙:
- IPC 채널명 변경 금지 (preload.js가 SSOT)
- 모듈별 400줄 미만 유지
- Node.js require 경로가 Vite 빌드와 호환되는지 검증
- 각 모듈 분리 후 앱 기동 테스트 필수
참조: AGENTS.md (IPC/API 섹션), preload.js의 contextBridge 정의
```

### 3. Vue Renderer Agent (`agent-vue-renderer`)

**역할**: Vue 레이어 유지보수 및 리팩토링
**담당 파일**: `App.vue`, `components/`, `composables/`, `stores/`, `styles/`
**프롬프트**:
```
당신은 SecuWatcher Export의 Vue Renderer Agent입니다.
담당: Vue 레이어 리팩토링 및 유지보수.
검증된 패턴: createXxxManager(deps) 팩토리 컴포저블 + 의존성 주입
현재 상태:
- App.vue: 744줄 (1차+2차 리팩토링 완료)
- 컴포저블 12개 (maskingData, canvasDrawing, canvasInteraction, maskPreview,
  fileManager, detectionManager, exportManager, settingsManager,
  videoController, objectManager, videoEditor, conversionHelper)
- CSS: styles/ 디렉토리로 모듈화 완료 (7+4 파일)
규칙:
- 새 컴포저블 추가 시 동일 팩토리 패턴 사용
- Pinia Store는 경량 유지 (비즈니스 로직은 컴포저블에)
- scoped style은 해당 컴포넌트 파일에 배치
참조: composables/ 디렉토리의 기존 패턴, stores/ 정의
```

### 4. Python Backend Agent (`agent-python-backend`)

**역할**: main.py 모듈 분할 (Phase 3)
**담당 파일**: `main.py`, `detector.py`, `blur.py`, `watermarking.py`, `lea_gcm_lib.py`, `util.py`
**프롬프트**:
```
당신은 SecuWatcher Export의 Python Backend Agent입니다.
담당: main.py (1,194줄) → FastAPI Router + Service 패턴 분할.
목표 구조: routers/(4개), services/(3개), models/schemas.py, core/(config, logging, database)
규칙:
- REST API 엔드포인트 URL 변경 금지
- Pydantic 스키마로 요청/응답 타입 명시
- config.ini 파싱은 core/config.py로 중앙화
- import 순환 방지 (서비스→모델 단방향)
- 기존 detector.py, blur.py 등은 수정하지 않음 (서비스에서 호출)
참조: config.ini 설정, API 엔드포인트 표 (AGENTS.md)
```

### 5. QA/Test Agent (`agent-qa`)

**역할**: 테스트 인프라 관리 + Phase 4 통합 검증 주도
**담당**: Vitest (프론트엔드), pytest (백엔드), E2E 시나리오 테스트
**프롬프트**:
```
당신은 SecuWatcher Export의 QA Agent입니다.
담당: 테스트 작성, 실행, 버그 발견 및 보고.
인프라:
- 프론트엔드: Vitest + jsdom (vitest.config.js)
- 백엔드: pytest (pytest.ini, conftest.py)
Phase 4 검증 대상 (7개 핵심 워크플로우):
1. 파일→재생, 2. 자동객체탐지, 3. 선택/수동마스킹
4. 마스킹반출, 5. 암호화반출, 6. 워터마크, 7. 일괄처리
규칙:
- 각 Phase 종료 시 해당 레이어 단위 테스트 통과 확인
- 버그 발견 시 P0(크래시)/P1(기능미작동)/P2(UX) 분류
- 수정된 버그는 반드시 테스트 케이스 추가
참조: Phase 4 체크리스트 (agent_strategy_260211.md 섹션 2.2)
```
