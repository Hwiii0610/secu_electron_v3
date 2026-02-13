/**
 * 탐지 관리 컴포저블
 *
 * App.vue의 객체 탐지, 탐지 데이터 로드/저장 로직을 통합합니다.
 *
 * @param {Object} deps
 * @param {Function} deps.getStores - () => { file, video, detection, mode, config }
 * @param {Function} deps.getVideo - () => HTMLVideoElement
 * @param {Function} deps.getVideoDir - () => string
 * @param {Function} deps.drawBoundingBoxes - () => void (VideoCanvas ref)
 */

import apiPython from '../apiRequest';
import config from '../resources/config.json';
import { createProgressPoller, pollAsPromise } from './progressPoller';
import {
  showMessage, showError,
  showDetectionCompleted, showDetectionFailed,
  normalizeFilePath, convertMaskingEntries,
  formatTime, MESSAGES
} from '../utils';

export function createDetectionManager(deps) {
  const { getStores, getVideo, getVideoDir, drawBoundingBoxes } = deps;

  // 내부 폴러 참조
  let _selectDetectionPoller = null;
  let _detectionPoller = null;
  let _lastReloadTime = 0;

  // ─── 탐지 데이터 유효성 검사 ──────────────────

  function validateCSVForExport() {
    const { file: fileStore, detection } = getStores();
    const selected = fileStore.files[fileStore.selectedFileIndex];
    if (!selected || !selected.name) {
      return { valid: false, message: '선택된 영상이 없습니다.' };
    }

    if (!detection.maskingLogs || detection.maskingLogs.length === 0) {
      return {
        valid: false,
        message: '원본 영상은 내보내기를 진행할 수 없습니다.\n먼저 반출(탐지) 작업을 완료한 뒤, 내보내기를 진행해주세요.'
      };
    }

    return {
      valid: true,
      message: `검증 완료: ${detection.maskingLogs.length}개의 탐지 데이터가 있습니다.`
    };
  }

  // ─── 탐지 데이터 로드 ─────────────────────────

  async function loadDetectionData(force = false) {
    const { file: fileStore, detection } = getStores();
    try {
      const selected = fileStore.files[fileStore.selectedFileIndex];
      if (!selected || !selected.name) {
        showMessage(MESSAGES.DETECTION.SELECT_VIDEO_FIRST);
        return;
      }

      const videoName = selected.name;
      const videoPath =
        (typeof selected.file === 'string' && selected.file) ||
        normalizeFilePath(selected.url) ||
        videoName;

      // 이미 현재 비디오의 데이터가 로드되어 있으면 스킵 (force=true이면 강제 리로드)
      if (!force && detection.dataLoaded && detection.maskingLogs.length > 0) {
        if (detection.maskingLogsMap && Object.keys(detection.maskingLogsMap).length > 0) {
          console.log('[탐지데이터] 이미 로드된 데이터가 있습니다. 스킵합니다.');
          return;
        }
      }

      const result = await window.electronAPI.loadJson({
        VideoName: videoName,
        VideoPath: videoPath,
        VideoDir: getVideoDir(),
      });

      if (!result) {
        detection.maskingLogs = [];
        detection.maskingLogsMap = {};
        detection.dataLoaded = false;
        return;
      }

      detection.maskingLogs = [];
      detection.maskingLogsMap = {};

      if (result.format === 'json') {
        const frames = result.data.frames || {};
        for (const [frameKey, entries] of Object.entries(frames)) {
          const frameNum = Number(frameKey);
          detection.maskingLogsMap[frameNum] = [];
          for (const entry of entries) {
            const logEntry = {
              frame: frameNum,
              track_id: entry.track_id,
              bbox: entry.bbox,
              bbox_type: entry.bbox_type || 'rect',
              score: entry.score,
              class_id: entry.class_id,
              type: entry.type,
              object: entry.object,
            };
            detection.maskingLogs.push(logEntry);
            detection.maskingLogsMap[frameNum].push(logEntry);
          }
        }
      } else {
        parseCSVLegacy(result.data);
      }

      console.log('maskingLogs:', detection.maskingLogs.length, 'entries');
      detection.dataLoaded = true;

      // 탐지 중이면 사용자 변경값(HashMap) 복원
      if (detection.isDetecting && Object.keys(detection.userObjectOverrides).length > 0) {
        for (const log of detection.maskingLogs) {
          const key = `${log.track_id}_${log.frame}`;
          if (key in detection.userObjectOverrides) {
            log.object = detection.userObjectOverrides[key];
          }
        }
      }
    } catch (error) {
      console.log('탐지 데이터 로드 실패:', error.message);
    }
  }

  function parseCSVLegacy(csvText) {
    const { detection } = getStores();
    const lines = csvText.split('\n').filter(l => l.trim());
    for (let i = 1; i < lines.length; i++) {
      const match = lines[i].match(/^(\d+),([^,]*),("?\[.*?\]"?),([^,]*),([^,]*),([^,]*),(.*)$/);
      if (match) {
        const frameNum = Number(match[1]);
        const entry = {
          frame: frameNum,
          track_id: match[2],
          bbox: match[3].replace(/^"|"$/g, ''),
          score: match[4] || null,
          class_id: match[5] || null,
          type: match[6] ? Number(match[6]) : null,
          object: match[7] ? Number(match[7]) : 1,
        };
        detection.maskingLogs.push(entry);
        if (!detection.maskingLogsMap[frameNum]) detection.maskingLogsMap[frameNum] = [];
        detection.maskingLogsMap[frameNum].push(entry);
      }
    }
  }

  // ─── 탐지 데이터 저장 ─────────────────────────

  async function exportDetectionData() {
    const { file: fileStore, detection } = getStores();
    if (detection.dataLoaded) {
      console.log('데이터가 이미 로드된 상태이므로 저장을 생략합니다.');
      return;
    }
    const selectedFile = fileStore.files[fileStore.selectedFileIndex];
    const videoName = selectedFile?.name || 'default.mp4';

    const maskingData = detection.maskingLogs.map(log => ({
      frame: log.frame ?? 0,
      track_id: log.track_id ?? '',
      bbox: typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox,
      bbox_type: log.bbox_type || (Array.isArray(log.bbox) && Array.isArray(log.bbox[0]) ? 'polygon' : 'rect'),
      score: log.score ?? null,
      class_id: log.class_id ?? null,
      type: log.type ?? 4,
      object: log.object ?? 1
    }));

    try {
      const result = await window.electronAPI.updateFilteredJson({
        videoName: videoName,
        data: maskingData
      });
      console.log('JSON 저장 성공:', result);
    } catch (error) {
      console.error('JSON 저장 오류:', error.message);
      showError(MESSAGES.SAVE.ERROR(error.message));
    }
  }

  // ─── 자동 객체 탐지 ───────────────────────────

  async function autoObjectDetection() {
    const { file: fileStore, video: videoStore, detection, mode } = getStores();
    const video = getVideo();
    try {
      if (fileStore.selectedFileIndex < 0) {
        showMessage(MESSAGES.DETECTION.SELECT_VIDEO_FIRST);
        return;
      }

      video.pause();
      videoStore.videoPlaying = false;

      const selectedFile = fileStore.files[fileStore.selectedFileIndex];

      const response = await apiPython.post(`${config.autodetect}`, {
        VideoPath: selectedFile.name,
        Event: '1'
      });

      if (!response) {
        throw new Error('자동 객체 탐지 실패');
      }

      const jobId = response.data.job_id;
      if (!jobId) throw new Error('job_id 누락됨');

      detection.detectionProgress = 0;
      detection.isDetecting = true;
      detection.detectionEventType = '1';
      detection.userObjectOverrides = {};
      _lastReloadTime = 0;

      _detectionPoller = createProgressPoller({
        onProgress: (data) => {
          detection.detectionProgress = Math.floor(data.progress);

          // 1초마다 탐지 데이터 리로드 (증분 JSON 반영)
          const now = Date.now();
          if (now - _lastReloadTime >= 1000) {
            _lastReloadTime = now;
            loadDetectionData(true).then(() => {
              if (drawBoundingBoxes) drawBoundingBoxes();
              // 데이터 로드됐으면 캔버스 상호작용 활성화 (호버/클릭)
              if (detection.dataLoaded) {
                mode.selectMode = true;
              }
            });
          }
        },
        onComplete: (data) => {
          const hasOverrides = Object.keys(detection.userObjectOverrides).length > 0;
          detection.isDetecting = false;
          detection.detectionProgress = 0;
          detection.detectionEventType = '';
          if (data.error) {
            console.error('서버에서 에러 응답:', data.error);
            detection.userObjectOverrides = {};
            showError(MESSAGES.DETECTION.ERROR_OCCURRED(data.error));
            return;
          }
          mode.currentMode = '';
          mode.selectMode = true;

          // 최종 데이터 로드 후 강제 렌더링
          loadDetectionData(true).then(() => {
            // 사용자 변경값이 있으면 최종 적용 후 디스크 동기화
            if (hasOverrides) {
              for (const log of detection.maskingLogs) {
                const key = `${log.track_id}_${log.frame}`;
                if (key in detection.userObjectOverrides) {
                  log.object = detection.userObjectOverrides[key];
                }
              }
              const videoName = fileStore.files[fileStore.selectedFileIndex]?.name || 'unknown.mp4';
              window.electronAPI.updateFilteredJson({
                videoName,
                data: JSON.parse(JSON.stringify(detection.maskingLogs))
              }).catch(err => console.error('최종 동기화 오류:', err));
              detection.userObjectOverrides = {};
            }

            if (drawBoundingBoxes) {
              drawBoundingBoxes();
              console.log('[자동객체탐지] 데이터 로드 완료, 바운딩박스 갱신');
            }
          });
        },
        onError: (err) => {
          console.error('진행 상황 조회 오류:', err);
          detection.isDetecting = false;
          detection.detectionProgress = 0;
          detection.detectionEventType = '';
          showError(err, MESSAGES.DETECTION.ERROR_OCCURRED(''));
        }
      });
      _detectionPoller.start(jobId);

    } catch (error) {
      console.error('자동 객체 탐지 실패:', error);
      showDetectionFailed(error, 'auto');
    }
  }

  async function executeMultiAutoDetection() {
    const { file: fileStore, video: videoStore, detection, mode } = getStores();
    const video = getVideo();

    video.pause();
    videoStore.videoPlaying = false;
    fileStore.fileProgressMap = {};

    const selectedFiles = fileStore.files.filter(
      (_, index) => detection.autoDetectionSelections[index]
    );

    const { config: configStore } = getStores();
    const CONCURRENCY_LIMIT = Number(configStore.allConfig?.detect?.concurrency_limit) ?? 3;

    const processWithLimit = async (files, limit) => {
      const results = [];
      const executing = new Set();

      for (const file of files) {
        const promise = performAutoDetectionForFile(file, true)
          .catch(err => console.error(`파일 처리 실패: ${file.name}`, err));

        executing.add(promise);
        results.push(promise);
        promise.finally(() => executing.delete(promise));

        if (executing.size >= limit) {
          await Promise.race(executing);
        }
      }

      return Promise.allSettled(results);
    };

    await processWithLimit(selectedFiles, CONCURRENCY_LIMIT);

    setTimeout(() => {
      mode.currentMode = '';
      detection.showMultiAutoDetectionModal = false;
      loadDetectionData();
    }, 1000);
  }

  async function performAutoDetectionForFile(file, isMulti = false) {
    const { file: fileStore } = getStores();
    try {
      fileStore.fileProgressMap[file.name] = 0;

      const response = await apiPython.post(`${config.autodetect}`, {
        VideoPath: isMulti ? file.file : file.name,
        Event: '1'
      });

      if (!response) {
        throw new Error('자동 객체 탐지 실패');
      }

      const jobId = response.data.job_id;

      return pollAsPromise(jobId, {
        onProgress: (data) => {
          fileStore.fileProgressMap[file.name] = Math.floor(data.progress);
        },
        onError: () => {
          fileStore.fileProgressMap[file.name] = -1;
        }
      });
    } catch (error) {
      console.error(`자동 객체 탐지 오류 (${file.name}):`, error);
      fileStore.fileProgressMap[file.name] = -1;
      throw error;
    }
  }

  // ─── 선택 객체 탐지 ───────────────────────────

  async function handleObjectDetect(payload) {
    const { file: fileStore, video: videoStore, detection, mode } = getStores();
    const video = getVideo();
    const { x, y, frame, videoName } = payload;

    if (detection.hasSelectedDetection) {
      showMessage(MESSAGES.DETECTION.ALREADY_EXECUTED);
      return;
    }

    video.pause();
    videoStore.videoPlaying = false;
    detection.hasSelectedDetection = true;

    try {
      const postRes = await apiPython.post(`${config.autodetect}`, {
        Event: '2',
        VideoPath: fileStore.files[fileStore.selectedFileIndex].name,
        FrameNo: String(frame),
        Coordinate: `${x},${y}`
      });

      const jobId = postRes.data.job_id;

      _lastReloadTime = 0;

      _selectDetectionPoller = createProgressPoller({
        onProgress: (data) => {
          detection.detectionProgress = Math.floor(data.progress);

          // 1초마다 탐지 데이터 리로드 (증분 JSON 반영)
          const now = Date.now();
          if (now - _lastReloadTime >= 1000) {
            _lastReloadTime = now;
            loadDetectionData(true).then(() => {
              if (drawBoundingBoxes) drawBoundingBoxes();
              // 데이터 로드됐으면 캔버스 상호작용 활성화 (호버/클릭)
              if (detection.dataLoaded) {
                mode.selectMode = true;
              }
            });
          }
        },
        onComplete: async () => {
          const hasOverrides = Object.keys(detection.userObjectOverrides).length > 0;
          detection.isDetecting = false;
          detection.detectionProgress = 0;
          detection.detectionEventType = '';
          await loadDetectionData(true);

          // 사용자 변경값이 있으면 최종 적용 후 디스크 동기화
          if (hasOverrides) {
            for (const log of detection.maskingLogs) {
              const key = `${log.track_id}_${log.frame}`;
              if (key in detection.userObjectOverrides) {
                log.object = detection.userObjectOverrides[key];
              }
            }
            const videoName = fileStore.files[fileStore.selectedFileIndex]?.name || 'unknown.mp4';
            window.electronAPI.updateFilteredJson({
              videoName,
              data: JSON.parse(JSON.stringify(detection.maskingLogs))
            }).catch(err => console.error('최종 동기화 오류:', err));
            detection.userObjectOverrides = {};
          }

          mode.selectMode = true;
          drawBoundingBoxes();
          showDetectionCompleted('select');
          _selectDetectionPoller = null;
        },
        onError: (error) => {
          detection.isDetecting = false;
          detection.detectionProgress = 0;
          detection.detectionEventType = '';
          showDetectionFailed(error, 'select');
          _selectDetectionPoller = null;
        }
      }, { useInterval: false });

      detection.isDetecting = true;
      detection.detectionEventType = '2';
      detection.userObjectOverrides = {};
      _selectDetectionPoller.start(jobId);
    } catch (err) {
      console.error('선택객체탐지 API 에러:', err);
      showDetectionFailed(err, 'select');
    }
  }

  // ─── 유틸리티 ─────────────────────────────────

  function toggleAllAutoDetectionSelection() {
    const { detection, file: fileStore } = getStores();
    const newValue = !detection.allAutoDetectionSelected;
    detection.autoDetectionSelections = fileStore.files.map(() => newValue);
  }

  function resetSelectionDetection() {
    const { detection } = getStores();
    detection.hasSelectedDetection = false;
  }

  return {
    validateCSVForExport,
    loadDetectionData,
    parseCSVLegacy,
    exportDetectionData,
    autoObjectDetection,
    executeMultiAutoDetection,
    performAutoDetectionForFile,
    handleObjectDetect,
    toggleAllAutoDetectionSelection,
    resetSelectionDetection,
  };
}
