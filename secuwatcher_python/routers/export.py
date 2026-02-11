"""
일괄 처리(배치) 라우터
- POST /autoexport : 탐지 → 마스킹 → 워터마킹 일괄 파이프라인
"""
import os
import time
import uuid
import threading
import traceback

from fastapi import APIRouter, HTTPException, Body
from util import logLine, timeToStr
import util

from core.state import jobs, log_queue
from core.config import get_config_data, get_config, resolve_video_path
from models.schemas import AutoexportRequest

# 로그 경로는 main.py에서 초기화 후 설정됨
daily_log_path: str = ""
video_log_path: str = ""

router = APIRouter()


def init_log_paths(daily: str, video: str):
    """main.py에서 호출하여 로그 경로를 설정"""
    global daily_log_path, video_log_path
    daily_log_path = daily
    video_log_path = video


@router.post("/autoexport", summary="일괄 처리 (탐지 + 마스킹 + 워터마킹)")
def autoexport_route(req: AutoexportRequest = Body(...)):
    """
    복수의 비디오 파일에 대해 탐지 → 마스킹 → 워터마킹(옵션) 파이프라인을
    순차적으로 실행합니다. 반환된 job_id로 진행률을 조회할 수 있습니다.
    """
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
