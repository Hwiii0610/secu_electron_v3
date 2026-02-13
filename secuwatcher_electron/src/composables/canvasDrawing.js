/**
 * 캔버스 드로잉 컴포저블
 *
 * VideoCanvas.vue의 모든 캔버스 그리기 로직을 통합합니다.
 * 좌표 변환, 바운딩 박스, 마스킹 효과, 워터마크 등을 담당합니다.
 *
 * @param {Object} deps - 의존성
 * @param {Function} deps.getVideo - () => HTMLVideoElement
 * @param {Function} deps.getCanvas - () => HTMLCanvasElement (maskingCanvas)
 * @param {Function} deps.getTmpCanvas - () => HTMLCanvasElement
 * @param {Function} deps.getTmpCtx - () => CanvasRenderingContext2D
 * @param {Function} deps.getStores - () => { detection, mode, config, video, file }
 * @param {Function} deps.getProps - () => { watermarkImage, cachedWatermarkImage, watermarkImageLoaded }
 */
export function createCanvasDrawing(deps) {
  const { getVideo, getCanvas, getTmpCanvas, getTmpCtx, getStores, getProps } = deps;

  // ─── 좌표 변환 ──────────────────────────────────

  function convertToCanvasCoordinates(point) {
    const video = getVideo();
    const canvas = getCanvas();
    if (!video || !canvas) return { x: 0, y: 0 };

    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
    const containerWidth = video.clientWidth;
    const containerHeight = video.clientHeight;

    const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);
    const offsetX = (containerWidth - originalWidth * scale) / 2;
    const offsetY = (containerHeight - originalHeight * scale) / 2;

    return {
      x: point.x * scale + offsetX,
      y: point.y * scale + offsetY
    };
  }

  function convertToOriginalCoordinates(event) {
    const canvas = getCanvas();
    const video = getVideo();
    if (!canvas || !video) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
    const containerWidth = video.clientWidth;
    const containerHeight = video.clientHeight;

    const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);
    const offsetX = (containerWidth - originalWidth * scale) / 2;
    const offsetY = (containerHeight - originalHeight * scale) / 2;

    return {
      x: Math.floor((clickX - offsetX) / scale),
      y: Math.floor((clickY - offsetY) / scale)
    };
  }

  function getScale() {
    const video = getVideo();
    if (!video) return 1;
    const originalW = video.videoWidth;
    const originalH = video.videoHeight;
    const containerW = video.clientWidth;
    const containerH = video.clientHeight;
    if (!originalW || !originalH) return 1;
    return Math.min(containerW / originalW, containerH / originalH);
  }

  function getCurrentFrameNormalized() {
    const video = getVideo();
    if (!video || !video.duration) return 0;

    const { file, video: videoStore } = getStores();
    const currentFile = file.files[file.selectedFileIndex];
    const totalFrames = currentFile?.totalFrames;

    if (totalFrames && typeof totalFrames === 'number') {
      const timeRatio = video.currentTime / video.duration;
      const frame = Math.floor(timeRatio * totalFrames);
      return Math.max(0, Math.min(frame, totalFrames - 1));
    } else {
      return videoStore.frameRate ? Math.floor(video.currentTime * videoStore.frameRate) : 0;
    }
  }

  // ─── 개별 드로잉 ────────────────────────────────

  function drawDetectionBoxes(ctx, video) {
    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
    if (!originalWidth || !originalHeight) return;

    const { detection, video: videoStore } = getStores();

    const containerWidth = video.clientWidth;
    const containerHeight = video.clientHeight;
    const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);
    const offsetX = (containerWidth - originalWidth * scale) / 2;
    const offsetY = (containerHeight - originalHeight * scale) / 2;

    ctx.font = '14px Arial';
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;

    const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);
    const currentFrameBoxes = detection.detectionResults.filter(item => item.frame === currentFrame);

    currentFrameBoxes.forEach(result => {
      if (result.bbox) {
        const coords = result.bbox.split(',').map(Number);
        if (coords.length === 4 && coords.every(num => !isNaN(num))) {
          let [x, y, w, h] = coords;
          x = x * scale + offsetX;
          y = y * scale + offsetY;
          w = w * scale;
          h = h * scale;

          const isHovered = detection.hoveredBoxId === result.track_id;
          ctx.strokeStyle = isHovered ? 'orange' : 'red';
          ctx.fillStyle = isHovered ? 'orange' : 'red';

          if (isHovered) {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
            ctx.fillRect(x, y, w, h);
            ctx.restore();
          }

          ctx.strokeRect(x, y, w, h);
          ctx.fillText(`ID: ${result.track_id}`, x, y - 5);
        }
      }
    });
  }

  function drawCSVBoundingBoxOutlines(ctx, currentFrame) {
    const video = getVideo();
    if (!video) return;

    const { detection, mode } = getStores();

    const origW = video.videoWidth;
    const origH = video.videoHeight;
    if (!origW || !origH) return;

    const rect = video.getBoundingClientRect();
    const dispW = rect.width;
    const dispH = rect.height;
    const scale = Math.min(dispW / origW, dispH / origH);
    const offsetX = (dispW - origW * scale) / 2;
    const offsetY = (dispH - origH * scale) / 2;

    // 미리보기: 지정객체(object===1)는 블러만 표시하고 바운딩박스 숨김 (호버 시 표시)
    // 비미리보기: 모든 객체 바운딩박스 표시
    const allLogs = detection.maskingLogsMap[currentFrame] || [];
    const logs = mode.isBoxPreviewing
      ? allLogs.filter(log => log.object !== 1 || detection.hoveredBoxId === log.track_id)
      : allLogs;

    const toCanvas = (x, y) => ({
      x: x * scale + offsetX,
      y: y * scale + offsetY
    });

    ctx.font = '14px Arial';
    ctx.lineWidth = 2;
    const RADIUS = 6;

    for (const log of logs) {
      try {
        const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;

        // 호버 상태 및 object 타입에 따른 색상 결정
        const isHovered = detection.hoveredBoxId === log.track_id;
        const baseColor = log.object === 1 ? 'red' : 'blue';
        ctx.strokeStyle = isHovered ? 'orange' : baseColor;
        ctx.fillStyle = isHovered ? 'orange' : baseColor;

        // 사각형 형식 [x0, y0, x1, y1]
        if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
          const [x0, y0, x1, y1] = bboxData;
          const p0 = toCanvas(x0, y0);
          const p1 = toCanvas(x1, y1);
          const w = p1.x - p0.x;
          const h = p1.y - p0.y;

          // 호버 시 반투명 채우기 (라운딩)
          if (isHovered) {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
            ctx.beginPath();
            ctx.roundRect(p0.x, p0.y, w, h, RADIUS);
            ctx.fill();
            ctx.restore();
          }

          ctx.beginPath();
          ctx.roundRect(p0.x, p0.y, w, h, RADIUS);
          ctx.stroke();
          if (log.track_id !== undefined) {
            ctx.fillText(`ID: ${log.track_id}`, p0.x, p0.y - 5);
          }

        // 다각형 형식 [[x1,y1], [x2,y2], ...]
        } else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
          const points = bboxData.map(p => toCanvas(p[0], p[1]));
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.closePath();

          // 호버 시 반투명 채우기
          if (isHovered) {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
            ctx.fill();
            ctx.restore();
          }

          ctx.stroke();
          if (log.track_id !== undefined) {
            ctx.fillText(`ID: ${log.track_id}`, points[0].x, points[0].y - 5);
          }
        }
      } catch (error) {
        console.error('바운딩박스 아웃라인 그리기 중 오류:', error);
      }
    }
  }

  function drawCSVMasks(ctx, currentFrame) {
    const video = getVideo();
    if (!video) return;

    const { detection, mode, config } = getStores();
    const origW = video.videoWidth;
    const origH = video.videoHeight;
    if (!origW || !origH) return;

    const rect = video.getBoundingClientRect();
    const dispW = rect.width;
    const dispH = rect.height;
    const scale = Math.min(dispW / origW, dispH / origH);
    const offsetX = (dispW - origW * scale) / 2;
    const offsetY = (dispH - origH * scale) / 2;

    const logs = detection.maskingLogsMap[currentFrame] || [];
    const MASK_COLOR = 'rgba(128, 128, 128, 0.7)';

    const toCanvas = (x, y) => ({
      x: x * scale + offsetX,
      y: y * scale + offsetY
    });

    // 전체 마스킹 프리뷰
    if (mode.exportAllMasking === 'Yes') {
      ctx.fillStyle = MASK_COLOR;
      ctx.fillRect(offsetX, offsetY, origW * scale, origH * scale);
      return;
    }

    const range = config.settingExportMaskRange;
    const RADIUS = 6;

    const STROKE_COLOR = 'rgba(80, 80, 80, 0.9)';
    const STROKE_WIDTH = 3;

    // 사각형 채우기 (라운딩 + 외곽선)
    const fillBBox = (x0, y0, x1, y1) => {
      const p = toCanvas(x0, y0);
      const w = (x1 - x0) * scale, h = (y1 - y0) * scale;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, w, h, RADIUS);
      ctx.fill();
      ctx.lineWidth = STROKE_WIDTH;
      ctx.strokeStyle = STROKE_COLOR;
      ctx.stroke();
    };

    // 다각형 채우기 (외곽선 포함)
    const fillPoly = (points) => {
      ctx.beginPath();
      const first = toCanvas(points[0][0], points[0][1]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i++) {
        const p = toCanvas(points[i][0], points[i][1]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = STROKE_WIDTH;
      ctx.strokeStyle = STROKE_COLOR;
      ctx.stroke();
    };

    // 로그 항목 채우기 (호버된 객체는 제외 → 호버 효과가 가려지지 않도록)
    const fillLog = (log) => {
      if (detection.hoveredBoxId === log.track_id) return;
      try {
        const bbox = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
        if (Array.isArray(bbox) && bbox.length === 4 && !Array.isArray(bbox[0])) {
          fillBBox(bbox[0], bbox[1], bbox[2], bbox[3]);
        } else if (Array.isArray(bbox) && bbox.length >= 3 && Array.isArray(bbox[0])) {
          fillPoly(bbox);
        }
      } catch (e) {
        console.error('마스킹 처리 중 오류:', e, log.bbox);
      }
    };

    ctx.fillStyle = MASK_COLOR;

    switch (range) {
      case 'none':
        break;

      case 'selected':
        logs.filter(l => String(l.object) === '1').forEach(fillLog);
        break;

      case 'bg':
        // 전체 채우기 → 지정객체 영역은 원본이 보이도록 clearRect
        ctx.fillRect(offsetX, offsetY, origW * scale, origH * scale);
        logs.filter(l => String(l.object) === '1').forEach(log => {
          try {
            const bbox = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
            if (Array.isArray(bbox) && bbox.length === 4 && !Array.isArray(bbox[0])) {
              const p = toCanvas(bbox[0], bbox[1]);
              const w = (bbox[2] - bbox[0]) * scale, h = (bbox[3] - bbox[1]) * scale;
              ctx.save();
              ctx.beginPath();
              ctx.roundRect(p.x, p.y, w, h, RADIUS);
              ctx.clip();
              ctx.clearRect(p.x, p.y, w, h);
              ctx.restore();
            } else if (Array.isArray(bbox) && bbox.length >= 3 && Array.isArray(bbox[0])) {
              ctx.save();
              ctx.beginPath();
              const first = toCanvas(bbox[0][0], bbox[0][1]);
              ctx.moveTo(first.x, first.y);
              for (let i = 1; i < bbox.length; i++) {
                const p = toCanvas(bbox[i][0], bbox[i][1]);
                ctx.lineTo(p.x, p.y);
              }
              ctx.closePath();
              ctx.clip();
              ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
              ctx.restore();
            }
          } catch (e) {
            console.error('bg 케이스 bbox 파싱 에러:', e, log.bbox);
          }
        });
        break;

      case 'unselected':
        logs.filter(l => String(l.object) === '2').forEach(fillLog);
        break;

      default:
        logs.forEach(fillLog);
        break;
    }
  }

  function drawPolygon() {
    const canvas = getCanvas();
    const video = getVideo();
    if (!canvas || !video) return;

    const { mode, detection, video: videoStore } = getStores();

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);
    if (detection.maskFrameStart !== null && detection.maskFrameEnd !== null &&
        (currentFrame < detection.maskFrameStart || currentFrame > detection.maskFrameEnd)) {
      return;
    }

    if (mode.maskingPoints.length === 0) return;
    const complete = mode.isPolygonClosed;

    ctx.beginPath();
    const first = convertToCanvasCoordinates(mode.maskingPoints[0]);
    ctx.moveTo(first.x, first.y);

    for (let i = 1; i < mode.maskingPoints.length; i++) {
      const pt = convertToCanvasCoordinates(mode.maskingPoints[i]);
      ctx.lineTo(pt.x, pt.y);
    }

    if (complete) {
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
      ctx.fill();
    }

    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();

    mode.maskingPoints.forEach((point) => {
      const cp = convertToCanvasCoordinates(point);
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = 'red';
      ctx.fill();
    });
  }

  function drawRectangle() {
    const canvas = getCanvas();
    const video = getVideo();
    if (!canvas || !video) return;

    const { mode, detection, video: videoStore } = getStores();

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);
    if (detection.maskFrameStart !== null && detection.maskFrameEnd !== null &&
        (currentFrame < detection.maskFrameStart || currentFrame > detection.maskFrameEnd)) {
      return;
    }

    if (mode.maskingPoints.length === 2) {
      const p0 = convertToCanvasCoordinates(mode.maskingPoints[0]);
      const p1 = convertToCanvasCoordinates(mode.maskingPoints[1]);
      const rectX = Math.min(p0.x, p1.x);
      const rectY = Math.min(p0.y, p1.y);
      const rectW = Math.abs(p1.x - p0.x);
      const rectH = Math.abs(p1.y - p0.y);

      ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
      ctx.fillRect(rectX, rectY, rectW, rectH);

      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(rectX, rectY, rectW, rectH);
    }
  }

  function resizeCanvas() {
    const canvas = getCanvas();
    const video = getVideo();
    if (canvas && video) {
      const rect = video.getBoundingClientRect();
      const displayedWidth = rect.width;
      const displayedHeight = rect.height;
      canvas.width = displayedWidth;
      canvas.height = displayedHeight;
      canvas.style.width = displayedWidth + 'px';
      canvas.style.height = displayedHeight + 'px';
      drawBoundingBoxes();
    }
  }

  function resizeMaskCanvas(maskCanvas) {
    const video = getVideo();
    const tmpCanvas = getTmpCanvas();
    if (!video || !maskCanvas) return;

    const origW = video.videoWidth;
    const origH = video.videoHeight;
    maskCanvas.width = origW;
    maskCanvas.height = origH;
    if (tmpCanvas) {
      tmpCanvas.width = origW;
      tmpCanvas.height = origH;
    }

    const rect = video.getBoundingClientRect();
    Object.assign(maskCanvas.style, {
      position: 'absolute',
      top: `${rect.top + window.scrollY}px`,
      left: `${rect.left + window.scrollX}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      pointerEvents: 'none',
      zIndex: 5
    });
  }

  function drawWatermarkPreview(ctx, canvas) {
    const video = getVideo();
    const { config } = getStores();
    const props = getProps();

    if (!config.allConfig || !video) return;

    const isWaterMarking = config.isWaterMarking;
    const text = (config.allConfig?.export?.watertext || '').trim();
    const hasText = isWaterMarking && text.length > 0;
    const hasImage =
      isWaterMarking &&
      props.watermarkImage &&
      props.watermarkImageLoaded &&
      props.cachedWatermarkImage;

    if (!hasText && !hasImage) return;

    const originalW = video.videoWidth;
    const originalH = video.videoHeight;
    if (!originalW || !originalH) return;

    const displayScale = getScale();
    const naturalLogoW = hasImage ? props.cachedWatermarkImage.naturalWidth || 0 : 0;
    const naturalLogoH = hasImage ? props.cachedWatermarkImage.naturalHeight || 0 : 0;

    let logoWidth = 0;
    let logoHeight = 0;
    if (hasImage && naturalLogoW > 0 && naturalLogoH > 0) {
      logoWidth = Math.max(1, Math.round(originalW / 10));
      const resizeFactor = logoWidth / naturalLogoW;
      logoHeight = Math.max(1, Math.round(naturalLogoH * resizeFactor));
    }

    let textWidth = 0;
    let textHeight = 0;
    if (hasText && !hasImage) {
      const fontSize = Math.max(12, Math.round(18 * displayScale));
      ctx.font = `${fontSize}px sans-serif`;
      const metrics = ctx.measureText(text);
      textWidth = metrics.width / displayScale;
      textHeight = fontSize / displayScale;
    }

    const margin = 50;
    const location = Number(config.allConfig?.export?.waterlocation) || 4;

    const itemWidth = hasImage ? logoWidth : textWidth;
    const itemHeight = hasImage ? logoHeight : textHeight;

    const positions = {
      1: { x: margin, y: margin },
      2: { x: originalW - itemWidth - margin, y: margin },
      3: {
        x: Math.floor((originalW - itemWidth) / 2),
        y: Math.floor((originalH - itemHeight) / 2)
      },
      4: { x: margin, y: originalH - itemHeight - margin },
      5: { x: originalW - itemWidth - margin, y: originalH - itemHeight - margin }
    };
    const pos = positions[location] || positions[4];
    const xOffset = pos.x;
    const yOffset = pos.y;

    if (hasImage && logoWidth > 0 && logoHeight > 0) {
      const opacity = Number(config.allConfig?.export?.watertransparency) || 100;
      const normalizedOpacity = Number.isFinite(opacity)
        ? Math.max(0, Math.min(1, opacity / 100))
        : 0;

      const imgCanvasPos = convertToCanvasCoordinates({ x: xOffset, y: yOffset });
      const drawW = logoWidth * displayScale;
      const drawH = logoHeight * displayScale;

      ctx.save();
      ctx.globalAlpha = normalizedOpacity;
      ctx.drawImage(props.cachedWatermarkImage, imgCanvasPos.x, imgCanvasPos.y, drawW, drawH);
      ctx.restore();
    }

    if (hasText) {
      const fontSize = Math.max(12, Math.round(18 * displayScale));
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = Math.max(1, Math.round(fontSize / 6));

      const metrics = ctx.measureText(text);
      const drawTextWidth = metrics.width;
      const drawTextHeight = fontSize;

      let textCanvasX, textCanvasY;

      if (hasImage) {
        const imgCanvasPos = convertToCanvasCoordinates({ x: xOffset, y: yOffset });
        const drawW = logoWidth * displayScale;
        const drawH = logoHeight * displayScale;
        const marginCanvas = Math.max(2, Math.round(5 * displayScale));

        textCanvasX = imgCanvasPos.x + (drawW - drawTextWidth) / 2;
        textCanvasY = imgCanvasPos.y + drawH + drawTextHeight + marginCanvas;
      } else {
        const baseCanvasPos = convertToCanvasCoordinates({ x: xOffset, y: yOffset });
        textCanvasX = baseCanvasPos.x;
        textCanvasY = baseCanvasPos.y + drawTextHeight;
      }

      ctx.strokeText(text, textCanvasX, textCanvasY);
      ctx.fillText(text, textCanvasX, textCanvasY);
    }
  }

  function getWatermarkCoords(position, canvasW, canvasH, itemW, itemH) {
    switch (position) {
      case 'top-left': return { x: 10, y: 10 };
      case 'top-right': return { x: canvasW - itemW - 10, y: 10 };
      case 'bottom-left': return { x: 10, y: canvasH - itemH - 10 };
      case 'bottom-right': return { x: canvasW - itemW - 20, y: canvasH - itemH - 20 };
      case 'center':
      default:
        return {
          x: (canvasW - itemW) / 2,
          y: (canvasH - itemH) / 2
        };
    }
  }

  // ─── 선택객체 탐지 클릭 포인터 ─────────────────────

  function drawSelectDetectionPointer(ctx, point) {
    const canvasPoint = convertToCanvasCoordinates(point);
    const RADIUS = 8;
    const CROSS = 12;

    // 붉은 원
    ctx.save();
    ctx.beginPath();
    ctx.arc(canvasPoint.x, canvasPoint.y, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
    ctx.fill();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 십자 표시
    ctx.beginPath();
    ctx.moveTo(canvasPoint.x - CROSS, canvasPoint.y);
    ctx.lineTo(canvasPoint.x + CROSS, canvasPoint.y);
    ctx.moveTo(canvasPoint.x, canvasPoint.y - CROSS);
    ctx.lineTo(canvasPoint.x, canvasPoint.y + CROSS);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // ─── 메인 드로잉 루프 ───────────────────────────

  function drawBoundingBoxes() {
    const video = getVideo();
    const canvas = getCanvas();
    if (!canvas || !video) return;

    const { mode, detection, config } = getStores();
    const props = getProps();

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 마스킹 데이터 그리기
    const currentFrame = getCurrentFrameNormalized();
    if (detection.dataLoaded) {
      if (mode.isBoxPreviewing) {
        // 미리보기: 블러/모자이크 적용 (object=1 대상)
        drawCSVMasks(ctx, currentFrame);
      }
      // 바운딩박스 표시 (미리보기: 파란색만, 비미리보기: 전체)
      drawCSVBoundingBoxOutlines(ctx, currentFrame);
    }

    // 3. 마스킹 모드 그리기
    if (mode.currentMode === 'mask') {
      if (detection.maskFrameStart !== null && detection.maskFrameEnd !== null &&
          (currentFrame < detection.maskFrameStart || currentFrame > detection.maskFrameEnd)) {
        return;
      }
      if (mode.maskMode === 'polygon' && mode.maskingPoints.length > 0) {
        drawPolygon();
      }
      if (mode.maskMode === 'rectangle' && mode.maskingPoints.length === 2) {
        drawRectangle();
      }
    }

    // 4. 선택객체 탐지 클릭 포인터
    if (detection.selectDetectionPoint) {
      drawSelectDetectionPointer(ctx, detection.selectDetectionPoint);
    }

    // 5. 워터마크 그리기
    if (config.isWaterMarking && mode.isBoxPreviewing) {
      drawWatermarkPreview(ctx, canvas);
    }
  }
  return {
    convertToCanvasCoordinates,
    convertToOriginalCoordinates,
    getScale,
    getCurrentFrameNormalized,
    drawBoundingBoxes,
    drawDetectionBoxes,
    drawCSVMasks,
    drawCSVBoundingBoxOutlines,
    drawPolygon,
    drawRectangle,
    resizeCanvas,
    resizeMaskCanvas,
    drawWatermarkPreview,
    getWatermarkCoords,
  };
}
