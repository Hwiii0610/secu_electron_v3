# Phase 1.1: 캔버스 관련 메서드 분류 및 준비 - 분석 결과

> **작업 단계**: 1.1 (분석 및 준비)
> **분석 대상**: App.vue 캔버스/마스킹 관련 코드
> **분석 일자**: 2026-02-10
> **버전**: 1.2 (누락 내용 추가 - data, lifecycle, 호출 관계)

---

## 📊 분석 개요

### 캔버스 관련 코드 라인
| 구간 | 라인 수 | 내용 |
|------|---------|------|
| 787-1742 | ~955 lines | 캔버스/마스킹 관련 메서드 그룹 |
| 3548-3707 | ~159 lines | 마스킹 프리뷰 관련 메서드 |
| **합계** | **~1,114 lines** | VideoCanvas 이전 대상 |

---

## 📦 App.vue data()의 캔버스 관련 상태 ⚠️ 누락 추가

### 로컬 상태 (data()에 정의)
```javascript
// lines 149-154
isMasking: false,              // 마스킹 프리뷰 실행 중 여부
maskCanvas: null,              // 프리뷰 캔버스 ref
maskCtx: null,                 // 프리뷰 캔버스 context
tmpCanvas: null,               // 임시 캔버스 (createElement)
tmpCtx: null,                  // 임시 캔버스 context
maskPreviewAnimationFrame: null // 애니메이션 프레임 ID
```

### Store에서 가져오는 상태
```javascript
// detectionStore (lines 178-185)
maskingLogs, maskingLogsMap, newMaskings, dataLoaded,
detectionResults, isDetecting, detectionIntervalId, hasSelectedDetection,
manualBiggestTrackId, maskBiggestTrackId, hoveredBoxId, ...

// modeStore (lines 186-191)
currentMode, selectMode, isBoxPreviewing, exportAllMasking, maskMode, ...

// configStore (lines 192-197)
allConfig, isWaterMarking, watermarkImage, waterMarkImageName,
cachedWatermarkImage, watermarkImageLoaded, ...
```

### 주요 참조
```javascript
// mounted()에서 설정 (line 225)
this.video = this.$refs.videoPlayer;  // 비디오 엘리먼트 참조

// refs
$refs.videoPlayer     // 비디오 엘리먼트
$refs.maskingCanvas   // 마스킹 캔버스
$refs.maskPreview     // 프리뷰 캔버스
```

---

## 🔄 Lifecycle Hooks 연결 분석 ⚠️ 누락 추가

### mounted() (lines 224-247)
```javascript
this.video = this.$refs.videoPlayer;              // 비디오 참조 설정
this.video.addEventListener('loadedmetadata', this.onVideoLoaded);
this.video.addEventListener('ended', this.onVideoEnded);
this.startAnimationLoop();                         // 애니메이션 루프 시작
window.addEventListener('resize', this.resizeCanvas);
```

### beforeUnmount() (lines 248-266)
```javascript
this.video.removeEventListener('loadedmetadata', this.onVideoLoaded);
this.video.removeEventListener('ended', this.onVideoEnded);
window.removeEventListener('resize', this.resizeCanvas);
this.stopMaskPreview();                            // 마스킹 프리뷰 정리
```

### VideoCanvas로 이동 시 처리 필요
- **mounted**: VideoCanvas 난부에서 video ref 설정 및 이벤트 등록
- **beforeUnmount**: VideoCanvas의 beforeUnmount에서 정리
- **resize**: VideoCanvas에서 window resize 이벤트 처리

---

## 📁 메서드 그룹 분류 (최종)

### Group A: 좌표 변환 메서드 (2개)
| 메서드명 | 위치 | 설명 | 복잡도 |
|----------|------|------|--------|
| `convertToCanvasCoordinates(point)` | 1709-1724 | 원본 좌표 → 캔버스 좌표 | 🟡 중간 |
| `convertToOriginalCoordinates(e)` | 1725-1741 | 캔버스 좌표 → 원본 좌표 | 🟡 중간 |

---

### Group B: 그리기 메서드 (7개)
| 메서드명 | 위치 | 설명 | 복잡도 | 호출자 |
|----------|------|------|--------|--------|
| `drawBoundingBoxes()` | 1148-1201 | 메인 그리기 메서드 | 🔴 높음 | onVideoLoaded, checkHoveredBox, resizeCanvas, onVideoEnded, startAnimationLoop, handleMenuItemClick, setSelectedObject, deleteObjectByTrackId, deleteObjectsByType |
| `drawCSVMasks(ctx, currentFrame)` | 1203-1589 | CSV 마스킹 그리기 | 🔴 매우 높음 | drawBoundingBoxes |
| `drawDetectionBoxes(ctx, video)` | 1590-1633 | 객체 탐지 박스 | 🟡 중간 | drawBoundingBoxes, drawPolygon, drawRectangle |
| `drawPolygon()` | 1634-1677 | 다각형 마스킹 | 🟢 낮음 | onCanvasClick, drawBoundingBoxes |
| `drawRectangle()` | 1678-1707 | 사각형 마스킹 | 🟢 낮음 | onCanvasMouseMove/Up, drawBoundingBoxes |
| `resizeCanvas()` | 789-802 | 캔버스 크기 조정 | 🟢 낮음 | mounted(resize 이벤트) |
| `resizeMaskCanvas()` | 803-825 | 마스크 캔버스 크기 | 🟡 중간 | onVideoLoaded, resize 이벤트 |

---

### Group C: 마스킹 프리뷰 메서드 (3개)
| 메서드명 | 위치 | 설명 | 복잡도 |
|----------|------|------|--------|
| `startMaskPreview()` | 3550-3645 | 전체 마스킹 프리뷰 시작 | 🔴 높음 |
| `stopMaskPreview()` | 3646-3681 | 마스킹 프리뷰 중지 | 🟡 중간 |
| `applyEffectFull(ctx, ow, oh)` | 3682-3706 | 전체 화면 효과 | 🟡 중간 |

---

### Group D: 마우스 이벤트 핸들러 (5개)
| 메서드명 | 위치 | 설명 | 복잡도 |
|----------|------|------|--------|
| `onCanvasClick(e)` | 828-959 | 캔버스 클릭 | 🔴 매우 높음 |
| `onCanvasMouseDown(e)` | 960-996 | 마우스 다운 | 🟡 중간 |
| `onCanvasMouseMove(e)` | 997-1035 | 마우스 이동 | 🟡 중간 |
| `onCanvasMouseUp(e)` | 1036-1106 | 마우스 업 | 🟡 중간 |
| `onCanvasContextMenu(e)` | 1107-1145 | 우클릭 메뉴 | 🟡 중간 |

---

### Group E: 마스킹 데이터 관리 (6개)
| 메서드명 | 위치 | 설명 | 복잡도 |
|----------|------|------|--------|
| `logMasking()` | 1891-1919 | 마스킹 로그 생성 | 🟡 중간 |
| `saveMaskingEntry(frame, bbox)` | 1920-1935 | 마스킹 엔트리 저장 | 🟢 낮음 |
| `saveManualMaskingEntry(frame, bbox)` | 1936-1968 | 수동 마스킹 저장 | 🟡 중간 |
| `sendBatchMaskingsToBackend()` | 1969-1992 | 서버 배치 전송 | 🟡 중간 |
| `rebuildMaskingLogsMap()` | 1994-2001 | maskingLogsMap 재구성 | 🟢 낮음 |
| `addToMaskingLogsMap(entry)` | 2002-2006 | maskingLogsMap 추가 | 🟢 낮음 |
| `checkBiggestTrackId(typeNum)` | 2205-2240 | 최대 track_id 계산 | 🟡 중간 |

---

### Group F: 유틸리티/헬퍼 (5개)
| 메서드명 | 위치 | 설명 | 복잡도 |
|----------|------|------|--------|
| `checkHoveredBox(e)` | 707-785 | 마우스 위치 박스 확인 | 🟡 중간 |
| `getCurrentFrameNormalized()` | 3939-3952 | 현재 프레임 계산 | 🟢 낮음 |
| `isPointInPolygon(point, polygonPoints)` | 3998-4008 | 다각형 내부 확인 | 🟢 낮음 |
| `getBBoxString(box)` | 4009-4015 | bbox 문자열 변환 | 🟢 낮음 |
| `findTrackIdAtPosition(clickPoint)` | 3385-3434 | 위치로 track_id 찾기 | 🟡 중간 |

---

### Group G: 애니메이션 루프 (1개)
| 메서드명 | 위치 | 설명 | 복잡도 |
|----------|------|------|--------|
| `startAnimationLoop()` | 4204-4236 | 프레임 애니메이션 루프 | 🔴 높음 |

**동작 내용**:
1. 현재 프레임 계산 → Store 업데이트
2. 프로그레스 바 업데이트
3. **프레임 변경 시 `drawBoundingBoxes()` 호출**
4. 수동 모드: 매 프레임 `saveManualMaskingEntry()` + 30프레임마다 `sendBatchMaskingsToBackend()`

---

### Group H: 외부 연결 메서드 (App.vue 유지)
| 메서드명 | 위치 | 설명 | VideoCanvas와 관계 |
|----------|------|------|---------------------|
| `handleContextMenuAction(action)` | 3332-3384 | 컨텍스트 메뉴 처리 | VideoCanvas `@context-menu` emit 처리 |
| `handleMenuItemClick(item)` | 4024-4092 | 상단 메뉴 처리 | `currentMode` 변경, 미리보기 시 `drawBoundingBoxes()` 호출 필요 |
| `onVideoLoaded()` | 602-622 | 비디오 로드 완료 | tmpCanvas 생성, maskCanvas 설정, `drawBoundingBoxes()` 호출 |
| `onVideoEnded()` | 623-634 | 비디오 종료 | `sendBatchMaskingsToBackend()`, `drawBoundingBoxes()` 호출 |

---

### Group I: 워터마크 관련 ⚠️ 누락 추가
| 메서드명 | 위치 | 설명 | 이동 여부 |
|----------|------|------|----------|
| `drawWatermarkPreview(ctx, canvas)` | 2952-3062 | 워터마크 그리기 | ⚠️ VideoCanvas 또는 Composable |
| `preloadWatermarkImage()` | 3164-3172 | 워터마크 이미지 프리로드 | ⚠️ VideoCanvas 또는 Composable |
| `getWatermarkCoords()` | 3063-3076 | 워터마크 좌표 계산 | ⚠️ VideoCanvas 또는 Composable |
| `getScale()` | 3077-3084 | 스케일 계산 | ✅ VideoCanvas |

**특이사항**: drawBoundingBoxes() 안에서 호출됨 (line 1199)

---

## 🔗 외부 호출 관계 분석 ⚠️ 누락 추가

### App.vue → drawBoundingBoxes() 호출 지점 (8곳)
| 위치 | 메서드 | 호출 상황 | VideoCanvas 처리 |
|------|--------|----------|------------------|
| 611 | onVideoLoaded | 비디오 로드 완료 | VideoCanvas 내부 처리 |
| 633 | onVideoEnded | 비디오 종료 | VideoCanvas 내부 처리 |
| 783 | checkHoveredBox | 호버 상태 변경 | VideoCanvas 내부 처리 |
| 800 | resizeCanvas | 창 크기 변경 | VideoCanvas 내부 처리 |
| 1023 | onCanvasMouseMove | 수동 박스 이동 중 | VideoCanvas 내부 처리 |
| 1076 | onCanvasMouseUp | 수동 박스 이동 완료 | VideoCanvas 내부 처리 |
| 4091 | handleMenuItemClick | 미리보기 모드 변경 | `@toggle-preview` emit 후 VideoCanvas 처리 |
| 4215 | startAnimationLoop | 프레임 변경 | VideoCanvas 내부 처리 |

**결론**: 대부분 VideoCanvas 내부에서 처리 가능하지만, `handleMenuItemClick`은 App.vue에 남아있어야 함

---

## 🔗 외부 연결 인터페이스

### App.vue → VideoCanvas (Props)
| 데이터 | Store | 설명 |
|--------|-------|------|
| videoSrc | fileStore | 비디오 소스 URL |
| detectionResults | detectionStore | 객체 탐지 결과 |
| maskingLogs | detectionStore | 마스킹 로그 배열 |
| maskingLogsMap | detectionStore | 프레임별 마스킹 Map |
| dataLoaded | detectionStore | 데이터 로드 여부 |
| currentMode | modeStore | 현재 모드 |
| selectMode | modeStore | 선택 모드 여부 |
| maskMode | modeStore | 마스킹 모드 |
| exportAllMasking | modeStore | 전체 마스킹 여부 |
| isBoxPreviewing | modeStore | 미리보기 여부 |
| settingExportMaskRange | configStore | 마스킹 범위 |
| allConfig | configStore | 전체 설정 |
| isWaterMarking | configStore | 워터마킹 여부 |
| watermarkImage | configStore | 워터마크 이미지 |
| cachedWatermarkImage | configStore | 캐시된 이미지 |
| watermarkImageLoaded | configStore | 이미지 로드 여부 |

### VideoCanvas → App.vue (Emits)
| 이벤트 | 파라미터 | 설명 | 호출 원인 |
|--------|----------|------|----------|
| `@canvas-click` | event | 캔버스 클릭 | 선택 탐지 트리거 |
| `@object-detected` | {x, y, frame} | 객체 탐지 좌표 | 선택 객체 탐지 API |
| `@masking-save` | entry | 마스킹 저장 | 마스킹 완료 |
| `@masking-batch` | entries | 배치 동기화 | 30프레임/mouseup |
| `@context-menu` | {x, y, trackId} | 우클릭 메뉴 | 컨텍스트 메뉴 표시 |
| `@video-loaded` | videoInfo | 비디오 로드 완료 | 캔버스 초기화 완료 |
| `@video-ended` | - | 비디오 종료 | 마지막 동기화 |

---

## ⚠️ 주요 위험 요소 (최종)

### 🔴 Critical
1. **drawBoundingBoxes 다중 호출**: 8개의 다른 메서드에서 호출, 호출 체인 명확히 정의 필요
2. **애니메이션 루프 분리**: startAnimationLoop가 비디오 상태 + 캔버스 + 데이터 저장을 모두 처리
3. **this.video 참조**: mounted()에서 설정되며, VideoCanvas에서도 동일한 ref 필요
4. **워터마크 통합**: drawBoundingBoxes 안에서 drawWatermarkPreview 호출

### 🟡 High
5. **Lifecycle 연결**: mounted/beforeUnmount의 이벤트 등록/제거를 VideoCanvas로 이전
6. **데이터 동기화**: maskingLogs, maskingLogsMap, newMaskings 3중 구조
7. **좌표 변환**: getBoundingClientRect() 기반의 복잡한 좌표 계산

### 🟢 Medium
8. **메뉴 연동**: handleMenuItemClick에서의 drawBoundingBoxes 호출
9. **비디오 종료 처리**: onVideoEnded에서의 마지막 배치 동기화

---

## 📝 분석 결론

### 메서드 총계
| 그룹 | 메서드 수 | 총 라인 수 | 이동 대상 |
|------|----------|-----------|----------|
| A: 좌표 변환 | 2 | ~50 | VideoCanvas |
| B: 그리기 | 7 | ~600 | VideoCanvas |
| C: 마스킹 프리뷰 | 3 | ~160 | VideoCanvas |
| D: 마우스 이벤트 | 5 | ~320 | VideoCanvas |
| E: 데이터 관리 | 6 | ~250 | VideoCanvas |
| F: 유틸리티 | 5 | ~150 | VideoCanvas |
| G: 애니메이션 | 1 | ~35 | VideoCanvas |
| **H: 외부 연결** | **4** | **~250** | **App.vue 유지** |
| **I: 워터마크** | **4** | **~150** | **VideoCanvas 또는 Composable** |
| **합계** | **37개** | **~1,965 lines** | **33개 VideoCanvas로** |

### 권장 이전 순서
```
1.2: Props/Emits 정의 
→ 1.3: Group A (좌표 변환) 
→ 1.4: Group F (유틸리티) 
→ 1.5: Group I (워터마크) - drawBoundingBoxes와 연결
→ 1.6: Group B (그리기) 
→ 1.7: Group C (마스킹 프리뷰)
→ 1.8: Group D (마우스 이벤트) 
→ 1.9: Group E (데이터 관리) 
→ 1.10: Group G (애니메이션 루프)
→ 1.11: Template 교체 + Lifecycle 연결
→ 1.12: 통합 테스트
```

### 특이사항
- **this.video 참조**: mounted()에서 설정되므로 VideoCanvas에서는 props로 전달하거나 provide/inject 사용 고려
- **drawBoundingBoxes 호출 체인**: VideoCanvas 내부에서 self-contained 되도록 설계
- **워터마크**: useWatermark composable로 분리 고려

---

**분석 완료. 단계 1.2 진행 준비 완료.**

### 변경 이력
| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 1.0 | 2026-02-10 | 초안 작성 |
| 1.1 | 2026-02-10 | Group F, G, H 추가 |
| 1.2 | 2026-02-10 | data(), lifecycle, 호출 관계, Group I 추가 |
