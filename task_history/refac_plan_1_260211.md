# App.vue & VideoCanvas.vue 리팩토링 계획

## Context

App.vue (2,742줄)와 VideoCanvas.vue (2,110줄)이 과도하게 크며, 유지보수성이 떨어지고 코드 중복이 존재합니다. 기존 프로젝트 패턴(Options API, 팩토리 컴포저블, Pinia 스토어)을 유지하면서 두 파일을 각각 ~1,000줄로 줄이는 것이 목표입니다.

## 현재 상태

| 파일 | 줄 수 | 함수 수 | 상태변수 |
|------|--------|---------|----------|
| App.vue | 2,742 | 59 | 100+ (Pinia mapped) |
| VideoCanvas.vue | 2,110 | 39 | 51 |

### 핵심 중복: 마스킹 데이터 함수 3곳 중복
- `detectionStore.js` (actions): `rebuildMaskingLogsMap`, `addToMaskingLogsMap`
- `App.vue` (methods): `sendBatchMaskingsToBackend`, `rebuildMaskingLogsMap`, `addToMaskingLogsMap`
- `VideoCanvas.vue` (methods): `saveMaskingEntry`, `saveManualMaskingEntry`, `sendBatchMaskingsToBackend`, `rebuildMaskingLogsMap`, `addToMaskingLogsMap`, `logMasking`, `checkBiggestTrackId`

---

## 통합 패턴: 팩토리 컴포저블 (기존 `createProgressPoller` 패턴 따름)

```javascript
// composables/xxxManager.js
export function createXxxManager(deps) {
  // deps = { getStores, getVideo, ... } - 게터로 전달
  return {
    method1() { ... },
    method2() { ... },
  };
}

// App.vue 또는 VideoCanvas.vue에서 사용
created() {
  this._xxxManager = createXxxManager({
    getStores: () => ({ detection: useDetectionStore(), ... }),
  });
},
methods: {
  method1() { return this._xxxManager.method1(); },
}
```

---

## 실행 계획 (5 페이즈)

### Phase 1: 마스킹 데이터 통합 (중복 제거)
**새 파일**: `composables/maskingData.js` (~120줄)

VideoCanvas.vue에서 추출할 함수:
- `logMasking()` (1659-1687)
- `saveMaskingEntry(frame, bbox)` (1695-1719)
- `saveManualMaskingEntry(frame, bbox)` (1728-1772)
- `sendBatchMaskingsToBackend()` (1777-1799)
- `rebuildMaskingLogsMap()` (1805-1812)
- `addToMaskingLogsMap(entry)` (1819-1823)
- `checkBiggestTrackId(typeNum)` (1831-1862)

App.vue의 동일 함수도 이 컴포저블로 위임.
detectionStore.js의 actions(`rebuildMaskingLogsMap`, `addToMaskingLogsMap`)은 유지하되, 컴포저블이 store action을 호출하는 구조.

**결과**: VideoCanvas -170줄, App.vue -30줄

---

### Phase 2: 캔버스 드로잉 추출 (VideoCanvas 핵심)
**새 파일**: `composables/canvasDrawing.js` (~450줄)

VideoCanvas.vue에서 추출:
- `convertToCanvasCoordinates(point)` (416-437)
- `convertToOriginalCoordinates(event)` (445-475)
- `getCurrentFrameNormalized()` (573-586)
- `drawBoundingBoxes()` (849-902)
- `drawDetectionBoxes(ctx, video)` (1026-1073)
- `drawCSVMasks(ctx, currentFrame)` (910-1018)
- `drawPolygon()` (1078-1123)
- `drawRectangle()` (1128-1158)
- `resizeCanvas()` (1163-1176)
- `resizeMaskCanvas()` (1181-1203)
- `drawWatermarkPreview(ctx, canvas)` (687-798)
- `getScale()` (807-815)
- `getWatermarkCoords(...)` (827-840)

**결과**: VideoCanvas -500줄

---

### Phase 3: 캔버스 인터랙션 + 충돌 감지 추출
**새 파일**: `composables/canvasInteraction.js` (~300줄)

VideoCanvas.vue에서 추출:
- `onCanvasClick(event)` (1389-1443)
- `onCanvasMouseDown(event)` (1452-1491)
- `onCanvasMouseMove(event)` (1501-1540)
- `onCanvasMouseUp(event)` (1550-1596)
- `onCanvasContextMenu(event)` (1603-1650)
- `checkHoveredBox(event)` (486-565)
- `findTrackIdAtPosition(clickPoint)` (628-675)
- `isPointInPolygon(point, polygon)` (595-605)
- `getBBoxString(box)` (613-619)

의존성: `canvasDrawing` (Phase 2), `maskingData` (Phase 1), `emit` 함수

**새 파일**: `utils/geometry.js` (~20줄) - `isPointInPolygon` 등 순수 유틸리티

**결과**: VideoCanvas -300줄

---

### Phase 4: 마스크 프리뷰 + 애니메이션 루프
**새 파일**: `composables/maskPreview.js` (~180줄)

VideoCanvas.vue에서 추출:
- `startMaskPreview()` (1212-1302)
- `stopMaskPreview()` (1308-1343)
- `applyEffectFull(ctx, ow, oh)` (1352-1377)
- `startAnimationLoop()` (1872-1913)
- `stopAnimationLoop()` (1918-1923)

내부 상태 관리: `isMasking`, `maskPreviewAnimationFrame`, `animationFrameId`

**결과**: VideoCanvas -150줄 → **최종 ~990줄**

---

### Phase 5: App.vue 대규모 추출 (4개 컴포저블)

#### 5A: `composables/fileManager.js` (~350줄)
App.vue에서 추출:
- `setVideoPathFromItem(item)` (269-315)
- `getSelectedVideoDir()` (318-335)
- `convertAndPlayFromPath(file, cacheKey)` (419-518)
- `selectFile(index)` (1155-1205)
- `deleteFile()` (1206-1229)
- `triggerFileInput()` (1231-1398)
- `onFileSelected(event)` (1399-1512)
- `formatFileSize(bytes)` (1516-1521)
- `updateFileInfoDisplay(fileInfo)` (1522-1529)
- `resetVideoInfo()` (1530-1541)
- `updateVideoInfoFromElectron(file)` (1543-1568)
- `convertAndPlay(file, cacheKey)` (1570-1618)
- `analyzeVideoInfo(fileIndex, filePath)` (1731-1773)

**App.vue -550줄**

#### 5B: `composables/detectionManager.js` (~200줄)
App.vue에서 추출:
- `validateCSVForExport()` (736-756)
- `loadDetectionData()` (758-823)
- `parseCSVLegacy(csvText)` (824-844)
- `exportDetectionData()` (846-876)
- `autoObjectDetection()` (990-1058)
- `executeMultiAutoDetection()` (1059-1099)
- `performAutoDetectionForFile(file, isMulti)` (1101-1137)
- `handleObjectDetect(payload)` (565-612)
- `resetSelectionDetection()` (1144-1147)
- `toggleAllAutoDetectionSelection()` (1138-1141)

**App.vue -350줄**

#### 5C: `composables/exportManager.js` (~200줄)
App.vue에서 추출:
- `sendExportRequest()` (2238-2357)
- `_startExportPolling(jobId, extraOnComplete)` (2405-2438)
- `validatePasswordCharacters(password)` (2361-2364)
- `batchProcessing()` (2536-2561)
- `startBatchPolling()` (2563-2585)
- `stopBatchPolling()` (2587-2592)
- `cancelBatchProcessing()` (2594-2596)
- `resetBatchState()` (2598-2607)

**App.vue -200줄**

#### 5D: `composables/settingsManager.js` (~250줄)
App.vue에서 추출:
- `settingNoti()` (337-339)
- `saveSettings(val)` (342-392)
- `onClickFindDir()` (395-416)
- `getExportConfig()` (1913-2012)
- `formatDateToYMD(date)` (2016-2023)
- `getDetectObjValue()` (2026-2044)
- `getMaskingRangeValue()` (2045-2053)
- `closeSettingModal()` (2056-2060)
- `onWatermarkImageUpload(e)` (1820-1866)
- `onWatermarkImageDelete()` (1869-1891)
- `applyWatermark()` (1893-1896)
- `preloadWatermarkImage()` (1897-1905)
- `closeWatermarkModal()` (1906-1908)

**App.vue -300줄**

---

## App.vue에 남는 코드 (~1,050줄)

- **Template** (81줄): 변경 없음
- **Imports + components** (~70줄): 컴포저블 import 추가
- **data + computed** (~74줄): Pinia 매핑 유지
- **Lifecycle hooks** (~50줄): 컴포저블 초기화 + 이벤트 리스너
- **위임 메서드** (~200줄): 컴포저블 호출하는 thin wrapper
- **남은 로직** (~460줄):
  - `handleMenuItemClick` (디스패처, ~80줄)
  - `handleContextMenuAction` + 객체 관리 (~150줄)
  - `handleKeyDown` + 비디오 컨트롤 위임 (~100줄)
  - 트림/머지 모달 (~90줄)
  - 모달 토글/닫기 (~40줄)
- **Style** (116줄)

---

## 최종 예상 결과

| 파일 | Before | After | 감소율 |
|------|--------|-------|--------|
| **App.vue** | 2,742 | ~1,050 | **-62%** |
| **VideoCanvas.vue** | 2,110 | ~990 | **-53%** |

### 새로 생성되는 파일 (9개)

| 파일 | 줄 수 | 출처 |
|------|--------|------|
| `composables/maskingData.js` | ~120 | 양쪽 (중복 제거) |
| `composables/canvasDrawing.js` | ~450 | VideoCanvas |
| `composables/canvasInteraction.js` | ~300 | VideoCanvas |
| `composables/maskPreview.js` | ~180 | VideoCanvas |
| `composables/fileManager.js` | ~350 | App.vue |
| `composables/detectionManager.js` | ~200 | App.vue |
| `composables/exportManager.js` | ~200 | App.vue |
| `composables/settingsManager.js` | ~250 | App.vue |
| `utils/geometry.js` | ~20 | VideoCanvas |

---

## 검증 방법

각 페이즈 완료 후:
1. `npm run dev`로 Electron 앱 실행
2. 비디오 파일 로드 → 재생/정지/프레임 이동 확인
3. 자동/선택/수동 객체 탐지 실행 확인
4. 영역 마스킹 (폴리곤/사각형) 그리기 확인
5. 내보내기 (일반/암호화) 실행 확인
6. 설정 저장/로드 확인
7. 워터마크 업로드/미리보기 확인
8. 일괄처리 실행 확인

## 실행 순서 의존성

```
Phase 1 (maskingData) ← 의존 없음
    ↓
Phase 2 (canvasDrawing) ← Pinia stores만
    ↓
Phase 3 (canvasInteraction) ← Phase 1, 2
    ↓
Phase 4 (maskPreview) ← Phase 2
    ↓
Phase 5A (fileManager) ← Phase 1
    ↓
Phase 5B (detectionManager) ← Phase 1
    ↓
Phase 5C (exportManager) ← Phase 5B
    ↓
Phase 5D (settingsManager) ← 의존 없음
```
