/**
 * 통합 다이얼로그 유틸리티
 *
 * Electron IPC 기반의 모든 다이얼로그 호출을 통합 관리합니다.
 * 프론트엔드에서 일관된 방식으로 다이얼로그를 사용할 수 있습니다.
 */

/**
 * 정보 메시지 다이얼로그 표시
 * @param {string} message - 표시할 메시지
 * @returns {Promise<void>}
 */
export async function showAlert(message) {
  if (window.electronAPI?.showMessage) {
    return window.electronAPI.showMessage(message);
  } else {
    console.log('[Alert]', message);
  }
}

/**
 * 확인/취소 다이얼로그 표시
 * @param {string} message - 표시할 메시지
 * @returns {Promise<boolean>} true: 확인, false: 취소
 */
export async function showConfirm(message) {
  if (window.electronAPI?.confirmMessage) {
    return window.electronAPI.confirmMessage(message);
  } else {
    console.log('[Confirm]', message);
    return confirm(message);
  }
}

/**
 * 영역 마스킹 방식 선택 다이얼로그
 * @param {string} message - 표시할 메시지
 * @returns {Promise<number>} 0: 다각형, 1: 사각형, 2: 취소
 */
export async function showAreaMaskingDialog(message) {
  if (window.electronAPI?.areaMaskingMessage) {
    return window.electronAPI.areaMaskingMessage(message);
  } else {
    console.log('[Area Masking]', message);
    return 2; // 취소
  }
}

/**
 * 마스킹 범위 선택 다이얼로그
 * @param {string} message - 표시할 메시지
 * @returns {Promise<number>} 0: 전체, 1: 여기까지, 2: 여기서부터, 3: 여기만, 4: 취소
 */
export async function showMaskingRangeDialog(message) {
  if (window.electronAPI?.maskRangeMessage) {
    return window.electronAPI.maskRangeMessage(message);
  } else {
    console.log('[Mask Range]', message);
    return 4; // 취소
  }
}

/**
 * 동적 버튼을 가진 다이얼로그 표시
 * @param {string} message - 표시할 메시지
 * @param {string[]} buttons - 버튼 텍스트 배열
 * @returns {Promise<number>} 클릭된 버튼의 인덱스
 */
export async function showDynamicDialog(message, buttons) {
  if (window.electronAPI?.dynamicDialog) {
    return window.electronAPI.dynamicDialog({ message, buttons });
  } else {
    console.log('[Dynamic Dialog]', message, buttons);
    // 웹 환경에서는 간단한 prompt 대체
    const result = buttons.findIndex(btn => btn === (prompt(message) || null));
    return result >= 0 ? result : buttons.length - 1;
  }
}

/**
 * 파일 저장 다이얼로그 표시
 * @param {Object} options - 다이얼로그 옵션
 * @returns {Promise<Object>} { filePath, canceled }
 */
export async function showSaveDialog(options) {
  if (window.electronAPI?.showSaveDialog) {
    return window.electronAPI.showSaveDialog(options);
  } else {
    console.log('[Save Dialog]', options);
    throw new Error('Save dialog not available in web environment');
  }
}

/**
 * 파일 열기 다이얼로그 표시
 * @param {Object} options - 다이얼로그 옵션
 * @returns {Promise<Object>} { filePaths, canceled }
 */
export async function showOpenDialog(options) {
  if (window.electronAPI?.showOpenDialog) {
    return window.electronAPI.showOpenDialog(options);
  } else {
    console.log('[Open Dialog]', options);
    throw new Error('Open dialog not available in web environment');
  }
}

/**
 * 비디오 파일 선택 다이얼로그
 * @param {Object} options - 다이얼로그 옵션
 * @returns {Promise<Object>} { filePaths, canceled }
 */
export async function showVideoDialog(options) {
  if (window.electronAPI?.showVideoDialog) {
    return window.electronAPI.showVideoDialog(options);
  } else {
    return showOpenDialog(options);
  }
}

/**
 * 파일/폴더 선택 방식 선택 다이얼로그
 * @returns {Promise<number>} 0: 파일 선택, 1: 폴더 선택, 2: 취소
 */
export async function showSelectionModeDialog() {
  if (window.electronAPI?.showSelectionModeDialog) {
    return window.electronAPI.showSelectionModeDialog();
  } else {
    console.log('[Selection Mode Dialog]');
    return 2; // 취소
  }
}

/**
 * 디렉토리 스캔 (폴더 내 영상 파일 목록)
 * @param {string} folderPath - 스캔할 폴더 경로
 * @returns {Promise<string[]>} 찾은 파일 경로 배열
 */
export async function scanDirectory(folderPath) {
  if (window.electronAPI?.scanDirectory) {
    return window.electronAPI.scanDirectory(folderPath);
  } else {
    console.log('[Scan Directory]', folderPath);
    return [];
  }
}

// 내보내기 관련 API는 message.js에 정의된 showMessage와 일치하도록 통합
// showAlert는 message.showMessage와 동일한 역할을 함
export { showAlert as showMessage };
