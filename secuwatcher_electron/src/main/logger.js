/**
 * 로깅 모듈
 * 파일 로그 기록 및 렌더러 프로세스 로그 전송을 관리합니다.
 */

import path from 'node:path';
import fs from 'node:fs';
import dirConfig from '../dirConfig.json';
import { getMainWindow } from './state.js';

/**
 * 파일에 로그를 기록합니다.
 * @param {string} message - 로그 메시지
 * @param {*} data - 추가 데이터 (선택)
 */
export function writeLogToFile(message, data = null) {
  const logDir = path.join(dirConfig.logDir);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logFile = path.join(logDir, 'export_front.log');
  const timestamp = new Date().toISOString();

  let dataStr = '';
  if (data) {
    if (data instanceof Error) {
      dataStr = JSON.stringify({
        name: data.name,
        message: data.message,
        code: data.code,
        stack: data.stack,
        ...data
      }, null, 2);
    } else if (typeof data === 'object') {
      try {
        dataStr = JSON.stringify(data, null, 2);
      } catch (e) {
        dataStr = String(data);
      }
    } else {
      dataStr = String(data);
    }
  }

  const logEntry = `[${timestamp}] ${message} ${dataStr}\n`;
  fs.appendFileSync(logFile, logEntry, 'utf-8');
}

/**
 * 렌더러 프로세스에 로그를 전송합니다.
 * @param {string} message - 로그 메시지
 * @param {*} data - 추가 데이터 (선택)
 */
export function sendLogToRenderer(message, data = null) {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('main-log', { message, data, timestamp: new Date().toISOString() });
  }
}
