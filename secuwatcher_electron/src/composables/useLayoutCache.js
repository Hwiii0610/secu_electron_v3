/**
 * 레이아웃 계산 캐싱 컴포저블
 * 
 * DOM 측정 값을 캐싱하여 reflow 최소화
 * 주의: video 메타데이터 로드 후 사용해야 함
 */

import { ref, computed } from 'vue';

export function useLayoutCache() {
  // 캐시 상태
  const cache = ref({
    videoWidth: 0,
    videoHeight: 0,
    containerWidth: 0,
    containerHeight: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    timestamp: 0
  });
  
  // 캐시 유효 시간 (ms) - 1프레임 @ 60fps
  const CACHE_TTL = 16;
  
  /**
   * 캐시된 레이아웃 정보 조회
   * @param {HTMLVideoElement} video
   * @param {HTMLElement} container
   * @returns {Object} 레이아웃 정보
   */
  const getLayout = (video, container) => {
    // 유효성 검사
    if (!video || !container) {
      console.warn('[useLayoutCache] Invalid video or container');
      return null;
    }
    
    // video 메타데이터 확인
    if (!video.videoWidth || !video.videoHeight) {
      console.warn('[useLayoutCache] Video metadata not loaded');
      return null;
    }
    
    const now = performance.now();
    
    // 캐시가 유효하면 반환
    if (now - cache.value.timestamp < CACHE_TTL) {
      return cache.value;
    }
    
    // 새로 계산 — clientWidth/clientHeight 사용 (CSS transform 전 레이아웃 크기)
    // 줌은 CSS transform으로 비디오+캔버스 동시 적용되므로 변환 전 좌표계 사용
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // scale 계산 (object-fit: contain 방식)
    const scale = Math.min(cw / vw, ch / vh);

    // 중앙 정렬 offset
    const offsetX = (cw - vw * scale) / 2;
    const offsetY = (ch - vh * scale) / 2;

    // 캐시 업데이트
    cache.value = {
      videoWidth: vw,
      videoHeight: vh,
      containerWidth: cw,
      containerHeight: ch,
      scale,
      offsetX,
      offsetY,
      timestamp: now
    };
    
    return cache.value;
  };
  
  /**
   * 좌표 변환: 화면 좌표 → 비디오 원본 좌표
   * @param {number} screenX - 화면 X 좌표
   * @param {number} screenY - 화면 Y 좌표
   * @param {Object} layout - getLayout() 결과
   * @returns {Object} 비디오 원본 좌표
   */
  const screenToVideo = (screenX, screenY, layout) => {
    if (!layout) return { x: 0, y: 0 };
    
    return {
      x: Math.floor((screenX - layout.offsetX) / layout.scale),
      y: Math.floor((screenY - layout.offsetY) / layout.scale)
    };
  };
  
  /**
   * 좌표 변환: 비디오 원본 좌표 → 화면 좌표
   * @param {number} videoX - 비디오 X 좌표
   * @param {number} videoY - 비디오 Y 좌표
   * @param {Object} layout - getLayout() 결과
   * @returns {Object} 화면 좌표
   */
  const videoToScreen = (videoX, videoY, layout) => {
    if (!layout) return { x: 0, y: 0 };
    
    return {
      x: Math.floor(videoX * layout.scale + layout.offsetX),
      y: Math.floor(videoY * layout.scale + layout.offsetY)
    };
  };
  
  /**
   * 캐시 무효화 (창 크기 변경, 비디오 변경 시)
   */
  const invalidate = () => {
    cache.value.timestamp = 0;
  };
  
  /**
   * 캐시 상태 확인 (디버깅용)
   */
  const isValid = computed(() => {
    return performance.now() - cache.value.timestamp < CACHE_TTL;
  });
  
  return {
    getLayout,
    screenToVideo,
    videoToScreen,
    invalidate,
    isValid,
    // 날짜 디버깅용
    _cache: cache
  };
}
