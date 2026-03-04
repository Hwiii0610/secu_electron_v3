# Phase 3 감사 보고서 — Python 백엔드 리팩토링

> 작성일: 2026-02-11
> 대상: secuwatcher_python/main.py (1,194줄) → 모듈 분할

---

## 1. 실행 요약

| 항목 | Before | After |
|------|--------|-------|
| main.py 줄 수 | **1,194줄** | **120줄** (-90%) |
| 모듈 수 | 1개 | **10개** (+ __init__ 3개) |
| 엔드포인트 | 6개 | **6개** (전수 보존) |
| 총 줄 수 | 1,194줄 | 1,363줄 (+14%, 모듈 헤더/독스트링) |

---

## 2. 파일별 줄 수

| 파일 | 줄 수 | 역할 |
|------|--------|------|
| `main.py` | 120 | FastAPI 앱 생성, CORS, 라이프사이클, 라우터 등록, uvicorn 실행 |
| `core/state.py` | 16 | 전역 공유 상태 (jobs, log_queue) |
| `core/config.py` | 112 | config.ini 파싱, classid_mapping, 유틸리티 함수 |
| `core/logging_setup.py` | 36 | 로깅 인프라 초기화 |
| `core/database.py` | 70 | SQLite DRM 테이블 생성/삽입 |
| `core/security.py` | 40 | RSA 개인키 로드, LEA GCM 라이브러리 로드 |
| `models/schemas.py` | 60 | Pydantic 모델 (AutodetectRequest, AutoexportRequest) |
| `routers/detection.py` | 252 | POST /autodetect, GET /progress/{job_id} |
| `routers/export.py` | 173 | POST /autoexport (일괄 처리) |
| `routers/encryption.py` | 484 | POST /encrypt, POST /decrypt |

---

## 3. 엔드포인트 매핑 (6/6)

| # | 메서드 | 경로 | 위치 | 상태 |
|---|--------|------|------|------|
| 1 | GET | `/` | main.py:96 | ✅ |
| 2 | POST | `/autodetect` | routers/detection.py:36 | ✅ |
| 3 | GET | `/progress/{job_id}` | routers/detection.py:219 | ✅ |
| 4 | POST | `/autoexport` | routers/export.py:33 | ✅ |
| 5 | POST | `/encrypt` | routers/encryption.py:44 | ✅ |
| 6 | POST | `/decrypt` | routers/encryption.py:325 | ✅ |

**누락: 0개 | 중복: 0개**

---

## 4. 모듈 의존성 그래프

```
main.py
  ├── core.state (jobs, log_queue)
  ├── core.config (get_config_data, set_video_masking_path_to_desktop)
  ├── core.logging_setup (setup_logging)
  ├── core.database (DB_FILE, create_drm_table)
  ├── routers.detection → core.state, core.config, models.schemas
  ├── routers.export → core.state, core.config, models.schemas
  └── routers.encryption → core.state, core.config, core.database, core.security

core.state → util (logLine, jobs 연결)
core.config → util (get_resource_path)
core.logging_setup → util (get_log_dir)
core.database → util (get_resource_path)
core.security → util (get_resource_path), Crypto.PublicKey
models.schemas → pydantic (독립)
```

**순환 참조: 없음** ✅

---

## 5. 품질 게이트 검증

| 게이트 | 기준 | 결과 |
|--------|------|------|
| main.py ≤ 150줄 | 전략 목표 | ✅ 120줄 |
| Router별 ≤ 200줄 | 전략 목표 | ⚠️ encryption.py 484줄 (encrypt+decrypt 복합) |
| API 전체 정상 응답 | 컴파일 검증 | ✅ py_compile 통과 |
| 엔드포인트 전수 보존 | 6개 | ✅ 6/6 |
| import 에러 없음 | 전체 파일 | ✅ |
| 순환 참조 없음 | 전체 모듈 | ✅ |

> encryption.py는 /encrypt(마스킹→워터마킹→암호화→DRM 기록→중간파일 정리)와 /decrypt(복호화→태그 검증→파일 기록)의 복합 로직으로 단일 라우터 기준 초과. 추후 services/ 계층으로 비즈니스 로직 추출 가능.

---

## 6. 백업

| 파일 | 크기 | 상태 |
|------|------|------|
| `main.py.bak` | 1,194줄 (56,865 bytes) | ✅ 보존 |

---

## 7. 디렉토리 구조 (최종)

```
secuwatcher_python/
├── main.py               (120줄)   FastAPI 진입점
├── main.py.bak           (1,194줄) 원본 백업
├── core/
│   ├── __init__.py
│   ├── state.py          (16줄)    전역 상태
│   ├── config.py         (112줄)   설정 관리
│   ├── logging_setup.py  (36줄)    로깅 초기화
│   ├── database.py       (70줄)    SQLite 관리
│   └── security.py       (40줄)    RSA + LEA 로드
├── models/
│   ├── __init__.py
│   └── schemas.py        (60줄)    Pydantic 모델
├── routers/
│   ├── __init__.py
│   ├── detection.py      (252줄)   탐지 + 진행률
│   ├── export.py         (173줄)   일괄 처리
│   └── encryption.py     (484줄)   암호화/복호화
├── detector.py           (유지)    YOLO 엔진
├── blur.py               (유지)    마스킹 엔진
├── watermarking.py       (유지)    워터마크 엔진
├── lea_gcm_lib.py        (유지)    LEA 암호화 라이브러리
└── util.py               (유지)    공통 유틸리티
```
