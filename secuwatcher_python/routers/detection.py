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

from core.state import jobs, log_queue
from core.config import get_config_data, get_config, resolve_video_path
from models.schemas import AutodetectRequest, autodetect_examples

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
            log_queue.append(logLine(
                path=daily_log_path,
                time=timeToStr(time.time(), 'datetime'),
                message=f"[API] /autodetect 경로해석: base_dir='{base_dir}', 입력='{vp_stripped}', 최종='{resolved_path}'"
            ))
            if not os.path.exists(resolved_path):
                raise HTTPException(status_code=400, detail=f"지정된 VideoPath 파일을 찾을 수 없습니다: {vp_stripped}")
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

        job_id = uuid.uuid4().hex
        jobs[job_id] = {
            "progress": 0,
            "result": None,
            "error": None,
            "status": "running",
            "event_type": event,
        }
        util.update_progress(job_id, 0.0, 0, 100)

        def task(current_job_id: str, event_type: str, video_path_to_process: str, request_data: AutodetectRequest):
            """ 백그라운드에서 실제 비디오 처리를 수행하는 함수 """
            if current_job_id not in jobs:
                logging.info(f"경고: 존재하지 않는 job_id({current_job_id})에 대한 작업 시작 시도됨.")
                log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                                        message=f"[API] /autodetect 경고: 존재하지 않는 job_id({current_job_id})에 대한 작업 시작 시도됨."))
                return
            try:
                if event_type == "1":  # 자동 탐지
                    print("main.py: init_model import 전")
                    from detector import autodetector
                    print("main.py: init_model import 후")
                    _, conf_thres, classid = get_config(event_type)
                    result = autodetector(video_path_to_process, conf_thres, classid, log_queue,
                                         lambda frac: util.update_progress(current_job_id, frac, 0, 100))

                elif event_type == "2":  # 선택 탐지 (SAM2)
                    from sam2_detector import selectdetector_sam2
                    result = selectdetector_sam2(
                        video_path_to_process, request_data.FrameNo, request_data.Coordinate,
                        log_queue, lambda frac: util.update_progress(current_job_id, frac, 0, 100),
                    )

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

                # 작업 결과 기록
                if current_job_id in jobs:
                    jobs[current_job_id]["result"] = result
                    jobs[current_job_id]["status"] = "completed"
                    util.update_progress(current_job_id, 1.0, 0, 100)
                    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
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


@router.get("/progress/{job_id}", summary="작업 진행 상태 조회", response_description="작업 진행 상태 정보 (JSON)")
def get_progress(job_id: str):
    """작업 진행 상태를 0~100% 스케일로 반환"""
    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
                             message=f"[API] /progress 요청: job_id={job_id}"))

    if job_id not in jobs:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'),
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

    return resp
