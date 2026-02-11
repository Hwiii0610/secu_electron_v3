/**
 * 라이선스 IPC 핸들러 모듈
 * 하드웨어 ID 생성, 라이선스 파일 선택/검증/내보내기를 담당합니다.
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { validateLicense, saveLicense, loadLicense, checkExpiry } from '../../license/licenseValidator';
import { generateHardwareId } from '../../license/hardwareId';
import { writeLogToFile } from '../logger.js';
import { setLicenseValid } from '../state.js';
import { createWindow } from '../windowManager.js';

/**
 * 라이선스 관련 IPC 핸들러를 등록합니다.
 */
export function registerLicenseHandlers() {

  // ─── 하드웨어 ID ───────────────────────────

  ipcMain.handle('get-hardware-id', async () => {
    return await generateHardwareId();
  });

  ipcMain.handle('export-hardware-id', async (event, hardwareId) => {
    try {
      const desktopPath = app.getPath('desktop');
      const fileName = `hardwareId.json`;
      const filePath = path.join(desktopPath, fileName);

      const jsonData = {
        hardwareId: hardwareId,
        exportDate: new Date().toISOString(),
        computerName: require('os').hostname()
      };

      fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');

      return {
        success: true,
        filePath: filePath,
        fileName: fileName
      };
    } catch (error) {
      console.error('하드웨어 ID 내보내기 실패:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // ─── 라이선스 파일 선택 ─────────────────────

  ipcMain.handle('select-license-file', async (event) => {
    try {
      const result = await dialog.showOpenDialog({
        title: '라이센스 파일 선택',
        defaultPath: app.getPath('downloads'),
        filters: [
          { name: '라이센스 파일', extensions: ['json', 'txt'] },
          { name: '모든 파일', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = result.filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      return {
        success: true,
        filePath: filePath,
        fileName: path.basename(filePath),
        content: fileContent
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // ─── 라이선스 검증 ─────────────────────────

  ipcMain.handle('validate-license', async (event, licenseKey, licenseFilePath) => {
    const result = await validateLicense(licenseKey);
    if (result.success) {
      const userDataPath = app.getPath('userData');
      saveLicense(result.data, userDataPath);
      setLicenseValid(true);

      // 인증 성공 후 파일들 삭제
      const filesToDelete = [];

      const desktopPath = app.getPath('desktop');
      const hardwareIdPath = path.join(desktopPath, 'hardwareId.json');
      if (fs.existsSync(hardwareIdPath)) {
        filesToDelete.push({ path: hardwareIdPath, name: 'hardwareId.json' });
      }

      if (licenseFilePath && fs.existsSync(licenseFilePath)) {
        filesToDelete.push({ path: licenseFilePath, name: path.basename(licenseFilePath) });
      }

      if (filesToDelete.length > 0) {
        filesToDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
            writeLogToFile(`파일 삭제 완료: ${file.name}`);
          } catch (deleteError) {
            writeLogToFile(`파일 삭제 실패 (${file.name}):`, deleteError.message);
          }
        });
      }

      const currentWindow = BrowserWindow.fromWebContents(event.sender);
      if (currentWindow) {
        currentWindow.close();
      }
      createWindow();
    }
    return result;
  });
}

/**
 * 저장된 라이선스를 검증합니다 (앱 시작 시 사용).
 * @returns {Promise<boolean>} 라이선스 유효 여부
 */
export async function verifySavedLicense() {
  const userDataPath = app.getPath('userData');
  const savedLicense = loadLicense(userDataPath);

  if (!savedLicense) return false;

  const currentHwId = await generateHardwareId();

  if (savedLicense.hardwareId !== currentHwId) {
    writeLogToFile('❌ 하드웨어 ID 불일치');
    return false;
  }

  const expiryCheck = checkExpiry(savedLicense);
  if (!expiryCheck.valid) {
    writeLogToFile('❌ 저장된 라이센스가 만료되었습니다:', expiryCheck.error);

    try {
      const licensePath = path.join(userDataPath, '.license');
      if (fs.existsSync(licensePath)) {
        fs.unlinkSync(licensePath);
        writeLogToFile('만료된 라이센스 파일 삭제 완료');
      }
    } catch (deleteError) {
      writeLogToFile('만료된 라이센스 파일 삭제 실패:', deleteError.message);
    }

    return false;
  }

  return true;
}
