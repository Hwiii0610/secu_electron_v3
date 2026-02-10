/**
 * 마스킹 데이터 변환 유틸리티
 * 
 * 마스킹 엔트리 변환, 직렬화, 검증 기능을 제공합니다.
 */

/**
 * 마스킹 엔트리 기본 구조
 * @typedef {Object} MaskingEntry
 * @property {number} frame - 프레임 번호
 * @property {string|number} track_id - 트랙 ID
 * @property {Array} bbox - 바운등 박스 좌표
 * @property {string} [bbox_type='rect'] - 박스 타입
 * @property {number} [score] - 신뢰도 점수
 * @property {number} [class_id] - 클래스 ID
 * @property {string} type - 엔트리 타입
 * @property {number} [object=1] - 객체 여부
 */

/**
 * 단일 마스킹 엔트리 정규화
 * @param {Object} entry - 원본 엔트리
 * @returns {MaskingEntry} 정규화된 엔트리
 */
export function normalizeMaskingEntry(entry) {
  return {
    frame: entry.frame,
    track_id: entry.track_id,
    bbox: typeof entry.bbox === 'string' ? JSON.parse(entry.bbox) : entry.bbox,
    bbox_type: entry.bbox_type || 'rect',
    score: entry.score ?? null,
    class_id: entry.class_id ?? null,
    type: entry.type,
    object: entry.object ?? 1
  };
}

/**
 * 마스킹 엔트리 배열 변환
 * @param {Array} entries - 원본 엔트리 배열
 * @returns {Array<MaskingEntry>} 정규화된 엔트리 배열
 * 
 * @example
 * const normalized = convertMaskingEntries([
 *   { frame: 10, track_id: '1', bbox: '[0,0,100,100]', type: 'manual' }
 * ]);
 * // => [{ frame: 10, track_id: '1', bbox: [0,0,100,100], bbox_type: 'rect', ... }]
 */
export function convertMaskingEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(normalizeMaskingEntry);
}

/**
 * 마스킹 엔트리를 백엔드 전송 형식으로 변환
 * @param {Array} entries - 마스킹 엔트리 배열
 * @param {string} videoName - 비디오 파일명
 * @returns {{videoName: string, entries: Array}} 백엔드 전송 데이터
 */
export function createMaskingPayload(entries, videoName = 'default.mp4') {
  return {
    videoName,
    entries: convertMaskingEntries(entries)
  };
}

/**
 * bbox 문자열 파싱
 * @param {string|Array} bbox - bbox 데이터 (문자열 또는 배열)
 * @returns {Array|null} 파싱된 bbox 배열
 */
export function parseBbox(bbox) {
  if (!bbox) return null;
  
  if (Array.isArray(bbox)) {
    return bbox;
  }
  
  if (typeof bbox === 'string') {
    try {
      return JSON.parse(bbox);
    } catch {
      return null;
    }
  }
  
  return null;
}

/**
 * bbox 직렬화
 * @param {Array} bbox - bbox 배열
 * @returns {string} JSON 문자열
 */
export function serializeBbox(bbox) {
  if (!bbox) return '';
  if (typeof bbox === 'string') return bbox;
  return JSON.stringify(bbox);
}

/**
 * 마스킹 로그 Map 구성
 * @param {Array} maskingLogs - 마스킹 로그 배열
 * @returns {Object} frame 키 기준 Map
 */
export function buildMaskingLogsMap(maskingLogs) {
  const map = {};
  
  for (const log of maskingLogs) {
    const frame = Number(log.frame);
    if (!map[frame]) map[frame] = [];
    map[frame].push(log);
  }
  
  return map;
}

/**
 * Map에 마스킹 로그 추가
 * @param {Object} map - 마스킹 로그 Map
 * @param {Object} entry - 추가할 엔트리
 */
export function addToMaskingLogsMap(map, entry) {
  const frame = Number(entry.frame);
  if (!map[frame]) map[frame] = [];
  map[frame].push(entry);
}

/**
 * 마스킹 엔트리 고유 키 생성
 * @param {Object} entry - 마스킹 엔트리
 * @returns {string} 고유 키 (frame:track_id)
 */
export function getEntryKey(entry) {
  return `${entry.frame}:${entry.track_id}`;
}

/**
 * 마스킹 엔트리 비교 (동일 여부)
 * @param {Object} a - 엔트리 A
 * @param {Object} b - 엔트리 B
 * @returns {boolean}
 */
export function isSameEntry(a, b) {
  return a.frame === b.frame && a.track_id === b.track_id;
}

/**
 * CSV 데이터에서 마스킹 엔트리 생성
 * @param {string} csvLine - CSV 한 줄
 * @returns {MaskingEntry|null} 파싱된 엔트리
 */
export function parseMaskingFromCsv(csvLine) {
  if (!csvLine || !csvLine.trim()) return null;
  
  const parts = csvLine.split(',');
  if (parts.length < 5) return null;
  
  return {
    frame: parseInt(parts[0], 10),
    track_id: parts[1],
    bbox: [parseFloat(parts[2]), parseFloat(parts[3]), parseFloat(parts[4]), parseFloat(parts[5])],
    bbox_type: parts[6] || 'rect',
    class_id: parts[7] ? parseInt(parts[7], 10) : null,
    score: parts[8] ? parseFloat(parts[8]) : null,
    type: parts[9] || 'auto',
    object: parts[10] ? parseInt(parts[10], 10) : 1
  };
}

/**
 * 마스킹 엔트리를 CSV 문자열로 변환
 * @param {Object} entry - 마스킹 엔트리
 * @returns {string} CSV 한 줄
 */
export function maskingEntryToCsv(entry) {
  const bbox = Array.isArray(entry.bbox) ? entry.bbox.join(',') : entry.bbox;
  return [
    entry.frame,
    entry.track_id,
    bbox,
    entry.bbox_type || 'rect',
    entry.class_id ?? '',
    entry.score ?? '',
    entry.type || 'auto',
    entry.object ?? 1
  ].join(',');
}

/**
 * 프레임 범위로 마스킹 엔트리 필터링
 * @param {Array} entries - 마스킹 엔트리 배열
 * @param {number} startFrame - 시작 프레임
 * @param {number} endFrame - 끝 프레임
 * @returns {Array} 필터링된 엔트리 배열
 */
export function filterMaskingsByFrameRange(entries, startFrame, endFrame) {
  return entries.filter(entry => {
    const frame = Number(entry.frame);
    return frame >= startFrame && frame <= endFrame;
  });
}

/**
 * track_id로 마스킹 엔트리 필터링
 * @param {Array} entries - 마스킹 엔트리 배열
 * @param {string|number} trackId - 트랙 ID
 * @returns {Array} 필터링된 엔트리 배열
 */
export function filterMaskingsByTrackId(entries, trackId) {
  return entries.filter(entry => entry.track_id === trackId);
}

/**
 * 마스킹 엔트리 유효성 검사
 * @param {Object} entry - 검사할 엔트리
 * @returns {{valid: boolean, error?: string}}
 */
export function validateMaskingEntry(entry) {
  if (!entry) {
    return { valid: false, error: '엔트리가 없습니다.' };
  }
  
  if (typeof entry.frame !== 'number' || entry.frame < 0) {
    return { valid: false, error: '유효하지 않은 프레임 번호입니다.' };
  }
  
  if (!entry.track_id) {
    return { valid: false, error: 'track_id가 필요합니다.' };
  }
  
  if (!entry.bbox) {
    return { valid: false, error: 'bbox가 필요합니다.' };
  }
  
  return { valid: true };
}
