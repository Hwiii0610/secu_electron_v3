"""
보안 관련 초기화
- RSA 개인키 로드
- LEA GCM C 라이브러리 동적 로드
"""
import os
import configparser
import importlib.util
from util import get_resource_path
from Crypto.PublicKey import RSA

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
