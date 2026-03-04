# Backend Agent 지침서

> **담당**: FastAPI Python 백엔드 (`secuwatcher_python/`)
> **편집 도구**: hashline:hashline 필수
> **참조 문서**: `SecuWatcher_UIUX_Review.md` (v4.0) 섹션 14, `SecuWatcher_UIUX_ModificationStrategy.md` (v2.0)

---

## 담당 범위

### Phase 1 (항목 #39~#41)
| # | 항목 | Risk | 대상 파일 |
|---|------|------|----------|
| 39 | print→logging 전환 | SAFE | 전체 .py |
| 40 | 에러 응답 구조화 | MEDIUM | `routers/*.py` + 새 `core/errors.py` |
| 41 | 모델 로딩 progress | LOW | `detector.py`, `sam2_detector.py` |

### Phase 2 (항목 #42~#44)
| # | 항목 | Risk | 대상 파일 |
|---|------|------|----------|
| 42 | 탐지/내보내기 ETA | LOW | `util.py`, `routers/detection.py` |
| 43 | 취소 응답 개선 | MEDIUM | `detector.py`, `sam2_detector.py`, `blur.py` |
| 44 | 동시 작업 수 제한 | MEDIUM | `routers/detection.py`, `export.py` |

### Phase 3 (항목 #45~#48)
| # | 항목 | Risk | 대상 파일 |
|---|------|------|----------|
| 45 | 작업 상태 영속화 (SQLite) | MEDIUM | `core/state.py`, `core/database.py` |
| 46 | 스트리밍 복호화 | HIGH | `routers/encryption.py`, `lea_gcm_lib.py` |
| 47 | SSE 실시간 진행률 | HIGH | `routers/detection.py`, `export.py` |
| 48 | 워터마크 세분화 진행률 | LOW | `watermarking.py` |

---

## 핵심 규칙

1. **hashline 사용**: 모든 파일 읽기/편집은 hashline 명령으로
2. **API 하위 호환성**: 응답 필드 추가는 OK, 기존 필드 삭제/타입 변경 시 프론트엔드 동기화 필수
3. **에러 응답 (#40)**: `detail` 문자열→딕셔너리 전환 시, 프론트에서 타입 체크 분기 필요 → Frontend Agent와 협의
4. **progress 범위 유지**: 0~100% 범위 내에서만 분할, 기존 프론트 프로그레스 바 영향 없음
5. **config.ini 존중**: 기존 설정 키 변경 금지, 새 키 추가만 허용

## 프로젝트 구조 참고

```
secuwatcher_python/
├── main.py                 # FastAPI 진입점 (115줄), CORS, lifespan
├── models/
│   └── schemas.py          # Pydantic 모델 (60줄)
├── routers/
│   ├── detection.py        # /autodetect, /cancel, /progress (272줄)
│   ├── export.py           # /autoexport 일괄처리 (173줄)
│   └── encryption.py       # /encrypt, /decrypt LEA-GCM (484줄)
├── core/
│   ├── config.py           # config.ini 읽기 (112줄)
│   ├── state.py            # jobs dict, log_queue (16줄)
│   ├── security.py         # RSA + LEA 초기화 (60줄)
│   ├── database.py         # SQLite DRM 테이블 (70줄)
│   └── logging_setup.py    # 로깅 설정 (36줄)
├── detector.py             # YOLOv8 자동탐지 (609줄)
├── sam2_detector.py        # SAM2 선택탐지 (593줄)
├── blur.py                 # 마스킹 처리 (581줄)
├── watermarking.py         # 워터마크 (257줄)
├── util.py                 # progress 업데이트, 유틸 (116줄)
├── lea_gcm_lib.py          # LEA-GCM C 라이브러리 래퍼 (271줄)
└── config.ini              # 설정 파일
```

## API 엔드포인트 참고

| Endpoint | Method | 비동기 | Progress |
|----------|--------|--------|---------|
| `/autodetect` | POST | Yes | polling |
| `/progress/{job_id}` | GET | No | — |
| `/cancel/{job_id}` | POST | No | — |
| `/autoexport` | POST | Yes | polling |
| `/encrypt` | POST | Yes | polling + ETA |
| `/decrypt` | POST | Yes | polling + ETA |

## 주의사항: 프론트-백 연동 포인트

| 백엔드 변경 | 프론트엔드 영향 | 협의 필요 |
|------------|---------------|----------|
| `detail` 타입 변경 (#40) | 에러 파싱 로직 | ✅ |
| `phase` 필드 추가 (#41) | 메시지 표시 | ❌ (무시해도 동작) |
| `estimated_remaining_seconds` 추가 (#42) | ETA 표시 UI | ✅ |
| SSE 엔드포인트 추가 (#47) | poller→EventSource 전환 | ✅ |
