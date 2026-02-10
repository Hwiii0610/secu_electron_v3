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
