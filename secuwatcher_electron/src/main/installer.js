/**
 * 설치/업데이트 이벤트 처리 모듈
 * Squirrel 이벤트 및 첫 실행 감지를 관리합니다.
 */

import { app, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import dirConfig from '../dirConfig.json';
import { writeLogToFile, sendLogToRenderer } from './logger.js';

/**
 * Squirrel 설치/업데이트 이벤트를 처리합니다.
 * @returns {boolean} true: 이벤트 처리됨 (앱 종료 예정), false: 일반 실행
 */
export function handleSquirrelEvent() {
  if (process.platform !== 'win32') return false;

  const squirrelEvent = process.argv[1];
  if (!squirrelEvent || !squirrelEvent.startsWith('--squirrel')) return false;

  const appFolder = path.dirname(process.execPath);

  const shortcutBaseDir = (dirConfig.shortcutDir || '').replace(/\//g, '\\');
  const shortcutName = 'SecuWatcher Export.lnk';
  const customShortcutPath = path.join(shortcutBaseDir, shortcutName);

  const makeCustomShortcut = () => {
    if (!shortcutBaseDir) return;
    try {
      if (!fs.existsSync(shortcutBaseDir)) {
        fs.mkdirSync(shortcutBaseDir, { recursive: true });
      }
      const ok = shell.writeShortcutLink(customShortcutPath, {
        target: process.execPath,
        cwd: appFolder,
        icon: process.execPath,
        iconIndex: 0,
        description: 'SecuWatcher Export'
      });
      sendLogToRenderer('custom shortcut created:', ok, customShortcutPath);
    } catch (err) {
      console.error('makeCustomShortcut failed:', err);
    }
  };

  const removeCustomShortcut = () => {
    try {
      if (fs.existsSync(customShortcutPath)) {
        fs.unlinkSync(customShortcutPath);
      }
    } catch { /* noop */ }
  };

  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      makeCustomShortcut();
      setTimeout(() => app.quit(), 700);
      return true;

    case '--squirrel-uninstall':
      removeCustomShortcut();
      setTimeout(() => app.quit(), 700);
      return true;

    case '--squirrel-obsolete':
      app.quit();
      return true;

    default:
      return false;
  }
}

/**
 * 첫 실행을 감지하고 처리합니다.
 * @returns {boolean} true: 첫 실행 (앱 종료 예정), false: 정상 실행
 */
export function handleFirstRun() {
  writeLogToFile('첫 실행 감지 중...');
  try {
    const firstRunFlagPath = path.join(dirConfig.shortcutDir, 'first-run-completed.json');

    writeLogToFile('플래그 파일 경로:', firstRunFlagPath);

    if (!fs.existsSync(firstRunFlagPath)) {
      writeLogToFile('첫 실행이 감지되었습니다. 앱을 종료합니다.');

      const firstRunData = {
        firstRunCompleted: true,
        completedDate: new Date().toISOString(),
        version: app.getVersion()
      };

      try {
        if (!fs.existsSync(dirConfig.shortcutDir)) {
          fs.mkdirSync(dirConfig.shortcutDir, { recursive: true });
          writeLogToFile('디렉토리 생성:', dirConfig.shortcutDir);
        }

        fs.writeFileSync(firstRunFlagPath, JSON.stringify(firstRunData, null, 2), 'utf-8');
        writeLogToFile('첫 실행 플래그 파일이 생성되었습니다:', firstRunFlagPath);
      } catch (error) {
        writeLogToFile('첫 실행 플래그 파일 생성 실패:', error.message || JSON.stringify(error));
      }

      setTimeout(() => {
        writeLogToFile('첫 실행 처리 완료. 앱을 종료합니다.');
        app.quit();
      }, 1000);

      return true;
    }

    writeLogToFile('이전에 실행된 적이 있는 앱입니다. 정상 실행을 계속합니다.');
    return false;
  } catch (error) {
    writeLogToFile('첫 실행 감지 중 오류 발생:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return false;
  }
}
