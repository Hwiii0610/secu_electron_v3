"""
보안 관련 초기화 (지연 초기화 패턴)
- RSA 개인키 로드
- LEA GCM C 라이브러리 동적 로드
- initialize_security()를 FastAPI lifespan에서 호출
"""
import os
import configparser
import importlib.util
from util import get_resource_path
from Crypto.PublicKey import RSA

# 전역 변수 (초기화 전 None)
private_key = None
lea_gcm_lib = None
_initialized = False


def initialize_security():
    """
    RSA 개인키와 LEA GCM 라이브러리를 로드합니다.
    FastAPI lifespan에서 호출되어야 합니다.
    멱등성 보장: 여러 번 호출해도 한 번만 초기화됩니다.
    """
    global private_key, lea_gcm_lib, _initialized

    if _initialized:
        return

    # ─── RSA 개인키 로드 ───
    try:
        _cfg = configparser.ConfigParser(allow_no_value=True)
        _cfg.read(get_resource_path('config.ini'), encoding='utf-8')
        _enc_key_path = _cfg['path']['enc']
        _enc_key_path = get_resource_path(_enc_key_path)
        with open(_enc_key_path, 'rb') as f:
            private_key = RSA.import_key(f.read())
        if not getattr(private_key, 'has_private', lambda: False)():
            raise ValueError(f"설정된 키 파일({_enc_key_path})는 공개키입니다. 개인키 파일을 지정해주세요.")
        print(f"RSA 개인키 로드 완료 (경로: {_enc_key_path})", flush=True)
    except Exception as e:
        print(f"RSA 개인키 로드 실패: {e}", flush=True)
        raise RuntimeError(f"RSA 개인키 로드 실패: {e}")

    # ─── LEA GCM C 라이브러리 동적 로드 ───
    _spec = importlib.util.spec_from_file_location(
        'lea_gcm_lib',
        get_resource_path('lea_gcm_lib.py')
    )
    lea_gcm_lib = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(lea_gcm_lib)

    try:
        _load_lea_library = lea_gcm_lib.load_lea_library
        _load_lea_library()
        print("LEA GCM C 라이브러리 로드 완료", flush=True)
    except Exception as e:
        print(f"경고: LEA GCM C 라이브러리 로드 실패: {e}", flush=True)

    _initialized = True
