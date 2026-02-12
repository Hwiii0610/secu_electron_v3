/**
 * 객체 관리 컴포저블
 *
 * App.vue의 컨텍스트 메뉴 액션 처리, 객체 선택/삭제 로직을 통합합니다.
 *
 * @param {Object} deps
 * @param {Function} deps.getStores      - () => { detection, file, mode }
 * @param {Function} deps.getCallbacks   - () => { drawBoundingBoxes, rebuildMaskingLogsMap }
 * @param {Function} deps.getLocals      - () => { frameMaskStartInput, frameMaskEndInput, fileInfoItems }
 * @param {Function} deps.setLocal       - (key, val) => void
 */

import { showMessage, MESSAGES } from '../utils';

export function createObjectManager(deps) {
  const { getStores, getCallbacks, getLocals, setLocal } = deps;

  // ─── 컨텍스트 메뉴 액션 ────────────────────────

  function handleContextMenuAction(action) {
    const { mode, detection } = getStores();
    mode.contextMenuVisible = false;

    switch (action) {
      case 'set-frame': {
        const locals = getLocals();
        detection.frameMaskStartInput = locals.currentFrame;
        detection.frameMaskEndInput = locals.fileInfoItems5Value;
        detection.showMaskFrameModal = true;
        break;
      }
      case 'toggle-identified':
        setSelectedObject(mode.selectedShape);
        break;

      case 'toggle-identified-forward':
        setSelectedObjectByRange(mode.selectedShape, 'forward');
        break;

      case 'toggle-identified-backward':
        setSelectedObjectByRange(mode.selectedShape, 'backward');
        break;

      case 'delete-selected':
        deleteObjectByTrackId(mode.selectedShape);
        break;

      case 'delete-all-types':
        if (confirm('모든 객체탐지 결과를 삭제하시겠습니까?')) {
          deleteObjectsByType(null);
        }
        break;

      case 'delete-auto':
        if (confirm('자동객체탐지 결과를 삭제하시겠습니까?')) {
          deleteObjectsByType(1);
        }
        break;

      case 'delete-select':
        if (confirm('선택객체탐지 결과를 삭제하시겠습니까?')) {
          deleteObjectsByType(2);
        }
        break;

      case 'delete-masking':
        if (confirm('영역마스킹 결과를 삭제하시겠습니까?')) {
          deleteObjectsByType(4);
        }
        break;

      case 'delete-manual':
        if (confirm('수동객체탐지 결과를 삭제하시겠습니까?')) {
          deleteObjectsByType(3);
        }
        break;
    }
  }

  // ─── 객체 선택 토글 ────────────────────────────

  function setSelectedObject(trackId) {
    if (!trackId) {
      showMessage(MESSAGES.DETECTION.NO_SELECTION);
      return;
    }

    const { detection, file } = getStores();
    const { drawBoundingBoxes, rebuildMaskingLogsMap } = getCallbacks();
    let modifiedCount = 0;

    detection.maskingLogs = detection.maskingLogs.map(log => {
      if (log.track_id === trackId) {
        modifiedCount++;
        return {
          ...log,
          object: log.object === 1 ? 2 : (log.object === 2 ? 1 : 1)
        };
      }
      return log;
    });

    if (modifiedCount > 0) {
      // 탐지 중이면 HashMap에 변경값 기록
      if (detection.isDetecting) {
        detection.maskingLogs.forEach(log => {
          if (log.track_id === trackId) {
            const key = `${log.track_id}_${log.frame}`;
            if (log.object !== 1) {
              detection.userObjectOverrides[key] = log.object;
            } else {
              delete detection.userObjectOverrides[key];
            }
          }
        });
      }

      rebuildMaskingLogsMap();
      drawBoundingBoxes();

      const videoName = file.files[file.selectedFileIndex]?.name || 'unknown.mp4';

      window.electronAPI.updateFilteredJson({
        videoName: videoName,
        data: JSON.parse(JSON.stringify(detection.maskingLogs))
      })
      .then(() => { /* 업데이트 완료 */ })
      .catch(error => {
        console.error('JSON 업데이트 오류:', error);
      });

      showMessage(MESSAGES.DETECTION.STATUS_CHANGED(modifiedCount));
    } else {
      showMessage(MESSAGES.DETECTION.OBJECT_NOT_FOUND);
    }
  }

  // ─── 프레임 범위 기반 객체 선택 토글 ────────────

  /**
   * 프레임 범위 기반으로 특정 track_id의 object 값을 토글합니다.
   * 현재 프레임의 object 값을 기준으로 범위 내 모든 항목을 일괄 변경합니다.
   *
   * @param {string} trackId - 대상 track_id
   * @param {'forward'|'backward'} direction - 'forward': 현재~끝, 'backward': 시작~현재
   */
  function setSelectedObjectByRange(trackId, direction) {
    if (!trackId) {
      showMessage(MESSAGES.DETECTION.NO_SELECTION);
      return;
    }

    const { detection, file } = getStores();
    const { drawBoundingBoxes, rebuildMaskingLogsMap } = getCallbacks();
    const locals = getLocals();
    const currentFrame = locals.currentFrame ?? 0;

    // 현재 프레임에서 해당 track_id의 object 값을 기준값으로 사용
    const currentFrameLog = detection.maskingLogs.find(
      log => log.track_id === trackId && log.frame === currentFrame
    );

    let referenceObject;
    if (currentFrameLog) {
      referenceObject = currentFrameLog.object;
    } else {
      // 현재 프레임에 해당 track_id가 없으면 가장 가까운 프레임에서 찾기
      const sameTrackLogs = detection.maskingLogs.filter(log => log.track_id === trackId);
      if (sameTrackLogs.length === 0) {
        showMessage(MESSAGES.DETECTION.OBJECT_NOT_FOUND);
        return;
      }
      sameTrackLogs.sort(
        (a, b) => Math.abs(a.frame - currentFrame) - Math.abs(b.frame - currentFrame)
      );
      referenceObject = sameTrackLogs[0].object;
    }

    const newObjectValue = referenceObject === 1 ? 2 : 1;
    let modifiedCount = 0;

    detection.maskingLogs = detection.maskingLogs.map(log => {
      if (log.track_id !== trackId) return log;

      const inRange = direction === 'forward'
        ? log.frame >= currentFrame
        : log.frame <= currentFrame;

      if (inRange) {
        modifiedCount++;
        return { ...log, object: newObjectValue };
      }
      return log;
    });

    if (modifiedCount > 0) {
      // 탐지 중이면 HashMap에 변경값 기록
      if (detection.isDetecting) {
        detection.maskingLogs.forEach(log => {
          if (log.track_id !== trackId) return;
          const inRange = direction === 'forward'
            ? log.frame >= currentFrame
            : log.frame <= currentFrame;
          if (inRange) {
            const key = `${log.track_id}_${log.frame}`;
            if (log.object !== 1) {
              detection.userObjectOverrides[key] = log.object;
            } else {
              delete detection.userObjectOverrides[key];
            }
          }
        });
      }

      rebuildMaskingLogsMap();
      drawBoundingBoxes();

      const videoName = file.files[file.selectedFileIndex]?.name || 'unknown.mp4';

      window.electronAPI.updateFilteredJson({
        videoName: videoName,
        data: JSON.parse(JSON.stringify(detection.maskingLogs))
      })
      .then(() => { /* 업데이트 완료 */ })
      .catch(error => {
        console.error('JSON 업데이트 오류:', error);
      });

      const rangeText = direction === 'forward' ? '현재 프레임 이후' : '현재 프레임 이전';
      showMessage(MESSAGES.DETECTION.RANGE_STATUS_CHANGED(modifiedCount, rangeText));
    } else {
      showMessage(MESSAGES.DETECTION.OBJECT_NOT_FOUND);
    }
  }

  // ─── 객체 삭제 (trackId 기반) ──────────────────

  function deleteObjectByTrackId(trackId) {
    if (!trackId) {
      showMessage(MESSAGES.DETECTION.NO_SELECTION);
      return;
    }

    const { detection, file } = getStores();
    const { drawBoundingBoxes, rebuildMaskingLogsMap } = getCallbacks();

    const beforeCount = detection.maskingLogs.length;
    detection.maskingLogs = detection.maskingLogs.filter(log => log.track_id !== trackId);
    rebuildMaskingLogsMap();
    const deletedCount = beforeCount - detection.maskingLogs.length;

    if (deletedCount > 0) {
      const videoName = file.files[file.selectedFileIndex]?.name || 'unknown.mp4';

      window.electronAPI.updateFilteredJson({
        videoName: videoName,
        data: JSON.parse(JSON.stringify(detection.maskingLogs))
      })
      .then(() => {
        drawBoundingBoxes();
      })
      .catch(error => {
        console.error('JSON 업데이트 오류:', error);
      });

      showMessage(MESSAGES.MASKING.DELETED(deletedCount, trackId));
    } else {
      showMessage(MESSAGES.MASKING.DELETE_FAILED);
    }
  }

  // ─── 객체 삭제 (타입 기반) ─────────────────────

  function deleteObjectsByType(type) {
    const { detection, file } = getStores();
    const { drawBoundingBoxes, rebuildMaskingLogsMap } = getCallbacks();

    const beforeCount = detection.maskingLogs.length;

    if (type === null) {
      detection.maskingLogs = [];
    } else {
      detection.maskingLogs = detection.maskingLogs.filter(log => log.type != type);
    }
    rebuildMaskingLogsMap();

    const deletedCount = beforeCount - detection.maskingLogs.length;

    if (deletedCount > 0) {
      const videoName = file.files[file.selectedFileIndex]?.name || 'unknown.mp4';

      window.electronAPI.updateFilteredJson({
        videoName: videoName,
        data: JSON.parse(JSON.stringify(detection.maskingLogs))
      })
      .then(() => {
        drawBoundingBoxes();
      })
      .catch(error => {
        console.error('JSON 업데이트 오류:', error);
        showMessage(MESSAGES.MASKING.DELETE_ERROR);
      });

      showMessage(MESSAGES.MASKING.DELETED(deletedCount, ''));
    } else {
      showMessage(MESSAGES.MASKING.NO_DATA);
    }
  }

  // ─── 공개 API ──────────────────────────────────

  return {
    handleContextMenuAction,
    setSelectedObject,
    setSelectedObjectByRange,
    deleteObjectByTrackId,
    deleteObjectsByType,
  };
}
