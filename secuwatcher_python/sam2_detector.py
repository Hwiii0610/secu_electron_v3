"""
SAM2 기반 선택객체 탐지 모듈
- YOLO+DeepSORT 기반 selectdetector를 대체
- 클릭 프레임 + forward_frames 만 추적 (CPU 리소스 절감)
- 클릭 지점 반경 크롭으로 SAM2 입력 최소화
"""
import os
import sys
import json
import tempfile
import shutil
import threading
import configparser
import time
from collections import deque
from typing import Optional, Callable

import cv2
import numpy as np
import torch

from util import logLine, timeToStr, get_log_dir

# ─── 설정 ──────────────────────────────────────────────────────────────
_config = configparser.ConfigParser(allow_no_value=True)
_config.read(os.path.join(os.path.dirname(__file__), 'config.ini'), encoding='utf-8')

# ─── SAM2 모델 싱글톤 (Lazy Loading) ──────────────────────────────────
SAM2_MODEL = None
_SAM2_LOCK = threading.Lock()


def _get_sam2_model():
    """SAM2VideoPredictor lazy singleton — 첫 호출 시 로컬 체크포인트에서 로드"""
    global SAM2_MODEL
    if SAM2_MODEL is not None:
        return SAM2_MODEL
    with _SAM2_LOCK:
        if SAM2_MODEL is not None:
            return SAM2_MODEL
        from sam2.build_sam import build_sam2_video_predictor
        ckpt_path = _config.get('sam2', 'model_path', fallback='model/sam2.1_hiera_base_plus.pt')
        device = _config.get('sam2', 'device', fallback='cpu')
        base_path = sys._MEIPASS if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
        full_ckpt = os.path.join(base_path, ckpt_path)
        print(f"SAM2 모델 로드 시작: {full_ckpt} (device={device})")
        SAM2_MODEL = build_sam2_video_predictor(
            config_file="configs/sam2.1/sam2.1_hiera_b+.yaml",
            ckpt_path=full_ckpt,
            device=device,
        )
        print("SAM2 모델 로드 완료")
        return SAM2_MODEL


# ─── 크롭 영역 계산 ───────────────────────────────────────────────────

def _compute_crop_region(click_x, click_y, frame_w, frame_h, crop_size):
    """클릭 지점 중심 crop_size × crop_size, 프레임 경계 클램핑

    경계 초과 시 반대쪽으로 밀어서 crop_size 유지.
    프레임이 crop_size보다 작으면 프레임 전체 사용.
    반환: (cx1, cy1, cx2, cy2) — 원본 프레임 좌표계
    """
    half = crop_size // 2

    cx1 = click_x - half
    cy1 = click_y - half
    cx2 = cx1 + crop_size
    cy2 = cy1 + crop_size

    # 경계 초과 시 밀어서 crop_size 유지
    if cx1 < 0:
        cx1, cx2 = 0, crop_size
    elif cx2 > frame_w:
        cx2, cx1 = frame_w, frame_w - crop_size

    if cy1 < 0:
        cy1, cy2 = 0, crop_size
    elif cy2 > frame_h:
        cy2, cy1 = frame_h, frame_h - crop_size

    # 프레임이 crop_size보다 작은 경우 → 프레임 전체 사용
    if frame_w < crop_size:
        cx1, cx2 = 0, frame_w
    if frame_h < crop_size:
        cy1, cy2 = 0, frame_h

    return (cx1, cy1, cx2, cy2)


# ─── 프레임 추출 ──────────────────────────────────────────────────────

def _extract_crop_frames(video_path, start_frame, crop_region, num_frames=6):
    """start_frame부터 최대 num_frames개 크롭 프레임을 JPEG로 저장

    SAM2VideoPredictor는 JPEG 디렉토리 필요 (000000.jpg, 000001.jpg, ...)
    반환: (temp_dir, actual_count)
    """
    cx1, cy1, cx2, cy2 = crop_region
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise IOError(f"비디오 파일을 열 수 없습니다: {video_path}")

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    actual_count = min(num_frames, max(total - start_frame, 0))
    if actual_count <= 0:
        cap.release()
        raise ValueError(f"프레임 {start_frame}부터 추출 가능한 프레임 없음 (total={total})")

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    temp_dir = tempfile.mkdtemp(prefix='sam2_frames_')
    extracted = 0

    for i in range(actual_count):
        ret, frame = cap.read()
        if not ret:
            break
        cropped = frame[cy1:cy2, cx1:cx2]
        cv2.imwrite(os.path.join(temp_dir, f'{i:06d}.jpg'), cropped)
        extracted += 1

    cap.release()

    if extracted == 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise ValueError("프레임 추출 실패: 읽을 수 있는 프레임 없음")

    return (temp_dir, extracted)


# ─── 좌표 변환 ────────────────────────────────────────────────────────

def _remap_point_to_crop(click_x, click_y, crop_x1, crop_y1):
    """원본 좌표 → 크롭 좌표 (SAM2 포인트 입력용)"""
    return (click_x - crop_x1, click_y - crop_y1)


def _remap_bbox_to_original(bbox_crop, crop_x1, crop_y1, frame_w, frame_h):
    """크롭 좌표 bbox → 원본 좌표 bbox + 프레임 경계 클리핑

    bbox_crop: [x1, y1, x2, y2] (크롭 좌표계)
    반환: [x1, y1, x2, y2] (원본 좌표계)
    """
    ox1 = max(0, min(bbox_crop[0] + crop_x1, frame_w))
    oy1 = max(0, min(bbox_crop[1] + crop_y1, frame_h))
    ox2 = max(0, min(bbox_crop[2] + crop_x1, frame_w))
    oy2 = max(0, min(bbox_crop[3] + crop_y1, frame_h))
    return [ox1, oy1, ox2, oy2]


# ─── 마스크 → bbox ────────────────────────────────────────────────────

def _mask_to_bbox(mask_binary):
    """이진 마스크(HxW) → [x1,y1,x2,y2] 또는 None"""
    rows = np.any(mask_binary, axis=1)
    cols = np.any(mask_binary, axis=0)
    if not np.any(rows) or not np.any(cols):
        return None
    y_min, y_max = np.where(rows)[0][[0, -1]]
    x_min, x_max = np.where(cols)[0][[0, -1]]
    return [int(x_min), int(y_min), int(x_max), int(y_max)]


# ─── Track ID 자동 생성 ───────────────────────────────────────────────

def _next_select_track_id(output_file):
    """기존 type:2 track_id 최대 번호 + 1 반환 ("2_1" → "2_2" → ...)"""
    max_num = 0
    if os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for fkey, entries in data.get("frames", {}).items():
                for entry in entries:
                    tid = entry.get("track_id", "")
                    if isinstance(tid, str) and tid.startswith("2_"):
                        try:
                            num = int(tid.split("_")[1])
                            max_num = max(max_num, num)
                        except (ValueError, IndexError):
                            pass
        except (json.JSONDecodeError, IOError):
            pass
    return f"2_{max_num + 1}"


# ─── JSON 병합 저장 ───────────────────────────────────────────────────

def _write_merged_json(output_file, new_results, metadata):
    """기존 JSON의 autodetect(type:1) 보존하면서 SAM2(type:2) 추가"""
    existing = {"schema_version": "1.0.0", "metadata": metadata, "frames": {}}
    if os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                existing = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass

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


# ─── 메인 함수 ────────────────────────────────────────────────────────

def selectdetector_sam2(video_path, FrameNo, Coordinate, log_queue, progress_callback=None):
    """SAM2 기반 선택객체 탐지

    Args:
        video_path: 비디오 파일 경로
        FrameNo: 클릭 프레임 번호 (문자열)
        Coordinate: 클릭 좌표 ("x,y" 문자열)
        log_queue: 로그 deque
        progress_callback: 진행률 콜백 (0.0~1.0)

    Returns:
        성공 시 output_file 경로, 실패 시 에러 문자열
    """
    ai_dir = get_log_dir('AI Log')
    log_file_path = os.path.join(ai_dir, f"sam2_detector.{timeToStr(time.time(), 'file')[-6:]}.log")

    def _log(msg):
        try:
            ll = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=msg)
            if isinstance(log_queue, deque):
                log_queue.append(ll)
            else:
                print(msg)
        except Exception:
            print(msg)

    def _progress(frac):
        if progress_callback:
            try:
                progress_callback(frac)
            except Exception:
                pass

    temp_dir = None
    try:
        # ─── 1. 입력 파싱 ──────────────────────────────────────
        coord_parts = Coordinate.split(',')
        click_x = int(coord_parts[0].strip())
        click_y = int(coord_parts[1].strip())
        start_frame = int(FrameNo)

        crop_size = _config.getint('sam2', 'crop_size', fallback=384)
        forward_frames = _config.getint('sam2', 'forward_frames', fallback=5)
        num_frames = forward_frames + 1  # 현재 프레임 + forward 프레임

        output_file = os.path.splitext(video_path)[0] + ".json"

        _log(f"selectdetector_sam2 시작: video={video_path}, frame={start_frame}, click=({click_x},{click_y}), crop={crop_size}, frames={num_frames}")

        # 비디오 정보 읽기
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return f"비디오 파일을 열 수 없습니다: {video_path}"
        frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        video_fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()

        # 크롭 영역 계산
        crop_region = _compute_crop_region(click_x, click_y, frame_w, frame_h, crop_size)
        cx1, cy1, cx2, cy2 = crop_region
        _log(f"크롭 영역: ({cx1},{cy1})-({cx2},{cy2}), 크기: {cx2-cx1}x{cy2-cy1}")
        _progress(0.05)

        # ─── 2. 크롭 프레임 추출 ──────────────────────────────
        temp_dir, extracted = _extract_crop_frames(video_path, start_frame, crop_region, num_frames)
        _log(f"크롭 프레임 추출: {extracted}개 → {temp_dir}")
        _progress(0.1)

        # ─── 3. SAM2 모델 로드 ────────────────────────────────
        predictor = _get_sam2_model()
        _progress(0.2)

        # ─── 4. 추론 상태 초기화 + 포인트 프롬프트 ────────────
        inference_state = predictor.init_state(
            video_path=temp_dir,
            async_loading_frames=False,
        )

        local_x, local_y = _remap_point_to_crop(click_x, click_y, cx1, cy1)
        _log(f"SAM2 포인트: local=({local_x},{local_y})")

        predictor.add_new_points_or_box(
            inference_state=inference_state,
            frame_idx=0,
            obj_id=1,
            points=np.array([[local_x, local_y]], dtype=np.float32),
            labels=np.array([1], dtype=np.int32),
        )
        _progress(0.3)

        # ─── 5. 비디오 전파 ───────────────────────────────────
        video_segments = {}
        for out_frame_idx, out_obj_ids, out_mask_logits in predictor.propagate_in_video(inference_state):
            if 1 in out_obj_ids:
                mask_idx = list(out_obj_ids).index(1)
                mask = out_mask_logits[mask_idx]
                mask_squeezed = mask.squeeze(0)
                mask_binary = (mask_squeezed > 0).byte().cpu().numpy()
                video_segments[out_frame_idx] = mask_binary

        _log(f"SAM2 전파 완료: {len(video_segments)}개 프레임 마스크 생성")
        _progress(0.6)

        # ─── 6. mask → bbox → 원본 좌표 변환 ─────────────────
        track_id = _next_select_track_id(output_file)
        tracking_results = []
        detected_count = 0

        for sam2_idx in range(extracted):
            if sam2_idx not in video_segments:
                continue

            mask_binary = video_segments[sam2_idx]
            crop_bbox = _mask_to_bbox(mask_binary)
            if crop_bbox is None:
                _log(f"프레임 {start_frame + sam2_idx}: 마스크 미검출 (빈 마스크)")
                continue

            orig_bbox = _remap_bbox_to_original(crop_bbox, cx1, cy1, frame_w, frame_h)
            actual_frame = start_frame + sam2_idx

            tracking_results.append({
                "frame": actual_frame,
                "track_id": track_id,
                "bbox": orig_bbox,
                "type": 2,
                "object": 1,
            })
            detected_count += 1

        _log(f"bbox 변환 완료: {detected_count}/{extracted} 프레임 검출")
        _progress(0.8)

        if detected_count == 0:
            _log("에러: 모든 프레임에서 객체 미검출")
            return "선택한 위치에서 객체를 찾을 수 없습니다."

        # ─── 7. JSON 병합 저장 ────────────────────────────────
        metadata = {
            "video_file": os.path.basename(video_path),
            "video_width": frame_w,
            "video_height": frame_h,
            "video_fps": video_fps,
        }
        _write_merged_json(output_file, tracking_results, metadata)
        _log(f"JSON 병합 저장 완료: {output_file} (track_id={track_id}, {detected_count}프레임)")
        _progress(1.0)

        return output_file

    except (ValueError, IndexError) as e:
        err = f"입력 파라미터 오류: {e}"
        _log(err)
        return err
    except Exception as e:
        err = f"SAM2 탐지 오류: {e}"
        _log(err)
        import traceback
        _log(traceback.format_exc())
        return err
    finally:
        # temp 디렉토리 정리
        if temp_dir and os.path.isdir(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
