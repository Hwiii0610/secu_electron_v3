"""
탐지 관련 라우터
- POST /autodetect  : 자동/선택 객체 탐지, 마스킹 내보내기
- GET  /progress/{job_id} : 작업 진행 상태 조회
"""
import os
import json
import time
import uuid
import logging
import threading
import traceback

from fastapi import APIRouter, HTTPException, BackgroundTasks, Body
from util import logLine, timeToStr
import util

from core.state import jobs, log_queue, acquire_job_slot, release_job_slot, MAX_CONCURRENT_JOBS, save_job_state, delete_job_state
from core.config import get_config_data, get_config, resolve_video_path
from models.schemas import AutodetectRequest, autodetect_examples
from core.errors import api_error

logger = logging.getLogger(__name__)

# 로그 경로는 main.py에서 초기화 후 설정됨
daily_log_path: str = ""
video_log_path: str = ""

router = APIRouter()


def init_log_paths(daily: str, video: str):
    """main.py에서 호출하여 로그 경로를 설정"""
    global daily_log_path, video_log_path
    daily_log_path = daily
    video_log_path = video


@router.post("/autodetect", summary="객체 탐지 또는 마스킹 작업 시작", response_description="생성된 작업 ID")
def autodetect_route(
    background_tasks: BackgroundTasks,
    req: AutodetectRequest = Body(..., examples=autodetect_examples)
):
    """
    요청된 Event 유형에 따라 비디오 처리 작업을 시작합니다.

    - **Event 1**: 자동 객체 탐지 (config.ini 설정 기반)
    - **Event 2**: 선택 객체 탐지 (프레임 번호 및 좌표 지정)
    - **Event 3**: 마스킹 적용 및 비디오 내보내기 (탐지 결과 또는 전체 프레임)

    반환된 `job_id`를 사용하여 `/progress/{job_id}` 엔드포인트에서 진행 상태를 확인할 수 있습니다.
    """
    # 요청 시각 및 내용 로그 기록
    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 요청: {json.dumps(req.dict(), ensure_ascii=False)}"))
    try:
        config = get_config_data()
        event = req.Event
        if event not in ["1", "2", "3"]:
            log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 요청 오류: 유효하지 않은 Event 값 '{event}'"))
            api_error(422, "INVALID_EVENT", f"유효하지 않은 Event 값입니다: {event}. '1', '2', '3' 중 하나여야 합니다.", suggestion="Event는 '1', '2', '3' 중 하나여야 합니다.")

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
            log_queue.append(logLine(
                path=daily_log_path,
                time=timeToStr(time.time(), 'datetime'),
                message=f"[API] /autodetect 경로해석: base_dir='{base_dir}', 입력='{vp_stripped}', 최종='{resolved_path}'"
            ))
            if not os.path.exists(resolved_path):
                api_error(400, "FILE_NOT_FOUND", "영상 파일을 찾을 수 없습니다", suggestion="파일 경로를 확인해주세요", context={"path": vp_stripped})
            validated_paths.append(resolved_path)

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
            try:
                int(req.FrameNo)
            except ValueError:
                raise HTTPException(status_code=422, detail="FrameNo는 유효한 숫자여야 합니다.")
            coords = req.Coordinate.split(',')
            if len(coords) != 2:
                raise HTTPException(status_code=422, detail="Coordinate는 'x,y' 형식이어야 합니다.")
            try:
                [int(c.strip()) for c in coords]
            except ValueError:
                raise HTTPException(status_code=422, detail="Coordinate의 각 값은 유효한 숫자여야 합니다.")
        elif event == "3":
            if req.FrameNo is not None or req.Coordinate is not None:
                raise HTTPException(status_code=422, detail="Event 3 요청 시 FrameNo와 Coordinate 필드는 사용할 수 없습니다.")
            if req.AllMasking is not None and req.AllMasking.lower() not in ["yes", "no"]:
                raise HTTPException(status_code=422, detail="Event 3 요청 시 AllMasking 필드는 'yes' 또는 'no' 값만 허용됩니다.")

        # 동시 작업 제한 확인
        if not acquire_job_slot():
            api_error(429, "TOO_MANY_JOBS", "동시 작업 제한에 도달했습니다.",
                      suggestion=f"현재 작업이 완료될 때까지 기다려주세요. 최대 {MAX_CONCURRENT_JOBS}개 작업 동시 실행 가능",
                      context={"max_concurrent_jobs": MAX_CONCURRENT_JOBS})

        job_id = uuid.uuid4().hex
        jobs[job_id] = {
            "progress": 0,
            "result": None,
            "error": None,
            "status": "running",
            "event_type": event,
            "phase": "model_loading",
            "video_path": validated_video_path,
            "created_at": time.time(),
        }
        util.update_progress(job_id, 0.0, 0, 100)
        # 작업 상태 저장
        save_job_state(job_id)

        def task(current_job_id: str, event_type: str, video_path_to_process: str, request_data: AutodetectRequest):
            """ 백그라운드에서 실제 비디오 처리를 수행하는 함수 """
            try:
                logger.info(f"[TASK] 작업 시작: job_id={current_job_id}, event={event_type}, video={video_path_to_process}")
                if current_job_id not in jobs:
                    logging.info(f"경고: 존재하지 않는 job_id({current_job_id})에 대한 작업 시작 시도됨.")
                    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                                            message=f"[API] /autodetect 경고: 존재하지 않는 job_id({current_job_id})에 대한 작업 시작 시도됨."))
                    release_job_slot()
                    return
                
                # 작업 상태 업데이트
                jobs[current_job_id]["status"] = "running"
                jobs[current_job_id]["phase"] = "initializing"
                save_job_state(current_job_id)
                
                if event_type == "1":  # 자동 탐지
                    logger.info(f"[TASK] 자동 탐지 시작: job_id={current_job_id}")
                    logger.debug("main.py: init_model import 전")
                    from detector import autodetector
                    logger.debug("main.py: init_model import 후")
                    _, conf_thres, classid = get_config(event_type)
                    logger.info(f"[TASK] 설정 로드 완료: conf_thres={conf_thres}, classid={classid}")
                    result = autodetector(video_path_to_process, conf_thres, classid, log_queue,
                                         lambda frac: util.update_progress(current_job_id, frac, 5, 100),
                                         job_id=current_job_id)
                    logger.info(f"[TASK] 자동 탐지 완료: result={result}")

                elif event_type == "2":  # 선택 탐지 (SAM2)
                    from sam2_detector import selectdetector_sam2
                    result = selectdetector_sam2(
                        video_path_to_process, request_data.FrameNo, request_data.Coordinate,
                        log_queue, lambda frac: util.update_progress(current_job_id, frac, 5, 100),
                        job_id=current_job_id,
                    )

                elif event_type == "3":  # 마스킹 → (옵션) 워터마킹
                    from blur import output_masking, output_allmasking
                    MaskingRange, MaskingTool, MaskingStrength = get_config(event_type)
                    logger.debug(f"적용할 마스킹 값: MaskingRange={MaskingRange}, MaskingTool={MaskingTool}, MaskingStrength={MaskingStrength}")

                    # 진행률 콜백: 마스킹 0~80%, 워터마킹 80~100%
                    mask_callback = lambda frac: util.update_progress(current_job_id, frac, 0, 80)
                    wm_callback   = lambda frac: util.update_progress(current_job_id, frac, 80, 100)

                    # 1) 마스킹
                    if request_data.AllMasking and request_data.AllMasking.lower() == "yes":
                        result = output_allmasking(
                            video_path_to_process, MaskingTool, MaskingStrength,
                            log_queue, mask_callback
                        )
                    else:
                        result = output_masking(
                            video_path_to_process, MaskingRange, MaskingTool, MaskingStrength,
                            log_queue, mask_callback
                        )

                    # 2) (옵션) 워터마킹 — 일반 내보내기이므로 마스킹 중간파일 삭제
                    config_local = get_config_data()
                    if config_local['export'].get('WaterMarking', 'no').lower() == 'yes':
                        from watermarking import apply_watermark
                        wm_text  = config_local['export'].get('WaterText', '')
                        wm_trans = int(config_local['export'].get('WaterTransparency', '100'))
                        wm_logo  = config_local['export'].get('WaterImgPath', '')
                        wm_loc   = int(config_local['export'].get('WaterLocation', '4'))
                        result = apply_watermark(
                            result, wm_text, wm_trans, wm_logo, wm_loc,
                            log_queue, wm_callback, remove_input=True,
                        )

                else:
                    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                                            message=f"[API] /autodetect 경고: 작업 실행 중 유효하지 않은 Event 값 발견: {event_type}"))
                    raise ValueError(f"작업 실행 중 유효하지 않은 Event 값 발견: {event_type}")

                # 작업 결과 기록 (취소된 경우 completed로 변경하지 않음)
                if current_job_id in jobs:
                    if jobs[current_job_id].get("status") == "cancelled":
                        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                                                message=f"[API] /autodetect 작업 취소됨: job_id={current_job_id}, event={event_type}"))
                        save_job_state(current_job_id)
                    else:
                        jobs[current_job_id]["result"] = result
                        jobs[current_job_id]["status"] = "completed"
                        util.update_progress(current_job_id, 1.0, 0, 100)
                        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                                                message=f"[API] /autodetect 작업 완료: job_id={current_job_id}, event={event_type}"))
                        save_job_state(current_job_id)

            except (FileNotFoundError, ValueError, ImportError) as e:
                error_message = f"작업 오류 ({type(e).__name__}): {e}"
                logger.error(f"[TASK] 작업 오류: {error_message}")
                logger.error(traceback.format_exc())
                if current_job_id in jobs:
                    jobs[current_job_id]["error"] = error_message
                    jobs[current_job_id]["status"] = "error"
                    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                                            message=f"[API] /autodetect 작업 오류: job_id={current_job_id}, event={event_type}, error={error_message}"))
                    save_job_state(current_job_id)
            except Exception as e:
                error_message = f"작업 처리 중 예상치 못한 오류 발생: {e}"
                logger.error(f"[TASK] 예상치 못한 오류: {error_message}")
                logger.error(traceback.format_exc())
                if current_job_id in jobs:
                    jobs[current_job_id]["error"] = str(e)
                    jobs[current_job_id]["status"] = "error"
                    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                                            message=f"[API] /autodetect 작업 오류: job_id={current_job_id}, event={event_type}, error={error_message}"))
                    save_job_state(current_job_id)
            finally:
                # 항상 슬롯 해제
                logger.info(f"[TASK] 작업 종료: job_id={current_job_id}")
                release_job_slot()

        threading.Thread(target=lambda: task(job_id, event, validated_video_path, req), daemon=True).start()
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 작업 시작: job_id={job_id}, event={event}"))
        return {"job_id": job_id}
    except HTTPException as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 오류: HTTPException: {e}"))
        raise
    except ValueError as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 오류: ValueError: {e}"))
        api_error(400, "CONFIG_ERROR", "설정 파일 읽기 중 오류가 발생했습니다", suggestion="설정 파일을 확인해주세요", context={"error": str(e)})
    except Exception as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /autodetect 라우트 오류: {e}"))
        raise HTTPException(status_code=500, detail="내부 서버 오류가 발생했습니다.")


@router.post("/cancel/{job_id}", summary="작업 취소", response_description="취소 결과")
def cancel_job(job_id: str):
    """실행 중인 작업을 취소합니다. 탐지 루프에서 cancelled 상태를 확인하고 조기 종료합니다."""
    if job_id not in jobs:
        api_error(404, "JOB_NOT_FOUND", "작업을 찾을 수 없습니다", suggestion="job_id를 확인해주세요", context={"job_id": job_id})

    current_status = jobs[job_id].get("status")
    current_progress = jobs[job_id].get("progress", 0)

    if current_status not in ("running",):
        return {
            "status": "already_completed",
            "message": "이미 완료되었거나 취소된 작업입니다.",
            "job_id": job_id,
            "previous_status": current_status,
            "progress_at_cancel": current_progress
        }

    jobs[job_id]["status"] = "cancelled"
    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                             message=f"[API] /cancel 작업 취소 요청: job_id={job_id}, progress={current_progress}"))

    return {
        "status": "cancelled",
        "message": "작업이 취소되었습니다.",
        "job_id": job_id,
        "progress_at_cancel": current_progress
    }


@router.get("/progress/{job_id}", summary="작업 진행 상태 조회", response_description="작업 진행 상태 정보 (JSON)")
def get_progress(job_id: str):
    """작업 진행 상태를 0~100% 스케일로 반환하며, ETA를 포함합니다"""
    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                             message=f"[API] /progress 요청: job_id={job_id}"))

    if job_id not in jobs:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                                 message=f"[API] /progress HTTPException"))
        api_error(404, "JOB_NOT_FOUND", "작업을 찾을 수 없습니다", suggestion="job_id를 확인해주세요", context={"job_id": job_id})

    # 원본 dict 복사
    resp = dict(jobs[job_id])

    # 1) 새 구조: progress_raw(0~1) → progress(0~100)로 변환
    raw = resp.get("progress_raw")
    if raw is not None:
        try:
            pct = round(float(raw) * 100.0, 2)
            resp["progress"] = pct
        except Exception:
            pass
    else:
        # 2) 구(legacy) 구조 대비: progress가 0~1로 들어온 경우도 정규화
        p = resp.get("progress", 0.0)
        try:
            p = float(p)
            if p <= 1.0:
                p = p * 100.0
            resp["progress"] = max(0.0, min(p, 100.0))
        except Exception:
            resp["progress"] = 0.0

    # ETA 초 단위로 반환 (없으면 None)
    resp["eta_seconds"] = resp.get("eta_seconds")

    return resp


@router.get("/progress/{job_id}/stream", summary="작업 진행률 SSE 스트림", response_description="실시간 진행률 업데이트 스트림")
async def progress_stream(job_id: str):
    """
    작업 진행률을 Server-Sent Events(SSE)로 실시간 전송합니다.
    
    - 진행률 업데이트마다 data 이벤트 전송
    - 5초마다 하트비트 전송 (연결 유지)
    - 작업 완료/오류/취소 시 done 이벤트 전송 후 종료
    - 작업 미존재 시 error 이벤트 전송
    """
    from fastapi.responses import StreamingResponse
    
    log_queue.append(logLine(
        path=daily_log_path,
        time=timeToStr(time.time(), "datetime"),
        message=f"[API] /progress/{job_id}/stream SSE 스트림 시작"
    ))
    
    last_progress = None
    heartbeat_counter = 0
    
    async def event_generator():
        nonlocal last_progress, heartbeat_counter
        
        while True:
            try:
                if job_id not in jobs:
                    yield f"event: error\ndata: {{\"error\": \"job_not_found\", \"message\": \"작업을 찾을 수 없습니다\"}}\n\n"
                    log_queue.append(logLine(
                        path=daily_log_path,
                        time=timeToStr(time.time(), "datetime"),
                        message=f"[API] /progress/{job_id}/stream 작업 미존재"
                    ))
                    break
                
                job = jobs[job_id]
                
                current_progress = job.get("progress_raw", 0.0)
                if current_progress != last_progress:
                    pct = round(float(current_progress) * 100.0, 2)
                    event_data = {
                        "progress": pct,
                        "progress_raw": float(current_progress),
                        "status": job.get("status", "running"),
                        "eta_seconds": job.get("eta_seconds", 0),
                        "phase": job.get("phase", ""),
                        "error": job.get("error"),
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
                    last_progress = current_progress
                    heartbeat_counter = 0
                else:
                    heartbeat_counter += 1
                    if heartbeat_counter >= 10:
                        yield f": heartbeat\n\n"
                        heartbeat_counter = 0
                
                if job.get("status") in ("completed", "error", "cancelled"):
                    final_data = {
                        "progress": 100.0 if job.get("status") == "completed" else 0.0,
                        "status": job.get("status"),
                        "error": job.get("error"),
                        "result": job.get("result"),
                    }
                    yield f"event: done\ndata: {json.dumps(final_data)}\n\n"
                    log_queue.append(logLine(
                        path=daily_log_path,
                        time=timeToStr(time.time(), "datetime"),
                        message=f"[API] /progress/{job_id}/stream SSE 스트림 종료 (status={job.get('status')})"
                    ))
                    break
                
                await asyncio.sleep(0.5)
            
            except GeneratorExit:
                log_queue.append(logLine(
                    path=daily_log_path,
                    time=timeToStr(time.time(), "datetime"),
                    message=f"[API] /progress/{job_id}/stream SSE 클라이언트 연결 해제"
                ))
                break
            except Exception as e:
                log_queue.append(logLine(
                    path=daily_log_path,
                    time=timeToStr(time.time(), "datetime"),
                    message=f"[API] /progress/{job_id}/stream SSE 오류: {e}"
                ))
                break
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
