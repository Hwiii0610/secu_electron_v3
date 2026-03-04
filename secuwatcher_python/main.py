"""
SecuWatcher Python Backend — FastAPI 진입점
- FastAPI 앱 생성 및 라이프사이클 관리
- CORS 미들웨어 설정
- 라우터 등록
- uvicorn 실행
"""
# NOTE: cv2를 먼저 import하여 OpenCV의 FFmpeg가 PyAV보다 먼저 로드되도록 함
# (PyAV와의 FFmpeg 중복 로드 충돌 방지)
import cv2

import os
import sys
import io

if sys.stdout is None:
    sys.stdout = io.StringIO()
if sys.stderr is None:
    sys.stderr = io.StringIO()

import time
import logging
import threading

logger = logging.getLogger(__name__)

import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from util import logLine, timeToStr, log_writer

# ─── Core 모듈 임포트 ───
from core.state import jobs, log_queue, load_job_states
from core.config import get_config_data, set_video_masking_path_to_desktop, initialize_config_paths
from core.logging_setup import setup_logging
from core.database import DB_FILE, create_drm_table

# ─── 로깅 초기화 ───
daily_log_path, video_log_path = setup_logging()

# ─── 라우터 임포트 및 로그 경로 전달 ───
from routers import detection, export, encryption

detection.init_log_paths(daily_log_path, video_log_path)
export.init_log_paths(daily_log_path, video_log_path)
encryption.init_log_paths(daily_log_path, video_log_path)


# ─── FastAPI 앱 라이프사이클 ───
@asynccontextmanager
async def lifespan(app):
    try:
        # ─── config.ini 경로 초기화 (상대 경로 → 절대 경로) ───
        initialize_config_paths()
        logging.info("config.ini 경로 초기화 완료")

        # ─── 보안 모듈 초기화 (RSA 개인키 + LEA GCM 라이브러리) ───
        from core.security import initialize_security
        initialize_security()
        logging.info("보안 모듈 초기화 완료 (RSA + LEA)")

        # ─── 이전 작업 상태 복원 ───
        load_job_states()
        logging.info("이전 작업 상태 복원 완료")

        t = threading.Thread(target=log_writer, args=(log_queue, daily_log_path), daemon=True)
        t.start()
        logging.info(f"로그 쓰기 스레드 시작됨 (파일: {daily_log_path})")
        # YOLO/SAM2 모델은 각 Event 호출 시 lazy loading (detector.py, sam2_detector.py)
        logging.info("모델 lazy loading 모드: Event 호출 시 로드됩니다.")
    except KeyError as e:
        logging.info(f"오류: config.ini에서 'path.log' 설정을 찾을 수 없습니다: {e}")
    except Exception as e:
        logging.info(f"오류: 서버 시작 프로세스 중 예외 발생: {e}")

    yield


# ─── FastAPI 앱 인스턴스 생성 ───
app = FastAPI(
    title="Masking & Encryption API",
    description="API for object detection, tracking, masking, and encryption using LEA GCM mode.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 미들웨어 추가 (로컬 전용 앱 — Electron file:// 포함 모든 origin 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Estimated-Completion-Time"]
)

# ─── 라우터 등록 ───
app.include_router(detection.router)
app.include_router(export.router)
app.include_router(encryption.router)


# ─── 루트 엔드포인트 ───
@app.get("/")
def root():
    """ 루트 경로('/')로 GET 요청이 왔을 때 응답합니다. """
    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message="[API] / 요청"))
    return {"message": "FastAPI 서버가 실행 중입니다!"}


# ─── 작업 히스토리 엔드포인트 ───
@app.get("/jobs")
def get_jobs_history(limit: int = 50):
    """ 최근 작업 히스토리를 반환합니다. """
    from core.state import get_recent_jobs
    try:
        recent_jobs = get_recent_jobs(limit=limit)
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /jobs 요청: limit={limit}, count={len(recent_jobs)}"))
        return {
            "total": len(recent_jobs),
            "limit": limit,
            "jobs": recent_jobs
        }
    except Exception as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /jobs 오류: {e}"))
        return {
            "total": 0,
            "limit": limit,
            "jobs": [],
            "error": str(e)
        }


# ─── 메인 실행 ───
if __name__ == "__main__":
    create_drm_table(DB_FILE)
    set_video_masking_path_to_desktop()
    try:
        config = get_config_data()
        host = config['fastapi'].get('host', '0.0.0.0')
        port = int(config['fastapi'].get('port', 5001))
        uvicorn.run(app, host=host, port=port, reload=False)
    except KeyError as e:
        logger.error(f"config.ini 파일에서 [fastapi] 섹션 또는 필요한 키(host, port)를 찾을 수 없습니다: {e}")
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] main KeyError: {e}"))
    except ValueError as e:
        logger.error(f"config.ini 파일의 port 값이 유효한 숫자가 아닙니다: {e}")
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] main ValueError: {e}"))
    except Exception as e:
        logger.error(f"FastAPI 서버 실행 중 오류 발생: {e}")
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] main Exception: {e}"))
