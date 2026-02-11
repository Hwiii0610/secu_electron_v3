/**
 * 내보내기 관리 컴포저블
 *
 * App.vue의 내보내기, 암호화, 일괄처리 로직을 통합합니다.
 *
 * @param {Object} deps
 * @param {Function} deps.getStores - () => { file, video, detection, mode, config, export: exportStore }
 * @param {Function} deps.getVideo - () => HTMLVideoElement
 * @param {Function} deps.getCallbacks - () => { validateCSVForExport, getMaskingRangeValue, loadDetectionData, copyJsonWithExport }
 * @param {Function} deps.getRefs - () => { progressBar2, progressLabel2 }
 */

import apiPython from '../apiRequest';
import config from '../resources/config.json';
import { createProgressPoller, createBatchPoller } from './progressPoller';
import {
  showMessage, showError, MESSAGES,
} from '../utils';
import {
  showSettingsSaveFailed, showExportError,
  showBatchCompleted, showBatchError,
} from '../utils/message';

export function createExportManager(deps) {
  const { getStores, getVideo, getCallbacks, getRefs } = deps;

  // 내부 폴러 참조
  let _exportPoller = null;
  let _batchPoller = null;

  // ─── 내보내기 요청 ───────────────────────────

  async function sendExportRequest() {
    const { file: fileStore, video: videoStore, detection, mode, config: configStore, export: exportStore } = getStores();

    // 0) 사전 체크
    if (fileStore.selectedFileIndex < 0) {
      showMessage(MESSAGES.FILE.SELECT_FIRST);
      return;
    }

    // 1) 출력 경로 보정 및 설정 저장
    try {
      if (!fileStore.selectedExportDir || !String(fileStore.selectedExportDir).trim()) {
        try {
          fileStore.selectedExportDir = await window.electronAPI.getDesktopDir();
        } catch {
          fileStore.selectedExportDir = (fileStore.dirConfig?.videoDir || 'C:/Users/Public/Videos');
        }
      }

      // settings에 경로 반영
      configStore.allConfig.path = configStore.allConfig.path || {};

      // DRM 날짜/횟수 반영
      const today = new Date();
      const selectedDate = new Date(configStore.drmInfo.drmExportPeriod);
      const timeDifference = selectedDate.getTime() - today.getTime();
      const daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24));
      configStore.allConfig.export.play_date = daysDifference;
      configStore.allConfig.export.play_count = configStore.drmInfo.drmPlayCount;

      // 설정 저장
      const configToSave = JSON.parse(JSON.stringify(configStore.allConfig));
      await window.electronAPI.saveSettings(configToSave);
    } catch (error) {
      console.error('설정 저장 실패:', error);
      showSettingsSaveFailed(error.message);
    }

    // 2) CSV 검증 (전체마스킹 예외 허용)
    const { validateCSVForExport, getMaskingRangeValue } = getCallbacks();
    const validateResult = validateCSVForExport();
    if (!validateResult.valid && mode.exportAllMasking === 'No') {
      showMessage(validateResult.message);
      mode.currentMode = '';
      exportStore.exporting = false;
      mode.selectMode = true;
      return;
    } else if (!detection.dataLoaded && mode.exportAllMasking === 'No') {
      showMessage("원본 영상은 내보내기를 진행할 수 없습니다.\n먼저 반출(탐지) 작업을 완료한 뒤, 내보내기를 진행해주세요.");
      mode.currentMode = '';
      exportStore.exporting = false;
      mode.selectMode = true;
      return;
    }

    // 3) UI 상태 초기화 + 비디오 일시정지
    const video = getVideo();
    if (video) { video.pause(); videoStore.videoPlaying = false; }
    exportStore.exporting = true;
    exportStore.exportProgress = 0;
    exportStore.exportMessage = "내보내는 중...";
    const refs = getRefs();
    if (refs.progressBar2) refs.progressBar2.style.width = '0%';
    if (refs.progressLabel2) refs.progressLabel2.textContent = '0%';

    let jobId;

    // 4) 분기: 원본파일저장 vs 암호화 파일저장
    if (exportStore.exportFileNormal) {
      // 4-1) 일반 내보내기 요청 (OutputDir 포함)
      try {
        const res = await apiPython.post(`${config.autodetect}`, {
          Event: "3",
          VideoPath: fileStore.files[fileStore.selectedFileIndex].name,
          AllMasking: mode.exportAllMasking,
          OutputDir: fileStore.selectedExportDir,
          maskingrange: getMaskingRangeValue?.()
        });
        if (!res) throw new Error("내보내기 요청 실패");
        jobId = res.data?.job_id;
        if (!jobId) throw new Error("job_id가 없습니다.");
      } catch (err) {
        exportStore.exporting = false;
        showMessage("내보내기 요청 실패: " + err.message);
        return;
      }

      // 4-2) 진행률 폴리
      _startExportPolling(jobId);

    } else {
      // 4-3) 암호화 파일 저장
      const userInfo = { userId: 'test' }; // TODO: 실제 사용자 정보 연동

      if (!exportStore.exportFilePassword) {
        exportStore.exporting = false;
        showMessage(MESSAGES.EXPORT.PASSWORD_REQUIRED);
        return;
      }

      try {
        const response = await window.electronAPI.encryptFile({
          file: fileStore.files[fileStore.selectedFileIndex].name,
          videoPw: exportStore.exportFilePassword,
          userId: userInfo.userId,
          outputDir: fileStore.selectedExportDir
        });

        if (response?.success) {
          jobId = response.data;
          _startExportPolling(jobId, () => { exportStore.exportFilePassword = ''; });
        } else {
          exportStore.exporting = false;
          showMessage(MESSAGES.EXPORT.ENCRYPT_FAILED(response?.data));
        }
      } catch (error) {
        console.error('암호화 요청 오류:', error);
        exportStore.exporting = false;
        showError(error, '암호화 요청 중 오류: ');
      }
    }
  }

  // ─── 내보내기 폴링 헬퍼 ─────────────────────

  function _startExportPolling(jobId, extraOnComplete) {
    const { file: fileStore, mode, export: exportStore } = getStores();

    _exportPoller = createProgressPoller({
      onProgress: (data) => {
        exportStore.exportProgress = Math.floor(data.progress || 0);
        exportStore.exportMessage = `내보내는 중... ${exportStore.exportProgress}%`;
        const refs = getRefs();
        if (refs.progressBar2) {
          refs.progressBar2.style.width = exportStore.exportProgress + '%';
        }
        if (refs.progressLabel2) {
          refs.progressLabel2.textContent = exportStore.exportProgress + '%';
        }
      },
      onComplete: (data) => {
        if (data.error) {
          console.error('서버 에러:', data.error);
          showExportError(data.error);
          exportStore.exporting = false;
          exportStore.exportProgress = 0;
          return;
        }
        exportStore.exportMessage = '내보내기 완료!';
        const { copyJsonWithExport } = getCallbacks();
        copyJsonWithExport(fileStore.files[fileStore.selectedFileIndex].name, fileStore.selectedExportDir);
        mode.currentMode = '';
        mode.selectMode = true;
        exportStore.exporting = false;
        exportStore.exportProgress = 0;
        if (extraOnComplete) extraOnComplete();
      },
      onError: (err) => {
        exportStore.exporting = false;
        showError(err, '폴리 중 오류: ');
      }
    });
    _exportPoller.start(jobId);
  }

  // ─── 비밀번호 검증 ──────────────────────────

  function validatePasswordCharacters(password) {
    const asciiOnly = /^[\x00-\x7F]*$/;
    return asciiOnly.test(password);
  }

  // ─── 일괄처리 ────────────────────────────────

  async function batchProcessing() {
    const { file: fileStore, export: exportStore } = getStores();
    try {
      if (fileStore.files.length === 0) {
        showMessage(MESSAGES.FILE.SELECT_FIRST);
        return;
      }

      exportStore.isBatchProcessing = true;
      exportStore.totalFiles = fileStore.files.length;
      exportStore.currentFileIndex = 0;
      exportStore.currentFileName = '';
      exportStore.phase = 'init';
      exportStore.currentFileProgress = 0;

      const response = await apiPython.post(`${config.batchProcessing}`, {
        VideoPaths: fileStore.files.map(file => file.file)
      });
      exportStore.batchJobId = response.data.job_id;

      startBatchPolling();

    } catch (error) {
      console.error('일괄처리 오류:', error);
      showBatchError(error);
    }
  }

  function startBatchPolling() {
    const { export: exportStore } = getStores();
    const { loadDetectionData } = getCallbacks();

    _batchPoller = createBatchPoller({
      onProgress: (data) => {
        exportStore.currentFileIndex = data.current || 0;
        exportStore.totalFiles = data.total || exportStore.totalFiles;
        exportStore.currentFileName = data.current_video || '';
        exportStore.phase = data.phase || '';
        exportStore.currentFileProgress = data.progress || 0;
      },
      onComplete: () => {
        exportStore.phase = 'complete';
        showBatchCompleted();
        loadDetectionData();
        setTimeout(() => {
          resetBatchState();
        }, 1500);
      },
      onError: (err) => {
        showBatchError(err);
      }
    });
    _batchPoller.start(exportStore.batchJobId);
  }

  function stopBatchPolling() {
    if (_batchPoller) {
      _batchPoller.stop();
      _batchPoller = null;
    }
  }

  function cancelBatchProcessing() {
    resetBatchState();
  }

  function resetBatchState() {
    const { export: exportStore } = getStores();
    exportStore.isBatchProcessing = false;
    exportStore.currentFileIndex = 0;
    exportStore.totalFiles = 0;
    exportStore.currentFileName = '';
    exportStore.phase = '';
    exportStore.currentFileProgress = 0;
    exportStore.batchJobId = null;
    stopBatchPolling();
  }

  return {
    sendExportRequest,
    validatePasswordCharacters,
    batchProcessing,
    startBatchPolling,
    stopBatchPolling,
    cancelBatchProcessing,
    resetBatchState,
  };
}
