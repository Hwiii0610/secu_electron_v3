"""
전역 공유 상태 관리
- jobs: 모든 비동기 작업의 상태를 추적하는 딕셔너리
- log_queue: 비동기 로그 쓰기를 위한 큐
- 동시 작업 제한: MAX_CONCURRENT_JOBS를 초과하지 않도록 관리
- 작업 상태 영속화: 디스크에 저장/복원
"""
import util
import threading
import json
import os
import time
import logging
from typing import Deque
from collections import deque
from util import logLine, get_resource_path

logger = logging.getLogger(__name__)

# 전역 작업 상태 딕셔너리 (모든 라우터에서 공유)
jobs: dict = {}
util.jobs = jobs

# 전역 로그 큐
log_queue: Deque[logLine] = deque()

# 동시 작업 제한
MAX_CONCURRENT_JOBS = 2
_active_jobs = 0
_lock = threading.Lock()

# 작업 상태 파일 경로
_jobs_state_dir = None

def _get_jobs_state_dir():
    """작업 상태 저장 디렉토리 반환 (초기화 필요)"""
    global _jobs_state_dir
    if _jobs_state_dir is None:
        config_dir = os.path.dirname(get_resource_path('config.ini'))
        _jobs_state_dir = os.path.join(config_dir, 'jobs')
        os.makedirs(_jobs_state_dir, exist_ok=True)
    return _jobs_state_dir

def _get_job_state_file(job_id: str) -> str:
    """특정 job_id의 상태 파일 경로 반환"""
    return os.path.join(_get_jobs_state_dir(), f"{job_id}.json")


def acquire_job_slot():
    """
    작업 슬롯 획득. 가능하면 True, 불가하면 False
    동시 실행 가능한 작업 수 초과 시 False 반환
    """
    global _active_jobs
    with _lock:
        if _active_jobs >= MAX_CONCURRENT_JOBS:
            return False
        _active_jobs += 1
        return True


def release_job_slot():
    """작업 슬롯 해제"""
    global _active_jobs
    with _lock:
        _active_jobs = max(0, _active_jobs - 1)


def get_active_job_count():
    """현재 활성 작업 수 반환"""
    with _lock:
        return _active_jobs


def save_job_state(job_id: str):
    """
    현재 메모리의 job_id 작업 정보를 JSON 파일로 저장
    """
    if job_id not in jobs:
        logger.warning(f"[STATE] 존재하지 않는 job_id로 저장 시도: {job_id}")
        return

    try:
        job_data = dict(jobs[job_id])

        # 직렬화 불가능한 필드 제거 (콜백 함수 등)
        # 필요한 필드만 저장
        serializable_data = {
            "job_id": job_id,
            "status": job_data.get("status"),
            "progress": job_data.get("progress"),
            "progress_raw": job_data.get("progress_raw"),
            "result": job_data.get("result"),
            "error": job_data.get("error"),
            "event_type": job_data.get("event_type"),
            "phase": job_data.get("phase"),
            "current": job_data.get("current"),
            "total": job_data.get("total"),
            "current_video": job_data.get("current_video"),
            "video_path": job_data.get("video_path"),
            "start_time": job_data.get("start_time"),
            "eta_seconds": job_data.get("eta_seconds"),
            "created_at": job_data.get("created_at"),
            "updated_at": time.time(),
        }

        state_file = _get_job_state_file(job_id)
        with open(state_file, 'w') as f:
            json.dump(serializable_data, f, indent=2)

        logger.debug(f"[STATE] 작업 상태 저장 완료: {job_id}")
    except Exception as e:
        logger.error(f"[STATE] 작업 상태 저장 실패 ({job_id}): {e}")


def load_job_states():
    """
    디스크에 저장된 모든 job 상태를 메모리의 jobs dict에 로드
    이미 "completed" 또는 "error" 상태인 작업만 복원 (24시간 이전은 제거)
    """
    jobs_dir = _get_jobs_state_dir()

    if not os.path.exists(jobs_dir):
        logger.info("[STATE] 작업 상태 디렉토리가 없습니다 (첫 실행인 듯)")
        return

    current_time = time.time()
    loaded_count = 0
    removed_count = 0

    try:
        for filename in os.listdir(jobs_dir):
            if not filename.endswith('.json'):
                continue

            job_id = filename[:-5]  # .json 제거
            state_file = _get_job_state_file(job_id)

            try:
                with open(state_file, 'r') as f:
                    job_data = json.load(f)

                # 24시간 이상 지난 작업 제거
                updated_at = job_data.get("updated_at", 0)
                age_hours = (current_time - updated_at) / 3600

                if age_hours > 24:
                    os.remove(state_file)
                    removed_count += 1
                    logger.debug(f"[STATE] 24시간 이상 지난 작업 상태 삭제: {job_id}")
                    continue

                # "running" 상태를 "interrupted"로 변경
                status = job_data.get("status", "unknown")
                if status == "running":
                    job_data["status"] = "interrupted"
                    job_data["error"] = "Server restarted during execution"

                # jobs dict에 복원
                jobs[job_id] = job_data
                loaded_count += 1
                logger.info(f"[STATE] 작업 상태 복원: {job_id} (status={status})")

            except Exception as e:
                logger.error(f"[STATE] 작업 상태 로드 실패 ({job_id}): {e}")

    except Exception as e:
        logger.error(f"[STATE] 작업 상태 디렉토리 읽기 실패: {e}")

    logger.info(f"[STATE] 작업 상태 로드 완료: 복원={loaded_count}, 삭제={removed_count}")


def delete_job_state(job_id: str):
    """
    특정 작업의 상태 파일 삭제 (작업 성공 시)
    """
    try:
        state_file = _get_job_state_file(job_id)
        if os.path.exists(state_file):
            os.remove(state_file)
            logger.debug(f"[STATE] 작업 상태 파일 삭제: {job_id}")
    except Exception as e:
        logger.error(f"[STATE] 작업 상태 파일 삭제 실패 ({job_id}): {e}")


def get_recent_jobs(limit: int = 50) -> list:
    """
    최근 작업 히스토리 반환 (메모리 + 디스크)
    limit: 반환할 최대 작업 수
    """
    all_jobs = dict(jobs)  # 현재 메모리의 jobs 복사

    # 디스크의 상태 파일도 읽음 (메모리에 없는 것들)
    jobs_dir = _get_jobs_state_dir()
    if os.path.exists(jobs_dir):
        try:
            for filename in os.listdir(jobs_dir):
                if not filename.endswith('.json'):
                    continue

                job_id = filename[:-5]
                if job_id not in all_jobs:
                    state_file = _get_job_state_file(job_id)
                    try:
                        with open(state_file, 'r') as f:
                            all_jobs[job_id] = json.load(f)
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"[STATE] 작업 히스토리 로드 실패: {e}")

    # updated_at 기준으로 정렬 (최신순)
    sorted_jobs = sorted(
        all_jobs.items(),
        key=lambda x: x[1].get("updated_at", 0),
        reverse=True
    )

    return [job[1] for job in sorted_jobs[:limit]]
