/**
 * 설정 및 워터마크 IPC 핸들러 모듈
 * config.ini 설정 로드/저장 및 워터마크 이미지 관리를 담당합니다.
 */

import { ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import dirConfig from '../../dirConfig.json';

/**
 * 설정 및 워터마크 관련 IPC 핸들러를 등록합니다.
 */
export function registerSettingsHandlers() {

  // ─── 설정 로드 ─────────────────────────────

  ipcMain.handle('get-settings', async (event) => {
    try {
      const configFile = path.join(dirConfig.exportConfig, 'config.ini');

      if (!fs.existsSync(configFile)) {
        throw new Error(`설정 파일을 찾을 수 없습니다: ${configFile}`);
      }

      const fileContent = fs.readFileSync(configFile, 'utf-8');
      const lines = fileContent.split('\n');

      const settings = {};
      let currentSection = null;

      for (let line of lines) {
        line = line.trim();

        if (!line || line.startsWith(';') || line.startsWith('#')) {
          continue;
        }

        if (line.startsWith('[') && line.endsWith(']')) {
          currentSection = line.substring(1, line.length - 1).toLowerCase();
          settings[currentSection] = {};
          continue;
        }

        if (currentSection && line.includes('=')) {
          const equalIndex = line.indexOf('=');
          const key = line.substring(0, equalIndex).trim().toLowerCase();
          const value = line.substring(equalIndex + 1).trim();
          settings[currentSection][key] = value;
        }
      }

      return settings;

    } catch (error) {
      console.error('설정 파일 읽기 오류:', error);
      throw new Error(`설정 파일 읽기 실패: ${error.message}`);
    }
  });

  // ─── 설정 저장 ─────────────────────────────

  ipcMain.handle('save-settings', async (event, settings) => {
    try {
      const configFile = path.join(dirConfig.exportConfig, 'config.ini');

      if (!fs.existsSync(configFile)) {
        throw new Error('config.ini 파일이 존재하지 않습니다.');
      }

      // 1) 입력 settings를 섹션/키 모두 소문자로 평탄화
      const norm = {};
      for (const [sec, obj] of Object.entries(settings || {})) {
        const s = String(sec).toLowerCase();
        norm[s] = norm[s] || {};
        for (const [k, v] of Object.entries(obj || {})) {
          norm[s][String(k).toLowerCase()] = v;
        }
      }

      const fileLines = fs.readFileSync(configFile, 'utf-8').split(/\r?\n/);
      let currentSectionLower = null;

      const updatedLines = fileLines.map(line => {
        const trimmed = line.trim();

        if (/^\[.+\]$/.test(trimmed)) {
          currentSectionLower = trimmed.slice(1, -1).toLowerCase();
          return `[${currentSectionLower}]`;
        }

        if (!trimmed || trimmed.startsWith(';') || !currentSectionLower) {
          return line;
        }

        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const keyLower = trimmed.slice(0, equalIndex).trim().toLowerCase();
          const currentValue = trimmed.slice(equalIndex + 1).trim();

          const has = !!(norm[currentSectionLower] &&
            Object.prototype.hasOwnProperty.call(norm[currentSectionLower], keyLower));

          if (has) {
            const newValue = String(norm[currentSectionLower][keyLower]);
            return `${keyLower}=${currentValue === newValue ? currentValue : newValue}`;
          }
          return line;
        }

        return line;
      });

      // 2) 파일에 없는 키들 처리
      const presentSections = new Set();
      for (const l of updatedLines) {
        const t = l.trim();
        if (/^\[.+\]$/.test(t)) presentSections.add(t.slice(1, -1));
      }

      const finalLines = [];
      let currentSec = null;
      const seenPairs = new Set();
      const pendingKeys = {};

      for (const l of updatedLines) {
        const t = l.trim();
        if (/^\[.+\]$/.test(t)) currentSec = t.slice(1, -1);
        else if (currentSec && t && !t.startsWith(';') && t.includes('=')) {
          const eq = t.indexOf('=');
          const k = t.slice(0, eq).trim().toLowerCase();
          seenPairs.add(`${currentSec}::${k}`);
        }
      }

      for (const [sec, obj] of Object.entries(norm)) {
        for (const [k, v] of Object.entries(obj || {})) {
          const key = k.toLowerCase();
          if (!seenPairs.has(`${sec}::${key}`)) {
            pendingKeys[sec] = pendingKeys[sec] || [];
            pendingKeys[sec].push(`${key}=${String(v)}`);
          }
        }
      }

      currentSec = null;
      for (let i = 0; i < updatedLines.length; i++) {
        const line = updatedLines[i];
        const t = line.trim();

        if (/^\[.+\]$/.test(t)) {
          if (currentSec && pendingKeys[currentSec]) {
            for (const newLine of pendingKeys[currentSec]) {
              finalLines.push(newLine);
            }
            delete pendingKeys[currentSec];
          }
          currentSec = t.slice(1, -1);
        }

        finalLines.push(line);
      }

      if (currentSec && pendingKeys[currentSec]) {
        for (const newLine of pendingKeys[currentSec]) {
          finalLines.push(newLine);
        }
        delete pendingKeys[currentSec];
      }

      for (const [sec, keys] of Object.entries(pendingKeys)) {
        if (!presentSections.has(sec)) {
          finalLines.push('');
          finalLines.push(`[${sec}]`);
          for (const newLine of keys) {
            finalLines.push(newLine);
          }
        }
      }

      fs.writeFileSync(configFile, finalLines.join('\n'), 'utf-8');

      return '설정이 성공적으로 업데이트되었습니다.';
    } catch (error) {
      console.error('설정 저장 오류:', error);
      throw new Error('설정 파일 저장 실패: ' + error.message);
    }
  });

  // ─── 워터마크 저장 ─────────────────────────

  ipcMain.handle('save-watermark', async (event, payload) => {
    const watermarkImage = payload.watermarkImage;
    let fileName = payload.fileName;
    const originalPath = payload.originalPath;
    const overwrite = payload.overwrite || false;

    if (!watermarkImage || watermarkImage.trim() === '') {
      throw new Error('워터마크 이미지가 없습니다.');
    }

    if (!fileName || fileName.trim() === '') {
      fileName = 'watermark.png';
    }

    const allowedExtensions = ['jpg', 'jpeg', 'png'];
    const fileExtension = fileName.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      throw new Error('JPG, JPEG, PNG 파일만 지원합니다.');
    }

    try {
      const imagePath = path.join(dirConfig.exportConfig, fileName);

      console.log('exportConfig:', dirConfig.exportConfig);
      console.log('워터마크 저장 경로:', imagePath);
      console.log('원본 경로:', originalPath);

      const dirPath = path.dirname(imagePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log('디렉토리 생성:', dirPath);
      }

      if (!overwrite && fs.existsSync(imagePath)) {
        console.log('이미 존재하는 워터마크 파일:', imagePath);
        throw new Error(`동일한 이름의 파일이 이미 존재합니다: ${fileName}`);
      }

      const imageBuffer = Buffer.from(watermarkImage, 'base64');
      fs.writeFileSync(imagePath, imageBuffer);

      console.log('워터마크 이미지 저장 완료:', imagePath);

      return {
        success: true,
        message: '워터마크 이미지가 성공적으로 저장되었습니다.',
        savedPath: imagePath,
        fileName: fileName,
        originalPath: originalPath
      };

    } catch (error) {
      console.error('워터마크 이미지 저장 오류:', error);
      throw new Error(`워터마크 이미지 저장 실패: ${error.message}`);
    }
  });

  // ─── 워터마크 로드 ─────────────────────────

  ipcMain.handle('load-watermark', async (event, waterimgpath) => {
    try {
      if (!waterimgpath || waterimgpath.trim() === '') {
        throw new Error('워터마크 이미지 경로가 누락되었습니다.');
      }

      const filePath = waterimgpath.trim();

      console.log('워터마크 이미지 경로:', filePath);

      if (!fs.existsSync(filePath)) {
        throw new Error(`이미지 파일을 찾을 수 없습니다: ${filePath}`);
      }

      const lastDotIndex = filePath.lastIndexOf('.');
      if (lastDotIndex === -1) {
        throw new Error('파일 확장자를 찾을 수 없습니다.');
      }

      const extension = filePath.substring(lastDotIndex + 1).toLowerCase();

      let mimeType;
      switch (extension) {
        case 'jpg':
        case 'jpeg':
          mimeType = 'image/jpeg';
          break;
        case 'png':
          mimeType = 'image/png';
          break;
        default:
          mimeType = 'application/octet-stream';
          break;
      }

      const imageBuffer = fs.readFileSync(filePath);
      const base64Data = imageBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64Data}`;

      const fileName = filePath.split(/[/\\]/).pop();
      console.log('워터마크 이미지 로드 완료:', fileName);

      return {
        success: true,
        filename: fileName,
        mimeType: mimeType,
        size: imageBuffer.length,
        dataUrl: dataUrl,
        buffer: imageBuffer
      };

    } catch (error) {
      console.error('워터마크 이미지 로드 오류:', error);
      throw new Error(`워터마크 이미지 로드 실패: ${error.message}`);
    }
  });

  // ─── 워터마크 이미지 복사 ───────────────────

  ipcMain.handle('copy-watermark-image', async (event, payload) => {
    const sourcePath = payload.sourcePath;
    const fileName = payload.fileName;
    const overwrite = payload.overwrite || false;

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error('원본 파일이 존재하지 않습니다.');
    }

    if (!fileName || fileName.trim() === '') {
      throw new Error('파일명이 누락되었습니다.');
    }

    const allowedExtensions = ['jpg', 'jpeg', 'png'];
    const fileExtension = fileName.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      throw new Error('JPG, JPEG, PNG 파일만 지원합니다.');
    }

    try {
      const targetPath = path.join(dirConfig.exportConfig, fileName);

      console.log('원본 경로:', sourcePath);
      console.log('대상 경로:', targetPath);

      const dirPath = path.dirname(targetPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log('디렉토리 생성:', dirPath);
      }

      if (!overwrite && fs.existsSync(targetPath)) {
        throw new Error(`동일한 이름의 파일이 이미 존재합니다: ${fileName}`);
      }

      fs.copyFileSync(sourcePath, targetPath);

      console.log('워터마크 이미지 복사 완료:', targetPath);

      return {
        success: true,
        message: '워터마크 이미지가 성공적으로 복사되었습니다.',
        sourcePath: sourcePath,
        targetPath: targetPath,
        fileName: fileName
      };

    } catch (error) {
      console.error('워터마크 이미지 복사 오류:', error);
      throw new Error(`워터마크 이미지 복사 실패: ${error.message}`);
    }
  });
}
