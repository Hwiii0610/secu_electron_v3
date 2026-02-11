"""
설정 파일(config.ini) 관리 및 유틸리티 함수
- get_config_data(): config.ini 파서 반환
- get_config(): 이벤트 타입별 설정값 반환
- resolve_video_path(): 비디오 경로 해석
- classid_mapping: DetectObj → YOLO 클래스 ID 매핑
"""
import os
import configparser
import logging
from util import get_resource_path

# 작업 상태 코드 정의
STATUS_WAIT = 'd0'       # 대기 상태
STATUS_DONE = 's0'       # 완료 상태
STATUS_ENC_FAIL = 'e1'   # 암호화 실패 상태
STATUS_META_FAIL = 'e2'  # 메타데이터 실패 상태

# 설정 파일의 DetectObj 값을 YOLO 클래스 ID로 매핑
classid_mapping = {
    "0": [0],
    "1": [1],
    "2": [2],
    "3": [3],
    "4": [0, 1],
    "5": [0, 2],
    "6": [0, 3],
    "7": [1, 2],
    "8": [1, 3],
    "9": [2, 3],
    "10": [0, 1, 2],
    "11": [0, 1, 3],
    "12": [0, 2, 3],
    "13": [1, 2, 3],
    "14": [0, 1, 2, 3]
}


def get_config_data():
    """config.ini를 읽어 ConfigParser 객체를 반환"""
    config = configparser.ConfigParser(allow_no_value=True)
    config_path = get_resource_path('config.ini')
    logging.info(f"[CFG] using config: {config_path}")
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"설정 파일({config_path})를 찾을 수 없습니다.")
    config.read(config_path, encoding='utf-8')
    return config


def resolve_video_path(base_dir: str, vp: str) -> str:
    """
    절대경로면 그대로 사용, 상대/파일명이면 base_dir와 합쳐 최종 절대경로 반환
    - 따옴표 섞여 들어온 경우를 대비해 strip('"')
    """
    vp = (vp or "").strip().strip('"')
    if not vp:
        return ""
    if os.path.isabs(vp):
        return os.path.abspath(vp)
    return os.path.abspath(os.path.join(base_dir, vp))


def get_config(event_type: str):
    """
    event_type에 따라 config.ini에서 필요한 설정값을 읽어 반환하는 함수.
    설정 파일 오류 발생 시 ValueError를 발생시킴.
    """
    config = get_config_data()
    try:
        if event_type == "1":
            video_path_ori = config['path']['video_path']
            conf_thres    = float(config['detect']['threshold'])
            DetectObj     = config['detect']['DetectObj']
            classid       = classid_mapping.get(DetectObj)
            if classid is None:
                raise ValueError(f"config.ini의 DetectObj 값 '{DetectObj}'에 해당하는 클래스 매핑이 없습니다.")
            return video_path_ori, conf_thres, classid
        elif event_type == "2":
            video_path_ori = config['path']['video_path']
            conf_thres    = float(config['detect']['threshold'])
            return video_path_ori, conf_thres
        elif event_type == "3":
            MaskingRange    = config['export'].get('MaskingRange', '0')
            MaskingTool     = config['export'].get('MaskingTool', '1')
            MaskingStrength = config['export'].get('MaskingStrength', '3')
            return MaskingRange, MaskingTool, MaskingStrength
        elif event_type == "4":
            MaskingTool     = config['export'].get('MaskingTool', '1')
            MaskingStrength = config['export'].get('MaskingStrength', '3')
            return MaskingTool, MaskingStrength
        else:
            raise ValueError(f"유효하지 않은 Event 값: {event_type}")
    except KeyError as e:
        raise ValueError(f"config.ini 파일에서 필요한 키를 찾을 수 없습니다: {e}")
    except ValueError as e:
        raise ValueError(f"config.ini 파일의 값 형식이 잘못되었거나 유효하지 않습니다: {e}")


def set_video_masking_path_to_desktop():
    """프로그램 시작 시 video_masking_path를 바탕화면 경로로 설정"""
    config_path = get_resource_path("config.ini")
    config = configparser.ConfigParser()
    config.read(config_path, encoding="utf-8")
    # 바탕화면 경로 가져오기
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
    if not config.has_section("path"):
        config.add_section("path")
    config.set("path", "video_masking_path", desktop_path)
    # 반드시 저장
    with open(config_path, "w", encoding="utf-8") as f:
        config.write(f)
    print(f"[INFO] 프로그램 시작시 video_masking_path를 {desktop_path}로 설정했습니다.")
