import cv2
import os
import json
import configparser
import time
import sys
from datetime import datetime
from collections import deque
from typing import List, Optional, Callable

from util import logLine, timeToStr, get_resource_path, get_log_dir
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'ultralytics'))
from ultralytics import YOLO

import yaml
import inspect
import traceback
import contextlib

def _push_ai_log(log_queue: deque, log_file_path: str, msg: str):
    """AI 관련 상세 로그를 남기는 공통 헬퍼"""
    try:
        ll = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=msg)
        if isinstance(log_queue, deque):
            log_queue.append(ll)
        else:
            print(msg)
    except Exception as e:
        print(f"[LOG-FAIL] {e} | {msg}")

def _write_incremental_json(output_file, tracking_results, metadata):
    """탐지 중 누적 결과를 JSON으로 증분 저장 (atomic write)"""
    frames_dict = {}
    for entry in tracking_results:
        fkey = str(entry["frame"])
        if fkey not in frames_dict:
            frames_dict[fkey] = []
        frames_dict[fkey].append({
            "track_id": entry["track_id"],
            "bbox": entry["bbox"],
            "bbox_type": "rect",
            "score": entry["score"],
            "class_id": entry["class_id"],
            "type": entry["type"],
            "object": entry["object"]
        })

    output_data = {
        "schema_version": "1.0.0",
        "metadata": metadata,
        "frames": frames_dict
    }

    tmp_file = output_file + '.tmp'
    with open(tmp_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp_file, output_file)


def _gpu_snapshot(prefix: str, log_queue: deque, log_file_path: str):
    """CUDA/VRAM 상태를 스냅샷으로 남김 (torch + NVML 가능하면 둘 다)"""
    try:
        info = [f"[GPU] {prefix}"]
        try:
            import torch
            if torch.cuda.is_available():
                dev = torch.cuda.current_device()
                props = torch.cuda.get_device_properties(dev)
                alloc = torch.cuda.memory_allocated(dev) / (1024**3)
                reserv = torch.cuda.memory_reserved(dev) / (1024**3)
                info.append(f"device={dev} name={props.name} total={props.total_memory/(1024**3):.2f}GB alloc={alloc:.2f}GB reserved={reserv:.2f}GB")
            else:
                info.append("cuda.is_available()=False")
        except Exception as e:
            info.append(f"torch-cuda-snapshot-fail:{type(e).__name__}:{e}")

        # NVML(선택) — 설치 안 되어도 무시
        try:
            import pynvml
            pynvml.nvmlInit()
            dev = 0
            h = pynvml.nvmlDeviceGetHandleByIndex(dev)
            mem = pynvml.nvmlDeviceGetMemoryInfo(h)
            util = pynvml.nvmlDeviceGetUtilizationRates(h)
            info.append(f"NVML used={mem.used/(1024**3):.2f}GB util.gpu={util.gpu}% util.mem={util.memory}%")
        except Exception:
            pass

        _push_ai_log(log_queue, log_file_path, " | ".join(info))
    except Exception as e:
        _push_ai_log(log_queue, log_file_path, f"[GPU] {prefix} | snapshot-fail:{e}")

# 설정 파일(config.ini)을 읽어 config 객체를 생성합니다.
config = configparser.ConfigParser(allow_no_value=True)
config_path = get_resource_path('config.ini')

if not os.path.exists(config_path):
    raise FileNotFoundError(f"Detector 설정 파일({config_path})을 찾을 수 없습니다.")

config.read(config_path, encoding='utf-8')

# ─── YOLO 모델 전역 변수 (초기화 전 상태) ───────────────────────────────────
MODEL = None

def init_model():
    """ FastAPI 서버 시작 시 YOLO 모델을 미리 로드하는 함수 """
    global MODEL
    try:
        if getattr(sys, 'frozen', False):
            base_path = sys._MEIPASS
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(base_path, 'model', 'secuwatcher_best.pt')
        MODEL = YOLO(model_path)
        print(f"YOLO 모델 로드 완료: {model_path}")
    except KeyError as e:
        MODEL = None  # 모델 로드 실패 시 전역 변수를 None으로 설정합니다.
        print(f"모델 로드 실패: config.ini에서 'path.model' 키를 찾을 수 없습니다. ({e})")
    except Exception as e:
        MODEL = None  # 기타 예외 발생 시에도 None으로 설정합니다.
        print(f"모델 로드 실패: {e}")

def autodetector(video_path: str, conf_thres: float, classid: List[int], log_queue: deque, progress_callback: Optional[Callable[[float], None]] = None):
    """
    지정된 비디오 경로들에 대해 자동 객체 탐지 및 추적을 수행하고 결과를 CSV 파일로 저장합니다.

    Args:
        video_path (str): 처리할 비디오 파일 경로 (쉼표로 구분 가능). main.py에서 검증된 절대 경로.
        conf_thres (float): 객체 탐지 시 신뢰도 임계값.
        classid (list): 탐지할 객체의 클래스 ID 리스트.
        log_queue (deque): 로그 메시지를 전달할 deque 객체.
        progress_callback (function, optional): 진행률 업데이트 콜백 함수. Defaults to None.

    Returns:
        list or str: 성공 시 생성된 CSV 파일 경로 리스트, 실패 시 오류 메시지 문자열.
    """
    # 시작 로그
    log_line = logLine()

    ai_dir = get_log_dir('AI Log')
    log_file_path = os.path.join(
        ai_dir,
        f"detector.{timeToStr(time.time(), 'file')[-6:]}.log"
    )

    log_line.path = log_file_path
    log_line.time = timeToStr(time.time(), 'datetime')[11:] # 시간 부분만 사용
    log_line.message = f"autodetector 시작: video_path='{video_path}', conf_thres={conf_thres}, classid={classid}"
	
    if isinstance(log_queue, deque):
        log_queue.append(log_line)
    else:
        print(f"경고: autodetector의 log_queue 타입이 deque가 아닙니다: {type(log_queue)}. 로그가 기록되지 않을 수 있습니다.")

    if MODEL is None:
        err = "모델이 로드되지 않았습니다. init_model()을 먼저 호출해야 합니다."
        log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
        if isinstance(log_queue, deque):
            log_queue.append(log_line)
        return err

    video_paths = video_path.split(',')
    results_files = []
    total_videos = len(video_paths)
    processed_videos = 0

    for video in video_paths:
        # print(f"Processing video: {video}")
        output_file = os.path.splitext(video)[0] + ".json"
        try:
            cap = cv2.VideoCapture(video)
            if not cap.isOpened():
                raise IOError(f"비디오 파일을 열 수 없습니다: {video}")
        except Exception as e:
            err = str(e)
            log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
            if isinstance(log_queue, deque):
                log_queue.append(log_line)
            return err

        video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        video_fps = cap.get(cv2.CAP_PROP_FPS)

        frame_index = 0  # 현재 프레임 번호를 초기화합니다.
        tracking_results = []  # Tracking 결과를 담을 리스트입니다.
        total_frames_in_video = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames_in_video <= 0:
            total_frames_in_video = 1

        while cap.isOpened():  # 비디오가 열려있는 동안 반복합니다.
            success, frame = cap.read()  # 비디오에서 한 프레임을 읽습니다.
            if not success:  # 프레임 읽기에 실패하면(비디오 끝)
                break  # 루프를 종료합니다.
            
            try:
                # 설정에 따라 CPU, GPU 또는 MPS(Apple Silicon)를 사용하여 모델 추적을 실행합니다.
                device = config['detect']['device']
                if device == "gpu":
                    results = MODEL.track(
                        frame,
                        tracker=config['path']['auto_tracker'],
                        verbose=False,
                        conf=conf_thres,
                        classes=classid,
                        persist=True,
                        device=0
                    )
                elif device == "mps":
                    # Apple Silicon MPS (Metal Performance Shaders)
                    results = MODEL.track(
                        frame,
                        tracker=config['path']['auto_tracker'],
                        verbose=False,
                        conf=conf_thres,
                        classes=classid,
                        persist=True,
                        device="mps"
                    )
                else:
                    results = MODEL.track(
                        frame,
                        tracker=config['path']['auto_tracker'],
                        verbose=False,
                        conf=conf_thres,
                        classes=classid,
                        persist=True,
                        device="cpu"
                    )
                
            except Exception as e:
                err = f"프레임 {frame_index} 처리 실패: {e}"
                log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
                if isinstance(log_queue, deque):
                    log_queue.append(log_line)
                cap.release()
                return err

            if results and results[0].boxes is not None:  # 탐지 결과가 있는지 확인합니다.
                for box in results[0].boxes:  # 각 탐지된 객체(box)에 대해 반복합니다.
                    xyxy = [int(coord) for coord in box.xyxy[0].cpu().numpy().tolist()]  # 바운딩 박스 좌표를 정수 리스트로 변환합니다.
                    raw_id = int(box.id.item()) if box.id is not None else -1  # 추적 ID를 가져옵니다 (없으면 -1).
                    track_id = f"1_{raw_id}"  # 자동 탐지임을 나타내는 접두사 '1_'을 붙입니다.
                    cls = int(box.cls.item())  # 객체의 클래스 ID를 가져옵니다.
                    conf = round(float(box.conf.item()), 2)  # 신뢰도 점수를 소수점 둘째 자리까지 반올림합니다.
                    tracking_results.append({  # 추적 결과를 딕셔너리 형태로 리스트에 추가합니다.
                        "frame": frame_index,
                        "track_id": track_id,
                        "bbox": xyxy,
                        "score": conf,
                        "class_id": cls,
                        "type": 1,
                        "object": 1
                    })
            frame_index += 1

            # 매 30프레임마다 증분 저장 (탐지 중 실시간 데이터 제공)
            if tracking_results and frame_index % 30 == 0:
                try:
                    _write_incremental_json(output_file, tracking_results, {
                        "created_at": datetime.now().isoformat(),
                        "updated_at": datetime.now().isoformat(),
                        "generator": "secuwatcher-detector",
                        "status": "detecting",
                        "video": {
                            "filename": os.path.basename(video),
                            "width": video_width,
                            "height": video_height,
                            "fps": video_fps,
                            "total_frames": total_frames_in_video
                        },
                        "detection": {
                            "model": os.path.basename(config['path']['model']),
                            "device": config['detect']['device'],
                            "confidence_threshold": conf_thres,
                            "class_ids": classid,
                            "tracker": os.path.basename(config['path']['auto_tracker'])
                        }
                    })
                except Exception:
                    pass  # 증분 저장 실패는 무시 (최종 저장에서 처리)

            if progress_callback is not None:
                current_video_frac = frame_index / max(1, total_frames_in_video)   # 0~1
                overall_frac = (processed_videos + current_video_frac) / max(1, total_videos)  # 0~1
                try:
                    progress_callback(overall_frac)   # 항상 0.0~1.0 float!
                except Exception as cb_e:
                    print(f"Progress callback 실행 오류: {cb_e}")
        try:
            if tracking_results:
                _write_incremental_json(output_file, tracking_results, {
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                    "generator": "secuwatcher-detector",
                    "status": "completed",
                    "video": {
                        "filename": os.path.basename(video),
                        "width": video_width,
                        "height": video_height,
                        "fps": video_fps,
                        "total_frames": total_frames_in_video
                    },
                    "detection": {
                        "model": os.path.basename(config['path']['model']),
                        "device": config['detect']['device'],
                        "confidence_threshold": conf_thres,
                        "class_ids": classid,
                        "tracker": os.path.basename(config['path']['auto_tracker'])
                    }
                })
            else:
                print(f"처리 결과 없음: {video}")
        except Exception as e:
            err = f"JSON 파일 저장 실패 ({output_file}): {e}"
            log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
            if isinstance(log_queue, deque):
                log_queue.append(log_line)
            cap.release()
            return err

        cap.release()
        results_files.append(output_file)
        processed_videos += 1

    log_line = logLine()
    log_line.path = log_file_path
    log_line.time = timeToStr(time.time(), 'datetime')[11:]
    log_line.message = f"autodetector 종료: 생성된 파일들={results_files}"
    if isinstance(log_queue, deque):
        log_queue.append(log_line)

    return results_files

def selectdetector(video_path: str, FrameNo: str, Coordinate: str, conf_thres: float, log_queue: deque, progress_callback: Optional[Callable[[float], None]] = None):
    """
    지정된 비디오의 특정 프레임에서 특정 좌표를 포함하는 객체를 찾아 이후 프레임에서 추적하고 결과를 CSV로 저장합니다.

    Args:
        video_path (str): 처리할 비디오 파일 경로 (main.py에서 검증된 절대 경로).
        FrameNo (str): 객체 선택을 시작할 프레임 번호 (문자열).
        Coordinate (str): 객체 선택 좌표 ('x,y' 형식의 문자열).
        conf_thres (float): 객체 탐지 시 신뢰도 임계값.
        log_queue (deque): 로그 메시지를 전달할 deque 객체.
        progress_callback (function, optional): 진행률 업데이트 콜백 함수. Defaults to None.

    Returns:
        str: 성공 시 생성된 CSV 파일 경로, 실패 시 오류 메시지 문자열.
    """
    ai_dir = get_log_dir('AI Log')
    log_file_path = os.path.join(
        ai_dir,
        f"detector.{timeToStr(time.time(), 'file')[-6:]}.log"
    )

    start_log_message = f"selectdetector 시작: video_path='{video_path}', FrameNo={FrameNo}, Coordinate='{Coordinate}', conf_thres={conf_thres}"
    print(start_log_message)
    log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=start_log_message)
    if isinstance(log_queue, deque):
        log_queue.append(log_line)
    else:
        print(f"경고: selectdetector의 log_queue 타입이 deque가 아닙니다: {type(log_queue)}. 로그가 기록되지 않을 수 있습니다.")

    try:
        coord_parts = Coordinate.split(',')  # 쉼표로 구분된 좌표 문자열을 분리합니다.
        click_x = int(coord_parts[0].strip())  # x 좌표를 정수로 변환합니다.
        click_y = int(coord_parts[1].strip())  # y 좌표를 정수로 변환합니다.
        start_frame_no = int(FrameNo)  # 시작 프레임 번호를 정수로 변환합니다.
    except (ValueError, IndexError) as e:
        err = f"입력 파라미터 오류 (FrameNo 또는 Coordinate): {e}"
        log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
        if isinstance(log_queue, deque):
            log_queue.append(log_line)
        return err

    output_file = os.path.splitext(video_path)[0] + ".json"
    print(f"결과 파일 경로: {output_file}")

    if MODEL is None:	# 모델이 로드되었는지 확인합니다.
        err = "모델이 로드되지 않았습니다."
        log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
        if isinstance(log_queue, deque):
            log_queue.append(log_line)
        return err

    # DeepSORT 트래커를 설정 파일 기반으로 초기화합니다.
    tracker_yaml_path = get_resource_path(config['path']['select_tracker'])
    with open(tracker_yaml_path, 'r', encoding='utf-8') as f:
        tracker_cfg = yaml.safe_load(f) # 트래커 설정 YAML 파일을 읽습니다.
    tracker_args = tracker_cfg.get('args', {})
    tracker_type = tracker_cfg.get('tracker_type')
    
    from deep_sort_realtime.deepsort_tracker import DeepSort	# DeepSORT 트래커를 임포트합니다.
    sig = inspect.signature(DeepSort.__init__)
    valid_args = {k: v for k, v in tracker_args.items() if k in sig.parameters}
    invalid_keys = set(tracker_args) - set(valid_args)
    if invalid_keys:
        print(f"DeepSort: 사용되지 않는 tracker args 제거: {invalid_keys}")

    if 'model_filename' in sig.parameters and 'model_filename' not in valid_args:
        valid_args['model_filename'] = config['path']['model']
        print(f"DeepSort: model_filename을 config.ini의 모델 경로로 설정: {config['path']['model']}")

    tracker = DeepSort(**valid_args)

    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise IOError(f"비디오 파일을 열 수 없습니다: {video_path}")
    except Exception as e:
        err = str(e)
        log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
        if isinstance(log_queue, deque):
            log_queue.append(log_line)
        return err

    video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    video_fps = cap.get(cv2.CAP_PROP_FPS)

    frame_index = 0  # 현재 프레임 번호를 초기화합니다.
    selected_id = None  # 사용자가 선택한 객체의 추적 ID를 저장할 변수입니다.
    tracking_results = []  # 추적 결과를 담을 리스트입니다.
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1  # 비디오의 전체 프레임 수를 가져옵니다.

    while cap.isOpened():  # 비디오가 열려있는 동안 반복합니다.
        success, frame = cap.read()  # 프레임을 읽습니다.
        if not success:
            break

        det = MODEL.predict(frame, conf=conf_thres, verbose=False)[0]  # 현재 프레임에서 객체를 탐지합니다.
        detections = []  # DeepSORT에 전달할 탐지 결과 리스트입니다.
        for box in det.boxes:  # 각 탐지된 객체에 대해 반복합니다.
            x1, y1, x2, y2 = [int(c) for c in box.xyxy[0].cpu().numpy()]  # 좌표를 가져옵니다.
            conf_score = float(box.conf[0])  # 신뢰도를 가져옵니다.
            cls_id = int(box.cls[0])  # 클래스 ID를 가져옵니다.
            if tracker_type == 'DeepSORT':
                w, h = x2 - x1, y2 - y1	# 너비와 높이를 계산합니다.
                detections.append([[x1, y1, w, h], conf_score, cls_id])	# DeepSORT 형식에 맞게 변환하여 추가합니다.
            # else:

        if tracker_type == 'DeepSORT':
            tracks = tracker.update_tracks(detections, frame=frame)
        # else:

        if frame_index == start_frame_no:	# 사용자가 지정한 시작 프레임이면
            found = False
            for t in tracks:
                if tracker_type == 'DeepSORT':
                    if not t.is_confirmed(): continue
                    tl, tt, br, bb = t.to_ltrb()	# Tracking 좌표를 가져옵니다.
                    if tl <= click_x <= br and tt <= click_y <= bb:	# 사용자가 클릭한 좌표가 객체 내에 있는지 확인합니다.
                        raw = t.track_id	# Tracking ID를 가져옵니다.
                        selected_id = f"2_{raw}"
                        print(f"객체 선택됨: Frame={frame_index}, TrackID={selected_id}, Box={[int(tl), int(tt), int(br), int(bb)]}")
                    # 해당 트랙에 대응하는 검출 객체 찾기
                    matched_conf, matched_cls = None, None
                    for bbox, conf_score, cls_id in detections:
                        x1, y1, w, h = bbox
                        cx, cy = x1 + w/2, y1 + h/2
                        if tl <= cx <= br and tt <= cy <= bb:
                            matched_conf = round(conf_score, 2)
                            matched_cls = cls_id
                            break
                        tracking_results.append({
                            "frame": frame_index,
                            "track_id": selected_id,
                            "bbox": [int(tl), int(tt), int(br), int(bb)],
                            "score": matched_conf,
                            "class_id": matched_cls,
                            "type": 2,
                            "object": 1
						})
                        found = True
                        break
                # else:
            if not found:
                err = f"시작 프레임({start_frame_no})의 좌표에서 객체를 찾을 수 없습니다."
                log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
                if isinstance(log_queue, deque): log_queue.append(log_line)
                cap.release()
                return err
        elif frame_index > start_frame_no and selected_id is not None:	# 시작 프레임 이후이고, 추적할 객체가 선택되었다면
            target_raw = selected_id.split('_')[1]
            for t in tracks:
                if tracker_type == 'DeepSORT' and t.track_id == target_raw:                    
                    tl, tt, br, bb = t.to_ltrb()
                    print(f"추적: Frame={frame_index}, TrackID={selected_id}, Box={[int(tl), int(tt), int(br), int(bb)]}")
                    matched_conf, matched_cls = None, None
                    for bbox, conf_score, cls_id in detections:
                        x1, y1, w, h = bbox
                        cx, cy = x1 + w/2, y1 + h/2
                        if tl <= cx <= br and tt <= cy <= bb:
                            matched_conf = round(conf_score, 2)
                            matched_cls = cls_id
                            break
                    tracking_results.append({
                        "frame": frame_index,
                        "track_id": selected_id,
                        "bbox": [int(tl), int(tt), int(br), int(bb)],
                        "score": matched_conf,
                        "class_id": matched_cls,
                        "type": 2,
                        "object": 1
                    })
                    break
                # elif tracker_type != 'DeepSORT' and int(t[4]) == selected_id:

        frame_index += 1

        # 매 30프레임마다 증분 저장 (탐지 중 실시간 데이터 제공)
        if tracking_results and frame_index % 30 == 0:
            try:
                _write_incremental_json(output_file, tracking_results, {
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                    "generator": "secuwatcher-detector",
                    "status": "detecting",
                    "video": {
                        "filename": os.path.basename(video_path),
                        "width": video_width,
                        "height": video_height,
                        "fps": video_fps,
                        "total_frames": total_frames
                    },
                    "detection": {
                        "model": os.path.basename(config['path']['model']),
                        "device": config['detect']['device'],
                        "confidence_threshold": conf_thres,
                        "tracker": os.path.basename(config['path']['select_tracker'])
                    }
                })
            except Exception:
                pass  # 증분 저장 실패는 무시

        if progress_callback:
            try:
                progress_callback(frame_index / max(1, total_frames))
            except Exception:
                pass

    cap.release()

    if selected_id is None:
        err = "객체 선택 또는 추적 실패."
        log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
        if isinstance(log_queue, deque):
            log_queue.append(log_line)
        return err

    if not tracking_results:
         err = f"선택된 객체(TrackID: {selected_id})에 대한 추적 결과가 없습니다."
         log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
         if isinstance(log_queue, deque):
             log_queue.append(log_line)
         return err

    try:
        _write_incremental_json(output_file, tracking_results, {
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "generator": "secuwatcher-detector",
            "status": "completed",
            "video": {
                "filename": os.path.basename(video_path),
                "width": video_width,
                "height": video_height,
                "fps": video_fps,
                "total_frames": total_frames
            },
            "detection": {
                "model": os.path.basename(config['path']['model']),
                "device": config['detect']['device'],
                "confidence_threshold": conf_thres,
                "tracker": os.path.basename(config['path']['select_tracker'])
            }
        })
    except Exception as e:
        err = f"JSON 파일 저장 실패 ({output_file}): {e}"
        log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=err)
        if isinstance(log_queue, deque):
            log_queue.append(log_line)
        return err

    log_line = logLine(path=log_file_path, time=timeToStr(time.time(), 'datetime')[11:], message=f"selectdetector 종료: 생성된 파일={output_file}")
    if isinstance(log_queue, deque):
        log_queue.append(log_line)

    return output_file
