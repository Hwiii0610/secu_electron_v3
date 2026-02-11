/**
 * 마스크 프리뷰 + 애니메이션 루프 컴포저블
 *
 * 전체 마스킹 프리뷰(모자이크/블러)와 메인 애니메이션 루프를 관리합니다.
 *
 * @param {Object} deps
 * @param {Function} deps.getVideo - () => HTMLVideoElement
 * @param {Function} deps.getMaskCanvas - () => HTMLCanvasElement
 * @param {Function} deps.getMaskCtx - () => CanvasRenderingContext2D
 * @param {Function} deps.getTmpCanvas - () => HTMLCanvasElement
 * @param {Function} deps.getTmpCtx - () => CanvasRenderingContext2D
 * @param {Object} deps.drawing - canvasDrawing 컴포저블 인스턴스
 * @param {Object} deps.masking - maskingData 컴포저블 인스턴스
 * @param {Function} deps.getStores - () => { detection, mode, video, config }
 * @param {Function} deps.formatTime - (seconds) => string
 */

import { getBBoxString } from '../utils/geometry';

export function createMaskPreview(deps) {
  const {
    getVideo, getMaskCanvas, getMaskCtx, getTmpCanvas, getTmpCtx,
    drawing, masking, getStores, formatTime
  } = deps;

  // 내부 상태
  let isMasking = false;
  let maskPreviewAnimationFrame = null;
  let animationFrameId = null;

  // ─── 마스킹 프리뷰 ─────────────────────────────

  function startMaskPreview() {
    if (isMasking) return;

    const { detection, config } = getStores();
    if (!detection.dataLoaded) return;

    isMasking = true;

    const v = getVideo();
    const mc = getMaskCtx();
    const tc = getTmpCtx();
    if (!v || !mc || !tc) return;

    const maskCanvas = getMaskCanvas();
    if (maskCanvas) {
      maskCanvas.style.display = 'block';
    }

    const origW = v.videoWidth;
    const origH = v.videoHeight;
    if (!origW || !origH) return;

    maskCanvas.width = origW;
    maskCanvas.height = origH;
    const tmpCanvas = getTmpCanvas();
    if (tmpCanvas) {
      tmpCanvas.width = origW;
      tmpCanvas.height = origH;
    }

    const lvl = Number(config.allConfig?.export?.maskingstrength) || 5;

    const containerW = v.clientWidth;
    const containerH = v.clientHeight;
    const scale = Math.min(containerW / origW, containerH / origH);
    const displayW = origW * scale;
    const displayH = origH * scale;
    const offsetX = (containerW - displayW) / 2;
    const offsetY = (containerH - displayH) / 2;

    Object.assign(maskCanvas.style, {
      position: 'absolute',
      top: `${v.offsetTop + offsetY}px`,
      left: `${v.offsetLeft + offsetX}px`,
      width: `${displayW}px`,
      height: `${displayH}px`,
      pointerEvents: 'none',
      zIndex: 5,
      objectFit: 'contain'
    });

    const maskingTool = config.allConfig?.export?.maskingtool === '0' ? 'mosaic' : 'blur';

    const loop = () => {
      if (!isMasking) {
        if (maskPreviewAnimationFrame) {
          cancelAnimationFrame(maskPreviewAnimationFrame);
          maskPreviewAnimationFrame = null;
        }
        return;
      }

      tc.clearRect(0, 0, origW, origH);
      tc.drawImage(v, 0, 0, origW, origH);
      mc.clearRect(0, 0, origW, origH);

      if (maskingTool === 'mosaic') {
        const w = Math.max(1, Math.floor(origW / (lvl + 4)));
        const h = Math.max(1, Math.floor(origH / (lvl + 4)));
        mc.drawImage(tc.canvas, 0, 0, origW, origH, 0, 0, w, h);
        mc.drawImage(mc.canvas, 0, 0, w, h, 0, 0, origW, origH);
        mc.imageSmoothingEnabled = false;
      } else {
        mc.filter = `blur(${lvl + 4}px)`;
        mc.drawImage(tc.canvas, 0, 0, origW, origH);
        mc.filter = 'none';
      }

      maskPreviewAnimationFrame = requestAnimationFrame(loop);
    };

    loop();
  }

  function stopMaskPreview() {
    isMasking = false;

    const maskCanvas = getMaskCanvas();
    const mc = getMaskCtx();
    if (maskCanvas && mc) {
      mc.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskCanvas.style.display = 'none';
    }

    const tmpCanvas = getTmpCanvas();
    const tc = getTmpCtx();
    if (tmpCanvas && tc) {
      tc.clearRect(0, 0, tmpCanvas.width, tmpCanvas.height);
    }

    const video = getVideo();
    const { video: videoStore } = getStores();
    if (video) {
      if (!video.paused) {
        video.pause();
        videoStore.videoPlaying = false;
      }
      video.style.filter = 'none';
    }

    if (maskPreviewAnimationFrame) {
      cancelAnimationFrame(maskPreviewAnimationFrame);
      maskPreviewAnimationFrame = null;
    }
  }

  function applyEffectFull(ctx, ow, oh) {
    const { config } = getStores();
    const lvl = Number(config.allConfig?.export?.maskingstrength) || 5;
    const type = config.allConfig?.export?.maskingtool === '0' ? 'mosaic' : 'blur';
    const src = getTmpCanvas();

    if (type === 'mosaic') {
      const tw = Math.max(1, Math.floor(ow / (lvl + 4)));
      const th = Math.max(1, Math.floor(oh / (lvl + 4)));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, 0, 0, ow, oh, 0, 0, tw, th);
      ctx.drawImage(ctx.canvas, 0, 0, tw, th, 0, 0, ow, oh);
    } else {
      ctx.save();
      ctx.filter = `blur(${lvl + 4}px)`;
      ctx.drawImage(src, 0, 0, ow, oh, 0, 0, ow, oh);
      ctx.restore();
    }
  }

  // ─── 애니메이션 루프 ────────────────────────────

  function startAnimationLoop() {
    const loop = () => {
      const video = getVideo();
      if (!video) {
        animationFrameId = requestAnimationFrame(loop);
        return;
      }

      const { video: videoStore, detection, mode } = getStores();

      const currentFrame = Math.floor(video.currentTime * videoStore.frameRate);
      videoStore.currentFrame = currentFrame;

      if (video.duration) {
        // 탐지 진행 중에는 progress를 덮어쓰지 않음 (탐지 폴러가 관리)
        if (!detection.isDetecting) {
          videoStore.progress = (video.currentTime / video.duration) * 100;
        }
        videoStore.currentTime = formatTime(video.currentTime);
      }

      if (currentFrame !== videoStore.previousFrame) {
        videoStore.previousFrame = currentFrame;
        drawing.drawBoundingBoxes();
      }

      // manual 모드: 재생 중 박스 위치 자동 저장
      if (
        mode.currentMode === 'manual' &&
        videoStore.videoPlaying &&
        mode.manualBox &&
        !mode.isDrawingManualBox
      ) {
        const bbox = getBBoxString(mode.manualBox);
        masking.saveManualMaskingEntry(currentFrame, bbox);
        if (detection.newMaskings.length > 0 && currentFrame % 30 === 0) {
          masking.sendBatchMaskingsToBackend();
        }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
  }

  function stopAnimationLoop() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  return {
    startMaskPreview,
    stopMaskPreview,
    applyEffectFull,
    startAnimationLoop,
    stopAnimationLoop,
    get isMasking() { return isMasking; },
  };
}
