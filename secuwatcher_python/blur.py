import os
import cv2
import av
import ast
import json
import numpy as np
import pandas as pd
import configparser
from util import get_resource_path

print("[DEBUG] blur.py 실제 경로:", __file__)

def load_path_config():
    """config.ini 에서 마스킹 결과 저장 경로를 읽어옴."""
    cfg_path = get_resource_path('config.ini')
    config = configparser.ConfigParser()
    config.read(cfg_path, encoding='utf-8')

    # [path] 섹션 내보내기 경로
    out_dir = config.get('path', 'video_masking_path', fallback='')
    if not out_dir:
        # fallback: 데스크탑
        out_dir = os.path.join(os.path.expanduser('~'), 'Desktop')
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir, exist_ok=True)
    return out_dir


# ---------------------------
# CSV 로더 & 좌표 파서
# ---------------------------
def _find_csv_for_video(video_path: str):
    """
    입력 mp4 옆(같은 폴더)에 있는 CSV를 우선적으로 찾는다.
    일반적으로 {원본영상명}.csv 또는 {원본영상명}_filtered.csv 같은 관례를 고려.
    """
    # print(video_path, "csv 파일 경로(video_path 값)")
    base, _ = os.path.splitext(video_path)
    # print(base, "video_path의 base 값")
    candidates = [
        base + '.csv',
        base + '_filtered.csv',
        base + '_mask.csv',
        base + '_detected.csv',
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    # 폴더 내 동일 이름 검색(대소문자 보정)
    folder = os.path.dirname(video_path)
    name = os.path.basename(base).lower()
    for fn in os.listdir(folder):
        if fn.lower().startswith(name) and fn.lower().endswith('.csv'):
            return os.path.join(folder, fn)
    return None


def _load_mask_logs(csv_path: str):
    """
    CSV에서 프레임별 마스킹 로그를 읽어온다.
    기대 컬럼: frame, track_id, bbox(JSON), score, class_id, type, object
    """
    # print(csv_path, "csv_path 변수 값")
    df = pd.read_csv(csv_path)
    # 컬럼 이름 soft mapping
    colmap = {c.lower(): c for c in df.columns}
    # print(colmap,"colmap 값")
    def pick(*names):
        for n in names:
            if n in colmap: 
                print(colmap[n],"colmap[n] 값")
                return colmap[n]
        return None

    c_frame   = pick('frame')
    c_tid     = pick('track_id', 'trackid', 'tid')
    c_bbox    = pick('bbox', 'box', 'polygon')
    c_obj     = pick('object', 'obj')
    c_type    = pick('type')

    # print(c_frame,c_tid,c_bbox,c_obj,c_type,"pick으로 선택한 column들")
    
    if not (c_frame and c_tid and c_bbox):
        raise ValueError('CSV에 frame/track_id/bbox 컬럼이 필요합니다.')

    logs = []
    for _, row in df.iterrows():
        try:
            frame = int(row[c_frame])
            track = str(row[c_tid])
            bbox_raw = row[c_bbox]

            # bbox가 문자열 JSON일 수 있음: [x0,y0,x1,y1] 또는 [[x1,y1],[x2,y2],...]
            if isinstance(bbox_raw, str):
                try:
                    bbox = json.loads(bbox_raw)
                except Exception:
                    bbox = ast.literal_eval(bbox_raw)
            else:
                bbox = bbox_raw

            obj = None
            if c_obj and pd.notna(row[c_obj]):
                try:
                    obj = int(row[c_obj])
                except Exception:
                    obj = None

            t = None
            if c_type and pd.notna(row[c_type]):
                try:
                    t = int(row[c_type])
                except Exception:
                    t = None

            logs.append({
                'frame': frame,
                'track_id': track,
                'bbox': bbox,
                'object': obj,    # 1: 지정, 2: 미지정 (프론트 규칙)
                'type': t,        # 3: 수동, 4: 영역마스킹 (참고용)
            })
        except Exception:
            # 라인 파싱 실패는 무시
            continue

    # 프레임별로 묶음
    frame_map = {}
    for item in logs:
        frame_map.setdefault(item['frame'], []).append(item)
    return frame_map


# ---------------------------
# 효과 계산 (프론트 규칙 이식)
# ---------------------------
def _apply_mosaic_roi(roi_bgr: np.ndarray, lvl: int, s: float = 1.0) -> np.ndarray:
    """
    강도(lvl)가 커질수록 더 거칠게 보이도록 스케일을 단조증가로 매핑.
    다운스케일은 INTER_AREA(평균화) / 업스케일은 NEAREST(블록 유지).
    s는 서명 유지용 파라미터로 사용 안 함.
    """
    h, w = roi_bgr.shape[:2]

    # 강도 → 축소비율: blur와 동일한 기준(lvl*2+10)을 사용해 일관성 유지
    # 값이 커질수록 small 크기가 작아져 모자이크가 강해짐
    scale = max(1, int(lvl * 2 + 10))

    small_w = max(1, w // scale)
    small_h = max(1, h // scale)

    # 평균화가 되는 보간으로 다운스케일
    small = cv2.resize(roi_bgr, (small_w, small_h), interpolation=cv2.INTER_AREA)
    # 블록 유지 보간으로 업스케일
    mosaic = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
    return mosaic


def _apply_blur_roi(roi_bgr: np.ndarray, lvl: int, s: float = 1.0) -> np.ndarray:
    """
    프론트 규칙: blur px = (lvl*2 + 10) [화면픽셀].
    원본 픽셀로 환산: r_src = px / s → 가우시안 커널 크기 홀수로 변환.
    """
    if roi_bgr is None or roi_bgr.size == 0:
        return roi_bgr
    r_canvas = (lvl * 2 + 10)
    r_src = max(1.0, r_canvas / max(s, 1e-6))
    k = int(max(3, 2 * round(r_src) + 1))
    if k % 2 == 0:
        k += 1
    # ROI가 극소일 때 과대 커널 방지
    k = min(k, 2 * max(roi_bgr.shape[0], roi_bgr.shape[1]) - 1)
    return cv2.GaussianBlur(roi_bgr, (k, k), 0)


def _apply_effect_roi(roi_bgr: np.ndarray, MaskingTool: str, lvl: int, s: float = 1.0) -> np.ndarray:
    """
    MaskingTool: '0' = mosaic, '1' = blur
    """
    if str(MaskingTool) == '0':
        return _apply_mosaic_roi(roi_bgr, lvl, s)
    return _apply_blur_roi(roi_bgr, lvl, s)


# ---------------------------
# 폴리곤/사각형 유틸
# ---------------------------
def _bbox_to_rect(bbox):
    # [x0,y0,x1,y1]
    x0, y0, x1, y1 = bbox
    x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
    if x1 < x0: x0, x1 = x1, x0
    if y1 < y0: y0, y1 = y1, y0
    return x0, y0, x1, y1


def _poly_to_mask(h, w, poly_pts):
    mask = np.zeros((h, w), dtype=np.uint8)
    pts = np.array(poly_pts, dtype=np.int32)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def _clip_roi(frame, x0, y0, x1, y1):
    # 포함 하한 / 배제 상한으로 클램핑
    h, w = frame.shape[:2]
    x0 = max(0, min(w - 1, int(round(x0))))
    y0 = max(0, min(h - 1, int(round(y0))))
    x1 = max(0, min(w,     int(round(x1))))  # 상한은 w
    y1 = max(0, min(h,     int(round(y1))))  # 상한은 h
    # 0폭/0높이 방지
    if x1 <= x0:
        x1 = min(w, x0 + 1)
    if y1 <= y0:
        y1 = min(h, y0 + 1)
    return x0, y0, x1, y1


# ---------------------------
# 마스킹 본체
# ---------------------------
def _process_frame_with_logs(frame_bgr, logs_for_frame, MaskingRange, MaskingTool, MaskingStrength):
    """
    MaskingRange:
      '0' none
      '1' bg(지정객체 제외 배경 마스킹)
      '2' selected(지정객체만 마스킹)
      '3' unselected(미지정객체만 마스킹)
    """
    lvl = int(MaskingStrength) if str(MaskingStrength).isdigit() else 3
    s = 1.0  # 시그니처 변경 없이 스케일 1로 가정

    h, w = frame_bgr.shape[:2]
    out = frame_bgr.copy()

    # 로그를 지정/미지정으로 분리
    sel = []
    uns = []
    for it in logs_for_frame or []:
        obj = it.get('object', None)
        if obj == 2:
            uns.append(it)
        else:
            # 기본은 지정으로 본다(프론트 'none'에서도 테두리/표시용으로 취급)
            sel.append(it)

    def apply_roi_effect(rect_or_poly, only_polygon=False):
        """
        rect_or_poly: dict { 'type': 'rect'/'poly', 'rect':(x0,y0,x1,y1) or 'poly':[(x,y), ...] }
        only_polygon: True면 다각형으로 clip 후 합성
        """
        nonlocal out, lvl, s
        if rect_or_poly['type'] == 'rect':
            x0, y0, x1, y1 = rect_or_poly['rect']
            x0, y0, x1, y1 = _clip_roi(out, x0, y0, x1, y1)
            roi = out[y0:y1, x0:x1]
            effected = _apply_effect_roi(roi, MaskingTool, lvl, s)
            out[y0:y1, x0:x1] = effected
        else:
            # poly
            pts = rect_or_poly['poly']
            xs = [int(round(p[0])) for p in pts]
            ys = [int(round(p[1])) for p in pts]

            # 배제 상한(+1)로 영역 계산
            minx = max(0, min(xs))
            miny = max(0, min(ys))
            maxx = min(w, max(xs) + 1)
            maxy = min(h, max(ys) + 1)
            if maxx <= minx: maxx = min(minx + 1, w)
            if maxy <= miny: maxy = min(miny + 1, h)

            roi = out[miny:maxy, minx:maxx].copy()

            # ROI 좌표계에서 다각형 마스크 생성
            local_pts = [(x - minx, y - miny) for x, y in zip(xs, ys)]
            mask = _poly_to_mask(roi.shape[0], roi.shape[1], local_pts)

            effected = _apply_effect_roi(roi, MaskingTool, lvl, s)
            roi[mask == 255] = effected[mask == 255]
            out[miny:maxy, minx:maxx] = roi

    # Range별 처리
    if str(MaskingRange) == '0':
        # 아무 것도 하지 않음(프론트 프리뷰는 테두리만, 백엔드는 원본 유지)
        return out

    if str(MaskingRange) == '1':
        # 배경 전체에 효과 → 지정객체(sel) 영역만 원본 복원
        effected_full = _apply_effect_roi(out, MaskingTool, lvl, s)
        out = effected_full
        # sel을 원본으로 되살림
        for it in sel:
            bbox = it.get('bbox')
            if isinstance(bbox, (list, tuple)) and len(bbox) == 4 and not isinstance(bbox[0], (list, tuple)):
                x0, y0, x1, y1 = _bbox_to_rect(bbox)
                x0, y0, x1, y1 = _clip_roi(frame_bgr, x0, y0, x1, y1)
                out[y0:y1, x0:x1] = frame_bgr[y0:y1, x0:x1]
            elif isinstance(bbox, (list, tuple)) and len(bbox) >= 3 and isinstance(bbox[0], (list, tuple)):
                # polygon 복원
                pts = [(float(p[0]), float(p[1])) for p in bbox]
                xs = [int(round(p[0])) for p in pts]
                ys = [int(round(p[1])) for p in pts]

                # 배제 상한(+1)로 영역 계산
                minx = max(0, min(xs))
                miny = max(0, min(ys))
                maxx = min(w, max(xs) + 1)
                maxy = min(h, max(ys) + 1)
                if maxx <= minx: maxx = min(minx + 1, w)
                if maxy <= miny: maxy = min(miny + 1, h)

                roi_dst = out[miny:maxy, minx:maxx]
                roi_src = frame_bgr[miny:maxy, minx:maxx]
                mask = _poly_to_mask(roi_dst.shape[0], roi_dst.shape[1],
                                     [(x - minx, y - miny) for x, y in zip(xs, ys)])
                roi_dst[mask == 255] = roi_src[mask == 255]
                out[miny:maxy, minx:maxx] = roi_dst
        return out

    if str(MaskingRange) in ('2', '3'):
        # selected: 지정객체만 효과
        # unselected: 미지정객체만 효과
        target = sel if str(MaskingRange) == '2' else uns
        for it in target:
            bbox = it.get('bbox')
            if isinstance(bbox, (list, tuple)) and len(bbox) == 4 and not isinstance(bbox[0], (list, tuple)):
                x0, y0, x1, y1 = _bbox_to_rect(bbox)
                apply_roi_effect({'type': 'rect', 'rect': (x0, y0, x1, y1)})
            elif isinstance(bbox, (list, tuple)) and len(bbox) >= 3 and isinstance(bbox[0], (list, tuple)):
                pts = [(float(p[0]), float(p[1])) for p in bbox]
                apply_roi_effect({'type': 'poly', 'poly': pts})
        return out

    # 알 수 없는 Range → 원본
    return out


def output_masking(video_path, MaskingRange, MaskingTool, MaskingStrength, log_queue, progress_callback=None):
    """
    CSV 기반 선택/배경/미지정 마스킹 적용.
    반환: 출력 mp4 파일 경로
    """
    out_dir = load_path_config()
    os.makedirs(out_dir, exist_ok=True)

    csv_path = _find_csv_for_video(video_path)
    if not csv_path or not os.path.isfile(csv_path):
        # CSV가 없으면 입력 그대로 복사(or 패스스루 인코딩)
        base = os.path.splitext(os.path.basename(video_path))[0]
        output_path = os.path.join(out_dir, f"{base}_masked.mp4")
        return _passthrough(video_path, output_path, log_queue, progress_callback)

    frame_logs = _load_mask_logs(csv_path)

    base = os.path.splitext(os.path.basename(video_path))[0]
    output_path = os.path.join(out_dir, f"{base}_masked.mp4")

    cap = None
    container = None
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        fps_int = max(1, int(round(fps)))
        width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        container = av.open(output_path, mode='w')
        stream = container.add_stream('h264', rate=fps_int)
        stream.width  = width
        stream.height = height
        stream.pix_fmt = 'yuv420p'

        frame_idx = 0
        while True:
            ok, bgr = cap.read()
            if not ok or bgr is None or bgr.size == 0:
                break

            logs = frame_logs.get(frame_idx, [])
            out_bgr = _process_frame_with_logs(bgr, logs, MaskingRange, MaskingTool, MaskingStrength)

            frame = av.VideoFrame.from_ndarray(out_bgr, format='bgr24')
            for packet in stream.encode(frame):
                container.mux(packet)

            frame_idx += 1
            if progress_callback and total > 0:
                progress_callback(min(0.9999, frame_idx / total))

        # flush
        for packet in stream.encode():
            container.mux(packet)
        container.close()
        cap.release()

        if progress_callback:
            progress_callback(1.0)

        log_queue.append(f"[INFO] output_masking 완료: {output_path}")
        return output_path

    except Exception as e:
        if container:
            try:
                container.close()
            except Exception:
                pass
        if cap:
            cap.release()
        log_queue.append(f"[ERROR] output_masking 실패: {str(e)}")
        raise


def output_allmasking(video_path, MaskingTool, MaskingStrength, log_queue, progress_callback=None):
    """
    전체 프레임에 마스킹(모자이크/블러) 적용.
    프론트의 'AllMasking' 프리뷰 동작에 대응.
    """
    out_dir = load_path_config()
    os.makedirs(out_dir, exist_ok=True)

    base = os.path.splitext(os.path.basename(video_path))[0]
    output_path = os.path.join(out_dir, f"{base}_allmasked.mp4")

    cap = None
    container = None
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        fps_int = max(1, int(round(fps)))
        width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        container = av.open(output_path, mode='w')
        stream = container.add_stream('h264', rate=fps_int)
        stream.width  = width
        stream.height = height
        stream.pix_fmt = 'yuv420p'

        lvl = int(MaskingStrength) if str(MaskingStrength).isdigit() else 3
        s = 1.0  # 시그니처 유지: 스케일 1 가정

        frame_idx = 0
        while True:
            ok, bgr = cap.read()
            if not ok or bgr is None or bgr.size == 0:
                break

            effected = _apply_effect_roi(bgr, MaskingTool, lvl, s)

            frame = av.VideoFrame.from_ndarray(effected, format='bgr24')
            for packet in stream.encode(frame):
                container.mux(packet)

            frame_idx += 1
            if progress_callback and total > 0:
                progress_callback(min(0.9999, frame_idx / total))

        for packet in stream.encode():
            container.mux(packet)
        container.close()
        cap.release()

        if progress_callback:
            progress_callback(1.0)

        log_queue.append(f"[INFO] output_allmasking 완료: {output_path}")
        return output_path

    except Exception as e:
        if container:
            try:
                container.close()
            except Exception:
                pass
        if cap:
            cap.release()
        log_queue.append(f"[ERROR] output_allmasking 실패: {str(e)}")
        raise


# ---------------------------
# Passthrough (CSV 없을 때 등)
# ---------------------------
def _passthrough(video_path, output_path, log_queue, progress_callback=None):
    """
    입력을 동일 스펙으로 재인코딩(혹은 컨테이너 카피).
    여기서는 PyAV를 사용해 간단 재인코딩.
    """
    cap = None
    container = None
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        fps_int = max(1, int(round(fps)))
        width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        container = av.open(output_path, mode='w')
        stream = container.add_stream('h264', rate=fps_int)
        stream.width  = width
        stream.height = height
        stream.pix_fmt = 'yuv420p'

        idx = 0
        while True:
            ok, bgr = cap.read()
            if not ok or bgr is None or bgr.size == 0:
                break
            frame = av.VideoFrame.from_ndarray(bgr, format='bgr24')
            for packet in stream.encode(frame):
                container.mux(packet)
            idx += 1
            if progress_callback and total > 0:
                progress_callback(min(0.9999, idx / total))

        for packet in stream.encode():
            container.mux(packet)
        container.close()
        cap.release()

        if progress_callback:
            progress_callback(1.0)

        log_queue.append(f"[INFO] passthrough 완료: {output_path}")
        return output_path
    except Exception as e:
        if container:
            try:
                container.close()
            except Exception:
                pass
        if cap:
            cap.release()
        log_queue.append(f"[ERROR] passthrough 실패: {str(e)}")
        raise
