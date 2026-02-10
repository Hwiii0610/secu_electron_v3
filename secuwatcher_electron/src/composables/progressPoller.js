/**
 * 진행률 폴리 관리 모듈
 * 
 * 다양한 폴리 패턴을 통일된 인터페이스로 관리합니다.
 * - setInterval 모드 (기본): 지속적인 진행률 추적
 * - 재귀 setTimeout 모드: 단순 완료 체크
 * - Promise 기반: async/await 사용시
 */

import apiPython from '../apiRequest';
import config from '../resources/config.json';

/**
 * 진행률 폴리 팩토리 함수
 * @param {Object} callbacks - 콜백 함수들
 * @param {Function} callbacks.onProgress - 진행률 업데이트 시 호출 (data) => void
 * @param {Function} callbacks.onComplete - 완료 시 호출 (data) => void
 * @param {Function} callbacks.onError - 에러 시 호출 (error) => void
 * @param {Object} options - 폴리 옵션
 * @param {number} options.interval - 폴리 간격 (ms), 기본 1000
 * @param {boolean} options.useInterval - true: setInterval, false: 재귀 setTimeout
 * @param {Function} options.isComplete - 완료 조건 함수 (data) => boolean
 * @param {Function} options.isFailed - 실패 조건 함수 (data) => boolean
 * @returns {{ start(jobId), stop(), isActive }}
 */
export function createProgressPoller(callbacks, options = {}) {
  const {
    onProgress,
    onComplete,
    onError
  } = callbacks;

  const {
    interval = 1000,
    useInterval = true,
    isComplete = (data) => data.status === 'completed' || (data.progress >= 100),
    isFailed = (data) => data.status === 'failed' || data.error
  } = options;

  let timerId = null;
  let isRunning = false;

  const fetchProgress = async (jobId) => {
    try {
      const res = await apiPython.get(`${config.progress}/${jobId}`);
      return res.data;
    } catch (err) {
      throw err;
    }
  };

  const handleResponse = (data, resolve, reject) => {
    // 진행률 콜백
    if (onProgress) {
      onProgress(data);
    }

    // 실패 체크
    if (isFailed(data)) {
      const error = new Error(data.message || data.error || '작업 실패');
      if (onError) onError(error);
      if (reject) reject(error);
      return true; // 처리 완료
    }

    // 완료 체크
    if (isComplete(data)) {
      if (onComplete) onComplete(data);
      if (resolve) resolve(data);
      return true; // 처리 완료
    }

    return false; // 계속 진행
  };

  const pollRecursive = async (jobId) => {
    if (!isRunning) return;

    try {
      const data = await fetchProgress(jobId);
      const done = handleResponse(data, null, null);

      if (!done && isRunning) {
        timerId = setTimeout(() => pollRecursive(jobId), interval);
      }
    } catch (err) {
      console.error('Progress polling error:', err);
      if (onError) onError(err);
      // 에러 발생 시 재시도
      if (isRunning) {
        timerId = setTimeout(() => pollRecursive(jobId), interval);
      }
    }
  };

  const pollInterval = (jobId) => {
    timerId = setInterval(async () => {
      if (!isRunning) {
        clearInterval(timerId);
        return;
      }

      try {
        const data = await fetchProgress(jobId);
        const done = handleResponse(data, null, null);

        if (done) {
          clearInterval(timerId);
          timerId = null;
          isRunning = false;
        }
      } catch (err) {
        console.error('Progress polling error:', err);
        clearInterval(timerId);
        timerId = null;
        isRunning = false;
        if (onError) onError(err);
      }
    }, interval);
  };

  return {
    /**
     * 폴리 시작
     * @param {string} jobId - 작업 ID
     */
    start(jobId) {
      if (isRunning) {
        console.warn('Progress poller is already running');
        return;
      }

      isRunning = true;

      if (useInterval) {
        pollInterval(jobId);
      } else {
        pollRecursive(jobId);
      }
    },

    /**
     * 폴리 중지
     */
    stop() {
      isRunning = false;
      if (timerId) {
        if (useInterval) {
          clearInterval(timerId);
        } else {
          clearTimeout(timerId);
        }
        timerId = null;
      }
    },

    /**
     * 폴리 실행 중 여부
     * @returns {boolean}
     */
    get isActive() {
      return isRunning;
    }
  };
}

/**
 * Promise 기반 폴리
 * async/await 패턴에서 사용하기 위한 래퍼
 * 
 * @param {string} jobId - 작업 ID
 * @param {Object} callbacks - 콜백 함수들 (onProgress, onError - 선택적)
 * @param {Object} options - 폴리 옵션
 * @returns {Promise} - 완료 시 resolve, 에러/중지 시 reject
 */
export function pollAsPromise(jobId, callbacks = {}, options = {}) {
  const { onProgress, onError } = callbacks;

  return new Promise((resolve, reject) => {
    const poller = createProgressPoller({
      onProgress,
      onComplete: (data) => {
        resolve(data);
      },
      onError: (err) => {
        if (onError) onError(err);
        reject(err);
      }
    }, options);

    poller.start(jobId);
  });
}

/**
 * 배치 처리용 폴리 (다중 파일 진행률)
 * @param {Object} callbacks - 콜백 함수들
 * @param {Object} options - 폴리 옵션
 * @returns {{ start(jobId), stop(), isActive }}
 */
export function createBatchPoller(callbacks, options = {}) {
  const { onProgress, onComplete, onError } = callbacks;
  const { interval = 1000 } = options;

  let timerId = null;
  let isRunning = false;

  return {
    start(jobId) {
      if (isRunning) return;
      isRunning = true;

      timerId = setInterval(async () => {
        if (!isRunning) {
          clearInterval(timerId);
          return;
        }

        try {
          const res = await apiPython.get(`${config.progress}/${jobId}`);
          const data = res.data;

          if (onProgress) {
            onProgress(data);
          }

          // 에러 체크
          if (data.error) {
            clearInterval(timerId);
            timerId = null;
            isRunning = false;
            if (onError) onError(new Error(data.error));
            return;
          }

          // 완료 체크
          if (data.status === 'completed' || 
              (data.current === data.total && data.progress >= 100)) {
            clearInterval(timerId);
            timerId = null;
            isRunning = false;
            if (onComplete) onComplete(data);
            return;
          }
        } catch (err) {
          console.error('Batch polling error:', err);
          clearInterval(timerId);
          timerId = null;
          isRunning = false;
          if (onError) onError(err);
        }
      }, interval);
    },

    stop() {
      isRunning = false;
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    },

    get isActive() {
      return isRunning;
    }
  };
}
