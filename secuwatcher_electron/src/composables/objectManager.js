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
    const { mode } = getStores();
    mode.contextMenuVisible = false;

    switch (action) {
      case 'toggle-identified':
        setSelectedObject(mode.selectedShape);
        break;
      case 'toggle-identified-forward':
        setSelectedObjectByRange(mode.selectedShape, 'forward');
        break;
      case 'toggle-identified-backward':
        setSelectedObjectByRange(mode.selectedShape, 'backward');
        break;
      case 'delete-mask':
        deleteMaskByRange(mode.selectedShape);
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
    const { drawBoundingBoxes } = getCallbacks();

    let modifiedCount = 0;

    // 인플레이스 뮤테이션 (배열 재생성 방지 → maskingLogsMap 참조 유지)
    for (const log of detection.maskingLogs) {
      if (log.track_id === trackId) {
        log.object = log.object === 1 ? 2 : 1;
        modifiedCount++;
      }
    }

    if (modifiedCount > 0) {
      // 사용자 조작 타임스탬프 기록 (리로드 가드)
      detection._lastUserActionTime = Date.now();

      // 탐지 중이면 HashMap에 변경값 기록
      if (detection.isDetecting) {
        for (const log of detection.maskingLogs) {
          if (log.track_id === trackId) {
            const key = `${log.track_id}_${log.frame}`;
            if (log.object !== 1) {
              detection.userObjectOverrides[key] = log.object;
            } else {
              delete detection.userObjectOverrides[key];
            }
          }
        }
      }

      // 인플레이스 뮤테이션이므로 맵 재구축 불필요 (참조 동일)
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
    const { drawBoundingBoxes } = getCallbacks();
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

    // 인플레이스 뮤테이션 (배열 재생성 방지)
    for (const log of detection.maskingLogs) {
      if (log.track_id !== trackId) continue;

      const inRange = direction === 'forward'
        ? log.frame >= currentFrame
        : log.frame <= currentFrame;

      if (inRange) {
        log.object = newObjectValue;
        modifiedCount++;
      }
    }

    if (modifiedCount > 0) {
      // 사용자 조작 타임스탬프 기록 (리로드 가드)
      detection._lastUserActionTime = Date.now();

      // 탐지 중이면 HashMap에 변경값 기록
      if (detection.isDetecting) {
        for (const log of detection.maskingLogs) {
          if (log.track_id !== trackId) continue;
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
        }
      }

      // 인플레이스 뮤테이션이므로 맵 재구축 불필요 (참조 동일)
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

  // ─── type:4 범위 삭제 ─────────────────────────

  async function deleteMaskByRange(trackId) {
    if (!trackId) {
      showMessage(MESSAGES.DETECTION.NO_SELECTION);
      return;
    }

    const { detection, file } = getStores();
    const { drawBoundingBoxes, rebuildMaskingLogsMap } = getCallbacks();
    const locals = getLocals();
    const currentFrame = locals.currentFrame ?? 0;

    // hasBefore / hasAfter 계산
    const trackLogs = detection.maskingLogs.filter(l => l.track_id === trackId);
    if (trackLogs.length === 0) {
      showMessage(MESSAGES.DETECTION.OBJECT_NOT_FOUND);
      return;
    }

    const hasBefore = trackLogs.some(l => l.frame < currentFrame);
    const hasAfter = trackLogs.some(l => l.frame > currentFrame);

    // 동적 버튼 배열 구성
    const buttons = [];
    if (hasBefore && hasAfter) buttons.push('전체');
    if (hasBefore) buttons.push('여기까지');
    if (hasAfter) buttons.push('여기부터');
    buttons.push('여기만', '취소');

    // OS 다이얼로그
    const idx = await window.electronAPI.dynamicDialog({
      message: '삭제 범위를 선택하세요.',
      buttons
    });
    const chosen = buttons[idx];
    if (chosen === '취소') return;

    // 선택에 따라 삭제
    const beforeCount = detection.maskingLogs.length;
    detection.maskingLogs = detection.maskingLogs.filter(log => {
      if (log.track_id !== trackId) return true;
      if (chosen === '전체') return false;
      if (chosen === '여기까지') return log.frame > currentFrame;
      if (chosen === '여기부터') return log.frame < currentFrame;
      if (chosen === '여기만') return log.frame !== currentFrame;
      return true;
    });
    const deletedCount = beforeCount - detection.maskingLogs.length;

    if (deletedCount > 0) {
      rebuildMaskingLogsMap();
      drawBoundingBoxes();

      const videoName = file.files[file.selectedFileIndex]?.name || 'unknown.mp4';
      window.electronAPI.updateFilteredJson({
        videoName,
        data: JSON.parse(JSON.stringify(detection.maskingLogs))
      }).catch(error => {
        console.error('JSON 업데이트 오류:', error);
      });

      showMessage(MESSAGES.MASKING.DELETED(deletedCount, trackId));
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
