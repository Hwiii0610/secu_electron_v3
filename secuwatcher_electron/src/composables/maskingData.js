/**
 * 마스킹 데이터 관리 컴포저블
 *
 * App.vue와 VideoCanvas.vue에서 중복되던 마스킹 CRUD 로직을 통합합니다.
 * 기존 utils/masking.js의 순수 유틸리티를 활용하여 Pinia 스토어 상태를 관리합니다.
 *
 * @example
 * // Options API에서 사용
 * created() {
 *   this._masking = createMaskingDataManager({
 *     getStores: () => ({
 *       detection: useDetectionStore(),
 *       mode: useModeStore(),
 *       file: useFileStore()
 *     }),
 *     getVideo: () => this.video
 *   });
 * }
 */

import { convertMaskingEntries } from '../utils/masking';

/**
 * 마스킹 데이터 관리 팩토리 함수
 *
 * @param {Object} deps - 의존성
 * @param {Function} deps.getStores - () => { detection, mode, file, video } Pinia 스토어 게터
 * @param {Function} deps.getVideo - () => HTMLVideoElement 비디오 엘리먼트 게터
 * @returns {Object} 마스킹 데이터 관리 메서드들
 */
export function createMaskingDataManager(deps) {
  const { getStores, getVideo } = deps;

  /**
   * 마스킹 데이터 로깅 (프레임 범위 지원)
   * 다각형 또는 사각형 마스킹을 현재 프레임 또는 지정된 범위에 저장
   */
  function logMasking() {
    const { mode, detection } = getStores();
    const video = getVideo();
    let bbox = null;

    if (mode.maskMode === 'rectangle' && mode.maskingPoints.length === 2) {
      const p0 = mode.maskingPoints[0];
      const p1 = mode.maskingPoints[1];
      const minX = Math.min(p0.x, p1.x);
      const minY = Math.min(p0.y, p1.y);
      const maxX = Math.max(p0.x, p1.x);
      const maxY = Math.max(p0.y, p1.y);
      bbox = [minX, minY, maxX, maxY];
    } else if (mode.maskMode === 'polygon' && mode.maskingPoints.length > 0 && mode.isPolygonClosed) {
      bbox = mode.maskingPoints.map(p => [p.x, p.y]);
    }

    if (!bbox) return;

    const { video: videoStore } = getStores();
    const currentFrame = Math.floor(video.currentTime * (videoStore.frameRate || 30));

    // 프레임 범위가 지정된 경우 해당 범위 전체에 적용
    if (detection.maskFrameStart !== null && detection.maskFrameEnd !== null) {
      for (let f = detection.maskFrameStart; f <= detection.maskFrameEnd; f++) {
        saveMaskingEntry(f, bbox);
      }
    } else {
      saveMaskingEntry(currentFrame, bbox);
    }
  }

  /**
   * 마스킹 엔트리 저장
   *
   * @param {number} frame - 프레임 번호
   * @param {Array} bbox - 바운딩 박스 좌표
   */
  function saveMaskingEntry(frame, bbox) {
    const { detection } = getStores();
    const bboxType = Array.isArray(bbox) && Array.isArray(bbox[0]) ? 'polygon' : 'rect';
    const newEntry = {
      frame,
      track_id: detection.maskBiggestTrackId,
      bbox,
      bbox_type: bboxType,
      type: 4,
      object: 1
    };

    // 중복 체크
    const exists = detection.maskingLogs.some(
      log => log.frame === newEntry.frame &&
             log.track_id === newEntry.track_id &&
             JSON.stringify(log.bbox) === JSON.stringify(newEntry.bbox) &&
             log.object === newEntry.object
    );

    if (!exists) {
      detection.maskingLogs.push(newEntry);
      detection.addToMaskingLogsMap(newEntry);
      detection.newMaskings.push(newEntry);
    }
  }

  /**
   * 수동 마스킹 엔트리 저장 (manual 모드)
   * 같은 프레임의 기존 엔트리는 업데이트
   *
   * @param {number} frame - 프레임 번호
   * @param {string} bbox - 바운딩 박스 문자열
   */
  function saveManualMaskingEntry(frame, bbox) {
    const { detection, file } = getStores();
    const videoName = file.files[file.selectedFileIndex]?.name || 'unknown.mp4';
    const trackId = detection.manualBiggestTrackId;
    const newEntry = {
      frame,
      track_id: trackId,
      bbox,
      bbox_type: 'rect',
      type: 3,
      object: 1
    };

    // 같은 프레임+track_id 조합이 있으면 업데이트
    const index = detection.maskingLogs.findIndex(
      log => log.frame === newEntry.frame && log.track_id === newEntry.track_id
    );

    if (index !== -1) {
      // bbox가 변경된 경우에만 업데이트
      if (JSON.stringify(detection.maskingLogs[index].bbox) !== JSON.stringify(newEntry.bbox)) {
        detection.maskingLogs[index] = newEntry;
        detection.rebuildMaskingLogsMap();

        // newMaskings에서도 업데이트 또는 추가
        const indexNew = detection.newMaskings.findIndex(
          log => log.frame === newEntry.frame && log.track_id === newEntry.track_id
        );
        if (indexNew !== -1) {
          detection.newMaskings[indexNew] = { ...newEntry, videoName };
        } else {
          detection.newMaskings.push({ ...newEntry, videoName });
        }
      }
    } else {
      // 새 엔트리 추가
      detection.maskingLogs.push(newEntry);
      detection.addToMaskingLogsMap(newEntry);
      detection.newMaskings.push({ ...newEntry, videoName });
    }

    // 데이터 로드 상태 업데이트
    if (detection.maskingLogs.length > 0) {
      detection.dataLoaded = true;
    }
  }

  /**
   * 배치 마스킹 데이터를 백엔드로 전송
   */
  async function sendBatchMaskingsToBackend() {
    const { detection, file } = getStores();
    if (!detection.newMaskings.length) return;

    const videoName = file.files[file.selectedFileIndex]?.name || 'default.mp4';
    const entries = convertMaskingEntries(detection.newMaskings);

    try {
      await window.electronAPI.updateJson({ videoName, entries });
      detection.newMaskings = [];
    } catch (error) {
      console.error('JSON 업데이트 오류:', error);
    }
  }

  /**
   * 다음 track_id 결정
   * 기존 마스킹 로그에서 가장 큰 번호를 찾아 +1
   *
   * @param {number} typeNum - 타입 번호 (3: manual, 4: mask)
   */
  function checkBiggestTrackId(typeNum) {
    const { detection } = getStores();

    if (detection.dataLoaded) {
      const entries = detection.maskingLogs.filter(log => log.type === typeNum);
      if (entries.length > 0) {
        const trackNumbers = entries.map(entry => {
          if (typeof entry.track_id === 'string' && entry.track_id.startsWith(typeNum + '_')) {
            return parseInt(entry.track_id.split('_')[1]);
          }
          return 0;
        });

        const nextTrackNumber = Math.max(...trackNumbers) + 1;
        if (typeNum === 3) {
          detection.manualBiggestTrackId = `3_${nextTrackNumber}`;
        } else {
          detection.maskBiggestTrackId = `4_${nextTrackNumber}`;
        }
      } else {
        if (typeNum === 3) {
          detection.manualBiggestTrackId = `${typeNum}_1`;
        } else {
          detection.maskBiggestTrackId = `${typeNum}_1`;
        }
      }
    } else {
      if (typeNum === 3) {
        detection.manualBiggestTrackId = `${typeNum}_1`;
      } else {
        detection.maskBiggestTrackId = `${typeNum}_1`;
      }
    }
  }

  return {
    logMasking,
    saveMaskingEntry,
    saveManualMaskingEntry,
    sendBatchMaskingsToBackend,
    checkBiggestTrackId,
  };
}
