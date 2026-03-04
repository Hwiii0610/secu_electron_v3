/**
 * UI 상태 관리 컴포저블
 * 
 * 모달, 토스트, 로딩 상태 등 App.vue의 UI 상태를 통합 관리합니다.
 * 
 * @param {Object} deps
 * @param {Function} deps.getStores - () => { video, file, detection, mode, config, export }
 * @param {Function} deps.getVideo - () => HTMLVideoElement
 */

export function createUIState(deps) {
  const { getStores, getVideo } = deps;

  // ─── 로컬 상태 ────────────────────────────────────
  let _state = {
    isLoading: true,
    isProcessing: false,
    processingMessage: '',
    toastMessage: '',
    toastType: 'info',
    showToast: false,
    showMergeModal: false,
    mergeSelections: [],
    allSelected: false,
    showMaskingAreaModal: false,
  };

  let _toastTimeout = null;

  // ─── 토스트 메시지 ────────────────────────────────
  
  function showToast(message, type = 'info') {
    _state.toastMessage = message;
    _state.toastType = type;
    _state.showToast = true;

    clearTimeout(_toastTimeout);
    _toastTimeout = setTimeout(() => {
      _state.showToast = false;
    }, 3000);
  }

  // ─── 모달 관리 ────────────────────────────────────

  function closeMergeModal() {
    _state.showMergeModal = false;
  }

  function closeMaskingAreaModal() {
    _state.showMaskingAreaModal = false;
  }

  function closeExportingModal() {
    const { export: exportStore } = getStores();
    exportStore.exporting = false;
  }

  function closeMultiAutoDetectionModal() {
    const { detection } = getStores();
    detection.showMultiAutoDetectionModal = false;
  }

  // ─── 진행률/처리 상태 ─────────────────────────────

  function setProcessing(isProcessing, message = '') {
    _state.isProcessing = isProcessing;
    _state.processingMessage = message;
  }

  function setLoading(isLoading) {
    _state.isLoading = isLoading;
  }

  // ─── 마스킹 영역 선택 ─────────────────────────────

  function handleMaskingAreaSelection(selection) {
    const { mode, detection } = getStores();
    const video = getVideo();

    mode.currentMode = 'mask';
    mode.selectMode = true;
    mode.maskMode = selection.modeLabel === 'polygon' ? 'polygon' : 'rectangle';

    if (video) {
      video.pause();
      getStores().video.videoPlaying = false;
    }

    // TODO: 실제 구현에서는 _masking.checkBiggestTrackId() 호출
    // 여기서는 masking composable과의 의존성을 피하기 위해 비워둠

    console.log('[마스킹] 영역 선택 완료:', {
      mode: selection.modeLabel,
      range: selection.rangeLabel,
      modeValue: selection.mode,
      rangeValue: selection.range
    });

    _state.showMaskingAreaModal = false;
  }

  // ─── 비밀번호 표시/숨김 ───────────────────────────

  function togglePasswordVisibility() {
    const { export: exportStore } = getStores();
    exportStore.showPassword = !exportStore.showPassword;
  }

  // ─── 전체 비디오 선택 토글 ────────────────────────

  function toggleSelectAllVideos() {
    const { file } = getStores();
    const allSelected = file.serverVideoList.length > 0 &&
      file.serverVideoList.every(v => v.selected);
    const newState = !allSelected;
    file.serverVideoList.forEach(video => {
      video.selected = newState;
    });
  }

  // ─── 상태 접근 (읽기전용) ─────────────────────────

  function getState() {
    return { ..._state };
  }

  function updateState(key, value) {
    if (key in _state) {
      _state[key] = value;
    }
  }

  // ─── 공개 API ─────────────────────────────────────

  return {
    showToast,
    closeMergeModal,
    closeMaskingAreaModal,
    closeExportingModal,
    closeMultiAutoDetectionModal,
    setProcessing,
    setLoading,
    handleMaskingAreaSelection,
    togglePasswordVisibility,
    toggleSelectAllVideos,
    getState,
    updateState,
  };
}
