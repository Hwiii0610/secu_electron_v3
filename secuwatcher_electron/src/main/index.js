/**
 * Electron 메인 프로세스 진입점
 *
 * main.js (2,578줄)에서 분할된 모듈들을 조합하여
 * 앱 라이프사이클을 관리합니다.
 *
 * 모듈 구조:
 *   state.js              — 공유 상태 (mainWindow, licenseValid)
 *   logger.js             — 파일/렌더러 로깅
 *   utils.js              — 경로/FFmpeg/파싱 유틸리티
 *   installer.js          — Squirrel 이벤트 + 첫 실행
 *   windowManager.js      — 윈도우 생성/관리/다이얼로그
 *   ipcHandlers/
 *     fileHandlers.js     — 파일 작업/스캔/복사/JSON
 *     videoHandlers.js    — 비디오 분석/복구/변환
 *     videoEditHandlers.js — 트림/머지
 *     settingsHandlers.js — 설정/워터마크
 *     licenseHandlers.js  — 라이선스 검증
 *     encryptHandlers.js  — 암호화
 */

import { app, protocol, globalShortcut, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// ─── 내부 모듈 ──────────────────────────────
import { getMainWindow, setLicenseValid } from './state.js';
import { writeLogToFile } from './logger.js';
import { handleSquirrelEvent, handleFirstRun } from './installer.js';
import { createWindow, createLicenseWindow, registerWindowHandlers } from './windowManager.js';
import { registerFileHandlers } from './ipcHandlers/fileHandlers.js';
import { registerVideoHandlers } from './ipcHandlers/videoHandlers.js';
import { registerVideoEditHandlers } from './ipcHandlers/videoEditHandlers.js';
import { registerSettingsHandlers } from './ipcHandlers/settingsHandlers.js';
import { registerLicenseHandlers, verifySavedLicense } from './ipcHandlers/licenseHandlers.js';
import { registerEncryptHandlers } from './ipcHandlers/encryptHandlers.js';

// ─── Squirrel 이벤트 처리 (설치/업데이트) ────
if (handleSquirrelEvent()) {
  process.exit(0);
}

// ─── 프로토콜 등록 (app.ready 이전에 호출 필요) ──
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-video', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
]);

// ─── IPC 핸들러 등록 (모듈 로드 시 즉시 등록) ──
registerWindowHandlers();
registerFileHandlers();
registerVideoHandlers();
registerVideoEditHandlers();
registerSettingsHandlers();
registerLicenseHandlers();
registerEncryptHandlers();

// ─── 앱 라이프사이클 ─────────────────────────

app.whenReady().then(async () => {
  // local-video:// 프로토콜 핸들러
  protocol.registerFileProtocol('local-video', (request, callback) => {
    let url = request.url.replace(/^local-video:\/\/stream\/?/, '');
    let decodedUrl = decodeURI(url);
    if (process.platform !== 'win32' && !decodedUrl.startsWith('/')) {
      decodedUrl = '/' + decodedUrl;
    }

    try {
      return callback(decodedUrl);
    } catch (error) {
      console.error('Protocol Error:', error);
      return callback(404);
    }
  });

  writeLogToFile('Electron 준비 완료');

  // [라이선스 검증 비활성화 - 개발/테스트용]
  // 배포 시에는 아래 주석을 해제하고 라이선스 검증을 활성화하세요
  /*
  if (handleFirstRun()) {
    writeLogToFile('첫 실행 감지 중...whenready');
    return;
  }

  const licenseOk = await verifySavedLicense();
  if (licenseOk) {
    setLicenseValid(true);
    createWindow();
    return;
  }

  createLicenseWindow();
  */

  // 라이선스 검증 없이 바로 메인 윈도우 생성 (개발/테스트용)
  setLicenseValid(true);
  createWindow();

  // 개발자 도구 단축키
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  // macOS: 독 아이콘 클릭 시 윈도우 재생성
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 모든 윈도우가 닫히면 앱 종료 (macOS 제외)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 앱 종료 시 정리
app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  const tempDir = path.join(process.cwd(), 'temp');
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('임시 디렉토리 정리 완료:', tempDir);
    } catch (error) {
      console.error('임시 디렉토리 삭제 실패:', error);
    }
  }
});
