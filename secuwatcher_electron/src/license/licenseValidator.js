import crypto from 'crypto';
import { generateHardwareId } from './hardwareId';
import fs from 'fs';
import path from 'path';

// 공개키 (외부 사이트의 개인키로 서명한 것을 검증)
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAknmsZpn6GSjkvUXomNNBmbe1+pQ4sDn8Ki/aqMI0crMURaxs+W/AKd1JfRroJJo6sgLcjYVBsDIVXCzuHFOjrF/It/h8Fl7jYKjIdiDJgXoYKHAUnw9nuhxjXG+jzRv7D4AB26OtfFMfAimk6NgWyFDsm2N4ByDQNBhXixx3lkuurC3U3C5u644ps5dblLO1FlWmRVwQjOiulpmKxwvWGwhoB6V4276lhsbcmNGC0vDfSZTdvagK4OrXrBALeh8shoB3atvnWlK7kVu/+iFuTxfsfHPz3bnXn+8yT3K1XrITL3nlGjzBSF+5smg4Hw5rJcmy3KjwIeU3DlVKYjczQQIDAQAB
-----END PUBLIC KEY-----`;


export async function validateLicense(licenseKey) {
  try {
    // 1. Base64 디코딩
    const decoded = Buffer.from(licenseKey, 'base64').toString('utf8');
    const licenseData = JSON.parse(decoded);
    
    // 2. 서명 검증
    const { signature, ...data } = licenseData;
    const verify = crypto.createVerify('SHA256');
    verify.update(JSON.stringify(data));
    const isValid = verify.verify(PUBLIC_KEY, signature, 'hex');
    
    if (!isValid) {
      return { success: false, error: '유효하지 않은 라이센스 키입니다.' };
    }
    
    // 3. 하드웨어 ID 비교
    const currentHardwareId = await generateHardwareId();
    if (licenseData.hardwareId !== currentHardwareId) {
      return { 
        success: false, 
        error: '등록된 장비와 일치하지 않아, 해당 라이센스를 사용할 수 없습니다',
        currentHardwareId
      };
    }
    
    // 4. 만료일 확인 (함수 사용)
    const expiryCheck = checkExpiry(licenseData);
    if (!expiryCheck.valid) {
      return { success: false, error: expiryCheck.error };
    }
    
    return { success: true, data: licenseData };
  } catch (error) {
    return { success: false, error: '라이센스 키 형식이 올바르지 않습니다.' };
  }
}

export function saveLicense(licenseData, userDataPath) {
  const licensePath = path.join(userDataPath, '.license');
  // 간단한 XOR 암호화로 저장 (사용자가 직접 수정 못하게)
  const encrypted = Buffer.from(JSON.stringify(licenseData))
    .toString('base64');
  fs.writeFileSync(licensePath, encrypted, 'utf8');
}

export function loadLicense(userDataPath) {
  try {
    const licensePath = path.join(userDataPath, '.license');
    if (!fs.existsSync(licensePath)) return null;
    
    const encrypted = fs.readFileSync(licensePath, 'utf8');
    const decrypted = Buffer.from(encrypted, 'base64').toString('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    return null;
  }
}

// 만료일 확인 함수 (공통 사용)
export function checkExpiry(licenseData) {
  if (!licenseData.expiryDate) {
    return { valid: true }; // 만료일 없음 = 영구 라이센스
  }
  
  let expiry;
  
  // 배열 형태 [년, 월, 일, 시, 분, 초] 처리
  if (Array.isArray(licenseData.expiryDate)) {
    const [year, month, day, hour, minute, second] = licenseData.expiryDate;
    expiry = new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
  } 
  // ISO 문자열 형태 처리
  else {
    expiry = new Date(licenseData.expiryDate);
  }
  
  // 유효한 날짜인지 확인
  if (isNaN(expiry.getTime())) {
    return { valid: false, error: '라이센스 만료일 형식이 올바르지 않습니다.' };
  }
  
  // 만료 여부 확인
  if (expiry < new Date()) {
    return { valid: false, error: '라이센스가 만료되었습니다.', expiryDate: expiry };
  }
  
  return { valid: true, expiryDate: expiry };
}