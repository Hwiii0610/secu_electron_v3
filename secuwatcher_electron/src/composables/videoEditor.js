/**
 * 비디오 편집 컴포저블
 *
 * App.vue의 트림, 머지, 마커 드래그 등 비디오 편집 관련 로직을 통합합니다.
 *
 * @param {Object} deps
 * @param {Function} deps.getStores    - () => { video, file }
 * @param {Function} deps.getVideo     - () => HTMLVideoElement
 * @param {Function} deps.getCallbacks - () => { selectFile, formatFileSize, analyzeVideoInfo }
 * @param {Function} deps.getAppLocals - () => { showMergeModal, mergeSelections, allSelected, isProcessing, processingMessage }
 * @param {Function} deps.setAppLocal  - (key, val) => void
 * @param {Function} deps.getSliderEl  - () => HTMLElement  (.slider-container)
 */

import {
  showMessage, showError, normalizeFilePath, MESSAGES
} from '../utils';

export function createVideoEditor(deps) {
  const { getStores, getVideo, getCallbacks, getAppLocals, setAppLocal, getSliderEl } = deps;

  // ─── 트림 (자르기) ─────────────────────────────

  async function trimVideo() {
    const video = getVideo();
    if (!video) return;

    const { video: videoStore, file: fileStore } = getStores();
    if (videoStore.trimStartTime >= videoStore.trimEndTime) {
      console.error('잘못된 자르기 범위입니다. 시작점은 끝점보다 작아야 합니다.');
      return;
    }

    const selectedFile = fileStore.files[fileStore.selectedFileIndex];
    if (!selectedFile) {
      showMessage(MESSAGES.EDIT.NO_FILE_SELECTED);
      return;
    }

    if (!confirm('자르시겠습니까?')) return;

    setAppLocal('isProcessing', true);
    setAppLocal('processingMessage', '비디오를 자르는 중입니다.');

    try {
      const data = await window.electronAPI.trimVideo({
        videoName: selectedFile.name,
        startTime: videoStore.trimStartTime,
        endTime: videoStore.trimEndTime
      });

      if (!fileStore.currentTimeFolder) {
        fileStore.currentTimeFolder = data.timeFolder;
      }

      const { formatFileSize } = getCallbacks();
      fileStore.sessionCroppedFiles.push({
        name: data.fileName,
        size: formatFileSize(data.fileSize),
        filePath: data.filePath,
        timeFolder: data.timeFolder
      });
    } catch (error) {
      console.error('자르기 실행 중 오류 발생:', error);
      showError(error, MESSAGES.EDIT.TRIM_ERROR('').replace(/:.*/, ': '));
    } finally {
      setAppLocal('isProcessing', false);
    }
  }

  // ─── 머지 (합치기) ─────────────────────────────

  function mergeVideo() {
    const { file: fileStore } = getStores();
    if (fileStore.sessionCroppedFiles.length === 0) {
      showMessage(MESSAGES.EDIT.NO_CROPPED_FILES);
      return;
    }
    setAppLocal('showMergeModal', true);
    setAppLocal('mergeSelections', fileStore.sessionCroppedFiles.map(() => false));
  }

  async function executeMerge() {
    const { file: fileStore } = getStores();
    const locals = getAppLocals();

    try {
      const selectedFiles = fileStore.sessionCroppedFiles.filter(
        (_, index) => locals.mergeSelections[index]
      );

      setAppLocal('isProcessing', true);
      setAppLocal('processingMessage', '구간 편집 중입니다...');

      try {
        const data = await window.electronAPI.mergeVideos({
          filePaths: selectedFiles.map(file => file.filePath)
        });

        const baseDirWin = normalizeFilePath(fileStore.dirConfig.videoDir || '');
        const absolutePath = data.absolutePath
          ? normalizeFilePath(data.absolutePath)
          : `${baseDirWin}/${data.fileName}`;

        const { formatFileSize, selectFile, analyzeVideoInfo } = getCallbacks();

        const newFile = {
          name: data.fileName,
          size: formatFileSize(data.fileSize),
          url: absolutePath,
          isServerFile: true,
          duration: '분석 중...',
          resolution: '분석 중...',
          frameRate: '분석 중...',
          totalFrames: '분석 중...',
        };

        fileStore.files.push(newFile);
        const newIndex = fileStore.files.length - 1;

        selectFile(newIndex);
        analyzeVideoInfo(newIndex, absolutePath);

        setAppLocal('showMergeModal', false);
        setAppLocal('allSelected', false);

        showMessage(MESSAGES.EDIT.MERGE_COMPLETED(data.fileName));
      } catch (error) {
        console.error('합치기 실행 중 오류 발생:', error);
        showError(error, MESSAGES.EDIT.MERGE_ERROR('').replace(/:.*/, ': '));
      }
    } finally {
      setAppLocal('isProcessing', false);
    }
  }

  // ─── 모달 / 세션 제어 ─────────────────────────

  function closeMergeModal() {
    setAppLocal('showMergeModal', false);
    setAppLocal('allSelected', false);
  }

  function toggleSelectAll() {
    const { file: fileStore } = getStores();
    const locals = getAppLocals();
    const newValue = !locals.allSelected;
    setAppLocal('mergeSelections', fileStore.sessionCroppedFiles.map(() => newValue));
    setAppLocal('allSelected', newValue);
  }

  function updateAllSelected() {
    const locals = getAppLocals();
    setAppLocal('allSelected', locals.mergeSelections.every(s => s));
  }

  function startNewSession() {
    const { file: fileStore } = getStores();
    fileStore.currentTimeFolder = null;
    fileStore.sessionCroppedFiles = [];
  }

  // ─── 트림 마커 드래그 ─────────────────────────

  function onMarkerMouseDown(markerType, event) {
    event.preventDefault();
    const { video: videoStore } = getStores();
    videoStore.trimDragging = markerType;
  }

  function onMarkerMouseMove(event) {
    const { video: videoStore } = getStores();
    if (!videoStore.trimDragging || !videoStore.videoDuration) return;

    const sliderEl = getSliderEl();
    if (!sliderEl) return;

    const sliderRect = sliderEl.getBoundingClientRect();
    let posX = event.clientX - sliderRect.left;
    posX = Math.max(0, Math.min(posX, sliderRect.width));
    const newTime = (posX / sliderRect.width) * videoStore.videoDuration;

    if (videoStore.trimDragging === 'start') {
      videoStore.trimStartTime = Math.min(newTime, videoStore.trimEndTime - 0.1);
    } else if (videoStore.trimDragging === 'end') {
      videoStore.trimEndTime = Math.max(newTime, videoStore.trimStartTime + 0.1);
    }
  }

  function onMarkerMouseUp() {
    const { video: videoStore } = getStores();
    videoStore.trimDragging = null;
  }

  // ─── 공개 API ──────────────────────────────────

  return {
    trimVideo,
    mergeVideo,
    executeMerge,
    closeMergeModal,
    toggleSelectAll,
    updateAllSelected,
    startNewSession,
    onMarkerMouseDown,
    onMarkerMouseMove,
    onMarkerMouseUp,
  };
}
