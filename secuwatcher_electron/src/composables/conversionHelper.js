/**
 * 비디오 변환 헬퍼 모듈
 * 
 * 변환 진행률 리스너의 생명주기 관리를 담당합니다.
 * convertAndPlay와 convertAndPlayFromPath의 공통 보일러플레이트를 추출했습니다.
 */

/**
 * 변환 진행률 리스너 설정
 * @param {Object} conversionState - 변환 상태 객체 (inProgress, progress, currentFile)
 * @param {string} fileName - 현재 변환 중인 파일명
 * @returns {{ cleanup(), fail() }} - cleanup: 정상 종료, fail: 에러 발생 시
 */
export function setupConversionProgress(conversionState, fileName) {
  conversionState.inProgress = true;
  conversionState.progress = 0;
  conversionState.currentFile = fileName;

  // 진행률 이벤트 핸들러
  const progressHandler = (event, data) => {
    conversionState.progress = data.progress;
  };

  // 리스너 등록
  window.electronAPI.onConversionProgress(progressHandler);

  return {
    /**
     * 정상 종료 시 호출 - 리스너 제거 및 상태 초기화
     */
    cleanup() {
      window.electronAPI.removeConversionProgressListener(progressHandler);
      conversionState.inProgress = false;
    },

    /**
     * 에러 발생 시 호출 - 리스너 제거 및 상태 초기화
     */
    fail() {
      window.electronAPI.removeConversionProgressListener(progressHandler);
      conversionState.inProgress = false;
      conversionState.progress = 0;
    }
  };
}

/**
 * 변환 옵션 생성 헬퍼
 * @param {Object} options - 사용자 정의 옵션
 * @returns {Object} - 최종 변환 옵션
 */
export function createConversionOptions(options = {}) {
  return {
    videoCodec: options.videoCodec || 'libx264',
    crf: options.crf ?? 23,
    duration: options.duration
  };
}
