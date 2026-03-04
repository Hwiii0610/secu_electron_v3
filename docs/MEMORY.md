# SecuWatcher Export - Project Memory

## Architecture
- **Python backend**: FastAPI on port 5001 (secuwatcher_python/main.py)
- **Electron frontend**: Vue 3 + Vite on port 5173 (secuwatcher_electron/)
- **Detection**: YOLOv8 via custom Ultralytics, MPS (Apple Silicon) supported
- **Encryption**: LEA-GCM with AES-GCM polyfill on macOS (lea_gcm_lib.py)

## Key Lessons
- **FastAPI dual app bug**: App was created twice (lines 149 then 190), CORS middleware was on first instance only. Always check for app re-assignment when debugging CORS.
- **CORS spec**: `allow_origins=["*"]` + `allow_credentials=True` is invalid per spec. Use explicit origins with credentials.
- **Path normalization**: `normalizeWinPath` existed in both main.js and App.vue, converting all slashes to backslashes. macOS needs forward slashes.
- **Missing endpoints**: Frontend called `/autoexport` which didn't exist in backend. Always verify API contract between frontend config.json and backend routes.

## File Map
- `secuwatcher_python/main.py` - FastAPI app, routes: /, /autodetect, /autoexport, /encrypt, /decrypt, /progress/{job_id}
- `secuwatcher_python/detector.py` - YOLO detection, MPS support
- `secuwatcher_python/config.ini` - Device=mps, paths, thresholds
- `secuwatcher_python/util.py` - update_progress(), jobs dict, logging
- `secuwatcher_electron/src/main.js` - Electron main process (~2441 lines)
- `secuwatcher_electron/src/App.vue` - Vue component (all UI + API calls)
- `secuwatcher_electron/src/resources/config.json` - API endpoint mapping

## Current State
- License validation: BYPASSED for development
- venv: secuwatcher_python/venv (Python 3.14.2)
- Node: v22.22.0


---

## 2026-02-10 Update: File Path Synchronization Fix

### Problem
400 Bad Request error on `/autodetect` endpoint:
```
POST http://127.0.0.1:5001/autodetect 400 (Bad Request)
지정된 VideoPath 파일을 찾을 수 없습니다: demo1.mp4
```

Root cause: File paths were inconsistent between Electron frontend and Python backend.
- Frontend used original file locations (e.g., `/Users/workHwiii/Downloads/demo1.mp4`)
- Python backend searched in `config.ini`'s `video_path` directory
- Two different config.ini files had different paths

### Solution
Implemented Windows-style unified storage approach:

1. **Automatic file copy on add**: Files are automatically copied to `videos/org/` when selected
2. **IPC handler `copy-video-to-dir`**: New handler in main.js handles:
   - Directory auto-creation
   - Duplicate file detection (compares size + mtime)
   - Automatic renaming with `(1)`, `(2)` suffixes for conflicts
3. **Path synchronization**: Both config.ini files now use identical absolute paths

### Files Modified
| File | Change |
|------|--------|
| `secuwatcher_electron/src/dirConfig.json` | Absolute paths for videoDir |
| `secuwatcher_electron/config/config.ini` | Fixed video_path (was pointing to Downloads) |
| `secuwatcher_python/config.ini` | Synchronized video_path |
| `secuwatcher_electron/src/main.js` | Added `copy-video-to-dir` IPC handler |
| `secuwatcher_electron/src/preload.js` | Exposed `copyVideoToDir` API |
| `secuwatcher_electron/src/App.vue` | Added copy logic to file selection |

### Test Results (2026-02-10)
All tests passed ✅:
- File copy: `/Users/workHwiii/Downloads/demo1.mp4` → `videos/org/demo1.mp4`
- API call: `POST /autodetect` returns 200 OK
- Detection: YOLO autodetector completed successfully
- CSV output: `demo1.csv` generated in `videos/org/`
- Progress polling: 1-second intervals working correctly

### Key Logs
```
[copy-video-to-dir] 파일 복사 완료: 
/Users/workHwiii/Downloads/demo1.mp4 -> 
/Users/workHwiii/Desktop/secu_electron_v3/secuwatcher_electron/videos/org/demo1.mp4

[10:23:41] autodetector 시작: video_path='.../videos/org/demo1.mp4', conf_thres=0.5
[10:26:39] autodetector 종료: 생성된 파일들=['.../videos/org/demo1.csv']
```


# SecuWatcher Export - 작업 기록

## 2026-02-10: 바울링박스 호버 효과 추가

### 작업 개요
자동객체탐지 후 표시되는 바울링박스에 마우스 호버 시 시각적 피드백 추가

### 문제 상황
- 객체 영역이 겹칠 경우 사용자가 어떤 객체를 선택 중인지 구분 불가
- 우클릭 메뉴 사용 시 정확한 객체 선택 어려움

### 해결 방안
1. **마우스 호버 시 색상 변경**: 빨간색 → 주황색
2. **낮에 불투명 채우기**: `rgba(255, 165, 0, 0.3)`로 낮에 투명하게 채움
3. **겹친 박스 처리**: 면적이 가장 작은 박스(낮은 박스) 우선 선택

### 수정 파일
- `secuwatcher_electron/src/App.vue`

### 주요 변경 사항

#### 1. 데이터 속성 추가
```javascript
hoveredBoxId: null,  // 마우스 호버 중인 박스의 track_id 저장
```

#### 2. 마우스 호버 감지 메서드 (`checkHoveredBox`)
- `detectionResults`와 `maskingLogs`에서 마우스 위치의 모든 박스 검색
- 겹친 박스는 면적 기준으로 정렬하여 가장 작은 박스 선택
- 상태 변경 시에만 `drawBoundingBoxes()` 호출 (성능 최적화)

#### 3. 색상 및 채우기 로직
```javascript
const isHovered = this.hoveredBoxId === result.track_id;
ctx.strokeStyle = isHovered ? 'orange' : 'red';

if (isHovered) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';  // 주황색 30% 불투명
  ctx.fillRect(x, y, w, h);  // 사각형 채우기
  ctx.restore();
}
```

### 적용 위치
- `drawDetectionBoxes()`: 자동객체탐지 바울링 박스
- `drawCSVMasks()` (사각형): CSV 데이터 사각형 마스크
- `drawCSVMasks()` (다각형): CSV 데이터 다각형 마스크

### 관련 요청
> "자동객체 탐지 수행후에, 프레임별로 탐지된 객체의 바울링박스가 붉은색으로 표시됨... 감지된 객채의 영역이 겹칠 경우, 사용자는 어떤 객체를 선택중인지 구분할 수가 없습니다. 따라서 마우스 커서가 해당 박스 영역에 호버중일 경우, 해당 박스의 색상이 주황색으로 출력되도록 기능을 추가"

> "두개의 객체가 겹쳐진 상태에서, 1번 객채 박스낮에 2번객채 박스가 포함되어 있을 경우엔 어떻게 처리되나요?"

> "현재 호버된 객체의 박스 색상낮에도 동일한 색상으로 불투명하게 채워야 할거 같습니다."