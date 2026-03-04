/**
 * 비디오 제어 컴포저블
 *
 * App.vue의 비디오 재생/정지, 프레임 이동, 속도 조절, 줌, 키보드 단축키 로직을 통합합니다.
 *
 * @param {Object} deps
 * @param {Function} deps.getStores - () => { video, detection, mode, file }
 * @param {Function} deps.getVideo  - () => HTMLVideoElement
 */

const FRAME_STEP_MODES = [
  { label: 'frameMode.1', getTime: (frameRate) => 1 / frameRate },
  { label: 'frameMode.1s', getTime: () => 1 },
  { label: 'frameMode.5s', getTime: () => 5 },
  { label: 'frameMode.10s', getTime: () => 10 },
];

export { FRAME_STEP_MODES };

export function createVideoController(deps) {
  const { getStores, getVideo } = deps;

  // ─── 헬퍼 ─────────────────────────────────────

  function getMaxPlaybackRate() {
    const video = getVideo();
    if (!video) return undefined;
    return video.duration < 10 ? 2.5 : 3.5;
  }

  function isInputFocused() {
    const activeElement = document.activeElement;
    return !!(activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable
    ));
  }

  // ─── 키보드 단축키 ────────────────────────────

  function handleKeyDown(event) {
    if (isInputFocused()) return;

    const video = getVideo();
    const { file, video: videoStore, mode } = getStores();

    // Escape: Close modals (통합 모달 관리)
    if (event.code === 'Escape') {
      event.preventDefault();
      const modals = [
        'showSettingModal',
        'showWatermarkModal',
        'showMultiAutoDetectionModal',
        'exporting',
        'isBatchProcessing'
      ];
      // 열린 모달이 있으면 닫기
      const { mode: modeStore, config, export: exportStore } = getStores();
      let closedAny = false;
      if (config.showSettingModal) {
        config.showSettingModal = false;
        closedAny = true;
      }
      if (config.showWatermarkModal) {
        config.showWatermarkModal = false;
        closedAny = true;
      }
      if (config.allConfig) {
        const detection = getStores().detection;
        if (detection.showMultiAutoDetectionModal) {
          detection.showMultiAutoDetectionModal = false;
          closedAny = true;
        }
      }
      if (exportStore.exporting) {
        exportStore.exporting = false;
        closedAny = true;
      }
      if (modeStore.contextMenuVisible) {
        modeStore.contextMenuVisible = false;
        closedAny = true;
      }
      if (modeStore.trackMenuVisible) {
        modeStore.trackMenuVisible = false;
        closedAny = true;
      }
      return;
    }

    // 비디오 미선택 상태에서는 video 없을 수 있음
    if (!video || file.selectedFileIndex < 0) return;

    switch (event.code) {
      case 'ArrowUp':
        event.preventDefault();
        videoStore.frameStepMode = (videoStore.frameStepMode + 1) % FRAME_STEP_MODES.length;
        break;
      case 'ArrowDown':
        event.preventDefault();
        videoStore.frameStepMode = (videoStore.frameStepMode + FRAME_STEP_MODES.length - 1) % FRAME_STEP_MODES.length;
        break;
      case 'ArrowRight':
        event.preventDefault();
        stepForward();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        stepBackward();
        break;
      case 'Space':
        event.preventDefault();
        togglePlay();
        break;
      case 'KeyA':
        event.preventDefault();
        jumpToTrackStart();
        break;
      case 'KeyD':
        event.preventDefault();
        jumpToTrackEnd();
        break;
      case 'KeyO':
        // Ctrl/Cmd+O: Open file dialog
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          // triggerFileInput 콜백은 App.vue에서 호출되므로
          // window.dispatchEvent를 통해 신호 전달
          window.dispatchEvent(new CustomEvent('trigger-file-input'));
        }
        break;
    }
  }

  // ─── 재생 제어 ─────────────────────────────────

  function togglePlay() {
    const video = getVideo();
    if (!video) return;

    const { video: videoStore } = getStores();
    if (video.paused) {
      video.play();
      videoStore.videoPlaying = true;
    } else {
      video.pause();
      videoStore.videoPlaying = false;
    }
  }

  // ─── 프레임 스텝 이동 ─────────────────────────

  function stepBackward() {
    const video = getVideo();
    const { video: videoStore } = getStores();
    if (!video || !videoStore.frameRate) return;
    const stepTime = FRAME_STEP_MODES[videoStore.frameStepMode].getTime(videoStore.frameRate);
    video.currentTime = Math.max(0, video.currentTime - stepTime);
  }

  function stepForward() {
    const video = getVideo();
    const { video: videoStore } = getStores();
    if (!video || !video.duration || !videoStore.frameRate) return;
    const stepTime = FRAME_STEP_MODES[videoStore.frameStepMode].getTime(videoStore.frameRate);
    video.currentTime = Math.min(video.duration, video.currentTime + stepTime);
  }

  // 기존 호환용 (VideoControls 버튼에서 사용)
  function jumpBackward() {
    const video = getVideo();
    const { video: videoStore } = getStores();
    if (video && videoStore.frameRate > 0) {
      const frameTime = 1 / videoStore.frameRate;
      video.currentTime = Math.max(0, video.currentTime - frameTime);
    }
  }

  function jumpForward() {
    const video = getVideo();
    const { video: videoStore } = getStores();
    if (video && video.duration && videoStore.frameRate > 0) {
      const frameTime = 1 / videoStore.frameRate;
      video.currentTime = Math.min(video.duration, video.currentTime + frameTime);
    }
  }

  // ─── 객체 프레임 점프 (A/D) ───────────────────

  function jumpToTrackFrame(reduceFn, overrideTrackId = null) {
    const video = getVideo();
    const { detection, file } = getStores();

    const trackId = overrideTrackId || detection.hoveredBoxId;
    console.log('[A/D Key] trackId:', trackId, '(override:', overrideTrackId, 'hovered:', detection.hoveredBoxId, ')');
    if (!video || !trackId) {
      console.log('[A/D Key] 중단: video=', !!video, 'trackId=', trackId);
      return;
    }
    const frames = [];
    for (const log of detection.maskingLogs) {
      if (log.track_id === trackId) frames.push(log.frame);
    }
    console.log('[A/D Key] trackId:', trackId, 'frames count:', frames.length);
    if (!frames.length) return;

    const totalFrames = file.files[file.selectedFileIndex]?.totalFrames;
    if (!totalFrames || !video.duration) {
      console.log('[A/D Key] 중단: totalFrames=', totalFrames, 'duration=', video.duration);
      return;
    }

    const targetFrame = reduceFn(frames, totalFrames);

    // 프레임 중심 시간으로 계산 (프레임 오차 방지)
    // frame N의 중심 시간 = (N + 0.5) / totalFrames * duration
    const frameCenterTime = ((targetFrame + 0.5) / totalFrames) * video.duration;

    console.log('[A/D Key] targetFrame:', targetFrame, 'frameCenterTime:', frameCenterTime);
    video.currentTime = frameCenterTime;
    moveCursorToBboxCenter(trackId, targetFrame);
  }

  function moveCursorToBboxCenter(trackId, frame) {
    const video = getVideo();
    const { detection } = getStores();
    if (!video || !video.videoWidth || !video.videoHeight) return;

    // frame을 숫자로 변환 (문자열 키로 저장된 경우 대비)
    const frameNum = Number(frame);
    const logs = detection.maskingLogsMap[frameNum] || detection.maskingLogsMap[String(frameNum)] || [];
    const log = logs.find(l => l.track_id === trackId);
    if (!log) {
      console.log('[moveCursor] bbox 찾지 못함: trackId=', trackId, 'frame=', frameNum,
        'mapKeys(sample):', Object.keys(detection.maskingLogsMap).slice(0, 5));
      return;
    }

    const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
    let cx, cy;

    if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
      cx = (bboxData[0] + bboxData[2]) / 2;
      cy = (bboxData[1] + bboxData[3]) / 2;
    } else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
      cx = bboxData.reduce((s, p) => s + p[0], 0) / bboxData.length;
      cy = bboxData.reduce((s, p) => s + p[1], 0) / bboxData.length;
    } else {
      return;
    }

    const rect = video.getBoundingClientRect();
    const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const offsetX = (rect.width - video.videoWidth * scale) / 2;
    const offsetY = (rect.height - video.videoHeight * scale) / 2;

    const pageX = Math.round(cx * scale + offsetX + rect.left + window.scrollX);
    const pageY = Math.round(cy * scale + offsetY + rect.top + window.scrollY);

    console.log('[moveCursor] bbox:', bboxData, 'center:', cx, cy,
      'rect:', { left: rect.left, top: rect.top, w: rect.width, h: rect.height },
      'scale:', scale, 'videoSize:', video.videoWidth, video.videoHeight,
      '→ page:', pageX, pageY, 'dpr:', window.devicePixelRatio);

    window.electronAPI?.moveCursor(pageX, pageY);
  }

  function jumpToTrackStart(trackId = null) {
    // A 키 또는 메뉴: 객체가 존재하는 첫 프레임으로 이동
    jumpToTrackFrame(frames => Math.min(...frames.map(f => Number(f))), trackId);
  }

  function jumpToTrackEnd(trackId = null) {
    // D 키 또는 메뉴: 객체가 존재하는 마지막 프레임으로 이동
    jumpToTrackFrame(frames => Math.max(...frames.map(f => Number(f))), trackId);
  }

  function setPlaybackRate(rate) {
    const video = getVideo();
    if (!video) return;

    const { video: videoStore } = getStores();
    const maxRate = getMaxPlaybackRate();

    if (rate === 'slow') {
      video.playbackRate = Math.max(0.5, video.playbackRate - 0.5);
    } else {
      video.playbackRate = Math.min(maxRate, video.playbackRate + 0.5);
    }
    videoStore.currentPlaybackRate = video.playbackRate;
  }

  // ─── 줌 제어 ───────────────────────────────────

  function zoomIn() {
    const { video: videoStore } = getStores();
    videoStore.zoomLevel += 0.1;
    // video.style.transform은 VideoCanvas.vue의 zoomLevel watcher가 처리
    // (비디오 + 캔버스에 동일 transform 동시 적용)
  }

  function zoomOut() {
    const { video: videoStore } = getStores();
    videoStore.zoomLevel = Math.max(0.5, videoStore.zoomLevel - 0.1);
    // video.style.transform은 VideoCanvas.vue의 zoomLevel watcher가 처리
  }

  // ─── 진행률 제어 ───────────────────────────────

  function updateVideoProgress() {
    const video = getVideo();
    const { video: videoStore } = getStores();
    if (video && video.duration) {
      video.currentTime = (videoStore.progress / 100) * video.duration;
    }
  }

  // ─── 공개 API ──────────────────────────────────

  return {
    getMaxPlaybackRate,
    isInputFocused,
    handleKeyDown,
    togglePlay,
    jumpBackward,
    jumpForward,
    stepBackward,
    stepForward,
    jumpToTrackStart,
    jumpToTrackEnd,
    setPlaybackRate,
    zoomIn,
    zoomOut,
    updateVideoProgress,
  };
}
