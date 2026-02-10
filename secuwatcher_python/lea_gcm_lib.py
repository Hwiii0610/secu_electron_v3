# LEA-GCM 암호화를 위한 ctypes 래퍼 모듈
import ctypes
import platform
import os
from ctypes.util import find_library

# CPU 명령어 세트 검출용 라이브러리
try:
    import cpuid
except (ImportError, ArithmeticError):
    cpuid = None

# LEA 키 구조체 정의
class LEA_KEY(ctypes.Structure):
    _fields_ = [
        ("rk", ctypes.c_uint32 * 192),
        ("round", ctypes.c_uint32)
    ]

# GCM 모드에서 사용되는 전체 암호화 컨텍스트 구조체
class LEA_GCM_CTX(ctypes.Structure):
    _fields_ = [
        ("h", (ctypes.c_uint8 * 16) * 256),
        ("ctr", ctypes.c_uint8 * 16),
        ("ek0", ctypes.c_uint8 * 16),
        ("tbl", ctypes.c_uint8 * 16),
        ("yn", ctypes.c_uint8 * 16),
        ("key", LEA_KEY),
        ("yn_used", ctypes.c_int32),
        ("aad_len", ctypes.c_int32),
        ("ct_len", ctypes.c_int32),
        ("is_encrypt", ctypes.c_int32)
    ]

# 최적화된 DLL/SO 라이브러리 로딩 함수
# CPU 기능에 따라 AVX2, SSE2, generic 중 선택

def load_lea_library():
    system = platform.system()
    arch = platform.architecture()[0]

    # SIMD-optimized library search order
    lib_names = {
        'Linux': {
            '32bit': ['liblea_generic_x86.so', 'liblea_avx2.so', 'liblea_sse2.so'],
            '64bit': ['liblea_generic_x64.so', 'liblea_avx2.so', 'liblea_sse2.so']
        },
        'Windows': {
            '32bit': ['lea_generic_x86.dll', 'lea_avx2.dll', 'lea_sse2.dll'],
            '64bit': ['lea_generic_x64.dll', 'lea_avx2.dll', 'lea_sse2.dll']
        },
        'Darwin': {  # macOS
            '32bit': ['liblea_generic_x86.so'],
            '64bit': ['liblea_generic_x64.so']
        }
    }

    if system not in lib_names:
        raise OSError(f"Unsupported OS: {system}")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    if system == 'Windows':
        try:
            os.add_dll_directory(script_dir)
        except AttributeError:
            pass
    elif system == 'Darwin':  # macOS
        # macOS에서는 DYLD_LIBRARY_PATH 설정이 필요할 수 있음
        pass

    # Detect CPU features
    cpu_flags = []
    if cpuid:
        cpu = cpuid.CPUID()
        if getattr(cpu, 'avx2', False): cpu_flags.append('avx2')
        if getattr(cpu, 'sse2', False): cpu_flags.append('sse2')
    cpu_flags.append('generic')  # fallback

    # Attempt loading based on flags
    for flag in cpu_flags:
        for name in lib_names[system][arch]:
            if flag in name:
                path = os.path.join(script_dir, name)
                try:
                    if system == 'Windows':
                        return ctypes.WinDLL(path)
                    else:
                        return ctypes.CDLL(path)
                except OSError as e:
                    print(f"[LEA] 스크립트 경로 로드 실패: 경로={path}, 에러={e}", flush=True)
                lib_path = find_library(name)
                if lib_path:
                    try:
                        if system == 'Windows':
                            return ctypes.WinDLL(lib_path)
                        else:
                            return ctypes.CDLL(lib_path)
                    except OSError as e:
                        print(f"[LEA] 시스템 라이브러리 로드 실패: 경로={lib_path}, 에러={e}", flush=True)
    raise RuntimeError("No compatible LEA library found")

# 라이브러리 로드 시도 (실패 시 None)
try:
    lea = load_lea_library()
except Exception as e:
    lea = None
    print(f"경고: LEA 라이브러리 로드 실패: {e}", flush=True)

# 라이브러리 함수 바인딩
if lea:
    lea.lea_gcm_init.argtypes = [ctypes.POINTER(LEA_GCM_CTX), ctypes.POINTER(ctypes.c_uint8), ctypes.c_int]
    lea.lea_gcm_init.restype = None
    lea.lea_gcm_set_ctr.argtypes = [ctypes.POINTER(LEA_GCM_CTX), ctypes.POINTER(ctypes.c_uint8), ctypes.c_int]
    lea.lea_gcm_set_ctr.restype = None
    lea.lea_gcm_set_aad.argtypes = [ctypes.POINTER(LEA_GCM_CTX), ctypes.POINTER(ctypes.c_uint8), ctypes.c_int]
    lea.lea_gcm_set_aad.restype = None
    lea.lea_gcm_enc.argtypes = [ctypes.POINTER(LEA_GCM_CTX), ctypes.POINTER(ctypes.c_uint8), ctypes.POINTER(ctypes.c_uint8), ctypes.c_int]
    lea.lea_gcm_enc.restype = None
    lea.lea_gcm_dec.argtypes = [ctypes.POINTER(LEA_GCM_CTX), ctypes.POINTER(ctypes.c_uint8), ctypes.POINTER(ctypes.c_uint8), ctypes.c_int]
    lea.lea_gcm_dec.restype = None
    lea.lea_gcm_final.argtypes = [ctypes.POINTER(LEA_GCM_CTX), ctypes.POINTER(ctypes.c_uint8), ctypes.c_int]
    lea.lea_gcm_final.restype = None
    # SIMD 최적화 함수가 있으면 설정
    try:
        lea.get_simd_type.argtypes = []
        lea.get_simd_type.restype = ctypes.c_char_p
        lea.lea_gcm_enc_avx2.argtypes = lea.lea_gcm_enc.argtypes
        lea.lea_gcm_enc_avx2.restype = None
        lea.lea_gcm_enc_sse2.argtypes = lea.lea_gcm_enc.argtypes
        lea.lea_gcm_enc_sse2.restype = None
        lea.lea_gcm_dec_avx2.argtypes = lea.lea_gcm_dec.argtypes
        lea.lea_gcm_dec_avx2.restype = None
        lea.lea_gcm_dec_sse2.argtypes = lea.lea_gcm_dec.argtypes
        lea.lea_gcm_dec_sse2.restype = None
    except AttributeError:
        pass

# macOS/Darwin에서 LEA 라이브러리를 사용할 수 없을 때 AES-GCM 폴리필
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes

class AES_GCM:
    """pycryptodome 기반 AES-GCM 구현 (macOS 폴리필)"""
    def __init__(self, key: bytes):
        if len(key) not in (16, 24, 32):
            raise ValueError("Key must be 16, 24, or 32 bytes")
        self.key = key
        self._cipher = None
        self.simd_type = 'AES-GCM-fallback'
        print(f"[AES_GCM] init: key_len={len(key)} (macOS fallback)", flush=True)

    def set_iv(self, iv: bytes):
        if len(iv) < 12:
            raise ValueError("IV must be at least 12 bytes")
        self._cipher = AES.new(self.key, AES.MODE_GCM, nonce=iv)
        print(f"[AES_GCM] set_iv: {iv.hex()}", flush=True)

    def set_aad(self, aad: bytes):
        if self._cipher is None:
            raise RuntimeError("set_iv must be called before set_aad")
        self._cipher.update(aad)
        print(f"[AES_GCM] set_aad: len={len(aad)}", flush=True)

    def encrypt(self, plaintext: bytes) -> bytes:
        if self._cipher is None:
            raise RuntimeError("set_iv must be called before encrypt")
        return self._cipher.encrypt(plaintext)

    def decrypt(self, ciphertext: bytes) -> bytes:
        if self._cipher is None:
            raise RuntimeError("set_iv must be called before decrypt")
        return self._cipher.decrypt(ciphertext)

    def finalize(self, tag_length: int = 16) -> bytes:
        if self._cipher is None:
            raise RuntimeError("set_iv must be called before finalize")
        # AES-GCM은 태그가 cipher 객체에 저장됨
        tag = self._cipher.digest()
        print(f"[AES_GCM] finalize tag={tag[:tag_length].hex()}", flush=True)
        return tag[:tag_length]

# 고수준 GCM 클래스 (LEA-GCM 또는 AES-GCM 폴리필)
class LEA_GCM:
    _USE_AES_FALLBACK = (lea is None)  # LEA 라이브러리 로드 실패 시 AES-GCM 사용
    
    def __init__(self, key: bytes):
        if self._USE_AES_FALLBACK:
            # macOS 등에서 LEA를 사용할 수 없을 때 AES-GCM 사용
            self._impl = AES_GCM(key)
            self.simd_type = self._impl.simd_type
        else:
            if len(key) not in (16, 24, 32):
                raise ValueError("Key must be 16, 24, or 32 bytes")
            self.ctx = LEA_GCM_CTX()
            key_buf = (ctypes.c_uint8 * len(key))(*key)
            lea.lea_gcm_init(ctypes.byref(self.ctx), key_buf, len(key))
            print(f"[LEA_GCM] init: key_len={len(key)}", flush=True)

            try:
                simd = lea.get_simd_type().decode()
            except Exception:
                simd = 'generic'
            self.simd_type = simd
            print(f"[LEA_GCM] simd_type={self.simd_type}", flush=True)

    def set_iv(self, iv: bytes):
        if self._USE_AES_FALLBACK:
            self._impl.set_iv(iv)
        else:
            if lea is None:
                raise RuntimeError("LEA 라이브러리가 로드되지 않았습니다.")
            if len(iv) < 12:
                raise ValueError("IV must be at least 12 bytes")
            iv_buf = (ctypes.c_uint8 * len(iv))(*iv)
            lea.lea_gcm_set_ctr(ctypes.byref(self.ctx), iv_buf, len(iv))
            print(f"[LEA_GCM] set_iv: {iv.hex()}", flush=True)

    def set_aad(self, aad: bytes):
        if self._USE_AES_FALLBACK:
            self._impl.set_aad(aad)
        else:
            if lea is None:
                raise RuntimeError("LEA 라이브러리가 로드되지 않았습니다.")
            aad_buf = (ctypes.c_uint8 * len(aad))(*aad)
            lea.lea_gcm_set_aad(ctypes.byref(self.ctx), aad_buf, len(aad))
            print(f"[LEA_GCM] set_aad: len={len(aad)}", flush=True)

    def _select_enc_func(self):
        if 'avx2' in self.simd_type and hasattr(lea, 'lea_gcm_enc_avx2'):
            return lea.lea_gcm_enc_avx2
        if 'sse2' in self.simd_type and hasattr(lea, 'lea_gcm_enc_sse2'):
            return lea.lea_gcm_enc_sse2
        return lea.lea_gcm_enc

    def encrypt(self, plaintext: bytes) -> bytes:
        if self._USE_AES_FALLBACK:
            return self._impl.encrypt(plaintext)
        enc_func = self._select_enc_func()
        ct = (ctypes.c_uint8 * len(plaintext))()
        pt_buf = (ctypes.c_uint8 * len(plaintext))(*plaintext)
        enc_func(ctypes.byref(self.ctx), ct, pt_buf, len(plaintext))
        return bytes(ct)

    def _select_dec_func(self):
        if 'avx2' in self.simd_type and hasattr(lea, 'lea_gcm_dec_avx2'):
            return lea.lea_gcm_dec_avx2
        if 'sse2' in self.simd_type and hasattr(lea, 'lea_gcm_dec_sse2'):
            return lea.lea_gcm_dec_sse2
        return lea.lea_gcm_dec

    def decrypt(self, ciphertext: bytes) -> bytes:
        if self._USE_AES_FALLBACK:
            return self._impl.decrypt(ciphertext)
        dec_func = self._select_dec_func()
        pt = (ctypes.c_uint8 * len(ciphertext))()
        ct_buf = (ctypes.c_uint8 * len(ciphertext))(*ciphertext)
        dec_func(ctypes.byref(self.ctx), pt, ct_buf, len(ciphertext))
        return bytes(pt)

    def finalize(self, tag_length: int = 16) -> bytes:
        if self._USE_AES_FALLBACK:
            return self._impl.finalize(tag_length)
        if lea is None:
            raise RuntimeError("LEA 라이브러리가 로드되지 않았습니다.")
        if tag_length not in (4, 8, 12, 13, 14, 15, 16):
            raise ValueError("Invalid tag length")
        tag = (ctypes.c_uint8 * tag_length)()
        lea.lea_gcm_final(ctypes.byref(self.ctx), tag, tag_length)
        tb = bytes(tag)
        print(f"[LEA_GCM] finalize tag={tb.hex()}", flush=True)
        return tb
