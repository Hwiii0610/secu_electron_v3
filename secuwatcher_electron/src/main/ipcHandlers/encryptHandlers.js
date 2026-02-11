/**
 * 암호화 IPC 핸들러 모듈
 * 파일 암호화 및 비밀번호 RSA 암호화를 담당합니다.
 */

import { app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'crypto';
import FormData from 'form-data';
import apiPython from '../../apiRequest';
import config from '../../resources/config.json';
import { writeLogToFile } from '../logger.js';

/**
 * 비밀번호를 RSA-OAEP(SHA-1)로 암호화합니다.
 * @param {string} plainText - 평문 비밀번호
 * @returns {Promise<string|null>} Base64 인코딩된 암호화 결과 또는 null
 */
async function encryptPw(plainText) {
  try {
    console.log('비밀번호 암호화 시작');

    const length = plainText.length;
    let keyLength;

    if (length <= 16) {
      keyLength = 16;
    } else if (length <= 24) {
      keyLength = 24;
    } else if (length <= 32) {
      keyLength = 32;
    } else {
      throw new Error('PlainText length must be 32 or less.');
    }

    // SHA-256 해시 생성
    const hash = crypto.createHash('sha256');
    hash.update(plainText, 'utf8');
    const hashed = hash.digest();
    const plainBytes = hashed.slice(0, keyLength);

    // 공개키 로드
    let resourcesPath;
    if (app.isPackaged) {
      resourcesPath = path.join(process.resourcesPath, 'resources');
    } else {
      resourcesPath = path.join(process.cwd(), 'src', 'resources');
    }

    const pubkeyPath = path.join(resourcesPath, 'key', 'pubkey.pem');

    if (!fs.existsSync(pubkeyPath)) {
      throw new Error(`공개키 파일을 찾을 수 없습니다: ${pubkeyPath}`);
    }

    const pemContent = fs.readFileSync(pubkeyPath, 'utf8');

    // RSA-OAEP(SHA-1) 암호화
    const encrypted = crypto.publicEncrypt({
      key: pemContent,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1'
    }, plainBytes);

    const base64Encrypted = encrypted.toString('base64');

    console.log('비밀번호 암호화 완료');
    return base64Encrypted;

  } catch (error) {
    console.error('비밀번호 암호화 실패:', error);
    return null;
  }
}

/**
 * 파일을 암호화합니다 (Python 서버에 요청).
 * @param {string} file - 파일명
 * @param {string} videoPw - 비밀번호
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} { success, data }
 */
async function encryptFile(file, videoPw, userId) {
  const hashMap = {
    success: true,
    data: null
  };

  try {
    console.log('암호화 요청:', { file, userId });

    // 1. 비밀번호 암호화
    const encryptedKeyB64 = await encryptPw(videoPw);
    if (!encryptedKeyB64) {
      throw new Error('비밀번호 암호화 실패');
    }

    // 2. Python 서버에 요청
    const formData = new FormData();
    formData.append('file', file);

    const encryptUrl = config.encrypt;

    console.log('Python 서버 요청:', encryptUrl);

    const response = await apiPython.post(encryptUrl, formData, {
      headers: {
        'Encryption-Key': encryptedKeyB64,
        'User-Id': userId,
        ...formData.getHeaders()
      },
      timeout: 300000
    });

    const result = response.data;
    console.log('Python 서버 응답:', result);

    if (result && result.job_id) {
      hashMap.data = result.job_id;
      hashMap.success = true;
    } else {
      hashMap.data = "서버에서 에러가 발생했습니다. 다시 시도해주세요.";
      hashMap.success = false;
    }

  } catch (error) {
    console.error('암호화 처리 오류:', error);

    if (error.response) {
      const status = error.response.status;
      if (status === 500) {
        hashMap.data = "비밀번호가 일치하지 않습니다.";
      } else {
        hashMap.data = `서버 오류 (${status}): ${error.response.data || error.message}`;
      }
    } else if (error.code === 'ECONNREFUSED') {
      hashMap.data = "Python 서버에 연결할 수 없습니다.";
    } else if (error.code === 'ETIMEDOUT') {
      hashMap.data = "요청 시간이 초과되었습니다.";
    } else {
      hashMap.data = "서버에서 에러가 발생했습니다. 다시 시도해주세요.";
      writeLogToFile('암호화 처리 오류:', {
        name: error.name,
        message: error.message,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        stack: error.stack
      });
    }

    hashMap.success = false;
  }

  return hashMap;
}

/**
 * 암호화 관련 IPC 핸들러를 등록합니다.
 */
export function registerEncryptHandlers() {
  ipcMain.handle('encrypt-file', async (event, requestData) => {
    const { file, videoPw, userId } = requestData;
    const resultMap = await encryptFile(file, videoPw, userId);
    return resultMap;
  });
}
