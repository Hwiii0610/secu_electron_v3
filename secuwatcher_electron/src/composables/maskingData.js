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
 * @param {Function} deps.getCurrentFrame - () => number 현재 프레임 번호 게터
 * @returns {Object} 마스킹 데이터 관리 메서드들
 */
export function createMaskingDataManager(deps) {
  const { getStores, getVideo, getCurrentFrame } = deps;

  /** bbox 허용 오차 비교 (rect: [x1,y1,x2,y2], polygon: [[x,y],...]) */
  function areBboxesEqual(a, b, tol = 0.5) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    if (typeof a[0] === 'number') {
      return a.every((v, i) => Math.abs(v - b[i]) < tol);
    }
    return a.every((pt, i) =>
      Math.abs(pt[0] - b[i][0]) < tol && Math.abs(pt[1] - b[i][1]) < tol
    );
  }

  /**
   * 마스킹 데이터 로깅 — 현재 프레임에 저장
   */
  function logMasking() {
    const { mode } = getStores();
    const video = getVideo();
    let bbox = null;

    if (mode.maskMode === 'rectangle' && mode.maskingPoints.length === 2) {
      const p0 = mode.maskingPoints[0];
      const p1 = mode.maskingPoints[1];
      bbox = [Math.min(p0.x, p1.x), Math.min(p0.y, p1.y),
              Math.max(p0.x, p1.x), Math.max(p0.y, p1.y)];
    } else if (mode.maskMode === 'polygon' && mode.maskingPoints.length > 0 && mode.isPolygonClosed) {
      bbox = mode.maskingPoints.map(p => [p.x, p.y]);
    }

    if (!bbox) return;

    const currentFrame = getCurrentFrame();
    saveMaskingEntry(currentFrame, bbox);
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

    // 중복 체크 — 허용 오차 기반 기하학적 비교
    const exists = detection.maskingLogs.some(
      log => log.frame === newEntry.frame &&
             log.track_id === newEntry.track_id &&
             areBboxesEqual(log.bbox, newEntry.bbox) &&
             log.object === newEntry.object
    );

    if (!exists) {
      detection.maskingLogs.push(newEntry);
      detection.addToMaskingLogsMap(newEntry);
      detection.newMaskings.push(newEntry);
    }
  }

  /**
   * 배치 마스킹 데이터를 백엔드로 전송
   */
  async function sendBatchMaskingsToBackend() {
    const { detection, file } = getStores();
    if (!detection.newMaskings.length) return;

    const videoName = file.files[file.selectedFileIndex]?.name || 'default.mp4';
    const entries = JSON.parse(JSON.stringify(convertMaskingEntries(detection.newMaskings)));

    try {
      await window.electronAPI.updateJson({ videoName, entries });
      detection.newMaskings = [];
    } catch (error) {
      console.error('JSON 업데이트 오류:', error);
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: '마스킹 데이터 저장에 실패했습니다.' } }));  // [UIUX-07]
    }
  }

  /**
   * 다음 track_id 결정
   * 기존 마스킹 로그에서 가장 큰 번호를 찾아 +1
   */
  function checkBiggestTrackId() {
    const { detection } = getStores();

    if (detection.dataLoaded) {
      const entries = detection.maskingLogs.filter(log => log.type === 4);
      if (entries.length > 0) {
        const trackNumbers = entries.map(entry => {
          if (typeof entry.track_id === 'string' && entry.track_id.startsWith('4_')) {
            return parseInt(entry.track_id.split('_')[1]);
          }
          return 0;
        });
        detection.maskBiggestTrackId = `4_${Math.max(...trackNumbers) + 1}`;
      } else {
        detection.maskBiggestTrackId = '4_1';
      }
    } else {
      detection.maskBiggestTrackId = '4_1';
    }
  }

  /**
   * 지정 범위의 프레임에 동일한 bbox 엔트리를 채워넣기
   *
   * @param {string} trackId - 채울 track_id
   * @param {number} startFrame - 시작 프레임
   * @param {number} endFrame - 끝 프레임
   */
  function fillMaskingFrames(trackId, startFrame, endFrame) {
    const { detection } = getStores();
    const sampleLog = detection.maskingLogs.find(log => log.track_id === trackId);
    if (!sampleLog) return;

    const MAX_FILL = 10000;
    const range = endFrame - startFrame;
    if (range > MAX_FILL) {
      const ok = window.confirm(`${range}개 프레임에 마스킹을 적용합니다. 계속하시겠습니까?`);
      if (!ok) return;
    }

    const existingFrames = new Set(
      detection.maskingLogs.filter(log => log.track_id === trackId).map(log => log.frame)
    );

    for (let f = startFrame; f <= endFrame; f++) {
      if (!existingFrames.has(f)) {
        const entry = {
          frame: f,
          track_id: trackId,
          bbox: sampleLog.bbox,
          bbox_type: sampleLog.bbox_type,
          type: 4,
          object: 1,
        };
        detection.maskingLogs.push(entry);
        detection.addToMaskingLogsMap(entry);
        detection.newMaskings.push(entry);
      }
    }
  }

  return {
    logMasking,
    saveMaskingEntry,
    sendBatchMaskingsToBackend,
    checkBiggestTrackId,
    fillMaskingFrames,
  };
}
