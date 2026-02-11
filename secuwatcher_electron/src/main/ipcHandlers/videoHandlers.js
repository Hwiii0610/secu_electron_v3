import { ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { getFFmpegPath, getFFprobePath, parseVideoInfo, parseTimeToSeconds } from '../utils.js';
import { sendLogToRenderer } from '../logger.js';
import { getMainWindow } from '../state.js';

/**
 * 비디오 정보를 분석합니다.
 * @param {string} filePath - 분석할 비디오 파일 경로
 * @returns {Promise<Object>} FFprobe 분석 결과 JSON 객체
 */
async function analyzeVideo(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFFprobePath();
    let output = '';

    const proc = spawn(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ], {
      cwd: path.dirname(filePath),
      env: { ...process.env }
    });

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          reject(new Error(`FFprobe JSON 파싱 실패: ${e.message}`));
        }
      } else {
        reject(new Error(`FFprobe 분석 실패 (코드: ${code})`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFprobe 프로세스 오류: ${err.message}`));
    });
  });
}

/**
 * 손상된 비디오를 복구합니다.
 * @param {string} inputPath - 입력 비디오 경로
 * @param {number} duration - 비디오 지속 시간 (초)
 * @param {number} startTime - 시작 시간 (초)
 * @returns {Promise<void>}
 */
async function fixVideo(inputPath, duration, startTime) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath();
    const tempPath = inputPath.replace(/(\.[^.]+)$/, '_fixed$1');
    const mainWindow = getMainWindow();

    let args = [];

    if (duration === 0) {
      args = ['-i', inputPath, '-c', 'copy', tempPath];
    } else if (startTime !== 0) {
      args = ['-i', inputPath, '-c', 'copy', '-map', '0', '-avoid_negative_ts', 'make_zero', '-fflags', '+genpts', tempPath];
    } else {
      args = ['-i', inputPath, '-c', 'copy', '-map', '0', '-movflags', 'faststart', tempPath];
    }

    args.push('-progress', 'pipe:1');

    const proc = spawn(ffmpegPath, args, {
      env: { ...process.env }
    });

    let progressOutput = '';

    proc.stdout.on('data', (data) => {
      progressOutput += data.toString();
      const lines = progressOutput.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line.startsWith('out_time=')) {
          const timeStr = line.substring('out_time='.length).trim();
          const currentTime = parseTimeToSeconds(timeStr);
          const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

          if (mainWindow) {
            mainWindow.webContents.send('conversion-progress', {
              progress: Math.min(progress, 100),
              currentTime,
              totalTime: duration
            });
          }
        }
      }

      progressOutput = lines[lines.length - 1];
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          fs.unlinkSync(inputPath);
          fs.renameSync(tempPath, inputPath);
          resolve();
        } catch (err) {
          reject(new Error(`파일 처리 오류: ${err.message}`));
        }
      } else {
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch (e) {
          // 임시 파일 삭제 실패는 무시
        }
        reject(new Error(`비디오 복구 실패 (코드: ${code})`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg 프로세스 오류: ${err.message}`));
    });
  });
}

/**
 * 비디오 프레임 레이트를 수정합니다.
 * @param {string} videoPath - 비디오 파일 경로
 * @param {number} avgFrameRate - 평균 프레임 레이트
 * @param {number} frameRate - 대상 프레임 레이트
 * @param {number} duration - 비디오 지속 시간 (초, 기본값: 0)
 * @returns {Promise<void>}
 */
async function fixFrameRate(videoPath, avgFrameRate, frameRate, duration = 0) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath();
    const tempPath = videoPath.replace(/(\.[^.]+)$/, '_fixed$1');
    const mainWindow = getMainWindow();

    const args = [
      '-y',
      '-i', videoPath,
      '-r', avgFrameRate.toString(),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'copy',
      tempPath,
      '-progress', 'pipe:1'
    ];

    const proc = spawn(ffmpegPath, args, {
      env: { ...process.env }
    });

    let progressOutput = '';

    proc.stdout.on('data', (data) => {
      progressOutput += data.toString();
      const lines = progressOutput.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line.startsWith('out_time=')) {
          const timeStr = line.substring('out_time='.length).trim();
          const currentTime = parseTimeToSeconds(timeStr);
          const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

          if (mainWindow) {
            mainWindow.webContents.send('conversion-progress', {
              progress: Math.min(progress, 100),
              currentTime,
              totalTime: duration
            });
          }
        }
      }

      progressOutput = lines[lines.length - 1];
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          fs.unlinkSync(videoPath);
          fs.renameSync(tempPath, videoPath);
          resolve();
        } catch (err) {
          reject(new Error(`파일 처리 오류: ${err.message}`));
        }
      } else {
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch (e) {
          // 임시 파일 삭제 실패는 무시
        }
        reject(new Error(`프레임 레이트 수정 실패 (코드: ${code})`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg 프로세스 오류: ${err.message}`));
    });
  });
}

/**
 * 비디오 IPC 핸들러를 등록합니다.
 * @returns {void}
 */
export function registerVideoHandlers() {
  /**
   * 비디오 정보를 조회하고 필요시 자동 복구합니다.
   * @param {Object} event - IPC 이벤트
   * @param {string} videoPath - 비디오 파일 경로
   * @returns {Promise<Object>} 비디오 정보 객체
   */
  ipcMain.handle('get-video-info', async (event, videoPath) => {
    try {
      sendLogToRenderer(`비디오 분석 시작: ${videoPath}`);

      let probeData = await analyzeVideo(videoPath);
      let videoInfo = parseVideoInfo(probeData);

      sendLogToRenderer(`초기 분석 완료 - 지속 시간: ${videoInfo.duration}s, 시작 시간: ${videoInfo.startTime}s`);

      // 손상된 비디오 복구
      if (videoInfo.duration === 0 || videoInfo.startTime !== 0) {
        sendLogToRenderer('손상된 비디오 복구 시작...');
        await fixVideo(videoPath, videoInfo.duration, videoInfo.startTime);
        sendLogToRenderer('비디오 복구 완료, 재분석 중...');

        probeData = await analyzeVideo(videoPath);
        videoInfo = parseVideoInfo(probeData);
        sendLogToRenderer(`복구 후 분석 완료 - 지속 시간: ${videoInfo.duration}s`);
      }

      // 프레임 레이트 수정
      if (videoInfo.avgFrameRate !== videoInfo.frameRate) {
        sendLogToRenderer(`프레임 레이트 수정 시작: ${videoInfo.avgFrameRate} → ${videoInfo.frameRate}`);
        await fixFrameRate(videoPath, videoInfo.avgFrameRate, videoInfo.frameRate, videoInfo.duration);
        sendLogToRenderer('프레임 레이트 수정 완료, 재분석 중...');

        probeData = await analyzeVideo(videoPath);
        videoInfo = parseVideoInfo(probeData);
        sendLogToRenderer('최종 분석 완료');
      }

      sendLogToRenderer(`비디오 정보 조회 완료: ${JSON.stringify(videoInfo)}`);
      return videoInfo;
    } catch (error) {
      sendLogToRenderer(`비디오 정보 조회 실패: ${error.message}`);
      throw error;
    }
  });

  /**
   * 비디오를 변환합니다.
   * @param {Object} event - IPC 이벤트
   * @param {string} inputPath - 입력 비디오 경로
   * @param {string} outputPath - 출력 비디오 경로
   * @param {Object} options - 변환 옵션
   * @param {string} options.videoCodec - 비디오 코덱 (기본값: 'libx264')
   * @param {number} options.crf - CRF 값 (기본값: 28)
   * @param {string} options.scale - 스케일 (예: '1920:1080')
   * @param {string} options.fps - 프레임 레이트
   * @returns {Promise<Object>} 변환 결과 객체
   */
  ipcMain.handle('convert-video', (event, inputPath, outputPath, options = {}) => {
    return new Promise((resolve, reject) => {
      try {
        const ffmpegPath = getFFmpegPath();
        const mainWindow = getMainWindow();

        let args = [
          '-fflags', '+genpts',
          '-hwaccel', 'auto',
          '-i', inputPath,
          '-y',
          '-progress', 'pipe:1',
          '-an',
          '-c:v', options.videoCodec || 'libx264',
          '-preset', 'ultrafast',
          '-crf', (options.crf || 28).toString(),
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-f', 'mp4',
          outputPath
        ];

        // 스케일 옵션 추가
        if (options.scale) {
          const pixFmtIndex = args.indexOf('-pix_fmt');
          args.splice(pixFmtIndex + 2, 0, '-vf', `scale=${options.scale}`);
        }

        // FPS 옵션 추가
        if (options.fps) {
          const pixFmtIndex = args.indexOf('-pix_fmt');
          args.splice(pixFmtIndex + 2, 0, '-r', options.fps.toString());
        }

        sendLogToRenderer(`비디오 변환 시작: ${inputPath} → ${outputPath}`);

        const proc = spawn(ffmpegPath, args, {
          env: { ...process.env }
        });

        let progressOutput = '';

        proc.stdout.on('data', (data) => {
          progressOutput += data.toString();
          const lines = progressOutput.split('\n');

          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            if (line.startsWith('out_time=')) {
              const timeStr = line.substring('out_time='.length).trim();
              const currentTime = parseTimeToSeconds(timeStr);

              if (mainWindow) {
                mainWindow.webContents.send('conversion-progress', {
                  progress: currentTime,
                  currentTime,
                  totalTime: 0
                });
              }
            }
          }

          progressOutput = lines[lines.length - 1];
        });

        proc.on('close', (code) => {
          if (code === 0) {
            sendLogToRenderer(`비디오 변환 완료: ${outputPath}`);
            resolve({
              success: true,
              outputPath
            });
          } else {
            sendLogToRenderer(`비디오 변환 실패 (코드: ${code})`);
            reject(new Error(`비디오 변환 실패 (코드: ${code})`));
          }
        });

        proc.on('error', (err) => {
          sendLogToRenderer(`비디오 변환 오류: ${err.message}`);
          reject(new Error(`FFmpeg 프로세스 오류: ${err.message}`));
        });
      } catch (error) {
        sendLogToRenderer(`비디오 변환 초기화 실패: ${error.message}`);
        reject(error);
      }
    });
  });
}
