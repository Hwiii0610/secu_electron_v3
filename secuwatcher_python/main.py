import os
import sys
import io

if sys.stdout is None:
    sys.stdout = io.StringIO()
if sys.stderr is None:
    sys.stderr = io.StringIO()

import time
import json
import threading
import uuid
import cv2
import uvicorn
import traceback
import shutil
import base64
import requests
import configparser
import struct
import logging
import sqlite3
import hashlib
import util
from datetime import datetime
from util import logLine, timeToStr, log_writer, get_resource_path, get_log_dir
from typing import Optional, Deque
from collections import deque, defaultdict
from fastapi import FastAPI, HTTPException, BackgroundTasks, Body, UploadFile, File, Header, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, Response
from pydantic import BaseModel, Field
from Crypto.Random import get_random_bytes
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_OAEP

DB_FILE = get_resource_path("local.db")

def create_drm_table(db_path):
    create_table_sql = '''
    CREATE TABLE IF NOT EXISTS tb_drm_info (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        file_hash TEXT,
        ori_file_name VARCHAR(100),
        org_filepath VARCHAR(256),
        masking_file_name VARCHAR(100),
        masking_status CHAR(10),
        enc_file_name VARCHAR(100),
        enc_status CHAR(10),
        play_date DATETIME,
        play_count INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    '''
    try:
        db_existed = os.path.exists(db_path)
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(create_table_sql)
        conn.commit()
        conn.close()

        if db_existed:
            print("기존 DB 사용")
        else:
            print("DB 생성 완료")

    except Exception as e:
        print(f"DB를 호출 실패: {e}")

def insert_drm_info( #데이터 삽입용 함수
    file_hash, ori_file_name, org_filepath, masking_file_name,
    masking_status, enc_file_name, enc_status, play_date, play_count,
    db_path=DB_FILE
):
    sql = '''
    INSERT INTO tb_drm_info (
        file_hash, ori_file_name, org_filepath, masking_file_name,
        masking_status, enc_file_name, enc_status, play_date, play_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    '''
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(sql, (
        file_hash, ori_file_name, org_filepath, masking_file_name,
        masking_status, enc_file_name, enc_status, play_date, play_count
    ))
    conn.commit()
    conn.close()

try:
    cfg = configparser.ConfigParser(allow_no_value=True)
    cfg.read(get_resource_path('config.ini'), encoding='utf-8')
    enc_key_path = cfg['path']['enc']
    enc_key_path = get_resource_path(enc_key_path)
    with open(enc_key_path, 'rb') as f:
        _private_key = RSA.import_key(f.read())
    if not getattr(_private_key, 'has_private', lambda: False)():
        raise ValueError(f"설정된 키 파일({enc_key_path})는 공개키입니다. 개인키 파일을 지정해주세요.")
    print(f"RSA 개인키 로드 완료 (경로: {enc_key_path})", flush=True)
except Exception as e:
    print(f"RSA 개인키 로드 실패: {e}", flush=True)
    raise RuntimeError(f"RSA 개인키 로드 실패: {e}")
# lea_gcm_lib.py 동적 로드 설정 (원본 그대로)
import importlib.util
spec = importlib.util.spec_from_file_location(
    'lea_gcm_lib',
    os.path.join(os.path.dirname(__file__), 'lea_gcm_lib.py')
)
lea_gcm_lib = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lea_gcm_lib)
# LEA GCM C 라이브러리 로드
try:
    load_lea_library = lea_gcm_lib.load_lea_library
    load_lea_library()
    print("LEA GCM C 라이브러리 로드 완료", flush=True)
except Exception as e:
    print(f"경고: LEA GCM C 라이브러리 로드 실패: {e}", flush=True)

# 전역 변수로 일별 로그 파일 경로 계산
config_for_log = configparser.ConfigParser(allow_no_value=True)
config_for_log.read(get_resource_path('config.ini'), encoding='utf-8')

date_str = datetime.now().strftime("%Y%m%d")

# 1) Daily Log (기본 API/터미널 로그)
daily_dir = get_log_dir('Daily Log')
daily_log_path = os.path.join(daily_dir, f"{date_str}_log.txt")

# 2) Video Log (마스킹/워터마킹/암복호화 등 영상 처리 로그)
video_dir = get_log_dir('Video Log')
video_log_path = os.path.join(video_dir, f"{date_str}_video.txt")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(daily_log_path, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
# 작업 상태 코드 정의
STATUS_WAIT = 'd0'  # 대기 상태
STATUS_DONE = 's0'  # 완료 상태
STATUS_ENC_FAIL = 'e1'  # 암호화 실패 상태
STATUS_META_FAIL = 'e2'  # 메타데이터 실패 상태
# FastAPI 앱 인스턴스 생성 (lifespan과 함께 단일 생성)
from contextlib import asynccontextmanager

log_queue: Deque[logLine] = deque()
jobs = {}
util.jobs = jobs

@asynccontextmanager
async def lifespan(app):
    try:
        t = threading.Thread(target=log_writer, args=(log_queue, daily_log_path), daemon=True)
        t.start()
        logging.info(f"로그 쓰기 스레드 시작됨 (파일: {daily_log_path})")
        try:
            from detector import init_model
            init_model()
        except ImportError:
            logging.info("경고: detector 모듈 또는 init_model 함수가 없어 모델 미리 로드를 건너뜁니다.")
        except Exception as e:
            logging.info(f"YOLO 모델 미리 로드 중 오류 발생: {e}")
    except KeyError as e:
        logging.info(f"오류: config.ini에서 'path.log' 설정을 찾을 수 없습니다: {e}")
    except Exception as e:
        logging.info(f"오류: 서버 시작 프로세스 중 예외 발생: {e}")

    yield  # shutdown 할 게 없으면 그냥 yield로 끝

app = FastAPI(
    title="Masking & Encryption API",
    description="API for object detection, tracking, masking, and encryption using LEA GCM mode.",
    version="1.0.0",
    lifespan=lifespan
)
# CORS 미들웨어 추가 (Electron 개발 서버 origin 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Estimated-Completion-Time"]
)

class AutodetectRequest(BaseModel):
    Event: str = Field(..., description="처리할 이벤트 유형 (1: 자동 탐지, 2: 선택 탐지, 3: 마스킹 내보내기, 4: 영역 마스킹)")
    VideoPath: str = Field(..., description="처리할 비디오 파일 경로 (쉼표로 여러 개 구분 가능)")
    FrameNo: Optional[str] = Field(None, description="Event 2에서 사용: 특정 프레임 번호")
    Coordinate: Optional[str] = Field(None, description="Event 2에서 사용: 선택 좌표 (x1,y1,x2,y2 형식)")
    AllMasking: Optional[str] = Field(None, description="Event 3에서 사용: 'yes'인 경우 전체 프레임 마스킹")
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
    config = configparser.ConfigParser(allow_no_value=True)
    config_path = get_resource_path('config.ini')
    logging.info(f"[CFG] using config: {get_resource_path('config.ini')}")
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
#def update_db_masking(filename: str):

def set_video_masking_path_to_desktop():
    config_path = os.path.join(os.path.dirname(__file__), "config.ini")
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

@app.get("/")
def root():
    """ 루트 경로('/')로 GET 요청이 왔을 때 응답합니다. """
    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message="[API] / 요청"))
    return {"message": "FastAPI 서버가 실행 중입니다!"}
# /autodetect 엔드포인트의 Swagger UI에 표시될 요청 예시
autodetect_examples = {
    "Event 1 (Auto Detect)": {
        "summary": "자동 객체 탐지 예시",
        "description": "Event 1은 지정된 비디오에서 설정된 객체를 자동으로 탐지합니다.",
        "value": {
            "Event": "1",
            "VideoPath": "video1.mp4,video2.mp4"
        }
    },
    "Event 2 (Select Detect)": {
        "summary": "선택 객체 탐지 예시",
        "description": "Event 2는 지정된 비디오의 특정 프레임과 좌표를 기반으로 객체를 탐지합니다.",
        "value": {
            "Event": "2",
            "VideoPath": "video.mp4",
            "FrameNo": "150",
            "Coordinate": "100,150,300,400"
        }
    },
    "Event 3 (Masking Export)": {
        "summary": "마스킹 내보내기 예시 (탐지 기반)",
        "description": "Event 3은 탐지된 객체에 마스킹을 적용하여 비디오를 내보냅니다. VideoPath는 보통 탐지 결과 JSON/CSV 파일 경로입니다.",
        "value": {
            "Event": "3",
            "VideoPath": "results/detection_output.json",
            "AllMasking": "no"
        }
    },
    "Event 3 (All Frame Masking)": {
        "summary": "전체 프레임 마스킹 내보내기 예시",
        "description": "Event 3에서 AllMasking='yes'로 설정하면 전체 비디오 프레임에 마스킹을 적용합니다. VideoPath는 원본 비디오 경로입니다.",
        "value": {
            "Event": "3",
            "VideoPath": "original/video.mp4",
            "AllMasking": "yes"
        }
    }
}
@app.post("/autodetect", summary="객체 탐지 또는 마스킹 작업 시작", response_description="생성된 작업 ID")
def autodetect_route(
    background_tasks: BackgroundTasks,
    req: AutodetectRequest = Body(..., examples=autodetect_examples)
):
    """
    요청된 Event 유형에 따라 비디오 처리 작업을 시작합니다.
    
    - **Event 1**: 자동 객체 탐지 (config.ini 설정 기반)
    - **Event 2**: 선택 객체 탐지 (프레임 번호 및 좌표 지정)
    - **Event 3**: 마스킹 적용 및 비디오 내보내기 (탐지 결과 또는 전체 프레임)
    
    요청 유효성 검사 후 작업은 백그라운드에서 실행되며, 반환된 `job_id`를 사용하여 `/progress/{job_id}` 엔드포인트에서 진행 상태를 확인할 수 있습니다.
    """
    # 요청 시각 및 내용 로그 기록
    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 요청: {json.dumps(req.dict(), ensure_ascii=False)}"))
    try:
        config = get_config_data()
        event = req.Event
        if event not in ["1", "2", "3"]:
            log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 요청 오류: 유효하지 않은 Event 값 '{event}'"))
            raise HTTPException(status_code=422, detail=f"유효하지 않은 Event 값입니다: {event}. '1', '2', '3' 중 하나여야 합니다.")
        # [경로 처리] 절대/상대 모두 허용
        base_dir = config['path']['video_path'].strip()
        validated_paths = []
        raw_paths = (req.VideoPath or "").split(',')

        if not raw_paths or not req.VideoPath.strip():
            raise HTTPException(status_code=422, detail="VideoPath는 필수이며 비어 있을 수 없습니다.")

        for vp in raw_paths:
            vp_stripped = (vp or "").strip()
            if not vp_stripped:
                continue

            resolved_path = resolve_video_path(base_dir, vp_stripped)

            # 디버그: 최종 확인 경로 로그
            log_queue.append(logLine(
                path=daily_log_path,
                time=timeToStr(time.time(),'datetime'),
                message=f"[API] /autodetect 경로해석: base_dir='{base_dir}', 입력='{vp_stripped}', 최종='{resolved_path}'"
            ))

            if not os.path.exists(resolved_path):
                raise HTTPException(status_code=400, detail=f"지정된 VideoPath 파일을 찾을 수 없습니다: {vp_stripped}")

            validated_paths.append(resolved_path)

        if not validated_paths:
            raise HTTPException(status_code=422, detail="유효한 VideoPath가 제공되지 않았습니다.")

        validated_video_path = ",".join(validated_paths)

        if not validated_paths:
            raise HTTPException(status_code=422, detail="유효한 VideoPath가 제공되지 않았습니다.")
        validated_video_path = ",".join(validated_paths)
        # 이벤트 유형별 요청 파라미터 유효성 검사
        if event == "1":
            if req.FrameNo is not None or req.Coordinate is not None or req.AllMasking is not None:
                raise HTTPException(status_code=422, detail="Event 1 요청 시 FrameNo, Coordinate, AllMasking 필드는 사용할 수 없습니다.")
        elif event == "2":
            if req.FrameNo is None or req.Coordinate is None:
                raise HTTPException(status_code=422, detail="Event 2 요청 시 FrameNo와 Coordinate 필드는 필수입니다.")
            if req.AllMasking is not None:
                raise HTTPException(status_code=422, detail="Event 2 요청 시 AllMasking 필드는 사용할 수 없습니다.")
            try: int(req.FrameNo)
            except ValueError: raise HTTPException(status_code=422, detail="FrameNo는 유효한 숫자여야 합니다.")
            coords = req.Coordinate.split(',')
            if len(coords) != 2: raise HTTPException(status_code=422, detail="Coordinate는 'x,y' 형식이어야 합니다.")
            try: [int(c.strip()) for c in coords]
            except ValueError: raise HTTPException(status_code=422, detail="Coordinate의 각 값은 유효한 숫자여야 합니다.")
        elif event == "3":
            if req.FrameNo is not None or req.Coordinate is not None:
                raise HTTPException(status_code=422, detail="Event 3 요청 시 FrameNo와 Coordinate 필드는 사용할 수 없습니다.")
            if req.AllMasking is not None and req.AllMasking.lower() not in ["yes", "no"]:
                raise HTTPException(status_code=422, detail="Event 3 요청 시 AllMasking 필드는 'yes' 또는 'no' 값만 허용됩니다.")
		
        job_id = uuid.uuid4().hex
        jobs[job_id] = {
            "progress": 0,
            "result": None,
            "error": None,
            "status": "running",
        }
        util.update_progress(job_id, 0.0, 0, 100)

        def progress_callback(progress):
            util.update_progress(job_id, progress, 0, 100)

        def task(current_job_id: str, event_type: str, video_path_to_process: str, request_data: AutodetectRequest):
            """ 백그라운드에서 실제 비디오 처리를 수행하는 함수 """
            if current_job_id not in jobs:
                logging.info(f"경고: 존재하지 않는 job_id({current_job_id})에 대한 작업 시작 시도됨.")
                log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'),
                                        message=f"[API] /autodetect 경고: 존재하지 않는 job_id({current_job_id})에 대한 작업 시작 시도됨.)"))
                # 작업이 취소되면 종료
                return
            try:
                if event_type == "1":  # 자동 탐지
                    print("main.py: init_model import 전")
                    from detector import autodetector
                    print("main.py: init_model import 후")
                    _, conf_thres, classid = get_config(event_type)
                    result = autodetector(video_path_to_process, conf_thres, classid, log_queue,
                                        lambda frac: util.update_progress(current_job_id, frac, 0, 100))

                elif event_type == "2":  # 선택 탐지
                    from detector import selectdetector
                    _, conf_thres = get_config(event_type)
                    result = selectdetector(video_path_to_process, request_data.FrameNo, request_data.Coordinate,
                                            conf_thres, log_queue,
                                            lambda frac: util.update_progress(current_job_id, frac, 0, 100))

                elif event_type == "3":  # 마스킹 → (옵션) 워터마킹
                    from blur import output_masking, output_allmasking
                    MaskingRange, MaskingTool, MaskingStrength = get_config(event_type)
                    print(f"적용할 마스킹 값: MaskingRange={MaskingRange}, MaskingTool={MaskingTool}, MaskingStrength={MaskingStrength}")

                    # 진행률 콜백: 마스킹 0~80%, 워터마킹 80~100%
                    mask_callback = lambda frac: util.update_progress(current_job_id, frac, 0, 80)
                    wm_callback   = lambda frac: util.update_progress(current_job_id, frac, 80, 100)

                    # 1) 마스킹
                    if request_data.AllMasking and request_data.AllMasking.lower() == "yes":
                        result = output_allmasking(
                            video_path_to_process,
                            MaskingTool,
                            MaskingStrength,
                            log_queue,
                            mask_callback
                        )
                    else:
                        result = output_masking(
                            video_path_to_process,
                            MaskingRange,
                            MaskingTool,
                            MaskingStrength,
                            log_queue,
                            mask_callback
                        )

                    # 2) (옵션) 워터마킹 — 일반 내보내기이므로 마스킹 중간파일 삭제
                    config = get_config_data()
                    if config['export'].get('WaterMarking', 'no').lower() == 'yes':
                        from watermarking import apply_watermark
                        wm_text  = config['export'].get('WaterText', '')
                        wm_trans = int(config['export'].get('WaterTransparency', '100'))
                        wm_logo  = config['export'].get('WaterImgPath', '')
                        wm_loc   = int(config['export'].get('WaterLocation', '4'))

                        result = apply_watermark(
                            result,
                            wm_text,
                            wm_trans,
                            wm_logo,
                            wm_loc,
                            log_queue,
                            wm_callback,
                            remove_input=True,  # ★ 여기서 중간(*_masked.mp4) 삭제
                        )


                else:
                    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'),
                                            message=f"[API] /autodetect 경고: 작업 실행 중 유효하지 않은 Event 값 발견: {event_type}"))
                    raise ValueError(f"작업 실행 중 유효하지 않은 Event 값 발견: {event_type}")

                # 작업 결과 기록
                if current_job_id in jobs:
                    jobs[current_job_id]["result"] = result
                    jobs[current_job_id]["status"] = "completed"
                    util.update_progress(current_job_id, 1.0, 0, 100)
                    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'),
                                            message=f"[API] /autodetect 작업 완료: job_id={current_job_id}, event={event_type}"))

            except (FileNotFoundError, ValueError, ImportError) as e:
                error_message = f"작업 오류 ({type(e).__name__}): {e}"
                if current_job_id in jobs:
                    jobs[current_job_id]["error"] = error_message
                    jobs[current_job_id]["status"] = "error"
                    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                                            message=f"[API] /autodetect 작업 오류: job_id={current_job_id}, event={event_type}, error={error_message}"))
            except Exception as e:
                error_message = f"작업 처리 중 예상치 못한 오류 발생: {e}\n{traceback.format_exc()}"
                if current_job_id in jobs:
                    jobs[current_job_id]["error"] = str(e)
                    jobs[current_job_id]["status"] = "error"
                    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                                            message=f"[API] /autodetect 작업 오류: job_id={current_job_id}, event={event_type}, error={error_message}"))


        threading.Thread(target=lambda: task(job_id, event, validated_video_path, req), daemon=True).start()
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 작업 시작: job_id={job_id}, event={event}"))
        return {"job_id": job_id}
    except HTTPException as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 오류: HTTPException: {e}"))
        raise
    except ValueError as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 오류: ValueError: {e}"))
        raise HTTPException(status_code=400, detail=f"요청 처리 중 설정 오류 발생: {e}")
    except Exception as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 라우트 오류: {e}"))
        raise HTTPException(status_code=500, detail="내부 서버 오류가 발생했습니다.")

# /autoexport 엔드포인트: 일괄 처리 (탐지 → 마스킹 → 워터마킹)
class AutoexportRequest(BaseModel):
    VideoPaths: list = Field(..., description="처리할 비디오 파일 경로 목록")

@app.post("/autoexport", summary="일괄 처리 (탐지 + 마스킹 + 워터마킹)")
def autoexport_route(req: AutoexportRequest = Body(...)):
    log_queue.append(logLine(
        path=daily_log_path,
        time=timeToStr(time.time(), 'datetime'),
        message=f"[API] /autoexport 요청: {len(req.VideoPaths)} files"
    ))
    try:
        if not req.VideoPaths:
            raise HTTPException(status_code=422, detail="VideoPaths는 필수이며 비어 있을 수 없습니다.")

        config = get_config_data()
        base_dir = config['path']['video_path'].strip()

        validated_paths = []
        for vp in req.VideoPaths:
            resolved = resolve_video_path(base_dir, vp)
            if not os.path.exists(resolved):
                raise HTTPException(status_code=400, detail=f"파일을 찾을 수 없습니다: {vp}")
            validated_paths.append(resolved)

        job_id = uuid.uuid4().hex
        jobs[job_id] = {
            "progress": 0,
            "progress_raw": 0.0,
            "result": None,
            "error": None,
            "status": "running",
            "current": 0,
            "total": len(validated_paths),
            "current_video": "",
            "phase": "init",
        }

        def batch_task():
            try:
                total = len(validated_paths)
                for idx, video_path in enumerate(validated_paths):
                    if jobs[job_id].get("status") == "error":
                        break

                    filename = os.path.basename(video_path)
                    jobs[job_id]["current"] = idx + 1
                    jobs[job_id]["current_video"] = filename

                    # Phase 1: 탐지
                    jobs[job_id]["phase"] = "detect"
                    from detector import autodetector
                    _, conf_thres, classid = get_config("1")

                    def detect_cb(frac, _idx=idx, _total=total):
                        file_pct = frac * 50  # 탐지 = 파일당 0~50%
                        jobs[job_id]["progress"] = round(file_pct, 2)
                        overall = (_idx + file_pct / 100.0) / _total
                        jobs[job_id]["progress_raw"] = overall

                    autodetector(video_path, conf_thres, classid, log_queue, detect_cb)

                    # Phase 2: 마스킹
                    jobs[job_id]["phase"] = "mask"
                    from blur import output_masking, output_allmasking
                    MaskingRange, MaskingTool, MaskingStrength = get_config("3")

                    def mask_cb(frac, _idx=idx, _total=total):
                        file_pct = 50 + frac * 30  # 마스킹 = 파일당 50~80%
                        jobs[job_id]["progress"] = round(file_pct, 2)
                        overall = (_idx + file_pct / 100.0) / _total
                        jobs[job_id]["progress_raw"] = overall

                    masked_result = output_masking(
                        video_path, MaskingRange, MaskingTool, MaskingStrength,
                        log_queue, mask_cb
                    )

                    # Phase 3: 워터마킹 (옵션)
                    config_local = get_config_data()
                    if config_local['export'].get('WaterMarking', 'no').lower() == 'yes':
                        jobs[job_id]["phase"] = "watermark"
                        from watermarking import apply_watermark
                        wm_text  = config_local['export'].get('WaterText', '')
                        wm_trans = int(config_local['export'].get('WaterTransparency', '100'))
                        wm_logo  = config_local['export'].get('WaterImgPath', '')
                        wm_loc   = int(config_local['export'].get('WaterLocation', '4'))

                        def wm_cb(frac, _idx=idx, _total=total):
                            file_pct = 80 + frac * 20  # 워터마킹 = 파일당 80~100%
                            jobs[job_id]["progress"] = round(file_pct, 2)
                            overall = (_idx + file_pct / 100.0) / _total
                            jobs[job_id]["progress_raw"] = overall

                        apply_watermark(
                            masked_result, wm_text, wm_trans, wm_logo, wm_loc,
                            log_queue, wm_cb, remove_input=True
                        )

                    # 파일 완료
                    jobs[job_id]["progress"] = 100
                    jobs[job_id]["progress_raw"] = (idx + 1) / total

                    log_queue.append(logLine(
                        path=daily_log_path,
                        time=timeToStr(time.time(), 'datetime'),
                        message=f"[API] /autoexport 파일 완료: {filename} ({idx+1}/{total})"
                    ))

                # 전체 완료
                jobs[job_id]["status"] = "completed"
                jobs[job_id]["progress"] = 100
                jobs[job_id]["progress_raw"] = 1.0
                jobs[job_id]["phase"] = "done"

            except Exception as e:
                jobs[job_id]["error"] = str(e)
                jobs[job_id]["status"] = "error"
                log_queue.append(logLine(
                    path=daily_log_path,
                    time=timeToStr(time.time(), 'datetime'),
                    message=f"[API] /autoexport 오류: {e}\n{traceback.format_exc()}"
                ))

        threading.Thread(target=batch_task, daemon=True).start()
        log_queue.append(logLine(
            path=daily_log_path,
            time=timeToStr(time.time(), 'datetime'),
            message=f"[API] /autoexport 작업 시작: job_id={job_id}, files={len(validated_paths)}"
        ))
        return {"job_id": job_id}

    except HTTPException:
        raise
    except Exception as e:
        log_queue.append(logLine(
            path=daily_log_path,
            time=timeToStr(time.time(), 'datetime'),
            message=f"[API] /autoexport 라우트 오류: {e}"
        ))
        raise HTTPException(status_code=500, detail="내부 서버 오류가 발생했습니다.")

# /encrypt 엔드포인트: 암호화 작업을 백그라운드에서 실행하고 job_id 반환
@app.post(
    "/encrypt",
    summary="비디오 파일 암호화 (LEA GCM)",
    response_description="암호화 작업 시작 및 job_id 반환",
    responses={
        200: {
            "description": "암호화 요청 성공",
            "content": {
                "application/json": {
                    "example": {"job_id": "abc123def", "estimated_completion_time": "2025-04-23 19:15:00"}
                }
            }
        }
    }
)
async def encrypt_endpoint(
    background_tasks: BackgroundTasks,
    file: str = Form(..., description="암호화할 파일의 이름 (config.ini의 video_path 하위에 위치)", examples={"default": {"value": "demo5.mp4"}}),
    encryption_key: str = Header(
        ..., 
        description="RSA-OAEP로 암호화된 대칭키(Base64)", 
        alias='Encryption-Key', 
        examples={"default": {"value": "Base64EncodedCiphertext"}}
    ),  # ← 여기서 괄호 닫힘!
    user_id: str = Header(..., description="요청 사용자 ID", alias='User-Id')
):
    """
    입력 받은 파일 이름을 config.ini 경로 하위에서 찾아 LEA GCM 모드로 암호화합니다.
    - 암호화 키는 헤더(Encryption-Key)에 RSA-OAEP(Base64) 형태로 전달
    - 파일 크기로부터 예측 완료 시간 반환
      원본 파일과 동일한 이름으로 하되 확장자만 "sphereax"로 변경하여 저장합니다.
    - 작업 진행 상황은 progress callback을 통해 업데이트되며, job_id를 통해 확인할 수 있습니다.
	- 암호화 완료 시 DRM 정보(tb_drm_info) 삽입.
    
    ※ Postman 테스트 시, 아래와 같은 순서로 테스트할 수 있습니다.
        1. HTTP Method: POST    
        2. URL: http://localhost:5001/encrypt    
        3. Headers:    
            - Encryption-Key : secret    
        4. Body: form-data 형식에서    
            - key: file, value: demo5.mp4    
    """
    # 요청 시각 및 입력값 로그 기록
    log_queue.append(logLine(
        path=daily_log_path,
        time=timeToStr(time.time(),'datetime'),
        message=f"[API] /encrypt 요청: file={file}, user_id={user_id}"
    ))
    try:
        config = configparser.ConfigParser(allow_no_value=True)
        config.read(get_resource_path('config.ini'), encoding='utf-8')
        base_dir = config['path']['video_path']
        mask_dir = config['path']['video_masking_path']
        input_path = os.path.join(base_dir, file)
        if not os.path.exists(input_path):
            raise HTTPException(status_code=400, detail="입력 파일이 존재하지 않습니다.")
        key = encryption_key.encode('utf-8')
        try:
            enc_key = base64.b64decode(encryption_key)  # Base64로 인코딩된 암호화 키를 디코딩합니다.
            cipher_rsa = PKCS1_OAEP.new(_private_key)  # RSA 복호화 객체를 생성합니다.
            key = cipher_rsa.decrypt(enc_key)  # 암호화된 대칭키를 개인키로 복호화합니다.
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"대칭키 복호화 실패: {e}")  # 복호화 실패 시 400 에러를 반환합니다.
        if len(key) not in (16, 24, 32):
            raise HTTPException(status_code=400, detail="암호화 키의 길이는 16, 24, 또는 32바이트여야 합니다.")
        total_mb = os.path.getsize(input_path) / (1024*1024)
        seconds_per_mb = 60.0 / 400.0
        eta = timeToStr(time.time() + total_mb*seconds_per_mb, 'datetime')
        job_id = uuid.uuid4().hex
        jobs[job_id] = {
            "progress": 0,
            "result": None,
            "error": None,
            "status": "running",
            "estimated_completion_time": eta
        }

        util.update_progress(job_id, 0.0, 0, 100)

        #신규소스코드
        def _norm(p: str) -> str:
            return os.path.normcase(os.path.abspath(p))

        def _is_under(child_path: str, parent_dir: str) -> bool:
            try:
                return os.path.commonpath([_norm(child_path), _norm(parent_dir)]) == _norm(parent_dir)
            except Exception:
                return False

        def safe_delete(path: str, allowed_dir: str, retries: int = 3, sleep_sec: float = 0.2):
            """허용 폴더 하위의 파일만 조심스럽게 삭제(파일잠금 대비 재시도)."""
            if not path or not os.path.exists(path):
                return False
            if not _is_under(path, allowed_dir):
                logging.warning(f"[삭제 스킵] 허용 폴더 바깥: {path}")
                return False
            for _ in range(retries):
                try:
                    os.remove(path)
                    logging.info(f"[삭제] {path}")
                    return True
                except Exception as e:
                    logging.warning(f"[삭제 재시도 대기] {path} ({e})")
                    time.sleep(sleep_sec)
            return False
        #신규소스코드 끝
        
        def encryption_task(job_id, input_file_path, mask_output_dir, key, user_id, file_name):
            """ 마스킹 → 워터마킹(옵션) → 암호화 → DRM 기록 → 중간파일 정리 """
            import os, json, struct, time, logging, configparser
            from Crypto.Random import get_random_bytes

            success = False  # ✅ 최종 성공여부 플래그

            try:
                # 1) config 읽기
                cfg_local = configparser.ConfigParser(allow_no_value=True)
                cfg_local.read(get_resource_path('config.ini'), encoding='utf-8')
                MaskingRange    = cfg_local['export'].get('MaskingRange', '0')
                MaskingTool     = cfg_local['export'].get('MaskingTool',   '1')
                MaskingStrength = cfg_local['export'].get('MaskingStrength','3')

                # 2) 마스킹 실행 (0~20%)
                masked_path = None
                mask_cb = lambda frac: util.update_progress(job_id, frac, 0, 20)

                if MaskingRange != '0':
                    from blur import output_masking
                    masked_path = output_masking(
                        input_file_path, MaskingRange, MaskingTool, MaskingStrength,
                        log_queue, mask_cb
                    )
                elif cfg_local['export'].get('AllMasking','no').lower() == 'yes':
                    from blur import output_allmasking
                    masked_path = output_allmasking(
                        input_file_path, MaskingTool, MaskingStrength,
                        log_queue, mask_cb
                    )

                # 마스킹 실패 방어: 원본 암호화 금지
                if not masked_path or not os.path.exists(masked_path):
                    jobs[job_id]['error']  = '마스킹 파일 생성 실패: 반출/암호화 불가'
                    jobs[job_id]['status'] = 'error'
                    log_queue.append(logLine(
                        path=video_log_path,
                        time=timeToStr(time.time(), 'datetime'),
                        message=f"[API] /encrypt {job_id} 마스킹 파일 없음! 원본 반출 불가"
                    ))
                    return

                # 3) 워터마킹(옵션) (20~40%)
                processed_path = masked_path
                wm_cb = lambda frac: util.update_progress(job_id, frac, 20, 40)

                if cfg_local['export'].get('WaterMarking','no').lower() == 'yes':
                    from watermarking import apply_watermark
                    watermarked_path = apply_watermark(
                        processed_path,
                        cfg_local['export'].get('WaterText',''),
                        int(cfg_local['export'].get('WaterTransparency','100')),
                        cfg_local['export'].get('WaterImgPath',''),   
                        int(cfg_local['export'].get('WaterLocation','4')),
                        log_queue,
                        wm_cb
                    )
                    processed_path = watermarked_path

                # 디버그
                try:
                    print(f"processed_path={processed_path}")
                    print(f"파일 크기={os.path.getsize(processed_path)}")
                except Exception:
                    pass

                # 4) 암호화 (40~95%)
                os.makedirs(mask_output_dir, exist_ok=True)
                name_wo_ext = os.path.splitext(file_name)[0]
                out_name = f"{name_wo_ext}.sphereax"
                output_path = os.path.join(mask_output_dir, out_name)

                nonce = get_random_bytes(12)
                gcm = lea_gcm_lib.LEA_GCM(key)
                gcm.set_iv(nonce)
                gcm.set_aad(b'')

                with open(output_path, 'wb') as outf, open(processed_path, 'rb') as inf:
                    outf.write(nonce)
                    total = max(1, os.path.getsize(processed_path))
                    processed = 0
                    while True:
                        chunk = inf.read(4096)
                        if not chunk:
                            break
                        ciphertext = gcm.encrypt(chunk)
                        outf.write(ciphertext)
                        processed += len(chunk)
                        util.update_progress(job_id, processed / total, 40, 95)
                    tag = gcm.finalize()
                    outf.write(tag)
                    logging.info(f"[encrypt_task DEBUG] Generated tag: {tag.hex()}")

                # 5) DRM 정보 DB 기록
                from datetime import datetime, timedelta
                import hashlib
                sha256 = hashlib.sha256()
                with open(output_path, 'rb') as f:
                    for chunk in iter(lambda: f.read(4096), b''):
                        sha256.update(chunk)
                file_hash = sha256.hexdigest()
                play_date = datetime.now() + timedelta(days=30)
                play_count = 99
                play_date_str = play_date.strftime('%Y-%m-%d')
                insert_drm_info(
                    file_hash=file_hash,
                    ori_file_name=os.path.basename(input_file_path),
                    org_filepath=os.path.dirname(input_file_path),
                    masking_file_name=os.path.basename(masked_path),
                    masking_status="s0",
                    enc_file_name=os.path.basename(output_path),
                    enc_status="s0",
                    play_date=play_date_str,
                    play_count=play_count
                )

                # 6) DRM 메타 정보 추가 기록
                meta_obj = {'play_date': play_date_str, 'play_count': play_count}
                meta_bytes = json.dumps(meta_obj).encode('utf-8')
                with open(output_path, 'ab') as meta_file:
                    meta_file.write(b'META')
                    meta_file.write(struct.pack('>I', len(meta_bytes)))
                    meta_file.write(meta_bytes)
                    logging.info(f"[encrypt_task DEBUG] Written marker 'META' and length {len(meta_bytes)}")

                # 성공 처리
                success = True
                util.update_progress(job_id, 1.0, 95, 100)
                jobs[job_id].update({'result': output_path, 'status': 'completed'})
                log_queue.append(logLine(
                    path=video_log_path,
                    time=timeToStr(time.time(),'datetime'),
                    message=f"[API] /encrypt {job_id} 암호화 완료: {os.path.basename(output_path)}"
                ))

            except Exception as ex:
                # 실패 처리
                util.update_progress(job_id, 0.0, 0, 100)
                jobs[job_id].update({'error': str(ex), 'status': 'error'})
                log_queue.append(logLine(
                    path=video_log_path,
                    time=timeToStr(time.time(),'datetime'),
                    message=f"[API] /encrypt {job_id} 예외: {ex}"
                ))

            # 7) 중간파일 정리(성공시에만) — .sphereax만 남기기
            try:
                if success:
                    # 내보내기 경로 하위 파일만 지우도록 제한
                    def _abs(p): return os.path.abspath(p)
                    def _under(child, parent):
                        try:
                            return os.path.commonpath([_abs(child), _abs(parent)]) == _abs(parent)
                        except Exception:
                            return False

                    base_name_from_input = os.path.splitext(os.path.basename(input_file_path))[0]
                    base_name_from_file  = os.path.splitext(file_name)[0]

                    candidates = set()

                    # 실제 암호화 입력 파일(워터마킹 ON: *_wm.mp4, OFF: *_masked.mp4)
                    if 'processed_path' in locals() and processed_path and os.path.exists(processed_path):
                        candidates.add(processed_path)

                    # 네이밍 후보들(내보내기 경로 하위)
                    for bn in (base_name_from_input, base_name_from_file):
                        if bn:
                            candidates.add(os.path.join(mask_output_dir, f"{bn}_masked.mp4"))
                            candidates.add(os.path.join(mask_output_dir, f"{bn}_wm.mp4"))

                    for p in candidates:
                        try:
                            if os.path.exists(p) and _under(p, mask_output_dir):
                                os.remove(p)
                                logging.info(f"[삭제] 중간 파일 삭제됨: {p}")
                        except Exception as e:
                            logging.warning(f"[삭제 실패] {p} -> {e}")

            except Exception as e:
                logging.warning(f"[정리 실패] 중간 파일 삭제 중 오류: {e}")
      
        # 스레드 실행
        threading.Thread(target=lambda: encryption_task(job_id, input_path, mask_dir, key, user_id, file), daemon=True).start()
        return {"job_id": job_id, "estimated_completion_time": eta}
    except HTTPException:
        raise
    except Exception as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'), message=f"[API] /encrypt 오류: {e}"))
        raise HTTPException(status_code=500, detail=f"암호화 처리 중 오류 발생: {e}")
    
# /decrypt 엔드포인트: 메모리 복호화 스트리밍 및 예상 완료 시간 헤더 추가
@app.post(
    "/decrypt",
    summary="비디오 파일 복호화 (LEA GCM)",
    response_description="복호화 작업 시작 및 job_id 반환",
    responses={
        200: {
            "description": "복호화 요청 성공",
            "content": {
                "application/json": {
                    "example": {"job_id": "xyz789uvw", "estimated_completion_time": "2025-04-23 19:20:00"}
                }
            }
        }
    }
)
async def decrypt_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="복호화할 파일(.sphereax) 업로드", alias="file"),
    encryption_key: str = Header(..., description="RSA-OAEP로 암호화된 대칭키(Base64)", alias='Encryption-Key', examples={"default": {"value": "Base64EncodedCiphertext"}})
):
    """
    암호화된 파일을 읽어 LEA GCM 모드로 복호화합니다.
    """
    logging.info(f"[decrypt_debug] /decrypt 요청: file_upload={file.filename}")	
    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'), message=f"[API] /decrypt 요청: file_upload={file.filename}"))

    try:
        # 키 유효성 검사
        if encryption_key is None:
            raise HTTPException(status_code=422, detail="필수 헤더 'Encryption-Key'가 누락되었습니다.")
        # 파일 존재 및 키 유효성 검사
        key = encryption_key.encode('utf-8')
        # --- RSA 복호화로 대칭키 획득 ---
        try:
            enc_key = base64.b64decode(encryption_key)
            cipher_rsa = PKCS1_OAEP.new(_private_key)
            key = cipher_rsa.decrypt(enc_key)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"대칭키 복호화 실패: {e}")
        # ----------------------------------------
        if len(key) not in (16, 24, 32):
            raise HTTPException(status_code=400, detail="암호화 키의 길이는 16, 24, 또는 32바이트여야 합니다.")
        # 임시 업로드 경로 설정 및 저장
        config = get_config_data()
        base_dir = config['path']['video_masking_path']
        upload_dir = os.path.join(base_dir, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        temp_filename = f"{uuid.uuid4().hex}_{file.filename}"
        temp_path = os.path.join(upload_dir, temp_filename)
        with open(temp_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
        total_mb = os.path.getsize(temp_path)/(1024*1024)
        seconds_per_mb = 60.0/400.0
        eta = timeToStr(time.time()+total_mb*seconds_per_mb, 'datetime')
        print(f"[decrypt_debug] ETA: {eta}", flush=True)
        
        # job 초기화
        job_id = uuid.uuid4().hex
        jobs[job_id] = {
            "progress_raw": 0.0,
            "result": None,
            "error": None,
            "status": "running",
            "estimated_completion_time": eta
        }
        util.update_progress(job_id, 0.0, 0, 100)

        def task():
            try:
                start_time = time.time()
                data = open(temp_path, 'rb').read()
                log_queue.append(logLine(
                    path=video_log_path,
                    time=timeToStr(time.time(), 'datetime'),
                    message=f"[API] /decrypt {job_id} 복호화 시작: file={file.filename}"))
                print(f"Decryption start: {timeToStr(start_time, 'datetime')}, size: {len(data)/1024/1024:.2f} MiB", flush=True)
                # 파일에서 Nonce, 암호문, 인증 태그, 메타데이터를 분리합니다.
                tag_len = 16
                marker = b'META'
                idx = data.rfind(marker)
                if idx != -1 and idx + 8 <= len(data):
                    meta_len = struct.unpack('>I', data[idx+4:idx+8])[0]
                    meta_total_len = 4 + 4 + meta_len
                    tag_start = len(data) - meta_total_len - tag_len
                else:
                    tag_start = len(data) - tag_len
                nonce = data[:12]
                ciphertext = data[12:tag_start]
                tag = data[tag_start:tag_start + tag_len]
                # 복호화 및 태그 검증
                gcm_decrypt = lea_gcm_lib.LEA_GCM(key)
                gcm_decrypt.set_iv(nonce)
                gcm_decrypt.set_aad(b'')
                plaintext_chunks = []
                total_len = len(ciphertext)
                # (1) 복호화 진행률: 0~45%
                for i in range(0, total_len, 4096):
                    chunk = ciphertext[i:i+4096]
                    plaintext_chunk = gcm_decrypt.decrypt(chunk)
                    plaintext_chunks.append(plaintext_chunk)
                    util.update_progress(job_id, (i+len(chunk))/max(1, total_len), 0, 45)
                # (2) 태그 검증 진행률: 45~90%
                gcm_check = lea_gcm_lib.LEA_GCM(key)
                gcm_check.set_iv(nonce)
                gcm_check.set_aad(b'')
                for idx, plain in enumerate(plaintext_chunks):
                    gcm_check.encrypt(plain)
                    util.update_progress(job_id, (idx+1)/max(1, len(plaintext_chunks)), 45, 90)
                expected_tag = gcm_check.finalize()
                print(f"[decrypt_debug] expected_tag={expected_tag.hex()}, actual_tag={tag.hex()}", flush=True)
                if expected_tag != tag:
                    raise HTTPException(status_code=400, detail="암호화 키 검증 실패: 잘못된 키입니다.")
                out_name = os.path.splitext(file.filename)[0] + '_dec.mp4'  # 복호화된 파일 이름을 결정합니다.
                out_path = os.path.join(base_dir, out_name)
                with open(out_path, 'wb') as outf:
                    gcm = lea_gcm_lib.LEA_GCM(key)
                    gcm.set_iv(nonce)
                    gcm.set_aad(b'')
                    # (3) 복호화 파일 기록 진행률: 90~99%
                    for i in range(0, total_len, 4096):
                        chunk = ciphertext[i:i+4096]
                        plaintext = gcm.decrypt(chunk)
                        outf.write(plaintext)
                        util.update_progress(job_id, (i+len(chunk))/max(1, total_len), 90, 99)
                os.remove(temp_path)
                # (4) 최종 완료: 99~100%
                util.update_progress(job_id, 1.0, 99, 100)
                jobs[job_id]['status'] = 'completed'
                jobs[job_id]['result'] = out_path

                end_time = time.time()
                print(f"Decryption end: {timeToStr(end_time,'datetime')}, processed: {total_mb:.2f} MiB in {end_time-start_time:.2f}s")
                log_queue.append(logLine(
                    path=video_log_path,
                    time=timeToStr(time.time(),'datetime'),
                    message=f"[API] /decrypt {job_id} 복호화 완료: file={out_path}"))

            except Exception as ex:
                util.update_progress(job_id, 0.0, 0, 100)
                jobs[job_id]['error'] = str(ex)
                jobs[job_id]['status'] = 'error'
                log_queue.append(logLine(
                    path=video_log_path,
                    time=timeToStr(time.time(),'datetime'),
                    message=f"[API] /decrypt {job_id} Exception: {ex}"))

        threading.Thread(target=task, daemon=True).start()
        return {"job_id": job_id, "estimated_completion_time": eta}

    except HTTPException as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'), message=f"[API] /decrypt HTTPException: {e}"))
        raise
    except Exception as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'), message=f"[API] /decrypt Exception: {e}"))
        raise HTTPException(status_code=500, detail=f"복호화 처리 중 오류 발생: {e}")
    

# /progress 엔드포인트:
@app.get("/progress/{job_id}", summary="작업 진행 상태 조회", response_description="작업 진행 상태 정보 (JSON)")
def get_progress(job_id: str):
    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'),
                             message=f"[API] /progress 요청: job_id={job_id}"))

    if job_id not in jobs:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'),
                                 message=f"[API] /progress HTTPException"))
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    # 원본 dict 복사
    resp = dict(jobs[job_id])

    # 1) 새 구조: progress_raw(0~1) → progress(0~100)로 변환
    raw = resp.get("progress_raw")
    if raw is not None:
        try:
            pct = round(float(raw) * 100.0, 2)
            resp["progress"] = pct
        except Exception:
            # 혹시라도 형변환 실패 시 fallback
            pass
    else:
        # 2) 구(legacy) 구조 대비: progress가 0~1로 들어온 경우도 정규화
        p = resp.get("progress", 0.0)
        try:
            p = float(p)
            if p <= 1.0:  # 과거에 비율을 그대로 저장한 경우
                p = p * 100.0
            resp["progress"] = max(0.0, min(p, 100.0))
        except Exception:
            resp["progress"] = 0.0

    return resp

# main: uvicorn으로 실행 (release 시 reload 옵션 제거)
if __name__ == "__main__":
    create_drm_table(DB_FILE)
    set_video_masking_path_to_desktop()
    try:
        config = get_config_data()
        host = config['fastapi'].get('host', '0.0.0.0')
        port = int(config['fastapi'].get('port', 5001))
        # reload=True: 코드 변경 시 서버 자동 재시작 (개발용)
        # 운영 환경에서는 reload=False 또는 Gunicorn/Uvicorn 워커 사용 권장
        uvicorn.run(app, host=host, port=port, reload=False)
    except KeyError as e:
        print(f"오류: config.ini 파일에서 [fastapi] 섹션 또는 필요한 키(host, port)를 찾을 수 없습니다: {e}")
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'), message=f"[API] main KeyError: {e}"))
    except ValueError as e:
        print(f"오류: config.ini 파일의 port 값이 유효한 숫자가 아닙니다: {e}")
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'), message=f"[API] main ValueError: {e}"))
    except Exception as e:
        print(f"FastAPI 서버 실행 중 오류 발생: {e}")
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(),'datetime'), message=f"[API] main Exception: {e}"))