/**
 * 윈도우 관리 모듈
 * BrowserWindow 생성/관리 및 윈도우/다이얼로그 관련 IPC 핸들러를 관리합니다.
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { writeLogToFile } from './logger.js';
import { getMainWindow, setMainWindow } from './state.js';

/**
 * 메인 윈도우를 생성합니다.
 */
export function createWindow() {
  writeLogToFile('createWindow 호출');

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 930,
    icon: path.join(__dirname, '../src/assets', 'APP_LOGO.ico'),
    frame: false,
    backgroundColor: '#121519',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    ...(process.platform === 'darwin' && {
      titleBarOverlay: {
        color: '#0078d7',
        symbolColor: '#0078d7',
        height: 30
      }
    })
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  setMainWindow(mainWindow);
}

/**
 * 라이선스 인증 윈도우를 생성합니다.
 */
export function createLicenseWindow() {
  const licenseWindow = new BrowserWindow({
    width: 630,
    height: 650,
    icon: path.join(__dirname, '../src/assets', 'APP_LOGO.ico'),
    frame: true,
    backgroundColor: '#121519',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  let licenseHtmlPath;
  if (app.isPackaged) {
    licenseHtmlPath = path.join(process.resourcesPath, 'license.html');
  } else {
    licenseHtmlPath = path.join(process.cwd(), 'license.html');
  }

  licenseWindow.loadFile(licenseHtmlPath);

  if (!app.isPackaged) {
    licenseWindow.webContents.openDevTools();
  }

  licenseWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      if (licenseWindow.webContents.isDevToolsOpened()) {
        licenseWindow.webContents.closeDevTools();
      } else {
        licenseWindow.webContents.openDevTools();
      }
    }
  });

  return licenseWindow;
}

/**
 * 윈도우 제어 및 다이얼로그 관련 IPC 핸들러를 등록합니다.
 */
export function registerWindowHandlers() {
  // ─── 윈도우 제어 ─────────────────────────────

  ipcMain.on('window-minimize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  ipcMain.on('window-maximize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', async () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['확인', '취소'],
        defaultId: 0,
        cancelId: 1,
        title: '종료 확인',
        message: '정말로 종료하시겠습니까?',
        detail: '진행 중인 작업이 있다면 저장 후 종료하시기 바랍니다.'
      });

      if (result.response === 0) {
        mainWindow.destroy();
      }
    }
  });

  ipcMain.handle('window-is-maximized', () => {
    const mainWindow = getMainWindow();
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  // ─── 다이얼로그 ─────────────────────────────

  ipcMain.handle('show-message', async (event, message) => {
    const mainWindow = getMainWindow();
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: message,
      buttons: ['확인']
    });
  });

  ipcMain.handle('confirm-message', async (event, message) => {
    const mainWindow = getMainWindow();
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      message: message,
      buttons: ['확인', '취소'],
      defaultId: 0,
      cancelId: 1
    });
    return result.response === 0;
  });

  ipcMain.handle('area-masking-message', async (event, message) => {
    const mainWindow = getMainWindow();
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      message: message,
      buttons: ['다각형', '사각형', '취소'],
      defaultId: 0,
      cancelId: 2
    });
    return result.response;
  });

  ipcMain.handle('show-save-dialog', async (event, options) => {
    const mainWindow = getMainWindow();
    try {
      const result = await dialog.showSaveDialog(mainWindow, options);
      return result;
    } catch (error) {
      console.error('Save dialog error:', error);
      throw error;
    }
  });

  ipcMain.handle('show-open-dialog', async (event, options) => {
    const mainWindow = getMainWindow();
    try {
      const opts = { ...(options || {}) };
      const desktop = app.getPath('desktop');

      if (typeof opts.defaultPath === 'string' && opts.defaultPath.trim()) {
        let p = opts.defaultPath.trim();
        if (process.platform === 'win32') p = p.replace(/\//g, '\\');

        if (!fs.existsSync(p)) {
          const maybeDir = path.extname(p) ? path.dirname(p) : p;
          opts.defaultPath = fs.existsSync(maybeDir) ? maybeDir : desktop;
        } else {
          opts.defaultPath = p;
        }
      } else {
        opts.defaultPath = desktop;
      }

      return await dialog.showOpenDialog(mainWindow, opts);
    } catch (error) {
      console.error('Open dialog error:', error);
      throw error;
    }
  });

  ipcMain.handle('show-video-dialog', async (event, options) => {
    const mainWindow = getMainWindow();
    try {
      const opts = { ...(options || {}) };
      const desktop = app.getPath('desktop');

      if (typeof opts.defaultPath === 'string' && opts.defaultPath.trim()) {
        let p = opts.defaultPath.trim();
        if (process.platform === 'win32') p = p.replace(/\//g, '\\');

        if (!fs.existsSync(p)) {
          const maybeDir = path.extname(p) ? path.dirname(p) : p;
          opts.defaultPath = fs.existsSync(maybeDir) ? maybeDir : desktop;
        } else {
          opts.defaultPath = p;
        }
      } else {
        opts.defaultPath = desktop;
      }

      opts.title = opts.title || '영상 파일 선택';
      opts.properties = opts.properties || ['openFile', 'multiSelections'];
      opts.filters = opts.filters || [
        { name: 'Videos', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] }
      ];

      console.log('showVideoDialog options:', opts);
      return await dialog.showOpenDialog(mainWindow, opts);
    } catch (error) {
      console.error('Open dialog error:', error);
      throw error;
    }
  });

  ipcMain.handle('show-selection-mode-dialog', async () => {
    const mainWindow = getMainWindow();
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['파일 선택', '폴더 선택', '취소'],
      title: '추가 방식 선택',
      message: '어떤 방식으로 영상을 추가하시겠습니까?',
      defaultId: 0,
      cancelId: 2,
    });
    return result.response;
  });
}
