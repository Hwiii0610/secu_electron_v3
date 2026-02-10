## Masking & Encryption Backend (FastAPI)

**마스킹 및 암호화 FastAPI 백엔드 프로그램**

YOLO 객체 탐지 기반 마스킹, LEA-GCM 암호화, 워터마크 적용, DRM 메타데이터 관리 기능을 제공하는 FastAPI 서비스입니다.

---

### 🗂️ 프로젝트 구조

```
Masking/
├── main.py               # FastAPI 서버 진입점
├── detector.py           # YOLO 모델 초기화 및 자동/선택 객체 탐지
├── blur.py               # 객체 영역 혹은 전체 프레임 블러/모자이크 처리
├── watermarking.py       # 비디오 워터마크(로고 및 텍스트) 적용
├── lea_gcm_lib.py        # LEA-GCM 암호화/복호화 래퍼
├── config.ini            # 애플리케이션 설정
├── util.py               # 공통 유틸리티 (로그, 시간 변환 등)
├── model/                # YOLO v8 모델 가중치
│   └── secuwatcher_best.pt
├── tracker/              # 객체 추적 설정 (DeepSORT, StrongSORT 등)
│   ├── deepsort.yaml
│   └── strong_sort.yaml
└── requirements.txt      # Python 패키지 의존성
```

---

### ⚙️ 설치 및 실행

1. **가상환경 설정 및 의존성 설치**

   ```bash
   python -m venv venv
   source venv/bin/activate      # Windows: venv\Scripts\activate
   pip install torch==2.3.0+cu118 torchvision==0.18.0+cu118 torchaudio==2.3.0+cu118 --index-url https://download.pytorch.org/whl/cu118 # GPU가속용 CUDA 설치
   pip install -r requirements.txt
   ```

2. **환경 구성**

   * `config.ini`:

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
     enc = ./key/private.pem

     [detect]
     device = gpu            ; gpu 또는 cpu
     multifiledetect = no    ; 다중객체탐지
     threshold = 0.5         ; 탐지 신뢰도
     DetectObj = 5           ; 클래스 매핑 인덱스

     [export]
     MaskingRange = 3        ; 객체 영역 마스킹 범위
     MaskingTool = 1         ; 0=모자이크, 1=블러
     MaskingStrength = 3     ; 모자이크/블러 강도 (1~5)
     WaterMarking = yes      ; 워터마크 적용 여부
     WaterText = Secuwatcher ; 워터마크 텍스트
     WaterTransparency = 80  ; 워터마크 투명도(0~100)
     WaterImgPath = ./assets/logo.png ; 워터마크 이미지 경로
     WaterLocation = 3       ; 워터마크 위치 (1~5)
     Drm = yes               ; 암호화 후 DRM 메타 기록 여부
     play_date = 30          ; 영상 재생 가능 기간
     play_count = 99         ; 영상 재생 가능 횟수
     ```


3. **서버 실행**

   ```bash
   Scripts\activate
   python main.py
   ```

---

### 🔑 주요 종속성

```text
ultralytics==8.3.121       # YOLO v8
opencv-python==4.11.0.86   # 영상 처리
fastapi==0.115.12          # API 서버
uvicorn==0.23.0            # ASGI 서버
pymysql==1.1.1             # MySQL 연동
pycryptodome==3.22.0       # AES 암호화
av==10.0.0                 # PyAV (비디오 입출력)
cryptography==41.0.2       # RSA OAEP
```

---

### 🚀 주요 기능 및 API

#### 1. 객체 탐지 & 마스킹 (`/autodetect`)

* **POST** `/autodetect`

  ```json
  {
    "Event": "1",              // 1=자동 탐지+추적
    "VideoPath": "sample.mp4", // config.ini 기준 상대 경로
    "FrameNo": null,             // Event=2: 지정 프레임
    "Coordinate": null,          // Event=2: (x1,y1,x2,y2)
    "AllMasking": "no"         // Event=3: 전체 프레임 마스킹(yes/no)
  }
  ```

* **Event 값**

  1. 자동 탐지 + 객체 추적
  2. 프레임 & 좌표 선택 탐지
  3. CSV 결과 기반 객체 마스킹 또는 전체 프레임 마스킹
  4. 지정 영역 마스킹(Region Masking)

* **응답**: `job_id` 반환

* **진행률 확인**: **GET** `/progress/{job_id}`

#### 2. 진행 상태 조회 (`/progress/{job_id}`)

* **GET** `/progress/{job_id}`

  ```json
  {
    "progress": 45.0,
    "status": "running"  // running/completed/error
  }
  ```

#### 3. 비디오 암호화 (`/encrypt`)

* **POST** `/encrypt`

  * **Headers**:

    * `Encryption-Key`: RSA-OAEP로 암호화된 대칭키 (Base64)
    * `User-Id`: 요청자 ID
  * **Form Data**:

    * `file`: 마스킹된 비디오 파일명

* **결과**: `.sphereax` 확장자로 암호화 파일 생성, DRM 메타데이터 DB 기록

---

### 📑 사용 예시 (curl)

```bash
# 1) 자동 탐지 + 마스킹 요청
curl -X POST "http://localhost:5001/autodetect" \
  -H 'Content-Type: application/json' \
  -d '{"Event":"1","VideoPath":"test.mp4"}'

# 2) 진행 상태 조회
curl "http://localhost:5001/progress/<job_id>"

# 3) 암호화 요청
curl -X POST "http://localhost:5001/encrypt" \
  -H "Encryption-Key: <Base64RSA>" \
  -H "User-Id: user123" \
  -F file="masked.mp4"
```

---

### 💾 로그 및 DB 업데이트

* 마스킹 완료 시 `tb_export_cctv_list` 업데이트
* 암호화 완료 시 `tb_drm_info`, `tb_drm_meta` 기록
* `util.log_writer`가 일별 로그 파일에 기록

---

### ⚠️ 주의사항

* `VideoPath`는 `config.ini` 기준 상대 경로만 허용
* `Encryption-Key`는 RSA-OAEP 암호화된 대칭키여야 함
* 마스킹/암호화 작업 중 임시 파일 자동 정리

---

**Version**: 1.0.0
**Author**: shjo
