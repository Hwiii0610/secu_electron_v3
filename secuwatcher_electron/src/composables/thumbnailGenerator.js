/**
 * 타임라인 썸네일 생성 컴포저블
 *
 * 오프스크린 비디오 + 캔버스를 사용해 여러 시점의 프레임을 캡처하고
 * 타임라인 스트립에 표시할 스프라이트 이미지를 생성합니다.
 */

export function createThumbnailGenerator() {
  /**
   * seek with timeout - seeked 이벤트가 발생하지 않을 경우 대비
   */
  function seekWithTimeout(video, time, timeoutMs = 3000) {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - time) < 0.05) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, timeoutMs);
      video.addEventListener('seeked', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      video.currentTime = time;
    });
  }

  /**
   * offscreen video 생성 — 메인 비디오를 방해하지 않고 seek/capture 수행
   */
  function createOffscreenVideo(src) {
    return new Promise((resolve, reject) => {
      const vid = document.createElement('video');
      vid.crossOrigin = 'anonymous';
      vid.preload = 'auto';
      vid.muted = true;
      vid.src = src;

      const timeout = setTimeout(() => {
        reject(new Error('offscreen video load timeout'));
      }, 10000);

      vid.addEventListener('loadeddata', () => {
        clearTimeout(timeout);
        resolve(vid);
      }, { once: true });

      vid.addEventListener('error', (e) => {
        clearTimeout(timeout);
        reject(new Error(`offscreen video error: ${e.message || 'unknown'}`));
      }, { once: true });
    });
  }

  /**
   * offscreen video 폐기
   */
  function disposeOffscreenVideo(video) {
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  /**
   * 스프라이트 스트립 생성
   * 지정된 시간 범위에서 여러 프레임을 캡처하여 하나의 넓은 스프라이트 이미지로 합성
   *
   * @param {HTMLVideoElement} offscreenVideo - offscreen video 요소
   * @param {number} startTime - 시작 시간(초)
   * @param {number} endTime - 종료 시간(초)
   * @param {number} stripWidth - 스트립의 픽셀 너비
   * @param {number} height - 썸네일 높이 (기본 40px)
   * @returns {{ spriteUrl: string, frameWidth: number, frameCount: number }}
   */
  async function generateSpriteStrip(offscreenVideo, startTime, endTime, stripWidth, height = 40) {
    if (!offscreenVideo || !offscreenVideo.videoWidth) return null;

    const aspectRatio = offscreenVideo.videoWidth / offscreenVideo.videoHeight;
    const frameWidth = Math.round(aspectRatio * height);
    const frameCount = Math.max(1, Math.ceil(stripWidth / frameWidth));
    const duration = endTime - startTime;
    const interval = duration / frameCount;

    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = frameCount * frameWidth;
    spriteCanvas.height = height;
    const ctx = spriteCanvas.getContext('2d');

    if (!ctx) return null;

    try {
      for (let i = 0; i < frameCount; i++) {
        const t = Math.min(startTime + i * interval + interval * 0.5, endTime - 0.01);
        await seekWithTimeout(offscreenVideo, Math.max(0, t));
        ctx.drawImage(offscreenVideo, i * frameWidth, 0, frameWidth, height);
      }

      const spriteUrl = spriteCanvas.toDataURL('image/jpeg', 0.6);
      if (!spriteUrl || spriteUrl.length < 100) return null;

      return { spriteUrl, frameWidth, frameCount };
    } catch (e) {
      console.error('[thumbnailGen] generateSpriteStrip failed:', e.message);
      return null;
    }
  }

  function dispose() {
    // cleanup if needed
  }

  return { createOffscreenVideo, disposeOffscreenVideo, generateSpriteStrip, seekWithTimeout, dispose };
}
