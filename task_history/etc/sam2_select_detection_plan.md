# 선택객체 탐지 — YOLO+DeepSORT → SAM2 교체

## Context
YOLO 오탐으로 일부 프레임에서 비식별 처리가 누락되는 문제를 해결하기 위해, 기존 선택객체 탐지(YOLO+DeepSORT 전체 프레임 추적)를 SAM2 기반 세그멘테이션으로 **완전 교체**합니다.

- **현재**: 클릭 프레임~영상 끝까지 전체 추적 (Event 2 → selectdetector → DeepSORT)
- **변경**: 클릭 프레임 + 5프레임만 추적, 클릭 지점 반경 크롭으로 CPU 리소스 절감
- **기존 JSON 양식** 유지 (type: 2, track_id: "2_N", bbox: [x1,y1,x2,y2])

## 수정 파일 요약

| 파일 | 변경 | 설명 |
|------|------|------|
| `secuwatcher_python/sam2_detector.py` | **신규** | SAM2 탐지 모듈 (핵심) |
| `secuwatcher_python/routers/detection.py` | 수정 | Event 2 핸들러를 SAM2로 교체 (lines 136-141) |
| `secuwatcher_python/detector.py` | 수정 | YOLO lazy loading 전환 (lines 104-123) |
| `secuwatcher_python/main.py` | 수정 | lifespan에서 init_model() 제거 (lines 57-62) |
| `secuwatcher_python/config.ini` | 수정 | `[sam2]` 섹션 추가 |
| 프론트엔드 | **변경 없음** | 기존 API 흐름 그대로 유지 |

---

## 1. 모델 로드 전략 — YOLO/SAM2 배타적 Lazy Loading

### 1-0. 문제점
- **현재**: `main.py` lifespan → `init_model()` → **서버 시작 시 YOLO 즉시 로드**
- CPU/GPU 메모리 제한 환경에서 두 모델 동시 상주 불필요
- 자동객체탐지(Event 1)만 사용할 때 SAM2 불필요, 선택객체탐지(Event 2)만 사용할 때 YOLO 불필요

### 1-0a. `main.py` — lifespan에서 YOLO 사전로드 제거

```python
# 변경 전 (lines 57-62)
try:
    from detector import init_model
    init_model()
except ImportError:
    ...

# 변경 후
# YOLO 모델은 Event 1 호출 시 lazy loading (detector.py 내부에서 처리)
# init_model() 호출 제거
```

### 1-0b. `detector.py` — YOLO lazy loading 전환

```python
# 변경 전 (lines 104-123)
MODEL = None

def init_model():
    global MODEL
    model_path = os.path.join(base_path, 'model', 'secuwatcher_best.pt')
    MODEL = YOLO(model_path)

# 변경 후
MODEL = None
MODEL_LOCK = threading.Lock()

def _get_yolo_model():
    """YOLO 모델 lazy singleton — Event 1 첫 호출 시 로드"""
    global MODEL
    if MODEL is not None:
        return MODEL
    with MODEL_LOCK:
        if MODEL is not None:
            return MODEL
        base_path = sys._MEIPASS if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(base_path, 'model', 'secuwatcher_best.pt')
        MODEL = YOLO(model_path)
        print(f"YOLO 모델 로드 완료: {model_path}")
        return MODEL

# autodetector() 내부: MODEL → _get_yolo_model() 호출로 변경
# selectdetector()는 SAM2로 교체되므로 MODEL 참조 불필요
```

---

## 2. `secuwatcher_python/sam2_detector.py` — 신규 파일

### 2-1. SAM2 모델 싱글톤 (로컬 체크포인트)

**모델 파일**: `secuwatcher_python/model/sam2.1_hiera_base_plus.pt` (YOLO 모델과 동일 위치)
- 원본: `sam2_models/models--facebook--sam2.1-hiera-base-plus/snapshots/.../sam2.1_hiera_base_plus.pt`

**로딩 방식**: `from_pretrained` (HF 다운로드) 대신 `build_sam2_video_predictor` (로컬 경로) 사용
- 참조: `sam2/backend/venv/.../sam2/build_sam.py` lines 100-141

```python
SAM2_MODEL = None
SAM2_LOAD_LOCK = threading.Lock()

def _get_sam2_model():
    global SAM2_MODEL
    if SAM2_MODEL is not None:
        return SAM2_MODEL
    with SAM2_LOAD_LOCK:
        if SAM2_MODEL is not None:
            return SAM2_MODEL
        from sam2.build_sam import build_sam2_video_predictor
        config = configparser.ConfigParser()
        config.read(os.path.join(os.path.dirname(__file__), 'config.ini'))
        ckpt_path = config.get('sam2', 'model_path')
        device = config.get('sam2', 'device')
        SAM2_MODEL = build_sam2_video_predictor(
            config_file="configs/sam2.1/sam2.1_hiera_b+.yaml",  # sam2 패키지 내장 hydra config
            ckpt_path=ckpt_path,
            device=device,
        )
        return SAM2_MODEL
```

### 2-2. 크롭 영역 계산 — 좌표 수학 상세

```python
def _compute_crop_region(click_x, click_y, frame_w, frame_h, crop_size):
    """클릭 지점 중심 crop_size × crop_size, 프레임 경계 클램핑

    반환: (cx1, cy1, cx2, cy2) — 원본 프레임 좌표계
    """
    half = crop_size // 2

    # 1단계: 클릭 중심으로 초기 영역 계산
    cx1 = click_x - half
    cy1 = click_y - half
    cx2 = cx1 + crop_size
    cy2 = cy1 + crop_size

    # 2단계: 경계 초과 시 반대쪽으로 밀어서 crop_size 유지
    if cx1 < 0:
        cx1, cx2 = 0, crop_size
    elif cx2 > frame_w:
        cx2, cx1 = frame_w, frame_w - crop_size

    if cy1 < 0:
        cy1, cy2 = 0, crop_size
    elif cy2 > frame_h:
        cy2, cy1 = frame_h, frame_h - crop_size

    # 3단계: 프레임이 crop_size보다 작은 경우 → 프레임 전체 사용
    if frame_w < crop_size:
        cx1, cx2 = 0, frame_w
    if frame_h < crop_size:
        cy1, cy2 = 0, frame_h

    return (cx1, cy1, cx2, cy2)
```

**에지 케이스 검증:**

| 케이스 | 입력 | 결과 | 비고 |
|--------|------|------|------|
| 일반 | click=(500,400), frame=1920×1080, crop=384 | (308,208,692,592) | 클릭 중앙 |
| 좌상단 | click=(50,30), frame=1920×1080, crop=384 | (0,0,384,384) | 밀어서 유지 |
| 우하단 | click=(1870,1050), frame=1920×1080, crop=384 | (1536,696,1920,1080) | 밀어서 유지 |
| 소형프레임 | click=(160,120), frame=320×240, crop=384 | (0,0,320,240) | 전체 사용 |

### 2-3. 좌표 변환 — 상세 수학

**SAM2 좌표 시스템 확인** (sam2_video_predictor.py lines 212-217):
- `add_new_points_or_box(normalize_coords=True)`: 포인트를 `(video_W, video_H)`로 나누어 정규화
- `video_W`, `video_H` = 입력 JPEG 원본 해상도 = **크롭 이미지 크기**
- 따라서 포인트 좌표는 **크롭 이미지 좌표계** 기준으로 전달

**mask 출력 확인** (sam2_video_predictor.py line 627, `_get_orig_video_res_output`):
- 마스크를 `(video_H, video_W)`로 리사이즈 → 출력 마스크 = **크롭 이미지 해상도**

```python
def _remap_point_to_crop(click_x, click_y, crop_x1, crop_y1):
    """원본 좌표 → 크롭 좌표 (SAM2 입력용)
    클릭이 항상 크롭 영역 내에 있음이 보장됨 (_compute_crop_region 로직상)
    """
    return (click_x - crop_x1, click_y - crop_y1)

def _remap_bbox_to_original(bbox_crop, crop_x1, crop_y1, frame_w, frame_h):
    """크롭 좌표 bbox → 원본 좌표 bbox (결과 변환)
    bbox_crop: [x1, y1, x2, y2] (크롭 좌표계)
    반환: [x1, y1, x2, y2] (원본 좌표계, 프레임 경계 클리핑)
    """
    ox1 = max(0, min(bbox_crop[0] + crop_x1, frame_w))
    oy1 = max(0, min(bbox_crop[1] + crop_y1, frame_h))
    ox2 = max(0, min(bbox_crop[2] + crop_x1, frame_w))
    oy2 = max(0, min(bbox_crop[3] + crop_y1, frame_h))
    return [ox1, oy1, ox2, oy2]
```

**좌표 흐름 다이어그램 (우하단 경계 케이스):**
```
원본 프레임 (1920 × 1080)
  │ click = (1870, 1050)
  ▼
_compute_crop_region → crop = (1536, 696, 1920, 1080)  ← 밀어서 유지
  │
  ▼
_remap_point_to_crop → local = (1870-1536, 1050-696) = (334, 354)
  │ SAM2 입력: point=(334,354), 이미지=(384×384)
  ▼
SAM2 내부: normalize (334/384, 354/384) → scale × image_size → process
  │
  ▼
mask 출력 (384 × 384) → _mask_to_bbox → crop_bbox = [310, 320, 380, 384]
  │                                         ↑ 크롭 경계에 걸림 (y2=384=crop_h)
  ▼
_remap_bbox_to_original → [1846, 1016, 1916, 1080]  ← 원본 좌표
                            + 프레임 경계 클리핑 적용
```

### 2-4. 프레임 추출 — 엣지 케이스 처리

```python
def _extract_crop_frames(video_path, start_frame, crop_region, num_frames=6):
    """start_frame부터 최대 num_frames개 크롭 프레임을 JPEG로 저장

    반환: (temp_dir, actual_count)
    주의: 영상 끝 근처에서 num_frames보다 적은 프레임만 추출될 수 있음
    """
    cx1, cy1, cx2, cy2 = crop_region
    cap = cv2.VideoCapture(video_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    actual_count = min(num_frames, total - start_frame)
    if actual_count <= 0:
        raise ValueError(f"프레임 {start_frame}부터 추출 가능한 프레임 없음")

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    temp_dir = tempfile.mkdtemp(prefix='sam2_frames_')

    for i in range(actual_count):
        ret, frame = cap.read()
        if not ret:
            break
        cropped = frame[cy1:cy2, cx1:cx2]
        cv2.imwrite(os.path.join(temp_dir, f'{i:06d}.jpg'), cropped)

    cap.release()
    return (temp_dir, actual_count)
```

### 2-5. 마스크 → bbox 변환

```python
def _mask_to_bbox(mask_binary):
    """이진 마스크(HxW) → [x1,y1,x2,y2] 또는 None"""
    rows = np.any(mask_binary, axis=1)
    cols = np.any(mask_binary, axis=0)
    if not np.any(rows) or not np.any(cols):
        return None
    y_min, y_max = np.where(rows)[0][[0, -1]]
    x_min, x_max = np.where(cols)[0][[0, -1]]
    return [int(x_min), int(y_min), int(x_max), int(y_max)]
```

### 2-6. JSON 병합 저장

```python
def _write_merged_json(output_file, new_results, metadata):
    """기존 JSON의 autodetect(type:1) 보존하면서 SAM2(type:2) 추가
    기존 _write_incremental_json은 전체 덮어쓰기 → autodetect 손실 위험
    """
    existing = {"schema_version": "1.0.0", "metadata": metadata, "frames": {}}
    if os.path.exists(output_file):
        with open(output_file, 'r', encoding='utf-8') as f:
            existing = json.load(f)

    for entry in new_results:
        fkey = str(entry["frame"])
        if fkey not in existing["frames"]:
            existing["frames"][fkey] = []
        existing["frames"][fkey].append({
            "track_id": entry["track_id"],
            "bbox": entry["bbox"],
            "bbox_type": "rect",
            "score": 1.0,
            "class_id": 0,
            "type": entry["type"],
            "object": entry["object"]
        })

    tmp = output_file + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(existing, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, output_file)
```

### 2-7. Track ID 자동 생성

```python
def _next_select_track_id(output_file):
    """기존 type:2 track_id 최대 번호 + 1 반환 ("2_1" → "2_2" → ...)"""
```

### 2-8. 메인 함수

```python
def selectdetector_sam2(video_path, FrameNo, Coordinate, log_queue, progress_callback=None):
```

**처리 흐름:**
1. 입력 파싱 → 크롭 영역 계산 → `progress(0.05)`
2. 크롭 프레임 추출 → temp 디렉토리 → `progress(0.1)`
3. SAM2 모델 로드 (lazy singleton) → `progress(0.2)`
4. `init_state(temp_dir)` → `add_new_points_or_box(frame=0, point, label=1)` → `progress(0.3)`
5. `propagate_in_video()` → `progress(0.6)`
6. 각 프레임: mask→bbox(크롭)→bbox(원본) → `progress(0.8)`
7. `_write_merged_json()` → `progress(1.0)`
8. `finally`: temp 디렉토리 정리 (`shutil.rmtree`)

**프레임 번호 매핑 (중요):**
- SAM2 내부 인덱스: 0, 1, 2, 3, 4, 5 (temp 디렉토리 내 JPEG 순서)
- 실제 비디오 프레임: start_frame, start_frame+1, ..., start_frame+5
- JSON 저장 시 `entry["frame"] = start_frame + sam2_frame_idx`

**에러**: 마스크 미검출 → 에러 문자열 반환 (기존 패턴)

---

## 3. `secuwatcher_python/routers/detection.py` — Lines 136-141

```python
# 변경 전
elif event_type == "2":
    from detector import selectdetector
    _, conf_thres = get_config(event_type)
    result = selectdetector(video_path_to_process, request_data.FrameNo, request_data.Coordinate,
                            conf_thres, log_queue, ...)

# 변경 후
elif event_type == "2":  # 선택 탐지 (SAM2)
    from sam2_detector import selectdetector_sam2
    result = selectdetector_sam2(
        video_path_to_process, request_data.FrameNo, request_data.Coordinate,
        log_queue, lambda frac: util.update_progress(current_job_id, frac, 0, 100),
    )
```

- `conf_thres` 불필요 (SAM2는 confidence threshold 없음)
- 나머지 (job_id, progress polling, 에러 처리) 모두 동일

---

## 4. `secuwatcher_python/config.ini` — `[sam2]` 섹션 추가

```ini
[sam2]
crop_size = 384
forward_frames = 5
model_path = model/sam2.1_hiera_base_plus.pt
device = cpu
```

- `model_path`: 로컬 체크포인트 경로 (HF 다운로드 아님)
- hydra config `"configs/sam2.1/sam2.1_hiera_b+.yaml"`은 sam2 패키지 내장

---

## 5. 의존성 및 사전 준비

```bash
# 1) sam2 pip 패키지 설치 (venv)
pip install sam2

# 2) 모델 파일 복사 (YOLO 모델과 동일 위치)
cp sam2_models/models--facebook--sam2.1-hiera-base-plus/snapshots/b7320756a13354e7530a63935656d35b2f91a290/sam2.1_hiera_base_plus.pt \
   secuwatcher_python/model/sam2.1_hiera_base_plus.pt

# 3) 프로젝트 루트 sam2/ 디렉토리 리네임 (필수 — pip 패키지 섀도잉 방지)
mv sam2 sam2_demo
```

기존 venv에 `torch`, `numpy`, `tqdm` 이미 설치됨. `sam2` + `hydra-core` + `iopath` 추가.

---

## 6. 데이터 흐름

```
사용자 클릭 (x=1870, y=1050, frame=150)
    ↓
Frontend → POST /api/autodetect {Event:"2", FrameNo:"150", Coordinate:"1870,1050"}
    ↓
detection.py → selectdetector_sam2(video_path, "150", "1870,1050", ...)
    ↓
1. 크롭 계산: (1870,1050) 중심 384×384 → (1536, 696, 1920, 1080) ← 밀어서 유지
2. 프레임 150~155 크롭 추출 → /tmp/sam2_frames_xxxx/
   000000.jpg ~ 000005.jpg (384×384 JPEG)
3. SAM2 모델 로드 (로컬 체크포인트, 싱글톤 캐싱)
4. init_state(temp_dir) → add_point_prompt(frame=0, point=[334,354])
                          ↑ (1870-1536, 1050-696)
5. propagate_in_video() → 6프레임 mask 생성 (384×384)
6. 각 프레임: mask → bbox(크롭) → bbox(원본) + 프레임 경계 클리핑
    ↓
JSON 병합 저장: 기존 autodetect(type:1) 보존 + SAM2(type:2) 추가
   frame 키: "150", "151", ..., "155" (실제 비디오 프레임 번호)
    ↓
Frontend: loadDetectionData → 기존과 동일하게 표시
```

---

## 7. 예상 이슈 및 대응

| # | 이슈 | 심각도 | 대응 |
|---|------|--------|------|
| 7-1 | `sam2/` 디렉토리가 pip 패키지 섀도잉 → `build_sam.py` RuntimeError | **필수** | `sam2/` → `sam2_demo/` 리네임 |
| 7-2 | 프레임이 crop_size보다 작은 영상 (예: 320×240) | 낮음 | 비정방형 크롭 허용, SAM2 내부에서 image_size로 resize하므로 동작 |
| 7-3 | 객체가 크롭 경계를 넘는 경우 | 중간 | bbox가 잘릴 수 있음 → crop_size 키워서 완화 (config.ini로 조절) |
| 7-4 | 영상 끝 근처에서 6프레임 미만 추출 | 낮음 | `actual_count = min(num_frames, total - start_frame)` |
| 7-5 | 프레임 번호 매핑 오류 | **주의** | SAM2 인덱스(0~5) → 실제 프레임(start+0 ~ start+5), JSON에 실제 번호 사용 |
| 7-6 | `init_state` 호출 시 이전 상태 잔류 | 중간 | 매 호출마다 새 `init_state` → 새 inference_state 반환, 모델 자체는 stateless |
| 7-7 | 자동탐지 중 선택탐지 실행 → JSON 동시쓰기 | 중간 | `_write_merged_json` atomic write (`tmp → os.replace`), 프론트엔드에서 순차 실행 보장 |
| 7-8 | YOLO+SAM2 동시 메모리 점유 | 중간 | 각각 lazy singleton, 필요시만 로드. 서버 시작 시 모델 미로드 |

---

## 8. 검증 방법

1. 모델 파일 확인: `ls secuwatcher_python/model/sam2.1_hiera_base_plus.pt`
2. `import sam2` 정상 확인 (pip 패키지, sam2/ 디렉토리 섀도잉 아닌지)
3. FastAPI 서버 시작 → YOLO 미로드 확인 (콘솔에 "YOLO 모델 로드" 출력 없음)
4. 자동 객체 탐지 (Event 1) → 이때 YOLO lazy 로드됨 확인
5. 선택객체탐지 → 누락 객체 클릭 → SAM2 로드 + 6프레임 탐지
6. 진행률 → 완료 후 6프레임에 바운딩박스 표시 확인
7. JSON 파일: `type:1` 보존 + `type:2` 6프레임 추가 확인
8. 미리보기 모드에서 마스킹 적용 확인
9. 배경 클릭 → 에러 메시지 정상 반환
10. 영상 끝 근처 클릭 → 6프레임 미만 정상 처리

---

## 작성일
2026-02-12
