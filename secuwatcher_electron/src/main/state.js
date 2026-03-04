/**
 * 공유 상태 모듈
 * 메인 프로세스 모듈 간 공유되는 상태를 관리합니다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

let mainWindow = null;
let licenseValid = false;

export function getMainWindow() {
  return mainWindow;
}

export function setMainWindow(win) {
  mainWindow = win;
}

export function isLicenseValid() {
  return licenseValid;
}

export function setLicenseValid(valid) {
  licenseValid = valid;
}

/**
 * 복구 파일 경로 반환
 * 개발 모드: 프로젝트 루트/config/recovery.json
 * 패키지 모드: userData/config/recovery.json
 */
export function getRecoveryFilePath() {
  const baseDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'config')
    : path.join(process.cwd(), 'config');

  return path.join(baseDir, 'recovery.json');
}

/**
 * 복구 상태 저장
 * @param {Object} recoveryData - { job_id, event_type, video_path, progress }
 */
export function saveRecoveryState(recoveryData) {
  try {
    const filePath = getRecoveryFilePath();
    const dir = path.dirname(filePath);

    // 디렉토리가 없으면 생성
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      ...recoveryData,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[Recovery] 복구 상태 저장: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error('[Recovery] 복구 상태 저장 실패:', error);
  }
}

/**
 * 복구 상태 읽기
 * @returns {Object|null} 복구 데이터 또는 null
 */
export function readRecoveryState() {
  try {
    const filePath = getRecoveryFilePath();

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`[Recovery] 복구 상태 읽음: ${JSON.stringify(data)}`);
    return data;
  } catch (error) {
    console.error('[Recovery] 복구 상태 읽기 실패:', error);
    return null;
  }
}

/**
 * 복구 상태 파일 삭제 (작업 완료/취소 시)
 */
export function deleteRecoveryState() {
  try {
    const filePath = getRecoveryFilePath();

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('[Recovery] 복구 상태 파일 삭제됨');
    }
  } catch (error) {
    console.error('[Recovery] 복구 상태 파일 삭제 실패:', error);
  }
}
