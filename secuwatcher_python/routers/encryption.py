"""
암호화/복호화 라우터
- POST /encrypt : LEA GCM 암호화 (마스킹 → 워터마킹 → 암호화 → DRM 기록)
- POST /decrypt : LEA GCM 복호화 스트리밍
"""
import os
import json
import time
import uuid
import struct
import shutil
import hashlib
import logging
import threading
import configparser
import base64

from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, BackgroundTasks, Form, Header, UploadFile, File
from Crypto.Random import get_random_bytes
from Crypto.Cipher import PKCS1_OAEP
from util import logLine, timeToStr, get_resource_path
import util

from core.state import jobs, log_queue
from core.config import get_config_data
from core.database import insert_drm_info
from core import security  # 모듈 참조: security.private_key, security.lea_gcm_lib
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


@router.post(
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
    file: str = Form(..., description="암호화할 파일의 이름 (config.ini의 video_path 하위에 위치)", examples=["demo5.mp4"]),
    encryption_key: str = Header(
        ...,
        description="RSA-OAEP로 암호화된 대칭키(Base64)",
        alias='Encryption-Key',
        examples=["Base64EncodedCiphertext"]
    ),
    user_id: str = Header(..., description="요청 사용자 ID", alias='User-Id')
):
    """
    입력 받은 파일 이름을 config.ini 경로 하위에서 찾아 LEA GCM 모드로 암호화합니다.
    - 암호화 키는 헤더(Encryption-Key)에 RSA-OAEP(Base64) 형태로 전달
    - 파일 크기로부터 예측 완료 시간 반환
    - 암호화 완료 시 DRM 정보(tb_drm_info) 삽입
    """
    log_queue.append(logLine(
        path=daily_log_path,
        time=timeToStr(time.time(), 'datetime'),
        message=f"[API] /encrypt 요청: file={file}, user_id={user_id}"
    ))
    try:
        config = configparser.ConfigParser(allow_no_value=True)
        config.read(get_resource_path('config.ini'), encoding='utf-8')
        base_dir = config['path']['video_path']
        mask_dir = config['path']['video_masking_path']
        input_path = os.path.join(base_dir, file)
        if not os.path.exists(input_path):
            api_error(400, "FILE_NOT_FOUND", "암호화할 입력 파일을 찾을 수 없습니다", suggestion="파일 경로를 확인해주세요", context={"file": file})

        key = encryption_key.encode('utf-8')
        try:
            enc_key = base64.b64decode(encryption_key)
            cipher_rsa = PKCS1_OAEP.new(security.private_key)
            key = cipher_rsa.decrypt(enc_key)
        except Exception as e:
            api_error(400, "ENCRYPTION_FAILED", "암호화 키 처리 중 오류가 발생했습니다", suggestion="암호화 키를 확인해주세요", context={"error": str(e)})
        if len(key) not in (16, 24, 32):
            api_error(400, "ENCRYPTION_FAILED", "암호화 키의 길이가 올바르지 않습니다", suggestion="16, 24, 또는 32바이트의 키를 사용해주세요")

        total_mb = os.path.getsize(input_path) / (1024 * 1024)
        seconds_per_mb = 60.0 / 400.0
        eta = timeToStr(time.time() + total_mb * seconds_per_mb, 'datetime')

        job_id = uuid.uuid4().hex
        jobs[job_id] = {
            "progress": 0,
            "result": None,
            "error": None,
            "status": "running",
            "estimated_completion_time": eta
        }
        util.update_progress(job_id, 0.0, 0, 100)

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

        def encryption_task(job_id, input_file_path, mask_output_dir, key, user_id, file_name):
            """ 마스킹 → 워터마킹(옵션) → 암호화 → DRM 기록 → 중간파일 정리 """
            success = False

            try:
                # 1) config 읽기
                cfg_local = configparser.ConfigParser(allow_no_value=True)
                cfg_local.read(get_resource_path('config.ini'), encoding='utf-8')
                MaskingRange    = cfg_local['export'].get('MaskingRange', '0')
                MaskingTool     = cfg_local['export'].get('MaskingTool', '1')
                MaskingStrength = cfg_local['export'].get('MaskingStrength', '3')

                # 2) 마스킹 실행 (0~20%)
                masked_path = None
                mask_cb = lambda frac: util.update_progress(job_id, frac, 0, 20)

                if MaskingRange != '0':
                    from blur import output_masking
                    masked_path = output_masking(
                        input_file_path, MaskingRange, MaskingTool, MaskingStrength,
                        log_queue, mask_cb
                    )
                elif cfg_local['export'].get('AllMasking', 'no').lower() == 'yes':
                    from blur import output_allmasking
                    masked_path = output_allmasking(
                        input_file_path, MaskingTool, MaskingStrength,
                        log_queue, mask_cb
                    )

                # 마스킹 실패 방어: 원본 암호화 금지
                if not masked_path or not os.path.exists(masked_path):
                    jobs[job_id]['error'] = '마스킹 파일 생성 실패: 반출/암호화 불가'
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

                if cfg_local['export'].get('WaterMarking', 'no').lower() == 'yes':
                    from watermarking import apply_watermark
                    watermarked_path = apply_watermark(
                        processed_path,
                        cfg_local['export'].get('WaterText', ''),
                        int(cfg_local['export'].get('WaterTransparency', '100')),
                        cfg_local['export'].get('WaterImgPath', ''),
                        int(cfg_local['export'].get('WaterLocation', '4')),
                        log_queue, wm_cb
                    )
                    processed_path = watermarked_path

                # 디버그
                try:
                    logger.debug(f"processed_path={processed_path}")
                    logger.debug(f"파일 크기={os.path.getsize(processed_path)}")
                except Exception:
                    pass

                # 4) 암호화 (40~95%)
                os.makedirs(mask_output_dir, exist_ok=True)
                name_wo_ext = os.path.splitext(file_name)[0]
                out_name = f"{name_wo_ext}.sphereax"
                output_path = os.path.join(mask_output_dir, out_name)

                nonce = get_random_bytes(12)
                gcm = security.lea_gcm_lib.LEA_GCM(key)
                gcm.set_iv(nonce)
                gcm.set_aad(b'')

                with open(output_path, 'wb') as outf, open(processed_path, 'rb') as inf:
                    outf.write(nonce)
                    total = max(1, os.path.getsize(processed_path))
                    processed = 0
                    while True:
                        chunk = inf.read(65536)
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
                    time=timeToStr(time.time(), 'datetime'),
                    message=f"[API] /encrypt {job_id} 암호화 완료: {os.path.basename(output_path)}"
                ))

            except Exception as ex:
                util.update_progress(job_id, 0.0, 0, 100)
                jobs[job_id].update({'error': str(ex), 'status': 'error'})
                log_queue.append(logLine(
                    path=video_log_path,
                    time=timeToStr(time.time(), 'datetime'),
                    message=f"[API] /encrypt {job_id} 예외: {ex}"
                ))

            # 7) 중간파일 정리(성공시에만) — .sphereax만 남기기
            try:
                if success:
                    def _abs(p):
                        return os.path.abspath(p)

                    def _under(child, parent):
                        try:
                            return os.path.commonpath([_abs(child), _abs(parent)]) == _abs(parent)
                        except Exception:
                            return False

                    base_name_from_input = os.path.splitext(os.path.basename(input_file_path))[0]
                    base_name_from_file = os.path.splitext(file_name)[0]

                    candidates = set()

                    if 'processed_path' in locals() and processed_path and os.path.exists(processed_path):
                        candidates.add(processed_path)

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
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /encrypt 오류: {e}"))
        api_error(500, "ENCRYPTION_FAILED", "암호화 처리 중 오류가 발생했습니다", suggestion="로그를 확인해주세요", context={"error": str(e)})


@router.post(
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
    encryption_key: str = Header(..., description="RSA-OAEP로 암호화된 대칭키(Base64)", alias='Encryption-Key', examples=["Base64EncodedCiphertext"])
):
    """
    암호화된 파일을 읽어 LEA GCM 모드로 복호화합니다.
    """
    logging.info(f"[decrypt_debug] /decrypt 요청: file_upload={file.filename}")
    log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /decrypt 요청: file_upload={file.filename}"))

    try:
        if encryption_key is None:
            api_error(422, "INVALID_REQUEST", "필수 암호화 키 헤더가 누락되었습니다", suggestion="Encryption-Key 헤더를 포함해주세요")

        key = encryption_key.encode('utf-8')
        try:
            enc_key = base64.b64decode(encryption_key)
            cipher_rsa = PKCS1_OAEP.new(security.private_key)
            key = cipher_rsa.decrypt(enc_key)
        except Exception as e:
            api_error(400, "ENCRYPTION_FAILED", "복호화 키 처리 중 오류가 발생했습니다", suggestion="암호화 키를 확인해주세요", context={"error": str(e)})

        if len(key) not in (16, 24, 32):
            api_error(400, "ENCRYPTION_FAILED", "복호화 키의 길이가 올바르지 않습니다", suggestion="16, 24, 또는 32바이트의 키를 사용해주세요")

        config = get_config_data()
        base_dir = config['path']['video_masking_path']
        upload_dir = os.path.join(base_dir, "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        temp_filename = f"{uuid.uuid4().hex}_{file.filename}"
        temp_path = os.path.join(upload_dir, temp_filename)
        with open(temp_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)

        total_mb = os.path.getsize(temp_path) / (1024 * 1024)
        seconds_per_mb = 60.0 / 400.0
        eta = timeToStr(time.time() + total_mb * seconds_per_mb, 'datetime')
        logger.debug(f"[decrypt_debug] ETA: {eta}")

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
                logger.info(f"Decryption start: {timeToStr(start_time, 'datetime')}, size: {len(data)/1024/1024:.2f} MiB")

                # 파일에서 Nonce, 암호문, 인증 태그, 메타데이터를 분리
                tag_len = 16
                marker = b'META'
                idx = data.rfind(marker)
                if idx != -1 and idx + 8 <= len(data):
                    meta_len = struct.unpack('>I', data[idx + 4:idx + 8])[0]
                    meta_total_len = 4 + 4 + meta_len
                    tag_start = len(data) - meta_total_len - tag_len
                else:
                    tag_start = len(data) - tag_len

                nonce = data[:12]
                ciphertext = data[12:tag_start]
                tag = data[tag_start:tag_start + tag_len]

                # 복호화 및 태그 검증
                gcm_decrypt = security.lea_gcm_lib.LEA_GCM(key)
                gcm_decrypt.set_iv(nonce)
                gcm_decrypt.set_aad(b'')
                plaintext_chunks = []
                total_len = len(ciphertext)

                # (1) 복호화 진행률: 0~45%
                for i in range(0, total_len, 65536):
                    chunk = ciphertext[i:i + 4096]
                    plaintext_chunk = gcm_decrypt.decrypt(chunk)
                    plaintext_chunks.append(plaintext_chunk)
                    util.update_progress(job_id, (i + len(chunk)) / max(1, total_len), 0, 45)

                # (2) 태그 검증 진행률: 45~90%
                gcm_check = security.lea_gcm_lib.LEA_GCM(key)
                gcm_check.set_iv(nonce)
                gcm_check.set_aad(b'')
                for check_idx, plain in enumerate(plaintext_chunks):
                    gcm_check.encrypt(plain)
                    util.update_progress(job_id, (check_idx + 1) / max(1, len(plaintext_chunks)), 45, 90)
                expected_tag = gcm_check.finalize()
                logger.debug(f"[decrypt_debug] expected_tag={expected_tag.hex()}, actual_tag={tag.hex()}")
                if expected_tag != tag:
                    api_error(400, "ENCRYPTION_FAILED", "암호화 키 검증 실패: 키가 올바르지 않습니다", suggestion="올바른 복호화 키를 사용해주세요")

                out_name = os.path.splitext(file.filename)[0] + '_dec.mp4'
                out_path = os.path.join(base_dir, out_name)
                with open(out_path, 'wb') as outf:
                    gcm = security.lea_gcm_lib.LEA_GCM(key)
                    gcm.set_iv(nonce)
                    gcm.set_aad(b'')
                    # (3) 복호화 파일 기록 진행률: 90~99%
                    for i in range(0, total_len, 65536):
                        chunk = ciphertext[i:i + 4096]
                        plaintext = gcm.decrypt(chunk)
                        outf.write(plaintext)
                        util.update_progress(job_id, (i + len(chunk)) / max(1, total_len), 90, 99)

                os.remove(temp_path)
                # (4) 최종 완료: 99~100%
                util.update_progress(job_id, 1.0, 99, 100)
                jobs[job_id]['status'] = 'completed'
                jobs[job_id]['result'] = out_path

                end_time = time.time()
                logger.info(f"Decryption end: {timeToStr(end_time, 'datetime')}, processed: {total_mb:.2f} MiB in {end_time - start_time:.2f}s")
                log_queue.append(logLine(
                    path=video_log_path,
                    time=timeToStr(time.time(), 'datetime'),
                    message=f"[API] /decrypt {job_id} 복호화 완료: file={out_path}"))

            except Exception as ex:
                util.update_progress(job_id, 0.0, 0, 100)
                jobs[job_id]['error'] = str(ex)
                jobs[job_id]['status'] = 'error'
                log_queue.append(logLine(
                    path=video_log_path,
                    time=timeToStr(time.time(), 'datetime'),
                    message=f"[API] /decrypt {job_id} Exception: {ex}"))

        threading.Thread(target=task, daemon=True).start()
        return {"job_id": job_id, "estimated_completion_time": eta}

    except HTTPException as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /decrypt HTTPException: {e}"))
        raise
    except Exception as e:
        log_queue.append(logLine(path=daily_log_path, time=timeToStr(time.time(), 'datetime'), message=f"[API] /decrypt Exception: {e}"))
        api_error(500, "ENCRYPTION_FAILED", "복호화 처리 중 오류가 발생했습니다", suggestion="로그를 확인해주세요", context={"error": str(e)})


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
