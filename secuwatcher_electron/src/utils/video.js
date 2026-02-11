/**
 * 비디오 메타데이터 유틸리티
 * 
 * 비디오 정보 추출, 시간 포맷팅, FPS 계산 기능을 제공합니다.
 */

/**
 * 비디오 메타데이터 객체
 * @typedef {Object} VideoMetadata
 * @property {number} duration - 재생 시간 (초)
 * @property {number} width - 너비 (픽셀)
 * @property {number} height - 높이 (픽셀)
 * @property {number} [fps] - 프레임 레이트
 * @property {number} [frameCount] - 총 프레임 수
 */

/**
 * 비디오 요소에서 메타데이터 추출
 * @param {HTMLVideoElement} videoElement - 비디오 요소
 * @returns {VideoMetadata} 비디오 메타데이터
 * 
 * @example
 * const meta = extractVideoMetadata(document.getElementById('video'));
 * // => { duration: 120.5, width: 1920, height: 1080 }
 */
export function extractVideoMetadata(videoElement) {
  if (!videoElement) {
    return { duration: 0, width: 0, height: 0 };
  }

  return {
    duration: videoElement.duration || 0,
    width: videoElement.videoWidth || 0,
    height: videoElement.videoHeight || 0
  };
}

/**
 * 비디오 분석 정보로부터 메타데이터 생성
 * @param {Object} info - 비디오 분석 결과
 * @param {number} info.duration - 재생 시간
 * @param {number} info.frameRate - 프레임 레이트
 * @param {number} info.width - 너비
 * @param {number} info.height - 높이
 * @returns {VideoMetadata}
 */
export function createVideoMetadata(info) {
  if (!info) {
    return { duration: 0, width: 0, height: 0 };
  }

  const metadata = {
    duration: info.duration || 0,
    width: info.width || 0,
    height: info.height || 0
  };

  if (info.frameRate) {
    metadata.fps = info.frameRate;
    metadata.frameCount = Math.floor(info.duration * info.frameRate);
  }

  return metadata;
}

/**
 * 초를 HH:MM:SS 형식으로 변환
 * @param {number} seconds - 초 단위 시간
 * @returns {string} 포맷된 시간 문자열
 * 
 * @example
 * formatTime(3665); // => '01:01:05'
 * formatTime(59.5); // => '00:00:59'
 */
export function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) {
    return '00:00:00';
  }

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

/**
 * 초를 분:초 형식으로 변환 (간단 버전)
 * @param {number} seconds - 초 단위 시간
 * @returns {string} 포맷된 시간 문자열
 * 
 * @example
 * formatDuration(125); // => '02:05'
 */
export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) {
    return '00:00';
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return [
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

/**
 * 시간 문자열(HH:MM:SS 또는 MM:SS)을 초로 변환
 * @param {string} timeStr - 시간 문자열
 * @returns {number} 초 단위 시간
 * 
 * @example
 * parseDurationToSeconds('01:30:45'); // => 5445
 * parseDurationToSeconds('05:30');    // => 330
 */
export function parseDurationToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string' || timeStr === '알 수 없음' || timeStr === '분석 중...') {
    return 0;
  }

  const parts = timeStr.split(':').map(Number);
  
  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    // SS
    return parts[0];
  }

  return 0;
}

/**
 * FPS 문자열을 숫자로 변환
 * @param {string|number} fpsStr - FPS 문자열 (예: '30 fps', '29.97')
 * @returns {number} FPS 값
 * 
 * @example
 * parseFps('30 fps');   // => 30
 * parseFps('29.97');    // => 29.97
 * parseFps(25);         // => 25
 */
export function parseFps(fpsStr) {
  if (!fpsStr) return 0;
  if (typeof fpsStr === 'number') return fpsStr;
  
  const match = String(fpsStr).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

/**
 * FPS를 문자열로 포맷팅
 * @param {number} fps - FPS 값
 * @param {number} [decimals=2] - 소수점 자릿수
 * @returns {string} 포맷된 FPS 문자열
 * 
 * @example
 * formatFps(29.976);  // => '29.98 fps'
 * formatFps(30, 0);   // => '30 fps'
 */
export function formatFps(fps, decimals = 2) {
  if (!fps || isNaN(fps)) {
    return '알 수 없음';
  }
  
  return `${fps.toFixed(decimals)} fps`;
}

/**
 * 특정 시간의 프레임 번호 계산
 * @param {number} currentTime - 현재 시간 (초)
 * @param {number} fps - 프레임 레이트
 * @returns {number} 프레임 번호
 * 
 * @example
 * timeToFrame(5.5, 30); // => 165
 */
export function timeToFrame(currentTime, fps) {
  if (!currentTime || !fps || fps <= 0) return 0;
  return Math.floor(currentTime * fps);
}

/**
 * 특정 프레임의 시간 계산
 * @param {number} frame - 프레임 번호
 * @param {number} fps - 프레임 레이트
 * @returns {number} 시간 (초)
 * 
 * @example
 * frameToTime(165, 30); // => 5.5
 */
export function frameToTime(frame, fps) {
  if (!frame || !fps || fps <= 0) return 0;
  return frame / fps;
}

/**
 * 비디오 확대/축소 레벨 계산
 * @param {number} duration - 비디오 길이 (초)
 * @returns {number} 확대/축소 레벨
 * 
 * @example
 * calculateZoomLevel(5);   // => 2.5 (짧은 영상)
 * calculateZoomLevel(60);  // => 3.5 (일반 영상)
 */
export function calculateZoomLevel(duration) {
  return duration && duration < 10 ? 2.5 : 3.5;
}

/**
 * 현재 재생 위치를 퍼센트로 변환
 * @param {number} currentTime - 현재 시간
 * @param {number} duration - 총 재생 시간
 * @returns {number} 퍼센트 (0-100)
 */
export function timeToPercent(currentTime, duration) {
  if (!duration || duration <= 0) return 0;
  return (currentTime / duration) * 100;
}

/**
 * 퍼센트를 시간으로 변환
 * @param {number} percent - 퍼센트 (0-100)
 * @param {number} duration - 총 재생 시간
 * @returns {number} 시간 (초)
 */
export function percentToTime(percent, duration) {
  if (!duration || duration <= 0) return 0;
  return (percent / 100) * duration;
}

/**
 * 프레임 단위로 시간 이동
 * @param {number} currentTime - 현재 시간
 * @param {number} frameDelta - 이동할 프레임 수 (양수/음수)
 * @param {number} fps - 프레임 레이트
 * @returns {number} 새로운 시간
 */
export function seekByFrames(currentTime, frameDelta, fps) {
  if (!fps || fps <= 0) return currentTime;
  const frameTime = 1 / fps;
  return Math.max(0, currentTime + (frameDelta * frameTime));
}

/**
 * 비디오 해상도 문자열 생성
 * @param {number} width - 너비
 * @param {number} height - 높이
 * @returns {string} 해상도 문자열
 * 
 * @example
 * formatResolution(1920, 1080); // => '1920x1080'
 */
export function formatResolution(width, height) {
  if (!width || !height) return '알 수 없음';
  return `${width}x${height}`;
}

/**
 * 비디오 파일 정보 객체 생성
 * @param {Object} info - 비디오 정보
 * @returns {Object} 파일 정보 객체
 */
export function createFileInfo(info) {
  if (!info) {
    return {
      duration: '알 수 없음',
      frameRate: '알 수 없음',
      resolution: '알 수 없음'
    };
  }

  return {
    duration: info.duration ? formatDuration(info.duration) : '알 수 없음',
    frameRate: info.frameRate ? formatFps(info.frameRate) : '알 수 없음',
    resolution: formatResolution(info.width, info.height)
  };
}
