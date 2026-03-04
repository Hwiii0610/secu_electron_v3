/**
 * 시스템 트레이 관리 모듈
 * Electron 앱의 시스템 트레이 아이콘과 메뉴를 관리합니다.
 */

import { Tray, Menu, app, nativeImage } from 'electron';
import path from 'node:path';
import { getMainWindow } from './state.js';

let tray = null;

/**
 * 시스템 트레이를 생성합니다.
 */
export function createTray() {
  // 트레이 아이콘 경로 설정
  const iconPath = path.join(__dirname, '../src/assets', 'APP_LOGO.ico');

  // macOS에서는 다른 이콘 사용 (투명 배경 권장)
  let icon;
  if (process.platform === 'darwin') {
    // macOS용 이콘 설정 (기본적으로 기존 이콘 사용)
    icon = nativeImage.createFromPath(iconPath);
    // macOS는 작은 이콘(16x16)이 권장됨
    icon = icon.resize({ width: 16, height: 16 });
  } else {
    icon = nativeImage.createFromPath(iconPath);
  }

  tray = new Tray(icon);

  // 트레이 메뉴 생성
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '열기',
      click: () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '종료',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // 트레이 아이콘 클릭 시 윈도우 표시/숨기기
  tray.on('click', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  // 트레이 더블클릭 시 윈도우 표시
  tray.on('double-click', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // 트레이 툴팁 설정
  tray.setToolTip('SecuWatcher Export');

  return tray;
}

/**
 * 시스템 트레이를 제거합니다.
 */
export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/**
 * 트레이 아이콘을 얻습니다.
 */
export function getTray() {
  return tray;
}
