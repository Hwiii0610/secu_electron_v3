/**
 * 파일 경로 유틸리티
 * 
 * 파일 경로 정규화, 변환, 추출 기능을 제공합니다.
 */

/**
 * file:// 프로토콜 제거 및 경로 정규화
 * @param {string} url - 파일 URL 또는 경로
 * @returns {string} 정규화된 파일 경로
 * 
 * @example
 * normalizeFilePath('file:///C:/path/to/file.mp4')
 * // => 'C:/path/to/file.mp4'
 * 
 * normalizeFilePath('file://C:/path/to/file.mp4')
 * // => 'C:/path/to/file.mp4'
 */
export function normalizeFilePath(url) {
  if (!url) return '';
  return decodeURI(url)
    .replace(/^file:\/+/, '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
}

/**
 * 파일 URL에서 경로 추출 (간단 버전)
 * @param {string} url - 파일 URL
 * @returns {string} 파일 경로
 * 
 * @example
 * extractPath('file:///C:/path/to/file.mp4')
 * // => '/C:/path/to/file.mp4'
 */
export function extractPath(url) {
  if (!url) return '';
  if (url.startsWith('file:///')) {
    return decodeURI(url.replace(/^file:\/\//, ''));
  }
  return url;
}

/**
 * 파일 객체에서 실제 경로 추출
 * @param {Object} file - 파일 객체
 * @param {string} [file.file] - 파일 경로 (우선순위 1)
 * @param {string} [file.path] - 파일 경로 (우선순위 2)
 * @param {string} [file.url] - 파일 URL (우선순위 3)
 * @param {string} [file.name] - 파일명 (우선순위 4)
 * @returns {string} 파일 경로
 */
export function getFilePath(file) {
  if (!file) return '';
  
  const rawPath = file.file || file.path || file.url || file.name;
  if (!rawPath) return '';
  
  return normalizeFilePath(rawPath);
}

/**
 * 파일 경로에서 파일명 추출
 * @param {string} filepath - 파일 경로
 * @returns {string} 파일명
 * 
 * @example
 * getFileName('/path/to/video.mp4')
 * // => 'video.mp4'
 */
export function getFileName(filepath) {
  if (!filepath) return '';
  const normalized = normalizeFilePath(filepath);
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || '';
}

/**
 * 파일 경로에서 확장자 추출
 * @param {string} filepath - 파일 경로
 * @returns {string} 확장자 (소문자, 점 제외)
 * 
 * @example
 * getExtension('video.MP4')
 * // => 'mp4'
 */
export function getExtension(filepath) {
  if (!filepath) return '';
  const filename = getFileName(filepath);
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : '';
}

/**
 * 파일 경로에서 디렉토리 경로 추출
 * @param {string} filepath - 파일 경로
 * @returns {string} 디렉토리 경로
 * 
 * @example
 * getDirectory('/path/to/video.mp4')
 * // => '/path/to'
 */
export function getDirectory(filepath) {
  if (!filepath) return '';
  const normalized = normalizeFilePath(filepath);
  const lastSep = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return lastSep > 0 ? normalized.slice(0, lastSep) : '';
}

/**
 * 비디오 파일 여부 확인
 * @param {string} filepath - 파일 경로
 * @returns {boolean}
 */
export function isVideoFile(filepath) {
  const ext = getExtension(filepath);
  return ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'].includes(ext);
}

/**
 * 이미지 파일 여부 확인
 * @param {string} filepath - 파일 경로
 * @returns {boolean}
 */
export function isImageFile(filepath) {
  const ext = getExtension(filepath);
  return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext);
}

/**
 * 경로가 file:// 프로토콜을 포함하는지 확인
 * @param {string} path - 경로
 * @returns {boolean}
 */
export function hasFileProtocol(path) {
  if (!path) return false;
  return path.startsWith('file://');
}
