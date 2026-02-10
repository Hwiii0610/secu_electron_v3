import cv2
import numpy as np
from PIL import Image, ImageFont, ImageDraw
from util import logLine, timeToStr, get_resource_path
import os
import uuid
import time
import configparser
import av


# --- 그대로 사용 ---
def load_wm_config():
    """config.ini에서 [export] 섹션을 로드"""
    config = configparser.ConfigParser(allow_no_value=True)
    cfg_path = get_resource_path('config.ini')
    config.read(cfg_path, encoding='utf-8')
    return config['export']


def load_path_config():
    """config.ini에서 결과 비디오 저장 경로([path].video_masking_path)를 로드"""
    config = configparser.ConfigParser()
    cfg_path = get_resource_path('config.ini')
    config.read(cfg_path, encoding='utf-8')
    return config['path']['video_masking_path']


# --- 추가: 로고 경로 해석기 (없으면 None 반환) ---
def _resolve_logo_path(logo_path: str | None) -> str | None:
    """PyInstaller 리소스/절대/상대 경로를 모두 고려하여 유효 파일 경로를 반환"""
    if not logo_path:
        return None
    # PyInstaller 리소스 경로 우선
    cand = get_resource_path(logo_path)
    if os.path.isfile(cand):
        return cand
    # 이미 절대/상대 실제 경로인 경우
    if os.path.isfile(logo_path):
        return logo_path
    return None

#--- 한글 텍스트 워터마크 입력을 위한 커스텀 putText 함수 ---
def myPutText(src, text, pos, font, font_color) :
    img_pil = Image.fromarray(cv2.cvtColor(src, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img_pil)
    rgb_font_color = (font_color[2], font_color[1], font_color[0])
    draw.text(pos, text, font=font, fill= rgb_font_color)
    return cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)


# --- 교체: 텍스트만/로고+텍스트 모두 안전하게 처리 ---
def apply_watermark(
    input_video_path: str,
    text: str,
    transparency: int,
    logo_path: str,
    location: int,
    log_queue,
    progress_callback,
    remove_input: bool = False,   # ★ 처리 후 입력(마스킹 파일) 삭제 여부
) -> str:
    """
    비디오에 워터마크(로고[선택]+텍스트)를 적용하고 새 파일 경로를 반환합니다.
    - base_name 이 '_wm' 로 끝나면 재적용을 생략합니다.
    - location: 1 좌상, 2 우상, 3 중앙, 4 좌하, 5 우하
    - remove_input=True 이면 처리 완료 후 input_video_path 삭제(일반 내보내기용)
    """
    start_time = time.time()
    output_dir = load_path_config()
    os.makedirs(output_dir, exist_ok=True)

    base_name = os.path.splitext(os.path.basename(input_video_path))[0]
    if base_name.endswith("_wm"):
        log_queue.append(f"워터마크 이미 적용됨(생략): {input_video_path}")
        if progress_callback:
            progress_callback(1.0)
        return input_video_path

    output_path = os.path.join(output_dir, f"{base_name}_wm.mp4")

    cap = cv2.VideoCapture(input_video_path)
    if not cap.isOpened():
        # 입력이 열리지 않으면 그대로 리턴(상위에서 처리하도록)
        log_queue.append(f"[워터마크 오류] 입력 영상 열기 실패: {input_video_path}")
        if progress_callback:
            progress_callback(1.0)
        return input_video_path

    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))  or 1
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1
    fps_f  = cap.get(cv2.CAP_PROP_FPS)
    # FPS가 0이거나 NaN이면 25로 보정
    try:
        fps = int(round(fps_f))
        if fps <= 0:
            fps = 25
    except Exception:
        fps = 25

    container = None
    stream = None

    try:
        # PyAV 컨테이너/스트림 준비
        container = av.open(output_path, mode='w')
        stream = container.add_stream('h264', rate=fps)
        stream.width = width
        stream.height = height
        stream.pix_fmt = 'yuv420p'

        # ----- 로고 준비(없어도 동작하도록) -----
        transparency = max(0, min(100, int(transparency)))  # 0~100 클램프
        resolved_logo = _resolve_logo_path(logo_path)
        logo_bgra = None
        logo_w = logo_h = 0

        if resolved_logo:
            try:
                logo_img = Image.open(resolved_logo).convert("RGBA")
                orig_w, orig_h = logo_img.size
                target_w = max(1, width // 10)
                scale = target_w / max(1, orig_w)
                target_h = max(1, int(orig_h * scale))
                logo_img = logo_img.resize((target_w, target_h), resample=Image.LANCZOS)

                # OpenCV 사용을 위해 임시 파일로 저장 후 로드
                tmp_logo = os.path.join(output_dir, f"{uuid.uuid4().hex}_tmp_logo.png")
                logo_img.save(tmp_logo)
                logo_bgra = cv2.imread(tmp_logo, cv2.IMREAD_UNCHANGED)
                try:
                    os.remove(tmp_logo)
                except OSError:
                    pass

                if logo_bgra is not None and logo_bgra.shape[2] == 4:
                    logo_h, logo_w = logo_bgra.shape[:2]
                else:
                    logo_bgra = None
                    logo_w = logo_h = 0
            except Exception:
                # 로고 문제가 있어도 텍스트만으로 진행
                logo_bgra = None
                logo_w = logo_h = 0

        # ----- 위치 계산 유틸 -----
        margin = 50

        def get_pos(box_w: int, box_h: int, loc: int) -> tuple[int, int]:
            if loc == 1:  # 좌상
                return (margin, margin)
            if loc == 2:  # 우상
                return (max(0, width - box_w - margin), margin)
            if loc == 3:  # 중앙
                return ((max(0, width - box_w)) // 2, (max(0, height - box_h)) // 2)
            if loc == 4:  # 좌하
                return (margin, max(0, height - box_h - margin))
            # 기본: 5 우하
            return (max(0, width - box_w - margin), max(0, height - box_h - margin))

        # ----- 텍스트 렌더링 설정 -----
        text = text or ""  # None 방지
        font_path = get_resource_path("NanumGothic.ttf")
        font_size = 16
        text_color = (255, 255, 255)
        try:
            font = ImageFont.truetype(font_path, font_size)
        except IOError:
            print(f"Error: Font file not found at '{font_path}'. Using default.")
            font = ImageFont.load_default()
        
        if text:
            text_bbox = font.getbbox(text)
            text_w = text_bbox[2] - text_bbox[0]
            text_h = text_bbox[3] - text_bbox[1]
        else:
            text_w, text_h = 0,0

        # 로고+텍스트 전체 박스 크기(로고 없으면 텍스트만 기준)
        box_w = max(logo_w, text_w) if text else logo_w
        box_h = logo_h + (text_h + 5 if text else 0)
        # 박스 좌상단
        x0, y0 = get_pos(box_w, box_h, location)

        # 텍스트 위치(로고 있으면 로고 아래, 없으면 박스 중앙 정렬)
        if text:
            text_x = x0 + ((logo_w if logo_bgra is not None else box_w) - text_w) // 2
            text_y = y0 + (logo_h if logo_bgra is not None else 0) + text_h + 5
            text_x = max(0, min(text_x, width - text_w))
            text_y = max(text_h + 1, min(text_y, height - 5))

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        count = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # 로고 합성 (있을 때만)
            if logo_bgra is not None:
                b, g, r, a = cv2.split(logo_bgra)
                alpha = (a.astype(float) / 255.0) * (transparency / 100.0)
                alpha = alpha[..., np.newaxis]

                y_end = min(y0 + logo_h, height)
                x_end = min(x0 + logo_w, width)
                h_roi = max(0, y_end - y0)
                w_roi = max(0, x_end - x0)
                if h_roi > 0 and w_roi > 0:
                    roi = frame[y0:y_end, x0:x_end].astype(float)
                    overlay = np.dstack((b[:h_roi, :w_roi], g[:h_roi, :w_roi], r[:h_roi, :w_roi])).astype(float)
                    blended = cv2.convertScaleAbs(roi * (1 - alpha[:h_roi, :w_roi]) + overlay * alpha[:h_roi, :w_roi])
                    frame[y0:y_end, x0:x_end] = blended

            # 텍스트 합성 (문자열 있을 때만)
            if text:
                frame = myPutText(frame, text, (text_x, text_y), font, text_color)

            # 인코딩
            video_frame = av.VideoFrame.from_ndarray(frame, format='bgr24')
            for packet in stream.encode(video_frame):
                container.mux(packet)

            count += 1
            if progress_callback:
                progress_callback(count / max(1, total_frames))

        # 플러시
        for packet in stream.encode():
            container.mux(packet)

    finally:
        # 자원 정리
        try:
            if container is not None:
                container.close()
        except Exception:
            pass
        try:
            cap.release()
        except Exception:
            pass

    log_queue.append(f"워터마크 적용 완료: {output_path}")
    if progress_callback:
        progress_callback(1.0)

    # ★ 일반 내보내기에서 True로 넘기면, 마스킹 중간파일 삭제
    if remove_input and os.path.abspath(input_video_path) != os.path.abspath(output_path):
        try:
            os.remove(input_video_path)
            log_queue.append(f"중간 파일 삭제: {input_video_path}")
        except OSError:
            pass

    return output_path
