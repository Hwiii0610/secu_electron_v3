/**
 * 공유 유틸리티 모듈
 * 경로 처리, FFmpeg 바이너리 위치, 비디오 정보 파싱 등 공통 유틸리티를 제공합니다.
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import dirConfig from '../dirConfig.json';
import { sendLogToRenderer } from './logger.js';

export const CONFIG_INI_PATH = path.join(dirConfig.exportConfig, 'config.ini');

/**
 * config.ini 파일을 파싱하여 설정 객체를 반환합니다.
 */
export function loadIniSettings() {
  try {
    if (!fs.existsSync(CONFIG_INI_PATH)) {
      console.warn('config.ini not found:', CONFIG_INI_PATH);
      return {};
    }
    const lines = fs.readFileSync(CONFIG_INI_PATH, 'utf-8').split(/\r?\n/);
    const settings = {};
    let currentSection = null;

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith(';') || line.startsWith('#')) continue;

      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.substring(1, line.length - 1).toLowerCase();
        settings[currentSection] = settings[currentSection] || {};
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
  } catch (e) {
    console.error('config.ini parse error:', e);
    return {};
  }
}

/**
 * Windows/macOS/Linux 경로를 정규화합니다.
 */
export function normalizeWinPath(p) {
  if (!p) return '';
  let s = String(p);
  if (s.startsWith('file:///')) s = decodeURI(s.replace(/^file:\/\//, ''));
  if (process.platform === 'win32') {
    s = s.replace(/\//g, '\\').replace(/\\+$/, '');
  } else {
    s = s.replace(/\\/g, '/').replace(/\/+$/, '');
  }
  return s;
}

/**
 * 비디오 디렉토리 경로를 반환합니다.
 */
export function getVideoDir() {
  const ini = loadIniSettings();
  const iniVideoPath = ini?.path?.video_path;
  const rawPath = (iniVideoPath && iniVideoPath.trim()) ? iniVideoPath : dirConfig.videoDir;
  return normalizeWinPath(rawPath);
}

/**
 * FFmpeg 바이너리 경로를 반환합니다.
 */
export function getFFmpegPath() {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    const systemFfmpeg = process.platform === 'darwin' ? '/opt/homebrew/bin/ffmpeg' : '/usr/bin/ffmpeg';
    if (fs.existsSync(systemFfmpeg)) {
      return systemFfmpeg;
    }
    return 'ffmpeg';
  }

  let resourcesPath;
  if (app.isPackaged) {
    resourcesPath = path.join(process.resourcesPath, 'resources');
  } else {
    resourcesPath = path.join(process.cwd(), 'src', 'resources');
  }

  const ffmpegPath = path.join(resourcesPath, 'ffmpeg.exe');

  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg 바이너리를 찾을 수 없습니다: ${ffmpegPath}`);
  }

  return ffmpegPath;
}

/**
 * FFprobe 바이너리 경로를 반환합니다.
 */
export function getFFprobePath() {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    const systemFfprobe = process.platform === 'darwin' ? '/opt/homebrew/bin/ffprobe' : '/usr/bin/ffprobe';
    if (fs.existsSync(systemFfprobe)) {
      return systemFfprobe;
    }
    return 'ffprobe';
  }

  let resourcesPath;
  if (app.isPackaged) {
    resourcesPath = path.join(process.resourcesPath, 'resources');
  } else {
    resourcesPath = path.join(process.cwd(), 'src', 'resources');
  }

  const ffprobePath = path.join(resourcesPath, 'ffprobe.exe');

  if (!fs.existsSync(ffprobePath)) {
    throw new Error(`FFprobe 바이너리를 찾을 수 없습니다: ${ffprobePath}`);
  }

  return ffprobePath;
}

/**
 * 파일명을 정규화합니다 (한글/특수문자 처리).
 */
export function sanitizeFileName(fileName) {
  let sanitized = fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\u3131-\u318E\uAC00-\uD7A3]/g, (match) => {
      return encodeURIComponent(match).replace(/%/g, '');
    })
    .replace(/\s+/g, '_')
    .replace(/\.+$/, '')
    .substring(0, 100);

  const ext = path.extname(fileName);
  const nameWithoutExt = path.basename(sanitized, ext);

  return `${nameWithoutExt}_${Date.now()}${ext}`;
}

/**
 * FFprobe JSON 출력에서 비디오 정보를 파싱합니다.
 */
export function parseVideoInfo(jsonData) {
  const info = {
    duration: 0,
    startTime: 0,
    resolution: '',
    frameRate: 0,
    totalFrames: 0,
    avgFrameRate: 0,
    bitrate: '',
    format: '',
    codec: ''
  };

  try {
    if (jsonData.format) {
      info.duration = parseFloat(jsonData.format.duration) || 0;
      info.startTime = parseFloat(jsonData.format.start_time) || 0;
      info.bitrate = jsonData.format.bit_rate ? `${Math.round(jsonData.format.bit_rate / 1000)} kb/s` : '';
      info.format = jsonData.format.format_name || '';
    }
    sendLogToRenderer('parseVideoInfo - info:', info);

    const videoStream = jsonData.streams?.find(stream => stream.codec_type === 'video');
    if (videoStream) {
      info.resolution = `${videoStream.width}x${videoStream.height}`;

      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        if (den && den !== 0) {
          info.frameRate = num / den;
        }
      }

      if (videoStream.avg_frame_rate) {
        const [num, den] = videoStream.avg_frame_rate.split('/').map(Number);
        if (den && den !== 0) {
          info.avgFrameRate = Math.round(num / den);
        }
      }

      if (videoStream.nb_frames && parseInt(videoStream.nb_frames) > 0) {
        info.totalFrames = parseInt(videoStream.nb_frames);
      } else if (info.duration && info.frameRate) {
        info.totalFrames = Math.round(info.duration * info.frameRate);
      }
      info.codec = (videoStream.codec_name || '').toLowerCase();
    }

  } catch (error) {
    console.error('비디오 정보 파싱 오류:', error);
  }

  return info;
}

/**
 * 시간 문자열(HH:MM:SS.ms)을 초 단위로 변환합니다.
 */
export function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;

  const parts = timeStr.split(':');
  if (parts.length === 3) {
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return 0;
}

/**
 * 비디오 파일의 전체 경로를 찾습니다.
 */
export function findVideoFile(videoName) {
  const videoDir = getVideoDir();
  const directPath = path.join(videoDir, videoName);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const extensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
  const baseName = videoName.replace(/\.[^.]+$/, '');

  for (const ext of extensions) {
    const testPath = path.join(videoDir, baseName + ext);
    if (fs.existsSync(testPath)) {
      return testPath;
    }
  }

  try {
    const files = fs.readdirSync(videoDir);
    for (const file of files) {
      if (file.toLowerCase().includes(videoName.toLowerCase()) ||
          videoName.toLowerCase().includes(file.toLowerCase())) {
        const fullPath = path.join(videoDir, file);
        if (fs.statSync(fullPath).isFile()) {
          return fullPath;
        }
      }
    }
  } catch (error) {
    console.error('비디오 파일 검색 중 오류:', error);
  }

  throw new Error(`비디오 파일을 찾을 수 없습니다: ${videoName}`);
}
