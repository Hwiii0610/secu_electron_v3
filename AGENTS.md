# SecuWatcher Export - AI 코딩 에이전트 가이드

## 프로젝트 개요

SecuWatcher Export는 비디오 보안 처리 애플리케이션으로, CCTV 비디오의 개인정보 보호를 위한 객체 탐지, 마스킹/블러, 워터마킹, LEA-GCM 암호화 기능을 제공합니다. 두 가지 주요 구성 요소로 이루어져 있습니다:

1. **secuwatcher_python**: FastAPI 기반 Python 백엔드 - AI 객체 탐지, 비디오 마스킹, 워터마킹, LEA-GCM 암호화
2. **secuwatcher_electron**: Electron + Vue 3 프론트엔드 데스크톱 애플리케이션

**언어**: 코드 주석, 문서, UI에는 한국어를 사용합니다.

---

## 프로젝트 구조

```
secu_electron_v3/
├── AGENTS.md                    # 이 파일 (AI 코딩 에이전트 가이드)
│
├── secuwatcher_python/          # Python FastAPI 백엔드
│   ├── main.py                  # FastAPI 서버 진입점, 라이프사이클 관리
│   ├── detector.py              # YOLO 자동 객체 탐지 및 추적 (증분 JSON 저장, lazy loading)
│   ├── sam2_detector.py         # SAM2 선택 객체 탐지 (크롭 기반 세그멘테이션)
│   ├── blur.py                  # 비디오 마스킹/블러 처리
│   ├── watermarking.py          # 비디오 워터마킹
│   ├── lea_gcm_lib.py           # LEA-GCM 암호화 래퍼 (ctypes, macOS AES-GCM 폴리필)
│   ├── util.py                  # 공통 유틸리티 (로그, 시간, 진행률)
│   ├── config.ini               # 애플리케이션 설정
│   ├── requirements.txt         # Python 의존성
│   │
│   ├── routers/                 # FastAPI 라우터
│   │   ├── detection.py         # POST /autodetect, GET /progress/{job_id}
│   │   ├── export.py            # POST /autoexport (일괄 처리)
│   │   └── encryption.py        # POST /encrypt
│   │
│   ├── core/                    # 핵심 모듈
│   │   ├── config.py            # 설정 관리, DetectObj 매핑, resolve_video_path
│   │   ├── state.py             # 전역 상태 (jobs dict, log_queue)
│   │   ├── security.py          # RSA + LEA GCM 보안 모듈
│   │   ├── database.py          # SQLite DRM 정보 관리
│   │   └── logging_setup.py     # 로깅 설정 초기화
│   │
│   ├── models/
│   │   └── schemas.py           # Pydantic 요청/응답 스키마
│   │
│   ├── tracker/                 # 객체 추적기 설정
│   │   ├── deepsort.yaml
│   │   └── strong_sort.yaml
│   │
│   ├── ultralytics/             # YOLO ultralytics 커스텀 설정
│   └── model/                   # 모델 파일 (secuwatcher_best.pt, sam2.1_hiera_base_plus.pt)
│
└── secuwatcher_electron/        # Electron 프론트엔드
    ├── package.json
    ├── forge.config.mjs         # Electron Forge 빌드 설정
    ├── vite.*.config.mjs        # Vite 빌드 설정 (main, preload, renderer)
    ├── index.html
    │
    └── src/
        ├── main/                # Electron 메인 프로세스 (모듈 분할)
        │   ├── index.js         # 메인 진입점
        │   ├── state.js         # 공유 상태 관리
        │   ├── logger.js        # 파일/렌더러 로깅
        │   ├── utils.js         # 경로/FFmpeg/파싱 유틸리티
        │   ├── installer.js     # Squirrel 이벤트 + 첫 실행
        │   ├── windowManager.js # 윈도우 생성/관리
        │   └── ipcHandlers/     # IPC 핸들러
        │       ├── fileHandlers.js     # 파일 작업 (JSON CRUD, 복사, 스캔)
        │       ├── videoHandlers.js    # 비디오 분석/변환
        │       ├── videoEditHandlers.js # 트림/머지
        │       ├── settingsHandlers.js # 설정/워터마크
        │       ├── licenseHandlers.js  # 라이선스 검증
        │       └── encryptHandlers.js  # 암호화
        │
        ├── preload.js           # 프리로드 스크립트 (IPC 브릿지)
        ├── renderer.js          # Vue 앱 진입점
        ├── App.vue              # 메인 Vue 컴포넌트 (컴포저블 조합)
        ├── apiRequest.js        # Axios API 클라이언트 (localhost:5001)
        ├── dirConfig.json       # 디렉토리 경로 설정
        │
        ├── components/          # Vue 컴포넌트
        │   ├── VideoCanvas.vue       # 비디오 + 캔버스 오버레이
        │   ├── VideoControls.vue     # 재생 컨트롤 바 + 탐지 진행률 오버레이
        │   ├── FilePanel.vue         # 파일 목록 패널
        │   ├── TopMenuBar.vue        # 상단 메뉴
        │   ├── ContextMenu.vue       # 우클릭 컨텍스트 메뉴
        │   └── modals/
        │       ├── DetectingPopup.vue      # 탐지 진행 팝업 (우측 상단 비모달)
        │       ├── ExportModal.vue
        │       ├── SettingsModal.vue
        │       ├── WatermarkModal.vue
        │       ├── BatchProcessingModal.vue
        │       ├── MultiDetectionModal.vue
        │       ├── MergeModal.vue
        │       ├── MaskFrameModal.vue
        │       ├── ProcessingModal.vue
        │       └── FolderLoadingModal.vue
        │
        ├── composables/         # Vue 컴포저블 (createXxx 팩토리 패턴)
        │   ├── detectionManager.js   # 탐지 데이터 로드/저장, 증분 리로드
        │   ├── fileManager.js        # 파일 선택, 변환, 중복 체크
        │   ├── exportManager.js      # 반출, 암호화, 일괄처리
        │   ├── settingsManager.js    # 설정 로드/저장
        │   ├── maskingData.js        # 마스킹 데이터 CRUD
        │   ├── objectManager.js      # 객체 지정/미지정, 삭제
        │   ├── canvasDrawing.js      # 바운딩박스, 마스킹 영역 렌더링
        │   ├── canvasInteraction.js  # 마우스 호버, 클릭, 드래그
        │   ├── maskPreview.js        # 마스킹 프리뷰 + 애니메이션 루프
        │   ├── videoController.js    # 비디오 재생/정지/줌/키보드
        │   ├── videoEditor.js        # 트림/머지/마커
        │   ├── conversionHelper.js   # 비디오 변환 진행률
        │   └── progressPoller.js     # 진행률 폴링 (setInterval/setTimeout/Promise)
        │
        ├── stores/              # Pinia 상태 관리
        │   ├── detectionStore.js     # 탐지 데이터, 마스킹 로그, 진행률
        │   ├── videoStore.js         # 비디오 재생 상태
        │   ├── fileStore.js          # 파일 목록, 선택
        │   ├── modeStore.js          # UI 모드 (select, mask, manual)
        │   ├── configStore.js        # 설정, 탐지 클래스, DRM
        │   └── exportStore.js        # 반출/일괄처리 상태
        │
        ├── utils/               # 유틸리티 함수
        │   ├── index.js              # 통합 재내보내기
        │   ├── api.js                # API 관련
        │   ├── geometry.js           # 좌표/바운딩박스 계산
        │   ├── masking.js            # 마스킹 데이터 변환
        │   ├── message.js            # showMessage, showError 등
        │   ├── path.js               # 경로 정규화
        │   ├── validation.js         # 입력 검증
        │   └── video.js              # 비디오 정보 추출
        │
        ├── styles/              # 모듈화된 CSS (12개)
        │   ├── index.css             # 메인 임포트 허브
        │   ├── base.css              # 전역 변수, body, 타이틀바
        │   ├── layout.css            # 컨테이너, 그리드
        │   ├── video.css             # 비디오 플레이어, 탐지 진행률 오버레이
        │   ├── file-panel.css        # 파일 패널
        │   ├── modals.css            # 모달 공통 + 비모달 팝업
        │   ├── controls.css          # 버튼, 폼
        │   ├── detection.css         # 바운딩박스 UI
        │   ├── export-layout.css
        │   ├── export-forms.css
        │   ├── export-progress.css
        │   └── export-controls.css
        │
        ├── license/             # 라이선스 검증
        │   ├── licenseValidator.js
        │   ├── encryption.js
        │   ├── hardwareId.js
        │   └── storage.js
        │
        └── resources/
            └── config.json      # API 엔드포인트 매핑
```

---

## 기술 스택

### 백엔드 (secuwatcher_python)

| 분류 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | FastAPI | 0.115.12 |
| 서버 | Uvicorn | 0.34.0 |
| AI/ML | YOLOv8 (ultralytics) | 8.3.121 |
| AI/ML | SAM2 (facebook) | - |
| AI/ML | PyTorch | 2.3.0+cu118 |
| 추적 | DeepSORT, StrongSORT, ByteTrack | - |
| 비디오 처리 | OpenCV | 4.11.0.86 |
| 암호화 | LEA-GCM (ctypes C 라이브러리) | - |
| 암호화 | cryptography | 44.0.2 |
| 데이터베이스 | SQLite3 (local.db) | - |

### 프론트엔드 (secuwatcher_electron)

| 분류 | 기술 | 버전 |
|------|------|------|
| 프레임워크 | Electron | 36.4.0 |
| 프레임워크 | Vue | 3.5.17 |
| 상태 관리 | Pinia | 3.0.4 |
| 빌드 도구 | Vite | 5.4.19 |
| 빌드 도구 | Electron Forge | 7.9.0 |
| HTTP 클라이언트 | Axios | 1.10.0 |
| 암호화 | crypto-js | 4.2.0 |
| 라이선스 | node-machine-id | 1.1.12 |

---

## 데이터 형식

### JSON 탐지 데이터 스키마 (v1.0.0)

탐지 데이터는 `.json` 파일로 저장됩니다. 프레임 번호를 키로 하는 `frames` 딕셔너리 구조:

```json
{
  "schema_version": "1.0.0",
  "metadata": {
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601",
    "generator": "secuwatcher-detector",
    "status": "completed | detecting",
    "video": {
      "filename": "demo.mp4",
      "width": 1920, "height": 1080,
      "fps": 30.0, "total_frames": 900
    },
    "detection": {
      "model": "secuwatcher_best.pt",
      "device": "mps",
      "confidence_threshold": 0.5,
      "class_ids": [0, 1, 2],
      "tracker": "bytetrack.yaml"
    }
  },
  "frames": {
    "0": [
      {
        "track_id": "1_5",
        "bbox": [100, 50, 300, 400],
        "bbox_type": "rect",
        "score": 0.92,
        "class_id": 0,
        "type": 1,
        "object": 1
      }
    ]
  }
}
```

**필드 설명**:
- `track_id`: `"1_N"` = 자동탐지, `"2_N"` = 선택탐지, `"4_N"` = 수동 마스킹
- `bbox`: `[x1, y1, x2, y2]` (rect) 또는 `[[x1,y1], [x2,y2], ...]` (polygon)
- `type`: 1=자동, 2=선택, 4=수동 마스킹
- `object`: 1=지정(마스킹 대상), 2=미지정
- `metadata.status`: `"detecting"` (탐지 중 증분 저장) 또는 `"completed"` (최종)

### 프론트엔드 데이터 구조

```javascript
// detectionStore — O(1) 프레임 조회
maskingLogs: [{ frame, track_id, bbox, bbox_type, score, class_id, type, object }]
maskingLogsMap: { [frameNumber]: [entries] }
```

---

## API 엔드포인트

### Python 백엔드 REST API (포트 5001)

| 엔드포인트 | 메서드 | 설명 |
|----------|--------|------|
| `/` | GET | 헬스 체크 |
| `/autodetect` | POST | 객체 탐지/마스킹 작업 시작 |
| `/progress/{job_id}` | GET | 작업 진행 상태 조회 (0~100%) |
| `/autoexport` | POST | 일괄 처리 (탐지 + 마스킹 + 워터마킹) |
| `/encrypt` | POST | LEA-GCM으로 비디오 암호화 |
| `/docs` | GET | Swagger UI |

### /autodetect 이벤트 유형

- **Event=1**: 자동 객체 탐지 + 추적 (YOLO, config.ini 설정 기반, lazy loading)
- **Event=2**: 선택 객체 탐지 (SAM2, 클릭 좌표 기반 크롭 세그멘테이션, 클릭 프레임 + 5프레임)
- **Event=3**: 마스킹 반출 (탐지 기반 또는 전체 프레임)

### Electron IPC → Python API 매핑 (config.json)

| config.json 키 | 경로 | 처리 위치 |
|----------------|------|-----------|
| `autodetect` | `/autodetect` | Python 백엔드 |
| `progress` | `/progress` | Python 백엔드 |
| `batchProcessing` | `/autoexport` | Python 백엔드 |
| `encrypt` | `/encrypt` | Python 백엔드 |
| `loadJson` | `/api/load-json` | Electron IPC |
| `saveJson` | `/api/save-json` | Electron IPC |
| `updateJson` | `/api/update-json` | Electron IPC |
| `updateFilteredJson` | `/api/update-json-filtered` | Electron IPC |
| `trimVideo` | `/api/trim-video` | Electron IPC |
| `mergeVideo` | `/api/merge-video` | Electron IPC |
| `settings` | `/api/settings` | Electron IPC |
| `drmInfo` | `/api/site-properties/drm-info` | Electron IPC |

### DetectObj 클래스 매핑 (config.ini)

```
0: 없음, 1: [0]사람, 2: [1]차량, 3: [2]오토바이, 4: [3]번호판
5: [0,1], 6: [0,2], 7: [0,3], 8: [1,2], 9: [1,3], 10: [2,3]
11: [0,1,2], 12: [0,1,3], 13: [0,2,3], 14: [1,2,3], 15: [0,1,2,3]
```

---

## IPC 채널 (preload.js)

### 창 제어
| API | 채널 | 설명 |
|-----|------|------|
| `minimizeWindow()` | `window-minimize` | 창 최소화 |
| `maximizeWindow()` | `window-maximize` | 창 최대화 |
| `closeWindow()` | `window-close` | 창 닫기 |
| `isWindowMaximized()` | `window-is-maximized` | 최대화 상태 |

### 파일 및 비디오
| API | 채널 | 설명 |
|-----|------|------|
| `saveTempFile()` | `save-temp-file` | 임시 파일 저장 |
| `deleteTempFile()` | `delete-temp-file` | 임시 파일 삭제 |
| `getVideoInfo()` | `get-video-info` | FFprobe 비디오 정보 |
| `convertVideo()` | `convert-video` | FFmpeg 비디오 변환 |
| `copyVideoToDir()` | `copy-video-to-dir` | 비디오를 videoDir로 복사 (중복 체크) |
| `scanDirectory()` | `scan-directory` | 폴더 내 비디오 스캔 |
| `showSaveDialog()` | `show-save-dialog` | 저장 대화상자 |
| `showOpenDialog()` | `show-open-dialog` | 파일 열기 대화상자 |
| `showVideoDialog()` | `show-video-dialog` | 비디오 파일 선택 |
| `getFileStat()` | `stat-file` | 파일 상태 정보 |

### JSON 탐지 데이터
| API | 채널 | 설명 |
|-----|------|------|
| `loadJson()` | `load-json` | JSON 탐지 데이터 로드 |
| `saveJson()` | `save-json` | JSON 저장 |
| `updateJson()` | `update-json` | JSON 증분 업데이트 |
| `updateFilteredJson()` | `update-filtered-json` | JSON 전체 교체 |
| `copyJsonWithExport()` | `copy-json-with-export` | 반출 시 JSON 복사 |

### 설정 및 워터마크
| API | 채널 | 설명 |
|-----|------|------|
| `getSettings()` | `get-settings` | 설정 조회 |
| `saveSettings()` | `save-settings` | 설정 저장 |
| `saveWatermark()` | `save-watermark` | 워터마크 설정 저장 |
| `loadWatermark()` | `load-watermark` | 워터마크 이미지 로드 |
| `copyWatermarkImage()` | `copy-watermark-image` | 워터마크 이미지 복사 |

### 비디오 편집
| API | 채널 | 설명 |
|-----|------|------|
| `trimVideo()` | `trim-video` | 비디오 자르기 |
| `mergeVideos()` | `merge-videos` | 비디오 병합 |

### 암호화 및 라이선스
| API | 채널 | 설명 |
|-----|------|------|
| `encryptFile()` | `encrypt-file` | 파일 암호화 |
| `getHardwareId()` | `get-hardware-id` | 하드웨어 ID |
| `exportHardwareId()` | `export-hardware-id` | 하드웨어 ID 내보내기 |
| `selectLicenseFile()` | `select-license-file` | 라이선스 파일 선택 |
| `validateLicense()` | `validate-license` | 라이선스 검증 |

### 기타
| API | 채널 | 설명 |
|-----|------|------|
| `readExternalJson()` | `read-external-json` | 외부 JSON 읽기 |
| `writeExternalJson()` | `write-external-json` | 외부 JSON 쓰기 |
| `getAppPath()` | `get-app-path` | 앱 경로 |
| `getDesktopDir()` | `get-desktop-dir` | 바탕화면 경로 |
| `showMessage()` | `show-message` | 메시지 대화상자 |
| `confirmMessage()` | `confirm-message` | 확인 대화상자 |
| `areaMaskingMessage()` | `area-masking-message` | 다각형/사각형 선택 대화상자 |
| `maskRangeMessage()` | `mask-range-message` | 마스킹 범위 선택 대화상자 (전체/여기까지/여기서부터/여기만/취소) |
| `dynamicDialog()` | `dynamic-dialog` | 동적 버튼 대화상자 (버튼 배열 파라미터) |
| `onConversionProgress()` | `conversion-progress` | 변환 진행률 이벤트 |
| `onMainLog()` | `main-log` | 메인 프로세스 로그 이벤트 |

---

## Pinia Store 상태

### detectionStore
```javascript
{
  maskingLogs: [],           // 전체 탐지/마스킹 데이터 배열
  maskingLogsMap: {},        // { frame: [entries] } — O(1) 조회
  newMaskings: [],           // 수동 마스킹 배치 버퍼
  dataLoaded: false,         // 데이터 로드 완료 여부
  isDetecting: false,        // 탐지 진행 중 여부
  detectionProgress: 0,      // 탐지 진행률 (0-100, videoStore.progress와 분리됨)
  hasSelectedDetection: false,
  maskBiggestTrackId: '',
  hoveredBoxId: null,        // 현재 호버된 바운딩박스 track_id
  // 프레임 범위 마스킹
  maskFrameStart: null, maskFrameEnd: null,
  showMaskFrameModal: false,
  frameMaskStartInput: '', frameMaskEndInput: '',
  // 다중파일 탐지
  showMultiAutoDetectionModal: false,
  autoDetectionSelections: [],
}
```

### videoStore
```javascript
{
  currentTime: '00:00',      // 표시용 시간 문자열
  totalTime: '00:00',
  progress: 0,               // 비디오 재생 위치 (0-100, 탐지 진행률과 분리됨)
  videoPlaying: false,
  zoomLevel: 1,
  frameRate: 30,
  videoDuration: 0,
  currentFrame: 0,
  previousFrame: -1,
  currentPlaybackRate: 1,
  trimStartTime: 0, trimEndTime: 0, trimDragging: null,
  conversion: { inProgress: false, progress: 0, currentFile: '' },
  conversionCache: {},
}
```

### fileStore
```javascript
{
  files: [],                  // [{ name, file, url, ... }]
  selectedFileIndex: -1,
  fileInfoItems: [            // 6개: 파일이름, 용량, 재생시간, 해상도, fps, 총프레임
    { label: '파일 이름', value: '' }, ...
  ],
  sessionCroppedFiles: [],
  currentTimeFolder: null,
  dirConfig: { videoDir: '' },
  selectedExportDir: '',
  desktopDir: '',
  fileProgressMap: {},        // 다중 파일 진행률
  isFolderLoading: false,
  folderLoadCurrent: 0, folderLoadTotal: 0, folderLoadProgress: 0,
  showVideoListModal: false,
  serverVideoList: [],
}
```

### modeStore
```javascript
{
  currentMode: '',            // '', 'select', 'mask'
  selectMode: false,          // true이면 캔버스 pointerEvents='auto' (호버/클릭 활성화)
  isBoxPreviewing: false,
  exportAllMasking: 'No',
  maskMode: 'rectangle',     // 'rectangle' 또는 'polygon'
  maskCompleteThreshold: 30,
  maskingPoints: [],
  isDrawingMask: false,
  isPolygonClosed: false,
  contextMenuVisible: false,
  contextMenuPosition: { x: 0, y: 0 },
  selectedShape: null,
}
```

### configStore
```javascript
{
  allConfig: '',              // 전체 설정 (config.ini 파싱 결과)
  selectedSettingTab: 'auto',
  showSettingModal: false,
  isWaterMarking: false,
  settingAutoClasses: { person: false, car: false, motorcycle: false, plate: false },
  settingExportMaskRange: 'none',  // 'none'|'bg'|'selected'|'unselected'
  drmInfo: { drmPlayCount: 99, drmExportPeriod: '' },
  showWatermarkModal: false,
  watermarkImage: null,
  waterMarkImageName: '',
  cachedWatermarkImage: null,
  watermarkImageLoaded: false,
}
```

### exportStore
```javascript
{
  exporting: false,
  exportProgress: 0,
  exportMessage: '',
  exportFileNormal: true,
  exportFilePassword: '',
  showPassword: false,
  // 일괄처리
  isBatchProcessing: false,
  currentFileIndex: 0,
  totalFiles: 0,
  currentFileName: '',
  phase: '',                  // 'init'|'detect'|'mask'|'watermark'|'encrypt'|'export'|'done'
  currentFileProgress: 0,
  batchJobId: null,
}
```

---

## 핵심 워크플로우

### 비디오 처리 파이프라인

1. **파일 로드** → 2. **탐지** → 3. **추적** → 4. **마스킹** → 5. **워터마킹** → 6. **암호화**

### 탐지 중 실시간 데이터 흐름

```
[Python detector.py]
  매 30프레임마다 _write_incremental_json() → atomic write (tmp → os.replace)
    ↓
[Frontend detectionManager.js]
  progress poller (1초 간격) → onProgress 콜백
    ↓ 1초마다
  loadDetectionData(force=true) → electronAPI.loadJson → JSON 파일 읽기
    ↓
  maskingLogsMap 재구성 → drawBoundingBoxes()
    ↓
  mode.selectMode = true → 캔버스 호버/클릭 활성화
```

### 진행률 추적

- 작업은 `job_id`를 키로 하는 전역 `jobs` 딕셔너리에 저장 (core/state.py)
- 진행률: progress_raw (0.0~1.0) → progress (0~100%) 정규화
- 탐지 진행률(`detectionStore.detectionProgress`)과 비디오 위치(`videoStore.progress`)는 **분리**

### 로그 구성

```
log/
├── Daily Log/YYYYMMDD/     # API/터미널 로그
├── AI Log/YYYYMMDD/        # AI 탐지 로그
└── Video Log/YYYYMMDD/     # 비디오 처리 로그
```

---

## 빌드 및 실행 명령어

### 백엔드 (secuwatcher_python)

```bash
cd secuwatcher_python
source venv/bin/activate     # macOS (Python 3.14.2)
python main.py               # 포트 5001에서 실행
```

### 프론트엔드 (secuwatcher_electron)

```bash
cd secuwatcher_electron
npm install                  # Node v22.22.0
npm run start                # 개발 모드
npm run make                 # 배포 빌드
```

**주요 config.ini 설정**:
```ini
[detect]
device = mps                 # mps (Apple Silicon), gpu, cpu
threshold = 0.5

[sam2]
crop_size = 384              # 클릭 지점 중심 크롭 크기 (px)
forward_frames = 5           # 클릭 프레임 이후 추적 프레임 수
model_path = model/sam2.1_hiera_base_plus.pt  # 로컬 체크포인트
device = cpu                 # cpu, cuda, mps

[export]
maskingtool = 1              # 0=모자이크, 1=블러
maskingstrength = 5          # 1-5
```

---

## 코드 스타일 가이드라인

### Python (secuwatcher_python)

- **주석**: 한국어
- **로깅**: `util.log_writer`와 `log_queue` (비동기)
- **설정**: `configparser` + `get_resource_path()` (PyInstaller 호환)
- **진행률**: `util.update_progress(job_id, fraction, start_pct, end_pct)`
- **JSON 저장**: `_write_incremental_json()` — atomic write with `os.replace`

### JavaScript (secuwatcher_electron)

- **모듈**: ES6+ import/export
- **프레임워크**: Vue 3 + Pinia
- **컴포저블**: `createXxxManager(deps)` 팩토리 패턴 + 의존성 주입
- **IPC**: `window.electronAPI.*` (preload.js contextBridge)
- **주석**: 한국어
- **Store**: 경량 유지 — 비즈니스 로직은 컴포저블에

---

## 보안 고려사항

### 암호화

- **알고리즘**: LEA-GCM (macOS에서는 AES-GCM 폴리필)
- **구현**: ctypes를 통해 로드되는 C 라이브러리
- **키 교환**: RSA-OAEP
- **출력 형식**: `.sphereax` (논스 + 암호문 + 태그 + DRM 메타데이터)

### 라이선스 검증

- `node-machine-id` 하드웨어 ID 바인딩
- RSA 서명 검증, 만료일 확인
- 현재 개발 모드에서 우회(BYPASSED)

### 파일 작업

- 경로 검증 (디렉토리 탐색 방지)
- 파일 중복 체크 (파일 크기 비교)
- 암호화 후 임시 파일 정리

---

## 배포 참고사항

### 백엔드 배포

- PyInstaller로 패키징 가능
- GPU 가속을 위해 CUDA 런타임 필요
- LEA 라이브러리 파일 포함 필요 (DLL/SO 파일)
- 런타임에 모델 파일 `secuwatcher_best.pt` (YOLO), `sam2.1_hiera_base_plus.pt` (SAM2) 필요

### 프론트엔드 배포

- Electron Forge로 빌드
- Windows (Squirrel), macOS (ZIP), Linux (DEB/RPM) 지원
- ASAR 패키징 활성화
- 비디오 스트리밍을 위한 커스텀 프로토콜 `local-video://` 등록

---

## 에이전트 구성

### 1. Orchestrator Agent

**역할**: 작업 분배, 품질 게이트, 인프라/보안 관리

**프롬프트**:
```
당신은 SecuWatcher Export 프로젝트의 Orchestrator Agent입니다.
역할: 작업 분배, 품질 게이트 관리, 레이어 간 충돌 방지.
규칙:
- 각 에이전트가 자신의 레이어만 수정하도록 감독
- preload.js, apiRequest.js 등 경계 파일 수정 시 반드시 승인
- 한국어 주석 유지, 기존 API 계약(IPC 채널명, REST 엔드포인트) 변경 금지
```

### 2. Electron Main Agent

**역할**: main 프로세스 개발 및 유지보수

**담당 파일**: `src/main/`, `preload.js`, `forge.config.mjs`

**프롬프트**:
```
당신은 SecuWatcher Export의 Electron Main Agent입니다.
담당: 메인 프로세스 개발 및 IPC 핸들러 관리.
구조: src/main/ (index.js, windowManager.js, ipcHandlers/6개, logger.js, state.js, utils.js)
규칙:
- IPC 채널명 변경 금지 (preload.js가 SSOT)
- 모듈별 400줄 미만 유지
- JSON 데이터 처리 시 bbox가 string/array 양쪽 모두 올 수 있음에 주의
```

### 3. Vue Renderer Agent

**역할**: Vue 레이어 유지보수 및 리팩토링

**담당 파일**: `App.vue`, `components/`, `composables/`, `stores/`, `styles/`

**프롬프트**:
```
당신은 SecuWatcher Export의 Vue Renderer Agent입니다.
담당: Vue 레이어 리팩토링 및 유지보수.
패턴: createXxxManager(deps) 팩토리 컴포저블 + 의존성 주입
규칙:
- 새 컴포저블 추가 시 동일 팩토리 패턴 사용
- Pinia Store는 경량 유지 (비즈니스 로직은 컴포저블에)
- 탐지 진행률(detectionProgress)과 비디오 진행률(videoStore.progress) 반드시 분리 유지
- selectMode 상태가 캔버스 pointerEvents를 제어함에 주의
```

### 4. Python Backend Agent

**역할**: Python 백엔드 개발 및 유지보수

**담당 파일**: `main.py`, `routers/`, `core/`, `models/`, `detector.py`, `sam2_detector.py`, `blur.py`

**프롬프트**:
```
당신은 SecuWatcher Export의 Python Backend Agent입니다.
담당: FastAPI 백엔드 개발 및 유지보수.
구조: FastAPI Router(routers/) + Core(core/) + Service(detector.py, sam2_detector.py, blur.py) 패턴
규칙:
- REST API 엔드포인트 URL 변경 금지
- Pydantic 스키마로 요청/응답 타입 명시
- 탐지 중 매 30프레임마다 _write_incremental_json()으로 증분 저장 (atomic write)
- SAM2 선택탐지는 _write_merged_json()으로 기존 데이터 보존 병합 (atomic write)
- YOLO/SAM2 모델 모두 lazy singleton 패턴 (서버 시작 시 미로드)
- config.ini 파싱은 core/config.py로 중앙화
```

### 5. QA/Test Agent

**역할**: 테스트 인프라 관리 및 통합 검증

**프롬프트**:
```
당신은 SecuWatcher Export의 QA Agent입니다.
담당: 테스트 작성, 실행, 버그 발견 및 보고.
핵심 검증 워크플로우:
1. 파일→재생
2. 자동객체탐지 (증분 데이터 표시 확인)
3. 탐지 중 호버/지정 기능 동작 확인
4. 선택/수동마스킹
5. 마스킹반출, 암호화반출
6. 워터마크, 일괄처리
규칙:
- 버그 분류: P0(크래시), P1(기능미작동), P2(UX)
- 수정된 버그는 반드시 테스트 케이스 추가
```

---

## 개발 참고사항

- 프로젝트는 주석, 로그, UI 전반에 걸쳐 한국어를 사용합니다
- 백엔드(포트 5001)와 프론트엔드는 localhost REST API로 통신합니다
- JSON 탐지 데이터는 탐지 중에도 30프레임마다 증분 저장됩니다 (atomic write)
- `maskingLogsMap` 딕셔너리로 O(1) 프레임 단위 조회가 가능합니다
- 탐지 팝업은 우측 상단 비모달 카드로 표시됩니다 (탐지 중 조작 가능)
- 타임라인에 탐지 진행률 오버레이가 표시됩니다
- XLSX 의존성은 제거됨 — JSON.parse 네이티브 사용
- 라이선스 검증은 현재 개발 모드에서 우회(BYPASSED)
- venv: secuwatcher_python/venv (Python 3.14.2), Node: v22.22.0
