# SecuWatcher Electron - 세션 3 핸드오프

## 기술 스택
- **Electron 36 + Vue 3.5 (Options API) + Vite 5 + Pinia + FastAPI 백엔드**
- IPC 패턴: `ipcMain.handle()` / `ipcRenderer.invoke()`
- 빌드: `npm run build` → `vite build --config vite.renderer.config.mjs` (155 모듈)
- 빌드 시 EPERM 에러는 샌드박스 제한으로 코드 문제 아님

---

## 이번 세션 완료 작업

### 1. 파일 삭제 시 연관 데이터 실제 삭제 (버그 수정)

**문제:** `deleteFile()` 함수가 확인 대화상자("데이터도 함께 삭제됩니다")를 표시하지만, 실제로 디스크의 JSON/CSV/crop 파일을 삭제하지 않았음. 파일 삭제 후 동일 파일 재추가 시 기존 바운딩박스 데이터가 그대로 로드됨.

**수정 파일:**
- **`src/main/ipcHandlers/fileHandlers.js`** — `delete-file-data` IPC 핸들러 추가
  - `videoDir/baseName.json`, `.csv` 파일 삭제
  - `videoDir/crop/*/baseName_crop*` 파일 삭제 + 빈 타임폴더 정리
- **`src/preload.js`** — `deleteFileData()` API 노출
- **`src/composables/fileManager.js` `deleteFile()`** — 사용자 확인 후:
  - `window.electronAPI.deleteFileData()` 호출로 디스크 데이터 실제 삭제
  - 메모리 내 `detection.maskingLogs/maskingLogsMap/dataLoaded` 초기화

### 2. 탐지 중 프레임 이동 성능 개선

**문제:** 탐지 진행 중 폴러가 1초마다 `loadDetectionData(true)`를 호출하여 8만~9만개 엔트리를 매번 전체 파싱/맵 재구축. 프레임 이동 시 메인 스레드 블록으로 바운딩박스 렌더링 지연.

**수정 파일:**
- **`src/composables/detectionManager.js`**
  - `RELOAD_INTERVAL = 3000` (자동탐지 리로드 간격 1초→3초)
  - `SEEK_DEBOUNCE = 1500` (프레임 이동 후 1.5초간 리로드 스킵)
  - `notifySeek()` 함수 추가/노출
  - **선택객체 탐지(Event=2)는 1초 리로드 유지** (데이터량 소량)
- **`src/components/VideoCanvas.vue`** — `seeked` 이벤트 시 `$emit('seeked')` 추가
- **`src/App.vue`** — `@seeked="detectionManager.notifySeek()"` 연결

| 탐지 유형 | 데이터량 | 리로드 간격 | Seek 디바운스 |
|---|---|---|---|
| 자동탐지 (Event=1) | 8만+ 엔트리 | 3초 | 1.5초 스킵 |
| 선택객체 (Event=2) | 수십 엔트리 | 1초 | 없음 |

### 3. 선택객체 탐지 프레임 표시 수정

**문제:** `DetectingPopup`이 선택객체 탐지(Event=2)에서도 전체 영상 프레임 수(예: 4,058)를 표시. 실제로는 `config.ini [sam2] forward_frames` 값 기반의 소규모 범위만 처리.

**수정 파일:**
- **`src/components/modals/DetectingPopup.vue`**
  - `totalFrames` computed에서 `detectionEventType === '2'`일 때 `configStore.allConfig.sam2.forward_frames + 1` 사용
  - 현재 `forward_frames=14` → "프레임 N / 15"로 표시

---

## 이전 세션(1~2)에서 완료된 작업 (컨텍스트)

- 파일 리스트 영속화 (`saveFileList`/`loadFileList`)
- 중복 파일 블로킹 다이얼로그 → 비블로킹 토스트 알림
- FolderLoadingModal을 BatchProcessingModal 스타일로 리디자인
- 파일 삭제 시 연관 데이터 확인 다이얼로그 (`check-file-data` IPC)
- 탐지 팝업, 바운딩박스, 클릭마커 등 다수 UI/UX 개선

---

## 미해결/관찰된 이슈

### track_id가 모두 동일값(-1)인 문제
- **현상:** 바운딩박스 라벨이 모두 "ID 1,-1"로 표시됨. 호버 시 모든 객체가 동시 하이라이트.
- **원인:** 프론트엔드 코드 문제가 아닌 **백엔드(FastAPI/모델)에서 track_id를 -1로 반환**하는 것으로 추정. `detectionManager.js`에서 JSON 로드 시 `entry.track_id`를 그대로 사용하며(109줄), 변환/손실 없음.
- **영향:** `hoveredBoxId === log.track_id` 비교에서 모든 객체 매칭 → 전체 하이라이트
- **해결 방향:**
  - (A) 백엔드에서 고유 track_id 부여 확인 (secuwatcher_python 쪽)
  - (B) 프론트 임시 대응: 프레임 내 배열 인덱스 기반 hover 식별로 변경

### `check-file-data` / `delete-file-data` 핸들러 등록
- 메인 프로세스 IPC 핸들러이므로 **앱 완전 재시작 필수** (renderer 핫리로드만으로 미반영)

---

## 주요 파일 참조

| 파일 | 역할 |
|---|---|
| `src/composables/fileManager.js` | 파일 선택/삭제/추가 핵심 로직 |
| `src/composables/detectionManager.js` | 탐지 데이터 로드/저장, 폴링 관리 |
| `src/composables/canvasDrawing.js` | 바운딩박스/마스킹 렌더링 |
| `src/composables/canvasInteraction.js` | 호버/클릭 충돌 감지 |
| `src/main/ipcHandlers/fileHandlers.js` | 파일 관련 IPC (check/delete-file-data 포함) |
| `src/stores/detectionStore.js` | 탐지 상태 관리 (Pinia) |
| `src/components/modals/DetectingPopup.vue` | 탐지 진행 팝업 |
| `config/config.ini` | SAM2 설정 (`forward_frames=14`) |

---

## config.ini 주요 설정

```ini
[sam2]
crop_size=384
forward_frames=14          # 선택객체 탐지 프레임 범위
model_path=model/sam2.1_hiera_base_plus.pt
device=gpu

[detect]
threshold=0.5
detectobj=10

[path]
video_path=/Users/workHwiii/Downloads
```
