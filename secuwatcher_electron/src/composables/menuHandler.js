/**
 * 메뉴 항목 클릭 핸들러 컴포저블
 * 
 * TopMenuBar에서 전송된 메뉴 항목 클릭 이벤트를 처리합니다.
 * 
 * @param {Object} deps
 * @param {Function} deps.getStores - () => { file, detection, mode, video, config, export }
 * @param {Function} deps.getCallbacks - () => { autoObjectDetection, resetSelectionDetection, ... }
 */

import { showMessage, showError, MESSAGES } from '../utils';

export function createMenuHandler(deps) {
  const { getStores, getCallbacks } = deps;

  function handleMenuItemClick(item) {
    const { file, detection, mode, video, config, export: exportStore } = getStores();
    const callbacks = getCallbacks();

    // ─── P0/P1: 탐지 중 차단 ──────────────────────────
    const blockedDuringDetection = [
      '자동객체탐지', '선택객체탐지', '수동 마스킹', '내보내기', '일괄처리'
    ];
    if (blockedDuringDetection.includes(item) && detection.isBusy) {
      showMessage(MESSAGES.DETECTION.BUSY);
      return;
    }

    // ─── P2: 파일 미선택 시 차단 ───────────────────────
    const requiresFile = [
      '자동객체탐지', '선택객체탐지', '수동 마스킹', '전체마스킹', '미리보기', '내보내기'
    ];
    if (requiresFile.includes(item) && file.selectedFileIndex < 0) {
      showMessage(MESSAGES.DETECTION.SELECT_VIDEO_FIRST);
      return;
    }

    // ─── 초기화 ────────────────────────────────────────
    mode.selectMode = false;
    mode.currentMode = '';

    // ─── 메뉴 항목별 처리 ──────────────────────────────
    
    if (item === '불러오기') {
      callbacks.triggerFileInput();
    }
    else if (item === '자동객체탐지') {
      if (config.allConfig.detect.multifiledetect !== 'no') {
        detection.autoDetectionSelections = file.files.map(() => false);
        detection.showMultiAutoDetectionModal = true;
      } else {
        callbacks.autoObjectDetection();
      }
    }
    else if (item === '선택객체탐지') {
      callbacks.resetSelectionDetection();
      mode.currentMode = 'select';
      mode.selectMode = true;
    }
    else if (item === '수동 마스킹') {
      callbacks.openMaskingAreaModal();
    }
    else if (item === '전체마스킹') {
      if (mode.exportAllMasking === 'No') {
        mode.exportAllMasking = 'Yes';
        const typeText = config.allConfig.export.maskingtool === '0' ? '모자이크' : '블러';
        mode.currentMode = '';
        mode.selectMode = true;
        showMessage(MESSAGES.MASKING.ALL_ENABLED(typeText));
      } else {
        mode.exportAllMasking = 'No';
        mode.currentMode = '';
        mode.selectMode = true;
        showMessage(MESSAGES.MASKING.ALL_DISABLED);
      }
    }
    else if (item === '미리보기') {
      mode.isBoxPreviewing = !mode.isBoxPreviewing;
      const msg = mode.isBoxPreviewing ? '미리보기 시작' : '미리보기 중지';
      mode.selectMode = true;
      showMessage(msg);
      callbacks.drawBoundingBoxes();
    }
    else if (item === '내보내기') {
      exportStore.exporting = true;
    }
    else if (item === '일괄처리') {
      callbacks.batchProcessing();
    }
    else if (item === '설정') {
      config.showSettingModal = true;
    }
  }

  return {
    handleMenuItemClick,
  };
}
