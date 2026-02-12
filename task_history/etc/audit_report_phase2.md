# SecuWatcher Export — Phase 2 Electron Main 리팩토링 보고서

**점검일**: 2026-02-11
**대상**: `src/main.js` (2,578줄) → `src/main/` (12개 모듈, 2,833줄)
**증가분**: +255줄 (JSDoc 주석, import 구문, 함수 래핑 오버헤드)

---

## 1. 결과 요약

| 구분 | 상태 | 비고 |
|------|------|------|
| IPC 핸들러 매핑 | **41/41** | 누락 0건, 중복 0건 |
| 모듈 수 | **12개** | 기반 6 + IPC 핸들러 6 |
| 최대 모듈 크기 | **570줄** (fileHandlers.js) | 목표 400줄 초과 1건 |
| 빌드 진입점 | **변경 완료** | forge.config.mjs 수정 |
| 원본 백업 | **완료** | src/main.js → src/main.js.bak |

---

## 2. 모듈 구조

```
src/main/
├── index.js                 (139줄)  진입점 + 앱 라이프사이클
├── state.js                  (23줄)  공유 상태 (mainWindow, licenseValid)
├── logger.js                 (60줄)  파일/렌더러 로깅
├── utils.js                 (261줄)  경로/FFmpeg/파싱 유틸리티
├── installer.js             (126줄)  Squirrel 이벤트 + 첫 실행
├── windowManager.js         (272줄)  윈도우 생성/관리/다이얼로그
└── ipcHandlers/
    ├── fileHandlers.js      (570줄)  파일 작업/스캔/복사/JSON
    ├── videoHandlers.js     (367줄)  비디오 분석/복구/변환
    ├── videoEditHandlers.js (316줄)  트림/머지
    ├── settingsHandlers.js  (364줄)  설정/워터마크
    ├── licenseHandlers.js   (167줄)  라이선스 검증
    └── encryptHandlers.js   (168줄)  암호화
```

---

## 3. IPC 핸들러 배치표

### windowManager.js (11 핸들러)

| 채널명 | 유형 | 기능 |
|--------|------|------|
| window-minimize | on | 윈도우 최소화 |
| window-maximize | on | 윈도우 최대화/해제 |
| window-close | on | 종료 확인 후 닫기 |
| window-is-maximized | handle | 최대화 상태 조회 |
| show-message | handle | 정보 메시지 |
| confirm-message | handle | 확인/취소 다이얼로그 |
| area-masking-message | handle | 마스킹 유형 선택 |
| show-save-dialog | handle | 저장 다이얼로그 |
| show-open-dialog | handle | 열기 다이얼로그 |
| show-video-dialog | handle | 비디오 파일 선택 |
| show-selection-mode-dialog | handle | 추가 방식 선택 |

### fileHandlers.js (14 핸들러)

| 채널명 | 유형 | 기능 |
|--------|------|------|
| get-desktop-dir | handle | 바탕화면 경로 |
| save-temp-file | handle | 임시 파일 저장 |
| delete-temp-file | handle | 임시 파일 삭제 |
| get-temp-path | handle | 임시 경로 생성 |
| get-temp-file-as-blob | handle | 파일→Buffer |
| stat-file | handle | 파일 정보 조회 |
| get-app-path | handle | 앱 경로 정보 |
| read-external-json | handle | 외부 JSON 읽기 |
| write-external-json | handle | 외부 JSON 쓰기 |
| load-json | handle | 탐지 JSON/CSV 로드 |
| save-json | handle | JSON 신규 저장 |
| update-json | handle | JSON 항목 추가 |
| update-filtered-json | handle | JSON 전체 교체 |
| scan-directory | handle | 디렉토리 스캔 |
| copy-video-to-dir | handle | 비디오 파일 복사 |
| copy-json-with-export | handle | 내보내기 시 JSON 복사 |

### videoHandlers.js (2 핸들러 + 3 내부 함수)

| 채널명/함수 | 유형 | 기능 |
|-------------|------|------|
| get-video-info | handle | 비디오 분석/자동복구 |
| convert-video | handle | 비디오 변환 (MP4) |
| analyzeVideo() | 내부 | FFprobe 분석 |
| fixVideo() | 내부 | 비디오 메타데이터 복구 |
| fixFrameRate() | 내부 | VFR→CFR 변환 |

### videoEditHandlers.js (2 핸들러)

| 채널명 | 유형 | 기능 |
|--------|------|------|
| trim-video | handle | 비디오 트림 |
| merge-videos | handle | 비디오 병합 |

### settingsHandlers.js (5 핸들러)

| 채널명 | 유형 | 기능 |
|--------|------|------|
| get-settings | handle | config.ini 로드 |
| save-settings | handle | config.ini 저장 |
| save-watermark | handle | 워터마크 이미지 저장 |
| load-watermark | handle | 워터마크 이미지 로드 |
| copy-watermark-image | handle | 워터마크 이미지 복사 |

### licenseHandlers.js (4 핸들러 + 1 export 함수)

| 채널명/함수 | 유형 | 기능 |
|-------------|------|------|
| get-hardware-id | handle | 하드웨어 ID 생성 |
| export-hardware-id | handle | HW ID 파일 내보내기 |
| select-license-file | handle | 라이선스 파일 선택 |
| validate-license | handle | 라이선스 검증 + 윈도우 전환 |
| verifySavedLicense() | export | 저장된 라이선스 확인 (앱 시작) |

### encryptHandlers.js (1 핸들러 + 2 내부 함수)

| 채널명/함수 | 유형 | 기능 |
|-------------|------|------|
| encrypt-file | handle | 파일 암호화 요청 |
| encryptFile() | 내부 | Python 서버 암호화 요청 |
| encryptPw() | 내부 | RSA-OAEP 비밀번호 암호화 |

---

## 4. 설계 패턴

### 공유 상태 패턴 (state.js)
- `mainWindow`, `licenseValid`를 getter/setter 함수로 관리
- 모든 모듈이 `getMainWindow()`으로 안전하게 접근
- 순환 의존 방지: state.js는 다른 모듈에 의존하지 않음

### 등록 함수 패턴
- 각 핸들러 모듈은 `registerXxxHandlers()` 함수를 export
- `index.js`에서 모듈 로드 시 즉시 호출 (app.ready 이전)
- IPC 핸들러 내부에서 `getMainWindow()`로 지연 참조

### 의존성 방향
```
index.js
  ├→ state.js (공유 상태)
  ├→ logger.js → state.js
  ├→ utils.js → logger.js
  ├→ installer.js → logger.js
  ├→ windowManager.js → state.js, logger.js
  └→ ipcHandlers/*
       ├→ fileHandlers.js → utils.js
       ├→ videoHandlers.js → utils.js, logger.js, state.js
       ├→ videoEditHandlers.js → utils.js, logger.js
       ├→ settingsHandlers.js → (독립, dirConfig만)
       ├→ licenseHandlers.js → logger.js, state.js, windowManager.js
       └→ encryptHandlers.js → logger.js, apiRequest, config.json
```

---

## 5. 빌드 설정 변경

| 파일 | 변경 내용 |
|------|-----------|
| `forge.config.mjs:55` | `entry: 'src/main.js'` → `entry: 'src/main/index.js'` |
| `package.json` | 변경 없음 (빌드 출력 `.vite/build/main.js`는 Vite가 관리) |
| `vite.main.config.mjs` | 변경 없음 |
| `src/preload.js` | 변경 없음 (IPC 채널명 불변) |

---

## 6. 주의 사항

- `fileHandlers.js` (570줄)가 목표 400줄을 초과. JSON CRUD 핸들러가 5개로 밀접하게 관련되어 분리 시 과도한 파편화 우려. 현행 유지 권장.
- `__dirname`은 Vite 빌드 후 `.vite/build/`를 가리키므로, 소스 디렉토리 변경이 런타임 경로에 영향 없음.
- `MAIN_WINDOW_VITE_DEV_SERVER_URL`, `MAIN_WINDOW_VITE_NAME`은 Vite 플러그인이 빌드 시 주입하는 전역 상수로, 모듈 분할과 무관하게 동작.
- `pythonBridge.js`는 전략 문서에 계획되었으나, 실제 main.js에 Python 프로세스 스폰 로직이 없어 생략 (Python API는 HTTP 통신으로 apiRequest.js에서 처리).
- 원본 파일 `src/main.js.bak`은 검증 완료 후 삭제 예정.
