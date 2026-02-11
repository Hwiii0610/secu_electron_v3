/**
 * 비디오 제어 컴포저블
 *
 * App.vue의 비디오 재생/정지, 프레임 이동, 속도 조절, 줌, 키보드 단축키 로직을 통합합니다.
 *
 * @param {Object} deps
 * @param {Function} deps.getStores - () => { video, detection, mode }
 * @param {Function} deps.getVideo  - () => HTMLVideoElement
 */

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
    const { file } = getStores();
    if (!video || file.selectedFileIndex < 0) return;

    switch (event.code) {
      case 'ArrowRight':
        event.preventDefault();
        if (video.playbackRate < getMaxPlaybackRate()) {
          setPlaybackRate('fast');
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (video.playbackRate > 0.5) {
          setPlaybackRate('slow');
        }
        break;
      case 'Space':
        event.preventDefault();
        togglePlay();
        break;
      case 'KeyA':
        event.preventDefault();
        jumpBackward();
        break;
      case 'KeyD':
        event.preventDefault();
        jumpForward();
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

  function setPlaybackRate(rate) {
    const video = getVideo();
    if (!video) return;

    const { video: videoStore } = getStores();
    const maxRate = video.duration < 10 ? 2.5 : 3.5;

    if (rate === 'slow') {
      video.playbackRate = Math.max(0.5, video.playbackRate - 0.5);
    } else {
      video.playbackRate = Math.min(maxRate, video.playbackRate + 0.5);
    }
    videoStore.currentPlaybackRate = video.playbackRate;
  }

  // ─── 줌 제어 ───────────────────────────────────

  function zoomIn() {
    const video = getVideo();
    const { video: videoStore } = getStores();
    videoStore.zoomLevel += 0.1;
    if (video) {
      video.style.transform = `scale(${videoStore.zoomLevel})`;
    }
  }

  function zoomOut() {
    const video = getVideo();
    const { video: videoStore } = getStores();
    videoStore.zoomLevel = Math.max(0.5, videoStore.zoomLevel - 0.1);
    if (video) {
      video.style.transform = `scale(${videoStore.zoomLevel})`;
    }
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
    setPlaybackRate,
    zoomIn,
    zoomOut,
    updateVideoProgress,
  };
}
