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
├── secuwatcher_python/          # Python FastAPI 백엔드
│   ├── main.py                  # FastAPI 서버 진입점
│   ├── detector.py              # YOLO 모델 및 객체 탐지
│   ├── blur.py                  # 비디오 마스킹/블러
│   ├── watermarking.py          # 비디오 워터마킹
│   ├── lea_gcm_lib.py           # LEA-GCM 암호화 래퍼
│   ├── util.py                  # 공통 유틸리티 (로그, 시간)
│   ├── config.ini               # 애플리케이션 설정
│   ├── requirements.txt         # Python 의존성
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
    └── src/
        ├── main.js              # Electron 메인 프로세스
        ├── preload.js           # 프리로드 스크립트 (IPC 브릿지)
        ├── renderer.js          # Vue 앱 진입점
        ├── App.vue              # 메인 Vue 컴포넌트
        ├── apiRequest.js        # Axios API 클라이언트
        ├── dirConfig.json       # 디렉토리 경로 설정
        ├── export.css           # 반출 페이지 스타일
        ├── index.css            # 메인 스타일
        ├── components/          # Vue 컴포넌트
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

**참고**: 현재 이 프로젝트에는 자동화된 테스트 스위트가 설정되어 있지 않습니다.

### 수동 테스트

1. **백엔드 테스트**:
   ```bash
   # autodetect 엔드포인트 테스트
   curl -X POST "http://localhost:5001/autodetect" \
     -H 'Content-Type: application/json' \
     -d '{"Event":"1","VideoPath":"test.mp4"}'
   
   # 진행률 확인
   curl "http://localhost:5001/progress/{job_id}"
   ```

2. **프론트엔드 테스트**:
   - 개발을 위해 `npm run start` 실행
   - 비디오 로딩, 탐지, 마스킹 플로우 테스트
   - 첫 실행 시 라이선스 검증 확인

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
