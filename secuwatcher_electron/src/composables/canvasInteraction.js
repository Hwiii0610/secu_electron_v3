/**
 * 캔버스 인터랙션 컴포저블
 *
 * VideoCanvas.vue의 마우스 이벤트 핸들러와 충돌 감지 로직을 통합합니다.
 *
 * @param {Object} deps
 * @param {Function} deps.getVideo - () => HTMLVideoElement
 * @param {Function} deps.getCanvas - () => HTMLCanvasElement
 * @param {Object} deps.drawing - canvasDrawing 컴포저블 인스턴스
 * @param {Object} deps.masking - maskingData 컴포저블 인스턴스
 * @param {Function} deps.emit - (event, ...args) => void
 * @param {Function} deps.getStores - () => { detection, mode, file, video }
 * @param {Function} deps.getLastHoveredBoxId - () => string|null
 * @param {Function} deps.setLastHoveredBoxId - (id) => void
 */

import { isPointInPolygon, getBBoxString } from '../utils/geometry';

export function createCanvasInteraction(deps) {
  const {
    getVideo, getCanvas, drawing, masking, emit,
    getStores, getLastHoveredBoxId, setLastHoveredBoxId
  } = deps;

  // ─── 충돌 감지 ──────────────────────────────────

  function checkHoveredBox(event) {
    const video = getVideo();
    const canvas = getCanvas();
    if (!video || !canvas) return;

    const { detection } = getStores();

    const clickPoint = drawing.convertToOriginalCoordinates(event);
    const currentFrame = drawing.getCurrentFrameNormalized();

    let overlappingBoxes = [];

    // maskingLogsMap 기반으로만 객체 검색 (detectionResults 제거)
    if (detection.dataLoaded) {
      const logs = detection.maskingLogsMap[currentFrame] || [];
      for (const log of logs) {
        try {
          const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
          
          // 사각형 형식 [x0, y0, x1, y1]
          if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
            const [x0, y0, x1, y1] = bboxData;
            if (clickPoint.x >= x0 && clickPoint.x <= x1 &&
                clickPoint.y >= y0 && clickPoint.y <= y1) {
              overlappingBoxes.push({ track_id: log.track_id, area: (x1 - x0) * (y1 - y0) });
            }
          } 
          // 다각형 형식 [[x1,y1], [x2,y2], ...]
          else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
            const points = bboxData.map(point => ({ x: point[0], y: point[1] }));
            if (isPointInPolygon(clickPoint, points)) {
              const xs = points.map(p => p.x);
              const ys = points.map(p => p.y);
              const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
              overlappingBoxes.push({ track_id: log.track_id, area });
            }
          }
        } catch (error) {
          console.error('객체 검색 중 오류:', error);
        }
      }
    }

    if (overlappingBoxes.length > 0) {
      overlappingBoxes.sort((a, b) => a.area - b.area);
      detection.hoveredBoxId = overlappingBoxes[0].track_id;
    } else {
      detection.hoveredBoxId = null;
    }

    if (getLastHoveredBoxId() !== detection.hoveredBoxId) {
      setLastHoveredBoxId(detection.hoveredBoxId);
      emit('hover-change', detection.hoveredBoxId);
      drawing.drawBoundingBoxes();
    }
  }
  function findTrackIdAtPosition(clickPoint) {
    const video = getVideo();
    const { detection, video: videoStore } = getStores();
    if (!detection.maskingLogs || !detection.maskingLogs.length) return null;

    const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);
    const logsInCurrentFrame = detection.maskingLogsMap[currentFrame] || [];
    const candidates = [];

    for (const log of logsInCurrentFrame) {
      try {
        const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
        if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
          const [x0, y0, x1, y1] = bboxData;
          if (clickPoint.x >= x0 && clickPoint.x <= x1 &&
              clickPoint.y >= y0 && clickPoint.y <= y1) {
            candidates.push({ track_id: log.track_id, area: (x1 - x0) * (y1 - y0) });
          }
        } else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
          const points = bboxData.map(point => ({ x: point[0], y: point[1] }));
          if (isPointInPolygon(clickPoint, points)) {
            const xs = points.map(p => p.x);
            const ys = points.map(p => p.y);
            const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
            candidates.push({ track_id: log.track_id, area });
          }
        }
      } catch (error) {
        console.error('객체 검색 중 오류:', error);
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.area - b.area);
      return candidates[0].track_id;
    }
    return null;
  }

  // ─── 범위 선택 다이얼로그 → 프레임 채우기 ─────────

  async function _showRangeDialogAndSave() {
    const video = getVideo();
    const { detection, video: videoStore } = getStores();

    // 0=전체, 1=여기까지, 2=여기서부터, 3=여기만, 4=취소
    const choice = await window.electronAPI.maskRangeMessage('마스킹 적용 범위를 선택하세요.');
    if (choice === 4) return; // 취소 — 아무 저장 없음

    const currentFrame = Math.floor(video.currentTime * (videoStore.frameRate || 30));
    const totalFrames = Math.floor((videoStore.videoDuration || 0) * (videoStore.frameRate || 30));

    // 현재 프레임 저장 (모든 선택지 공통)
    masking.logMasking();

    if (choice !== 3) {
      // 여기만(3)이 아닌 경우 범위 채우기
      const trackId = detection.maskBiggestTrackId;
      let startFrame, endFrame;

      if (choice === 0) {        // 전체
        startFrame = 0;
        endFrame = totalFrames;
      } else if (choice === 1) { // 여기까지
        startFrame = 0;
        endFrame = currentFrame;
      } else if (choice === 2) { // 여기서부터
        startFrame = currentFrame;
        endFrame = totalFrames;
      }

      masking.fillMaskingFrames(trackId, startFrame, endFrame);
    }

    detection.dataLoaded = true;
    await masking.sendBatchMaskingsToBackend();
    masking.checkBiggestTrackId();
    drawing.drawBoundingBoxes();
  }

  // ─── 마우스 이벤트 핸들러 ──────────────────────

  async function onCanvasClick(event) {
    const canvas = getCanvas();
    const video = getVideo();
    const { mode, detection } = getStores();

    if (!mode.selectMode) {
      emit('canvas-click', event);
      return;
    }

    if (!canvas || !video) return;

    // 마스킹 모드 - 다각형
    if (mode.currentMode === 'mask' && mode.maskMode === 'polygon') {
      const point = drawing.convertToOriginalCoordinates(event);

      if (mode.isPolygonClosed) return;

      if (mode.maskingPoints.length >= 3) {
        const first = mode.maskingPoints[0];
        const dx = first.x - point.x;
        const dy = first.y - point.y;
        if (Math.hypot(dx, dy) < mode.maskCompleteThreshold) {
          mode.isPolygonClosed = true;
          mode.maskingPoints.push({ ...first });
          drawing.drawPolygon();

          // 범위 선택 다이얼로그 후 저장
          await _showRangeDialogAndSave();
          mode.maskingPoints = [];
          mode.isPolygonClosed = false;
          return;
        }
      }

      mode.maskingPoints.push(point);
      drawing.drawPolygon();
      return;
    }

    // 선택 객체 탐지 모드
    if (mode.currentMode === 'select') {
      const { file } = getStores();
      const point = drawing.convertToOriginalCoordinates(event);
      const currentFrame = drawing.getCurrentFrameNormalized();
      emit('object-detect', {
        x: point.x,
        y: point.y,
        frame: currentFrame,
        videoName: file.files[file.selectedFileIndex]?.name || ''
      });
      return;
    }

    emit('canvas-click', event, drawing.convertToOriginalCoordinates(event), drawing.getCurrentFrameNormalized());
  }

  function onCanvasMouseDown(event) {
    if (event.button !== 0) return;
    const { mode } = getStores();

    // 사각형 마스킹 모드
    if (mode.currentMode === 'mask' && mode.maskMode === 'rectangle') {
      const point = drawing.convertToOriginalCoordinates(event);
      mode.maskingPoints = [point];
      mode.isDrawingMask = true;
      return;
    }

  }

  function onCanvasMouseMove(event) {
    if (event.button !== 0) return;
    const video = getVideo();
    const { mode, video: videoStore } = getStores();

    checkHoveredBox(event);

    // 사각형 마스킹
    if (mode.currentMode === 'mask' && mode.maskMode === 'rectangle' && mode.isDrawingMask) {
      const point = drawing.convertToOriginalCoordinates(event);
      if (mode.maskingPoints.length === 1) {
        mode.maskingPoints.push(point);
      } else {
        mode.maskingPoints[1] = point;
      }
      drawing.drawRectangle();
    }
  }

  async function onCanvasMouseUp(event) {
    if (event.button !== 0) return;
    const video = getVideo();
    const { mode, video: videoStore } = getStores();

    // 사각형 마스킹
    if (mode.currentMode === 'mask' && mode.maskMode === 'rectangle' && mode.isDrawingMask) {
      const endPoint = drawing.convertToOriginalCoordinates(event);
      if (mode.maskingPoints.length === 1) {
        mode.maskingPoints.push(endPoint);
      } else {
        mode.maskingPoints[1] = endPoint;
      }
      mode.isDrawingMask = false;

      const start = mode.maskingPoints[0];
      const dx = Math.abs(start.x - endPoint.x);
      const dy = Math.abs(start.y - endPoint.y);
      if (dx < 5 && dy < 5) {
        mode.maskingPoints = [];
        return;
      }

      drawing.drawRectangle();

      // 범위 선택 다이얼로그 후 저장
      await _showRangeDialogAndSave();
      mode.maskingPoints = [];
    }
  }

  function onCanvasContextMenu(event) {
    event.stopPropagation();
    event.preventDefault();

    const { mode, file, detection } = getStores();

    if (file.selectedFileIndex < 0) {
      console.log('선택된 파일이 없습니다');
      return;
    }

    if (mode.currentMode !== 'mask' && mode.currentMode !== '') return;

    const clickPoint = drawing.convertToOriginalCoordinates(event);
    const trackId = detection.hoveredBoxId || findTrackIdAtPosition(clickPoint);

    let shapeClicked = false;
    if (mode.maskMode === 'rectangle' && mode.maskingPoints.length === 2) {
      const [p0, p1] = mode.maskingPoints;
      const minX = Math.min(p0.x, p1.x);
      const maxX = Math.max(p0.x, p1.x);
      const minY = Math.min(p0.y, p1.y);
      const maxY = Math.max(p0.y, p1.y);
      if (clickPoint.x >= minX && clickPoint.x <= maxX && clickPoint.y >= minY && clickPoint.y <= maxY) {
        shapeClicked = true;
      }
    } else if (mode.maskMode === 'polygon' && mode.maskingPoints.length >= 3 && mode.isPolygonClosed) {
      if (isPointInPolygon(clickPoint, mode.maskingPoints)) {
        shapeClicked = true;
      }
    }

    if (file.selectedFileIndex >= 0) {
      shapeClicked = true;
    }

    emit('context-menu', {
      x: clickPoint.x,
      y: clickPoint.y,
      trackId: trackId,
      clientX: event.clientX,
      clientY: event.clientY,
      shapeClicked
    });
  }

  return {
    checkHoveredBox,
    findTrackIdAtPosition,
    onCanvasClick,
    onCanvasMouseDown,
    onCanvasMouseMove,
    onCanvasMouseUp,
    onCanvasContextMenu,
  };
}
