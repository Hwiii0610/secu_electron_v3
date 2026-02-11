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

    const { detection, video: videoStore } = getStores();

    const clickPoint = drawing.convertToOriginalCoordinates(event);
    const currentFrame = drawing.getCurrentFrameNormalized() + 1;

    let overlappingBoxes = [];

    // 1) detectionResults
    const currentFrameBoxes = detection.detectionResults.filter(
      item => item.frame === Math.floor(video.currentTime * videoStore.frameRate)
    );
    for (const result of currentFrameBoxes) {
      if (result.bbox) {
        const coords = result.bbox.split(',').map(Number);
        if (coords.length === 4 && coords.every(num => !isNaN(num))) {
          const [x, y, w, h] = coords;
          if (clickPoint.x >= x && clickPoint.x <= x + w &&
              clickPoint.y >= y && clickPoint.y <= y + h) {
            overlappingBoxes.push({ track_id: result.track_id, area: w * h });
          }
        }
      }
    }

    // 2) maskingLogs
    if (detection.dataLoaded) {
      const logs = detection.maskingLogsMap[currentFrame] || [];
      for (const log of logs) {
        try {
          const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
          if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
            const [x0, y0, x1, y1] = bboxData;
            if (clickPoint.x >= x0 && clickPoint.x <= x1 &&
                clickPoint.y >= y0 && clickPoint.y <= y1) {
              overlappingBoxes.push({ track_id: log.track_id, area: (x1 - x0) * (y1 - y0) });
            }
          } else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
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

  // ─── 마우스 이벤트 핸들러 ──────────────────────

  async function onCanvasClick(event) {
    const canvas = getCanvas();
    const video = getVideo();
    const { mode } = getStores();

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
          if (mode.maskFrameStart == null || mode.maskFrameEnd == null) {
            masking.logMasking();
          }
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

    // manual 모드
    if (mode.currentMode === 'manual') {
      const click = drawing.convertToOriginalCoordinates(event);

      if (!mode.manualBox) {
        mode.manualBox = { x: click.x, y: click.y, w: 0, h: 0 };
        mode.isDrawingManualBox = true;
        return;
      }

      const { x, y, w, h } = mode.manualBox;
      const withinBox = (
        click.x >= x && click.x <= x + w &&
        click.y >= y && click.y <= y + h
      );

      if (withinBox) {
        mode.isDraggingManualBox = true;
        mode.dragOffset = { x: click.x - x, y: click.y - y };
      } else {
        mode.manualBox = { x: click.x, y: click.y, w: 0, h: 0 };
        mode.isDrawingManualBox = true;
      }
    }
  }

  function onCanvasMouseMove(event) {
    if (event.button !== 0) return;
    const video = getVideo();
    const { mode, video: videoStore } = getStores();

    checkHoveredBox(event);

    // manual 모드
    if (mode.currentMode === 'manual') {
      const current = drawing.convertToOriginalCoordinates(event);

      if (mode.isDrawingManualBox && mode.manualBox) {
        mode.manualBox.w = current.x - mode.manualBox.x;
        mode.manualBox.h = current.y - mode.manualBox.y;
        drawing.drawBoundingBoxes();
        return;
      }

      if (mode.isDraggingManualBox && mode.manualBox) {
        mode.manualBox.x = current.x - mode.dragOffset.x;
        mode.manualBox.y = current.y - mode.dragOffset.y;
        const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);
        const bbox = getBBoxString(mode.manualBox);
        masking.saveManualMaskingEntry(currentFrame, bbox);
        drawing.drawBoundingBoxes();
        return;
      }
    }

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

  function onCanvasMouseUp(event) {
    if (event.button !== 0) return;
    const video = getVideo();
    const { mode, video: videoStore } = getStores();

    // manual 모드
    if (mode.currentMode === 'manual') {
      if (mode.isDrawingManualBox) {
        mode.isDrawingManualBox = false;
        const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);
        const bbox = getBBoxString(mode.manualBox);
        masking.saveManualMaskingEntry(currentFrame, bbox);
        masking.sendBatchMaskingsToBackend();
        return;
      }

      if (mode.isDraggingManualBox) {
        mode.isDraggingManualBox = false;
        const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);
        const bbox = getBBoxString(mode.manualBox);
        masking.saveManualMaskingEntry(currentFrame, bbox);
        masking.sendBatchMaskingsToBackend();
      }
    }

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
