/**
 * API 래퍼 유틸리티
 * 
 * API 호출 시 일관된 에러 처리 및 메시지 표시를 제공합니다.
 */

import apiPython from '../apiRequest';
import { showError, showMessage } from './message';

/**
 * API 호출 결과 객체
 * @typedef {Object} ApiResult
 * @property {boolean} success - 호출 성공 여부
 * @property {any} [data] - 응답 데이터
 * @property {Error} [error] - 에러 객체
 */

/**
 * API POST 요청 (에러 처리 포함)
 * @param {string} endpoint - API 엔드포인트
 * @param {Object} data - 요청 데이터
 * @param {Object} [options] - 옵션
 * @param {string} [options.errorMessage] - 에러 메시지 접두사
 * @param {boolean} [options.showError=true] - 에러 메시지 표시 여부
 * @param {Function} [options.onError] - 에러 발생 시 콜백
 * @returns {Promise<ApiResult>}
 * 
 * @example
 * const result = await apiPost('/autodetect', { Event: '1' });
 * if (result.success) {
 *   console.log(result.data);
 * }
 */
export async function apiPost(endpoint, data, options = {}) {
  const {
    errorMessage = '요청 실패: ',
    showError: shouldShowError = true,
    onError
  } = options;

  try {
    const response = await apiPython.post(endpoint, data);
    return { success: true, data: response.data };
  } catch (err) {
    const errorMsg = err?.message || err || '알 수 없는 오류';
    
    if (shouldShowError) {
      showError(errorMsg, errorMessage);
    }
    
    if (onError) {
      onError(err);
    }
    
    return { success: false, error: err };
  }
}

/**
 * API GET 요청 (에러 처리 포함)
 * @param {string} endpoint - API 엔드포인트
 * @param {Object} [options] - 옵션
 * @param {string} [options.errorMessage] - 에러 메시지 접두사
 * @param {boolean} [options.showError=true] - 에러 메시지 표시 여부
 * @param {Function} [options.onError] - 에러 발생 시 콜백
 * @returns {Promise<ApiResult>}
 */
export async function apiGet(endpoint, options = {}) {
  const {
    errorMessage = '요청 실패: ',
    showError: shouldShowError = true,
    onError
  } = options;

  try {
    const response = await apiPython.get(endpoint);
    return { success: true, data: response.data };
  } catch (err) {
    const errorMsg = err?.message || err || '알 수 없는 오류';
    
    if (shouldShowError) {
      showError(errorMsg, errorMessage);
    }
    
    if (onError) {
      onError(err);
    }
    
    return { success: false, error: err };
  }
}

/**
 * 자동 탐지 API 호출
 * @param {Object} params - 탐지 파라미터
 * @param {string} [params.errorMessage] - 에러 메시지
 * @returns {Promise<ApiResult>}
 */
export async function detectAuto(params = {}) {
  return apiPost('/autodetect', {
    Event: '1',
    ...params
  }, {
    errorMessage: '자동 객체 탐지 실패: '
  });
}

/**
 * 선택 탐지 API 호출
 * @param {Object} params - 탐지 파라미터
 * @param {string} params.videoPath - 비디오 경로
 * @param {number} params.frameNo - 프레임 번호
 * @param {string} params.coordinate - 좌표 (x,y)
 * @returns {Promise<ApiResult>}
 */
export async function detectSelect(params) {
  return apiPost('/autodetect', {
    Event: '2',
    ...params
  }, {
    errorMessage: '선택 객체 탐지 실패: '
  });
}

/**
 * 마스킹/낳�내기 API 호출
 * @param {Object} params - 낳�내기 파라미터
 * @param {string} params.videoPath - 비디오 경로
 * @param {string} [params.allMasking] - 전체 마스킹 여부
 * @param {string} [params.outputDir] - 출력 디렉토리
 * @returns {Promise<ApiResult>}
 */
export async function exportVideo(params) {
  return apiPost('/autodetect', {
    Event: '3',
    ...params
  }, {
    errorMessage: '낳�내기 요청 실패: '
  });
}

/**
 * 암호화 API 호출
 * @param {Object} params - 암호화 파라미터
 * @param {string} params.videoPath - 비디오 경로
 * @param {string} params.password - 암호
 * @param {string} [params.outputDir] - 출력 디렉토리
 * @returns {Promise<ApiResult>}
 */
export async function encryptVideo(params) {
  return apiPost('/encrypt', params, {
    errorMessage: '암호화 요청 실패: '
  });
}

/**
 * 진행률 조회 API 호출
 * @param {string} jobId - 작업 ID
 * @returns {Promise<ApiResult>}
 */
export async function getProgress(jobId) {
  return apiGet(`/progress/${jobId}`, {
    showError: false // 폴리 중 에러는 직접 처리
  });
}

/**
 * 일괄 처리 API 호출
 * @param {Object} params - 일괄 처리 파라미터
 * @returns {Promise<ApiResult>}
 */
export async function batchProcess(params) {
  return apiPost('/batchProcessing', params, {
    errorMessage: '일괄처리 오류: '
  });
}

/**
 * 작업 상태 확인 헬퍼
 * @param {Object} data - API 응답 데이터
 * @returns {'completed'|'failed'|'pending'} 작업 상태
 */
export function getJobStatus(data) {
  if (data.status === 'completed' || data.progress >= 100) {
    return 'completed';
  }
  if (data.status === 'failed' || data.error) {
    return 'failed';
  }
  return 'pending';
}

/**
 * 작업 완료 여부 확인
 * @param {Object} data - API 응답 데이터
 * @returns {boolean}
 */
export function isJobCompleted(data) {
  return getJobStatus(data) === 'completed';
}

/**
 * 작업 실패 여부 확인
 * @param {Object} data - API 응답 데이터
 * @returns {boolean}
 */
export function isJobFailed(data) {
  return getJobStatus(data) === 'failed';
}
