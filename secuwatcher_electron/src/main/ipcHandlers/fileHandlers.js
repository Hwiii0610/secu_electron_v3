import { app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { promisify } from 'node:util';
import dirConfig from '../../dirConfig.json';
import { getVideoDir, sanitizeFileName } from '../utils.js';

const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

/**
 * 외부 JSON 파일의 경로를 반환하는 헬퍼 함수
 * @param {string} filename - 파일 이름
 * @returns {string} 전체 경로
 */
function getExternalJsonPath(filename) {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), filename);
  } else {
    return path.join(process.cwd(), filename);
  }
}

/**
 * 외부 JSON 파일을 읽는 헬퍼 함수
 * @param {string} filename - 파일 이름
 * @returns {object|null} 파싱된 JSON 객체 또는 null
 */
function readExternalJsonFile(filename) {
  try {
    const filePath = getExternalJsonPath(filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading external JSON file ${filename}:`, error);
    return null;
  }
}

/**
 * 외부 JSON 파일을 쓰는 헬퍼 함수
 * @param {string} filename - 파일 이름
 * @param {object} data - 저장할 데이터
 * @returns {boolean} 성공 여부
 */
function writeExternalJsonFile(filename, data) {
  try {
    const filePath = getExternalJsonPath(filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error writing external JSON file ${filename}:`, error);
    return false;
  }
}

/**
 * 비디오 파일을 재귀적으로 스캔하는 헬퍼 함수
 * @param {string} dir - 검색 디렉토리
 * @param {string[]} extensions - 찾을 확장자 배열
 * @param {number} currentDepth - 현재 깊이
 * @param {number} maxDepth - 최대 깊이
 * @returns {string[]} 발견된 파일 경로 배열
 */
function scanVideoFiles(dir, extensions, currentDepth, maxDepth) {
  const results = [];

  try {
    if (!fs.existsSync(dir)) {
      return results;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && currentDepth < maxDepth) {
        // 재귀적으로 디렉토리 스캔
        const nestedResults = scanVideoFiles(fullPath, extensions, currentDepth + 1, maxDepth);
        results.push(...nestedResults);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }

  return results;
}

/**
 * 모든 파일 핸들러를 등록하는 함수
 * IPC 통신을 통해 메인 프로세스와 렌더러 프로세스 간의 파일 작업을 처리합니다.
 */
export function registerFileHandlers() {
  /**
   * 1. 데스크탑 경로 반환
   */
  ipcMain.handle('get-desktop-dir', () => {
    return app.getPath('desktop');
  });

  /**
   * 2. 임시 파일 저장
   */
  ipcMain.handle('save-temp-file', async (event, arrayBuffer, fileName) => {
    try {
      const tempDir = path.join(process.cwd(), 'temp');

      // 임시 디렉토리 생성 (존재하지 않으면)
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const sanitized = sanitizeFileName(fileName);
      const tempFilePath = path.join(tempDir, sanitized);

      // ArrayBuffer를 Buffer로 변환
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(tempFilePath, buffer);

      return tempFilePath;
    } catch (error) {
      console.error('Error saving temp file:', error);
      throw error;
    }
  });

  /**
   * 6. 외부 JSON 파일 읽기
   */
  ipcMain.handle('read-external-json', (event, filename) => {
    return readExternalJsonFile(filename);
  });

  /**
   * 7. 외부 JSON 파일 쓰기
   */
  ipcMain.handle('write-external-json', (event, filename, data) => {
    return writeExternalJsonFile(filename, data);
  });

  /**
   * 8. 앱 경로 정보 반환
   */
  ipcMain.handle('get-app-path', () => {
    return {
      isPackaged: app.isPackaged,
      execPath: process.execPath,
      execDir: path.dirname(process.execPath),
      cwd: process.cwd(),
      resourcesPath: process.resourcesPath,
    };
  });

  /**
   * 9. 임시 파일 삭제
   */
  ipcMain.handle('delete-temp-file', async (event, filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        await unlink(filePath);
      }
      return true;
    } catch (error) {
      console.error('Error deleting temp file:', error);
      return false;
    }
  });

  /**
   * 10. 임시 경로 반환
   */
  ipcMain.handle('get-temp-path', async (event, fileName) => {
    try {
      const tempDir = path.join(process.cwd(), 'temp');

      // 임시 디렉토리 생성 (존재하지 않으면)
      if (!fs.existsSync(tempDir)) {
        await mkdir(tempDir, { recursive: true });
      }

      const sanitized = sanitizeFileName(fileName);
      return path.join(tempDir, sanitized);
    } catch (error) {
      console.error('Error getting temp path:', error);
      throw error;
    }
  });

  /**
   * 11. 임시 파일을 Blob으로 반환
   */
  ipcMain.handle('get-temp-file-as-blob', async (event, filePath) => {
    try {
      const buffer = await readFile(filePath);
      return buffer;
    } catch (error) {
      console.error('Error reading temp file as blob:', error);
      throw error;
    }
  });

  /**
   * 12. 파일 통계 정보 반환
   */
  ipcMain.handle('stat-file', (event, filePath) => {
    try {
      const stat = fs.statSync(filePath);
      return { size: stat.size };
    } catch (error) {
      console.error('Error getting file stats:', error);
      throw error;
    }
  });

  /**
   * 13. JSON 또는 CSV 파일 로드
   */
  ipcMain.handle('load-json', (event, { VideoName, VideoPath, VideoDir }) => {
    try {
      const fromPath = (p) => (p ? p.replace(/^file:\/+/, '') : '');
      const baseName = path.basename(VideoName, path.extname(VideoName));
      const desktop = app.getPath('desktop');

      const hintDirA = VideoDir ? fromPath(VideoDir) : null;
      const hintDirB = VideoPath ? fromPath(VideoPath).replace(/[^\\/]*$/, '') : null;

      // 후보 경로 배열 생성
      const candidates = [
        hintDirA ? path.join(hintDirA, `${baseName}.json`) : null,
        hintDirB ? path.join(hintDirB, `${baseName}.json`) : null,
        path.join(desktop, `${baseName}.json`),
        hintDirA ? path.join(hintDirA, `${baseName}.csv`) : null,
        hintDirB ? path.join(hintDirB, `${baseName}.csv`) : null,
        path.join(desktop, `${baseName}.csv`),
      ].filter(Boolean);

      // 중복 제거
      const uniqueCandidates = Array.from(new Set(candidates));

      for (const candidate of uniqueCandidates) {
        if (fs.existsSync(candidate)) {
          const content = fs.readFileSync(candidate, 'utf-8');
          const ext = path.extname(candidate).toLowerCase();

          if (ext === '.json') {
            return {
              format: 'json',
              data: JSON.parse(content),
            };
          } else if (ext === '.csv') {
            return {
              format: 'csv',
              data: content,
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error loading JSON/CSV:', error);
      return null;
    }
  });

  /**
   * 14. JSON 파일 저장
   */
  ipcMain.handle('save-json', (event, payload) => {
    try {
      const { fileName, jsonData } = payload;
      const videoDir = getVideoDir();
      const fullPath = path.join(videoDir, fileName);

      // 파일이 이미 존재하는 경우 예외 발생
      if (fs.existsSync(fullPath)) {
        throw new Error(`File already exists: ${fullPath}`);
      }

      fs.writeFileSync(fullPath, JSON.stringify(jsonData, null, 2), 'utf-8');
      return { success: true, message: `JSON file saved: ${fullPath}` };
    } catch (error) {
      console.error('Error saving JSON:', error);
      throw error;
    }
  });

  /**
   * 15. JSON 파일 업데이트
   */
  ipcMain.handle('update-json', (event, { videoName, entries }) => {
    try {
      const baseName = path.basename(videoName, path.extname(videoName));
      const videoDir = getVideoDir();
      const filePath = path.join(videoDir, `${baseName}.json`);

      let jsonData;

      // 기존 JSON 읽기 또는 새로 생성
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        jsonData = JSON.parse(content);
      } else {
        jsonData = {
          schema_version: '1.0.0',
          metadata: {
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          frames: {},
        };
      }

      let addedCount = 0;

      // 각 엔트리 처리
      for (const entry of entries) {
        const frameKey = String(entry.frame ?? entry.frameNumber);

        if (!jsonData.frames[frameKey]) {
          jsonData.frames[frameKey] = [];
        }

        // 바운딩 박스 파싱 (이미 객체인 경우 그대로 사용)
        const bbox = typeof entry.bbox === 'string' ? JSON.parse(entry.bbox) : entry.bbox;

        // 중복 확인
        const isDuplicate = jsonData.frames[frameKey].some(
          (item) => JSON.stringify(item.bbox) === JSON.stringify(bbox)
        );

        if (!isDuplicate) {
          jsonData.frames[frameKey].push({
            track_id: entry.track_id,
            bbox,
            bbox_type: entry.bbox_type || 'rectangle',
            score: entry.score || 0,
            class_id: entry.class_id || 0,
            type: entry.type || 'detection',
            object: entry.object || {},
          });
          addedCount++;
        }
      }

      // 메타데이터 업데이트
      jsonData.metadata.updated_at = new Date().toISOString();

      // 파일에 저장
      fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');

      return {
        success: true,
        message: `Updated JSON: ${addedCount} entries added`,
        addedCount,
      };
    } catch (error) {
      console.error('Error updating JSON:', error);
      throw error;
    }
  });

  /**
   * 16. 필터링된 JSON 파일 업데이트
   */
  ipcMain.handle('update-filtered-json', (event, requestBody) => {
    try {
      const { videoName, data: maskingData } = requestBody;
      const baseName = path.basename(videoName, path.extname(videoName));
      const videoDir = getVideoDir();
      const filePath = path.join(videoDir, `${baseName}.json`);

      let jsonData;

      // 기존 JSON 읽기 또는 새로 생성
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        jsonData = JSON.parse(content);
      } else {
        jsonData = {
          schema_version: '1.0.0',
          metadata: {
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          frames: {},
        };
      }

      // 모든 프레임 교체
      jsonData.frames = {};

      // 마스킹 데이터 처리
      for (const entry of maskingData) {
        const frameKey = String(entry.frame);

        if (!jsonData.frames[frameKey]) {
          jsonData.frames[frameKey] = [];
        }

        // 바운딩 박스 파싱 (이미 객체인 경우 그대로 사용)
        const bbox = typeof entry.bbox === 'string' ? JSON.parse(entry.bbox) : entry.bbox;

        jsonData.frames[frameKey].push({
          track_id: entry.track_id || 0,
          bbox,
          bbox_type: entry.bbox_type || 'rectangle',
          score: entry.score || 0,
          class_id: entry.class_id || 0,
          type: entry.type || 'detection',
          object: entry.object || {},
        });
      }

      // 메타데이터 업데이트
      jsonData.metadata.updated_at = new Date().toISOString();

      // 파일에 저장
      fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');

      return {
        success: true,
        message: 'Filtered JSON file updated successfully',
      };
    } catch (error) {
      console.error('Error updating filtered JSON:', error);
      throw error;
    }
  });

  /**
   * 18. 디렉토리 스캔 (비디오 파일 검색)
   */
  ipcMain.handle('scan-directory', (event, folderPath) => {
    try {
      const extensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
      const results = scanVideoFiles(folderPath, extensions, 0, 4);
      return results;
    } catch (error) {
      console.error('Error scanning directory:', error);
      return [];
    }
  });

  /**
   * 19. 비디오 파일을 지정된 디렉토리로 복사
   */
  ipcMain.handle('copy-video-to-dir', (event, sourcePath) => {
    try {
      if (!fs.existsSync(sourcePath)) {
        return { success: false, message: 'Source file does not exist' };
      }

      const videoDir = getVideoDir();
      const fileName = path.basename(sourcePath);
      let targetPath = path.join(videoDir, fileName);

      // 비디오 디렉토리 생성 (존재하지 않으면)
      if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
      }

      // 파일이 이미 존재하는 경우
      if (fs.existsSync(targetPath)) {
        const sourceStat = fs.statSync(sourcePath);
        const targetStat = fs.statSync(targetPath);

        // 파일 크기가 같으면 동일 파일로 간주 → 복사하지 않음
        if (sourceStat.size === targetStat.size) {
          return {
            success: true,
            fileName,
            filePath: targetPath,
            copied: false,
            alreadyExists: true,
            message: 'File already exists with same content',
          };
        }

        // 크기가 다르면 다른 파일 → 새로운 이름으로 복사
        const ext = path.extname(fileName);
        const baseName = path.basename(fileName, ext);
        let counter = 1;

        while (fs.existsSync(targetPath)) {
          const newFileName = `${baseName}(${counter})${ext}`;
          targetPath = path.join(videoDir, newFileName);
          counter++;
        }
      }

      // 파일 복사
      fs.copyFileSync(sourcePath, targetPath);

      return {
        success: true,
        fileName: path.basename(targetPath),
        filePath: targetPath,
        copied: true,
        message: `Video copied to ${targetPath}`,
      };
    } catch (error) {
      console.error('Error copying video to directory:', error);
      return { success: false, message: error.message };
    }
  });

  /**
   * 20. JSON 파일을 내보내기 출력 디렉토리로 복사
   */
  ipcMain.handle('copy-json-with-export', (event, { videoName, outputDir }) => {
    try {
      const jsonFileName = path.basename(videoName, path.extname(videoName)) + '.json';

      // 검색할 경로들
      const searchDirs = [
        dirConfig.videoDir,
        dirConfig.MaskingDir,
        path.join(dirConfig.videoDir, 'org'),
        path.join(dirConfig.MaskingDir, 'masking'),
      ];

      let sourcePath = null;

      // JSON 파일 검색
      for (const dir of searchDirs) {
        if (!dir) continue;
        const candidatePath = path.join(dir, jsonFileName);
        if (fs.existsSync(candidatePath)) {
          sourcePath = candidatePath;
          break;
        }
      }

      if (!sourcePath) {
        return { success: false, message: 'JSON file not found' };
      }

      // 출력 디렉토리 생성 (존재하지 않으면)
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const targetPath = path.join(outputDir, jsonFileName);

      // 파일 복사
      fs.copyFileSync(sourcePath, targetPath);

      return {
        success: true,
        sourcePath,
        targetPath,
        message: `JSON file exported to ${targetPath}`,
      };
    } catch (error) {
      console.error('Error copying JSON with export:', error);
      return { success: false, message: error.message };
    }
  });
}
