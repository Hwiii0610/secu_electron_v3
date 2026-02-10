/**
 * 폼 검증 유틸리티
 * 
 * 입력값 검증 및 유효성 체크 기능을 제공합니다.
 */

import { MESSAGES } from './message';

/**
 * 프레임 범위 검증 결과
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - 유효성 여부
 * @property {string} [message] - 오류 메시지 (유효하지 않은 경우)
 */

/**
 * 프레임 범위 검증
 * @param {number|string} startFrame - 시작 프레임
 * @param {number|string} endFrame - 끝 프레임
 * @param {number} [maxFrame] - 최대 프레임 (선택사항)
 * @returns {ValidationResult}
 * 
 * @example
 * validateFrameRange(0, 100, 200);
 * // => { valid: true }
 * 
 * validateFrameRange(100, 50, 200);
 * // => { valid: false, message: '시작 프레임은 끝 프레임보다 작아야 합니다.' }
 */
export function validateFrameRange(startFrame, endFrame, maxFrame = null) {
  // null/undefined/빈 문자열 체크
  if (startFrame === '' || startFrame === null || startFrame === undefined ||
      endFrame === '' || endFrame === null || endFrame === undefined) {
    return {
      valid: false,
      message: MESSAGES.VALIDATION.FRAME_REQUIRED
    };
  }

  const start = Number(startFrame);
  const end = Number(endFrame);

  // 숫자 변환 체크
  if (isNaN(start) || isNaN(end)) {
    return {
      valid: false,
      message: '프레임 값은 숫자여야 합니다.'
    };
  }

  // 시작 프레임 0 이상 체크
  if (start < 0) {
    return {
      valid: false,
      message: MESSAGES.VALIDATION.FRAME_MIN_ZERO
    };
  }

  // 최대 프레임 체크
  if (maxFrame !== null && maxFrame !== undefined && end > maxFrame) {
    return {
      valid: false,
      message: MESSAGES.VALIDATION.FRAME_MAX(maxFrame)
    };
  }

  // 시작 < 끝 체크
  if (start >= end) {
    return {
      valid: false,
      message: MESSAGES.VALIDATION.FRAME_START_END
    };
  }

  return { valid: true };
}

/**
 * 비밀번호 유효성 검사
 * @param {string} password - 비밀번호
 * @param {Object} [options] - 옵션
 * @param {number} [options.minLength=1] - 최소 길이
 * @returns {ValidationResult}
 */
export function validatePassword(password, options = {}) {
  const { minLength = 1 } = options;

  if (!password || password.length < minLength) {
    return {
      valid: false,
      message: MESSAGES.EXPORT.PASSWORD_REQUIRED
    };
  }

  return { valid: true };
}

/**
 * 파일 선택 여부 검사
 * @param {Array|Object} files - 파일 목록 또는 파일 객체
 * @returns {ValidationResult}
 */
export function validateFileSelection(files) {
  const fileArray = Array.isArray(files) ? files : [files];
  
  if (!fileArray.length || !fileArray[0]) {
    return {
      valid: false,
      message: MESSAGES.FILE.SELECT_FIRST
    };
  }

  return { valid: true };
}

/**
 * 객체 선택 여부 검사
 * @param {Array} objects - 객체 목록
 * @returns {ValidationResult}
 */
export function validateObjectSelection(objects) {
  if (!objects || !objects.length) {
    return {
      valid: false,
      message: MESSAGES.DETECTION.NO_SELECTION
    };
  }

  return { valid: true };
}

/**
 * 이메일 형식 검사
 * @param {string} email - 이메일 주소
 * @returns {ValidationResult}
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email || !emailRegex.test(email)) {
    return {
      valid: false,
      message: '유효한 이메일 주소를 입력해주세요.'
    };
  }

  return { valid: true };
}

/**
 * 숫자 범위 검사
 * @param {number|string} value - 검사할 값
 * @param {number} min - 최소값
 * @param {number} max - 최대값
 * @param {string} [fieldName='값'] - 필드명
 * @returns {ValidationResult}
 */
export function validateNumberRange(value, min, max, fieldName = '값') {
  const num = Number(value);

  if (isNaN(num)) {
    return {
      valid: false,
      message: `${fieldName}은(는) 숫자여야 합니다.`
    };
  }

  if (num < min || num > max) {
    return {
      valid: false,
      message: `${fieldName}은(는) ${min}에서 ${max} 사이의 값을 입력해주세요.`
    };
  }

  return { valid: true };
}

/**
 * 필수 값 검사
 * @param {any} value - 검사할 값
 * @param {string} fieldName - 필드명
 * @returns {ValidationResult}
 */
export function validateRequired(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return {
      valid: false,
      message: `${fieldName}은(는) 필수 입력값입니다.`
    };
  }

  return { valid: true };
}

/**
 * 문자열 길이 검사
 * @param {string} value - 검사할 문자열
 * @param {number} maxLength - 최대 길이
 * @param {string} [fieldName='값'] - 필드명
 * @returns {ValidationResult}
 */
export function validateMaxLength(value, maxLength, fieldName = '값') {
  if (!value || value.length > maxLength) {
    return {
      valid: false,
      message: `${fieldName}은(는) ${maxLength}자 이하여야 합니다.`
    };
  }

  return { valid: true };
}

/**
 * 여러 검증 실행
 * @param {Array<{validate: Function, args: Array}>} validations - 검증 함수 목록
 * @returns {ValidationResult}
 * 
 * @example
 * const result = validateAll([
 *   { validate: validateRequired, args: [name, '이름'] },
 *   { validate: validateEmail, args: [email] },
 * ]);
 */
export function validateAll(validations) {
  for (const { validate, args } of validations) {
    const result = validate(...args);
    if (!result.valid) {
      return result;
    }
  }
  
  return { valid: true };
}

/**
 * 검증 결과 처리 헬퍼
 * @param {ValidationResult} result - 검증 결과
 * @param {Function} [onError] - 에러 발생 시 콜백
 * @returns {boolean} 유효성 여부
 * 
 * @example
 * if (!handleValidation(validateFrameRange(start, end), showMessage)) {
 *   return; // 검증 실패 시 함수 종료
 * }
 */
export function handleValidation(result, onError) {
  if (!result.valid) {
    if (onError) {
      onError(result.message);
    }
    return false;
  }
  return true;
}
