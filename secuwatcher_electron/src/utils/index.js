/**
 * 유틸리티 모듈 통합 export
 * 
 * 모든 유틸리티 함수를 한 곳에서 import할 수 있습니다.
 * 
 * @example
 * import { showMessage, normalizeFilePath, validateFrameRange } from '@/utils';
 * import { MESSAGES, formatTime } from '@/utils';
 */

// 메시지 유틸리티
export {
  showMessage,
  showSuccess,
  showError,
  showWarning,
  MESSAGES,
  showSettingsSaved,
  showSettingsSaveFailed,
  showDetectionCompleted,
  showDetectionFailed,
  showConvertError,
  showExportError,
  showBatchCompleted,
  showBatchError,
} from './message';

// 경로 유틸리티
export {
  normalizeFilePath,
  extractPath,
  getFilePath,
  getFileName,
  getExtension,
  getDirectory,
  isVideoFile,
  isImageFile,
  hasFileProtocol,
} from './path';

// API 유틸리티
export {
  apiPost,
  apiGet,
  detectAuto,
  detectSelect,
  exportVideo,
  encryptVideo,
  getProgress,
  batchProcess,
  getJobStatus,
  isJobCompleted,
  isJobFailed,
} from './api';

// 마스킹 유틸리티
export {
  normalizeMaskingEntry,
  convertMaskingEntries,
  createMaskingPayload,
  parseBbox,
  serializeBbox,
  buildMaskingLogsMap,
  addToMaskingLogsMap,
  getEntryKey,
  isSameEntry,
  parseMaskingFromCsv,
  maskingEntryToCsv,
  filterMaskingsByFrameRange,
  filterMaskingsByTrackId,
  validateMaskingEntry,
} from './masking';

// 검증 유틸리티
export {
  validateFrameRange,
  validatePassword,
  validateFileSelection,
  validateObjectSelection,
  validateEmail,
  validateNumberRange,
  validateRequired,
  validateMaxLength,
  validateAll,
  handleValidation,
} from './validation';

// 비디오 유틸리티
export {
  extractVideoMetadata,
  createVideoMetadata,
  formatTime,
  formatDuration,
  parseDurationToSeconds,
  parseFps,
  formatFps,
  timeToFrame,
  frameToTime,
  calculateZoomLevel,
  timeToPercent,
  percentToTime,
  seekByFrames,
  formatResolution,
  createFileInfo,
} from './video';
