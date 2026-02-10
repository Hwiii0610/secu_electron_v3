/**
 * 메시지 표시 유틸리티
 * 
 * 일관된 방식으로 사용자에게 메시지를 표시합니다.
 * window.electronAPI.showMessage 래퍼 및 상수 메시지를 제공합니다.
 */

/**
 * 기본 메시지 표시 함수
 * @param {string} message - 표시할 메시지
 */
export function showMessage(message) {
  if (window.electronAPI?.showMessage) {
    window.electronAPI.showMessage(message);
  } else {
    console.log('[Message]', message);
  }
}

/**
 * 성공 메시지 표시
 * @param {string} message - 성공 메시지
 */
export function showSuccess(message) {
  showMessage(message);
}

/**
 * 에러 메시지 표시
 * @param {string|Error} error - 에러 객체 또는 메시지
 * @param {string} [prefix] - 접두사 (예: '작업 실패: ')
 */
export function showError(error, prefix = '') {
  const message = error?.message || error || '알 수 없는 오류';
  showMessage(prefix + message);
}

/**
 * 경고 메시지 표시
 * @param {string} message - 경고 메시지
 */
export function showWarning(message) {
  showMessage(message);
}

// ============================================
// 상수 메시지 정의
// ============================================

export const MESSAGES = {
  // 설정 관련
  SETTINGS: {
    SAVED: '설정을 저장했습니다.',
    DETECTION_CHANGED: '객체 탐지 설정이 변경되었습니다. 재시작 시 설정이 적용됩니다.',
    LOAD_FAILED: '설정 파일을 불러 올 수 없습니다. 관리자에게 문의해 주세요.',
    SAVE_FAILED: (err) => `설정 저장에 실패했습니다: ${err}`,
  },

  // 워터마크 관련
  WATERMARK: {
    TEXT_OR_IMAGE_REQUIRED: '워터마크를 사용하려면 텍스트나 이미지 중 하나는 필수입니다.',
    IMAGE_REGISTERED: '워터마크 이미지가 등록되었습니다.',
    IMAGE_DELETED: '워터마크 이미지가 삭제되었습니다.',
    IMAGE_PROCESS_FAILED: (err) => `워터마크 이미지 처리에 실패했습니다: ${err}`,
    IMAGE_DELETE_FAILED: (err) => `워터마크 이미지 삭제에 실패했습니다: ${err}`,
    SELECT_FAILED: (err) => `파일 선택에 실패했습니다: ${err}`,
  },

  // 객체 탐지 관련
  DETECTION: {
    ALREADY_EXECUTED: '이미 선택 객체 탐지를 실행했습니다.',
    SELECT_COMPLETED: '선택 객체 탐지가 완료되었습니다.',
    AUTO_COMPLETED: '자동 객체 탐지가 완료되었습니다.',
    SELECT_FAILED: (err) => `선택 객체 탐지 실패: ${err}`,
    AUTO_FAILED: (err) => `자동 객체 탐지 실패: ${err}`,
    ERROR_OCCURRED: (err) => `객체 탐지 중 오류 발생: ${err}`,
    NO_SELECTION: '선택된 객체가 없습니다.',
    SELECT_VIDEO_FIRST: '먼저 영상을 선택해주세요.',
    STATUS_CHANGED: (count) => `${count}개 객체의 상태가 변경되었습니다.`,
    OBJECT_NOT_FOUND: '변경할 객체를 찾을 수 없습니다.',
  },

  // 마스킹 관련
  MASKING: {
    ALL_ENABLED: (type) => `전체 마스킹을 설정합니다 (${type})`,
    ALL_DISABLED: '전체 마스킹을 해제합니다',
    DELETED: (count, trackId) => `${count}개의 객체가 삭제되었습니다. (track_id: ${trackId})`,
    DELETE_FAILED: '삭제할 객체를 찾을 수 없습니다.',
    DELETE_ERROR: '객체 삭제 중 오류가 발생했습니다.',
    NO_DATA: '삭제할 객체가 없습니다.',
    BATCH_SYNC_FAILED: (err) => `배치 마스킹 동기화 실패: ${err}`,
  },

  // 파일 관련
  FILE: {
    NO_FILES_IN_FOLDER: '선택한 폸더에 영상 파일이 없습니다.',
    SELECT_FIRST: '영상 파일을 선택해주세요.',
    COPY_ERROR: (err) => `파일 복사 중 오류가 발생했습니다: ${err}`,
    FOLDER_SELECT_ERROR: (err) => `평더 선택 중 오류가 발생했습니다: ${err}`,
    CONVERT_ERROR: (err) => `파일 변환 중 오류가 발생했습니다: ${err}`,
  },

  // 낳�내기 관련
  EXPORT: {
    NO_ORIGINAL: '원본 영상은 낳�내기를 진행할 수 없습니다.\n먼저 반출(탐지) 작업을 완료한 뒤, 낳�내기를 진행해주세요.',
    PASSWORD_REQUIRED: '암호화 파일저장을 위해서는 재생암호를 입력해주세요.',
    ENCRYPT_FAILED: (res) => `암호화 처리 실패: ${res || '원인 불명'}`,
    REQUEST_FAILED: (err) => `낳�내기 요청 실패: ${err}`,
    ERROR: (err) => `낳�내기 중 오류 발생: ${err}`,
    POLLING_ERROR: (err) => `폴리 중 오류: ${err}`,
  },

  // 구간 편집 관련
  EDIT: {
    NO_FILE_SELECTED: '선택된 파일이 없습니다.',
    TRIM_ERROR: (err) => `자르기 오류: ${err}`,
    NO_CROPPED_FILES: '구간 편집 할 자른 파일이 없습니다. 먼저 자르기 작업을 진행해주세요.',
    MERGE_COMPLETED: (fileName) => `구간 편집 완료: ${fileName}`,
    MERGE_ERROR: (err) => `구간 편집 실행 중 오류가 발생했습니다: ${err}`,
  },

  // 일괄 처리 관련
  BATCH: {
    COMPLETED: '일괄처리가 완료되었습니다.',
    ERROR: (err) => `일괄처리 중 오류 발생: ${err}`,
    PROCESS_ERROR: (err) => `일괄처리 오류: ${err}`,
  },

  // 검증 관련
  VALIDATION: {
    INVALID_OBJECT_TYPE: (msg) => msg,
    FRAME_REQUIRED: '시작 프레임과 끝 프레임을 모두 입력해주세요.',
    FRAME_MIN_ZERO: '시작 프레임은 0 이상이어야 합니다.',
    FRAME_MAX: (max) => `끝 프레임은 최대 ${max} 프레임까지 입력 가능합니다.`,
    FRAME_START_END: '시작 프레임은 끝 프레임보다 작아야 합니다.',
  },

  // 저장 관련
  SAVE: {
    ERROR: (err) => `저장 중 오류가 발생했습니다: ${err}`,
    MASKING_EXPORT_ERROR: (err) => `마스킹 낳�내기 데이터 저장 오류: ${err}`,
  },
};

// ============================================
// 편의 함수
// ============================================

/**
 * 설정 저장 성공 메시지
 */
export function showSettingsSaved() {
  showMessage(MESSAGES.SETTINGS.SAVED);
}

/**
 * 설정 저장 실패 메시지
 * @param {Error} err
 */
export function showSettingsSaveFailed(err) {
  showError(MESSAGES.SETTINGS.SAVE_FAILED(err));
}

/**
 * 객체 탐지 완료 메시지
 * @param {string} type - 'select' | 'auto'
 */
export function showDetectionCompleted(type = 'auto') {
  const msg = type === 'select' 
    ? MESSAGES.DETECTION.SELECT_COMPLETED 
    : MESSAGES.DETECTION.AUTO_COMPLETED;
  showSuccess(msg);
}

/**
 * 객체 탐지 실패 메시지
 * @param {Error} err
 * @param {string} type - 'select' | 'auto'
 */
export function showDetectionFailed(err, type = 'auto') {
  const msg = type === 'select'
    ? MESSAGES.DETECTION.SELECT_FAILED(err)
    : MESSAGES.DETECTION.AUTO_FAILED(err);
  showError(msg);
}

/**
 * 파일 변환 에러 메시지
 * @param {Error} err
 */
export function showConvertError(err) {
  showError(MESSAGES.FILE.CONVERT_ERROR(err));
}

/**
 * 낳�내기 에러 메시지
 * @param {Error} err
 */
export function showExportError(err) {
  showError(MESSAGES.EXPORT.ERROR(err));
}

/**
 * 일괄 처리 완료 메시지
 */
export function showBatchCompleted() {
  showSuccess(MESSAGES.BATCH.COMPLETED);
}

/**
 * 일괄 처리 에러 메시지
 * @param {Error} err
 */
export function showBatchError(err) {
  showError(MESSAGES.BATCH.ERROR(err));
}
