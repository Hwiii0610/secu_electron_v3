/**
 * 공유 상태 모듈
 * 메인 프로세스 모듈 간 공유되는 상태를 관리합니다.
 */

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
