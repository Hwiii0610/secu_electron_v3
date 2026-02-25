SAM2 세그멘테이션 기반 마스킹 — 개발계획
Context
현재 마스킹 반출(Event 3)은 bbox(사각형) 영역에 블러/모자이크를 적용합니다.
객체 윤곽을 따라 정밀하게 마스킹하기 위해, SAM2 Video Predictor로 세그멘테이션 마스크를 생성하고
해당 마스크 영역에만 블러를 적용하도록 변경합니다.

핵심 원리: 기존 탐지 파이프라인(YOLO/SAM2)은 변경하지 않고,
마스킹 반출 시점(Event 3)에서 저장된 bbox를 SAM2 box prompt로 사용 → 세그멘테이션 마스크 생성 → 마스크 영역만 블러 적용.

수정 파일 요약
파일	변경	설명
secuwatcher_python/sam2_masking.py	신규	SAM2 세그멘테이션 마스크 생성 모듈
secuwatcher_python/blur.py	수정	세그멘테이션 마스크 활용 블러 적용
secuwatcher_python/config.ini	수정	[sam2] 섹션에 segmentation_masking 옵션 추가
프론트엔드	변경 없음	기존 API 흐름 유지
1. 처리 흐름 개요

[Event 3: 마스킹 반출 요청]
    │
    ▼
blur.py: output_masking() 호출
    │
    ├─ config.ini segmentation_masking = yes?
    │      │
    │      ├─ YES → sam2_masking.generate_segmentation_masks()
    │      │         │
    │      │         ├─ 1단계: 비디오 프레임 JPEG 추출 (청크 단위)
    │      │         ├─ 2단계: track_id별 첫 프레임 bbox → SAM2 box prompt
    │      │         ├─ 3단계: propagate_in_video() → 프레임별 세그멘테이션 마스크
    │      │         └─ 반환: {frame_idx: {obj_id: binary_mask(HxW)}}
    │      │
    │      └─ NO → 기존 bbox 방식 유지
    │
    ▼
프레임별 블러 적용 루프
    │
    ├─ 세그멘테이션 마스크 있는 객체 → 마스크 영역만 블러
    └─ 세그멘테이션 마스크 없는 객체 → 기존 bbox 블러 (폴백)
        (수동마스킹 type:3, 영역마스킹 type:4 등)
2. sam2_masking.py — 신규 모듈
2-1. 함수 시그니처

def generate_segmentation_masks(
    video_path: str,
    frame_map: dict,           # blur.py의 _load_mask_data_json() 반환값
    masking_range: str,        # '2'=selected, '3'=unselected
    log_queue: list,
    progress_callback=None,    # 0.0~1.0
    chunk_size: int = 300,     # 청크당 프레임 수 (메모리 관리)
) -> dict:
    """
    반환: {frame_idx: {track_id: np.ndarray(H,W, dtype=uint8, 0 or 255)}}
    세그멘테이션 대상이 아닌 프레임/객체는 dict에 포함하지 않음
    """
2-2. 내부 처리 흐름
Step 1: 대상 객체 필터링


# masking_range에 따라 마스킹 대상 필터링
# '2' (selected): object != 2 인 객체
# '3' (unselected): object == 2 인 객체
# type 1(자동) 또는 type 2(선택)만 SAM2 세그멘테이션 대상
# type 3(수동), type 4(영역)은 SAM2 불필요 → 스킵
Step 2: track_id별 그룹핑


tracks = {}  # {track_id: {"first_frame": int, "first_bbox": [x1,y1,x2,y2], "frames": set()}}
for frame_idx, logs in frame_map.items():
    for log in logs:
        if not is_target(log, masking_range):
            continue
        if log['type'] not in (1, 2):  # 자동/선택 탐지만
            continue
        tid = log['track_id']
        if tid not in tracks:
            tracks[tid] = {"first_frame": frame_idx, "first_bbox": log['bbox'], "frames": set()}
        tracks[tid]["frames"].add(frame_idx)
Step 3: 청크 단위 처리


# 전체 비디오를 chunk_size 프레임 단위로 분할
# 각 청크:
#   1) 해당 프레임 범위를 JPEG 추출 → temp_dir
#   2) SAM2 init_state(temp_dir)
#   3) 이 청크에 first_frame이 있는 track들에 대해 add_new_points_or_box(box=bbox)
#   4) propagate_in_video() → 마스크 수집
#   5) temp_dir 정리
Step 4: 마스크 수집


seg_masks = {}  # {frame_idx: {track_id: binary_mask}}
for frame_idx, obj_ids, masks in predictor.propagate_in_video(state):
    actual_frame = chunk_start + frame_idx
    seg_masks[actual_frame] = {}
    for i, obj_id in enumerate(obj_ids):
        mask = masks[i].squeeze(0)
        binary = (mask > 0).byte().cpu().numpy() * 255
        seg_masks[actual_frame][track_id_map[obj_id]] = binary
2-3. 청크 처리 상세

비디오: 900 프레임, chunk_size=300
  ├─ 청크 0: 프레임 0~299   → JPEG 추출 → SAM2 처리 → 마스크 수집 → 정리
  ├─ 청크 1: 프레임 300~599 → JPEG 추출 → SAM2 처리 → 마스크 수집 → 정리
  └─ 청크 2: 프레임 600~899 → JPEG 추출 → SAM2 처리 → 마스크 수집 → 정리
청크 간 객체 연속성 처리:

청크 0에서 시작된 track이 청크 1에도 존재하는 경우
청크 1의 첫 프레임에서 해당 track의 bbox를 다시 box prompt로 제공
SAM2가 새 청크에서 독립적으로 세그멘테이션 (약간의 불연속 가능하나 실용적)
2-4. 메모리/디스크 관리
항목	1080p 기준	관리 방법
JPEG 추출	~200KB/프레임 × 300 = 60MB	청크 완료 후 즉시 삭제
SAM2 추론	~2GB (모델) + 1GB (상태)	싱글톤 모델, 청크별 상태 해제
마스크 저장	~2MB/프레임 × 900 = 1.8GB	압축: RLE 또는 contour로 축소
마스크 메모리 최적화:


# 방법 1: 프레임 처리 직전에만 마스크 유지 (streaming)
# 방법 2: contour로 변환하여 저장 (polygon 형태)
# 방법 3: RLE 인코딩 (pycocotools 스타일)
# → 추천: 방법 2 (contour) — blur.py의 기존 polygon 처리 로직과 호환
Contour 변환:


def _mask_to_contours(binary_mask):
    """이진 마스크 → 외곽선 polygon 리스트 (blur.py polygon 형식과 호환)"""
    contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    # 가장 큰 contour만 사용 (주 객체)
    if not contours:
        return None
    largest = max(contours, key=cv2.contourArea)
    return largest.reshape(-1, 2).tolist()  # [[x1,y1], [x2,y2], ...]
이렇게 하면 마스크를 polygon으로 변환하여 저장 → blur.py의 기존 polygon 블러 로직을 그대로 재사용 가능.

3. blur.py 수정
3-1. output_masking() 수정 (lines 371-448)

def output_masking(video_path, MaskingRange, MaskingTool, MaskingStrength, log_queue, progress_callback=None):
    # ... 기존 코드: 데이터 로드, 출력 경로 생성 ...

    # ── 신규: 세그멘테이션 마스킹 옵션 확인 ──
    use_segmentation = _should_use_segmentation()  # config.ini [sam2] segmentation_masking

    seg_masks = {}
    if use_segmentation and frame_map:
        from sam2_masking import generate_segmentation_masks
        seg_masks = generate_segmentation_masks(
            video_path, frame_map, MaskingRange, log_queue,
            progress_callback=lambda frac: progress_callback(frac * 0.5) if progress_callback else None,
            # SAM2 세그멘테이션: 진행률 0~50%
        )

    # ... 프레임별 블러 루프 (진행률 50~100%) ...
    for frame_idx in range(total_frames):
        # ...
        out_bgr = _process_frame_with_logs(
            bgr, logs, MaskingRange, MaskingTool, MaskingStrength,
            seg_masks=seg_masks.get(frame_idx, {})  # ← 신규 파라미터
        )
3-2. _process_frame_with_logs() 수정 (lines 254-368)
기존 apply_roi_effect() 내부에서 세그멘테이션 마스크 우선 사용:


def _process_frame_with_logs(frame_bgr, logs_for_frame, MaskingRange, MaskingTool,
                              MaskingStrength, seg_masks=None):
    # ...
    def apply_roi_effect(bbox, track_id=None):
        # ── 세그멘테이션 마스크 확인 ──
        if seg_masks and track_id and track_id in seg_masks:
            seg_polygon = seg_masks[track_id]  # [[x1,y1], [x2,y2], ...]
            # 기존 polygon 블러 로직 재사용
            pts = np.array(seg_polygon, dtype=np.int32)
            x0, y0 = pts.min(axis=0)
            x1, y1 = pts.max(axis=0) + 1
            # ... 기존 polygon ROI 추출 + 마스크 블러 적용 ...
            return

        # ── 폴백: 기존 bbox 블러 ──
        # ... 기존 rect/polygon 로직 그대로 유지 ...
3-3. MaskingRange='1' (배경 마스킹) 처리
배경 마스킹 모드에서는 전체 프레임 블러 후 선택 객체 영역을 원본으로 복원합니다.
세그멘테이션 사용 시 복원 영역도 세그멘테이션 마스크 기반으로 변경:


# MaskingRange == '1': 배경 블러
effected_full = _apply_effect_roi(frame_bgr.copy(), MaskingTool, lvl)
out = effected_full.copy()

for log in selected_objects:
    tid = log['track_id']
    if seg_masks and tid in seg_masks:
        # 세그멘테이션 마스크 영역만 원본으로 복원
        polygon = np.array(seg_masks[tid], dtype=np.int32)
        mask = np.zeros(frame_bgr.shape[:2], dtype=np.uint8)
        cv2.fillPoly(mask, [polygon], 255)
        out[mask == 255] = frame_bgr[mask == 255]
    else:
        # 기존 bbox 복원 로직
        ...
4. config.ini 수정

[sam2]
crop_size = 384
forward_frames = 15
model_path = model/sam2.1_hiera_base_plus.pt
device = cpu
segmentation_masking = no     # yes: 마스킹 반출 시 세그멘테이션 사용, no: bbox 사용
chunk_size = 300              # 청크당 프레임 수 (메모리 관리)
5. 진행률 분배

Event 3 전체 진행률 (0~100%)
│
├─ segmentation_masking = yes:
│   ├─ SAM2 세그멘테이션 마스크 생성: 0~50%
│   │   ├─ 청크 0: 0~16%
│   │   ├─ 청크 1: 16~33%
│   │   └─ 청크 2: 33~50%
│   └─ 블러 적용 + 비디오 인코딩: 50~100%
│
└─ segmentation_masking = no:
    └─ 기존 블러 적용: 0~100% (변경 없음)
6. SAM2 모델 재사용
sam2_detector.py의 _get_sam2_model() 싱글톤을 sam2_masking.py에서도 재사용:


# sam2_masking.py
from sam2_detector import _get_sam2_model

def generate_segmentation_masks(...):
    predictor = _get_sam2_model()  # 기존 싱글톤 재사용
    # ...
7. 예상 성능
시나리오	bbox 마스킹 (현재)	세그멘테이션 마스킹 (신규)
30초 영상, 900프레임, 5객체	~30초	~90초 (SAM2 60초 + 블러 30초)
1분 영상, 1800프레임, 10객체	~60초	~180초
장점	빠름	객체 윤곽 정밀 마스킹
CPU vs GPU:

CPU: ~0.07초/프레임 (SAM2 전파)
MPS (Apple Silicon): ~0.03초/프레임
CUDA: ~0.02초/프레임
8. 엣지 케이스 및 폴백
#	케이스	처리
1	type:3 수동마스킹 / type:4 영역마스킹	SAM2 세그멘테이션 스킵, 기존 bbox/polygon 블러
2	SAM2 마스크 미검출 (빈 마스크)	bbox 폴백
3	청크 경계에서 객체 불연속	다음 청크 첫 프레임에서 bbox 재프롬프트
4	SAM2 모델 로드 실패	bbox 폴백 + 경고 로그
5	프레임 수 < chunk_size	단일 청크로 처리
6	탐지 데이터 없음	기존 동작 (패스스루)
9. 구현 순서
sam2_masking.py 신규 작성 (핵심 모듈)
blur.py output_masking() 수정 — SAM2 마스크 생성 호출
blur.py _process_frame_with_logs() 수정 — 마스크 기반 블러 적용
config.ini [sam2] 섹션에 옵션 추가
테스트: segmentation_masking=yes로 마스킹 반출 → 윤곽 정밀 블러 확인
테스트: segmentation_masking=no → 기존 bbox 블러 정상 동작 확인
10. 검증 방법
정밀도 확인: 마스킹된 영상에서 객체 윤곽 외부가 블러되지 않았는지 확인
폴백 확인: type:3/4 객체가 기존 방식으로 정상 마스킹되는지 확인
성능 측정: 30초 1080p 영상 기준 처리 시간 비교 (bbox vs segmentation)
메모리 확인: 청크 처리 시 temp 디렉토리가 정리되는지 확인
설정 확인: segmentation_masking=no 시 기존 동작 100% 동일한지 확인