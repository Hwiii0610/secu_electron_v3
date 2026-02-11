import { ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { getFFmpegPath, getVideoDir, findVideoFile } from '../utils.js';
import { sendLogToRenderer } from '../logger.js';

/**
 * 비디오 편집 IPC 핸들러를 등록하는 함수
 * FFmpeg을 사용하여 비디오 자르기 및 병합 작업을 처리
 */
export function registerVideoEditHandlers() {
  /**
   * 비디오 자르기 IPC 핸들러
   * 비디오의 특정 구간을 추출하여 새로운 파일로 저장
   */
  ipcMain.handle('trim-video', async (event, requestBody) => {
    try {
      // 요청 본문에서 필요한 파라미터 추출
      const { videoName, startTime: startTimeStr, endTime: endTimeStr } = requestBody;

      // 비디오 이름 유효성 검사
      if (!videoName || typeof videoName !== 'string') {
        throw new Error('유효하지 않은 비디오 이름');
      }

      const startTime = parseFloat(startTimeStr);
      const endTime = parseFloat(endTimeStr);

      if (isNaN(startTime) || isNaN(endTime) || startTime >= endTime) {
        throw new Error('유효하지 않은 시간 값');
      }

      // 입력 파일 찾기 및 존재 확인
      const inputFile = findVideoFile(videoName);
      if (!inputFile || !fs.existsSync(inputFile)) {
        throw new Error(`비디오 파일을 찾을 수 없음: ${videoName}`);
      }

      // 현재 시간을 기반으로 출력 폴더 생성 (YYYYMMDDHHMM 형식)
      const now = new Date();
      const timeFolder = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);

      // 비디오 디렉토리 및 자르기 폴더 경로 설정
      const videoDir = getVideoDir();
      const cropBaseDir = path.join(videoDir, 'crop');
      const cropTimeDir = path.join(cropBaseDir, timeFolder);

      // 자르기 폴더 생성 (필요시 재귀적으로 생성)
      fs.mkdirSync(cropTimeDir, { recursive: true });

      // 기존 파일을 기반으로 N 값을 증가시켜 출력 파일명 생성
      const baseName = path.parse(videoName).name;
      let fileNumber = 1;
      let outputFileName = `${baseName}_crop${fileNumber}.mp4`;
      let outputPath = path.join(cropTimeDir, outputFileName);

      // 기존 파일이 있으면 번호 증가
      while (fs.existsSync(outputPath)) {
        fileNumber++;
        outputFileName = `${baseName}_crop${fileNumber}.mp4`;
        outputPath = path.join(cropTimeDir, outputFileName);
      }

      // FFmpeg 프로세스를 Promise로 래핑하여 반환
      return new Promise((resolve, reject) => {
        const ffmpegPath = getFFmpegPath();
        const args = [
          '-ss',
          startTime.toString(),
          '-to',
          endTime.toString(),
          '-i',
          inputFile,
          '-c',
          'copy',
          '-y',
          outputPath
        ];

        const ffmpegProcess = spawn(ffmpegPath, args);
        let stderr = '';
        let stdout = '';

        ffmpegProcess.stdout.on('data', (data) => {
          stdout += data.toString();
          sendLogToRenderer('비디오 자르기 stdout: ' + data.toString());
        });

        ffmpegProcess.stderr.on('data', (data) => {
          stderr += data.toString();
          sendLogToRenderer('비디오 자르기 stderr: ' + data.toString());
        });

        // 180초 타임아웃 설정
        const timeoutId = setTimeout(() => {
          ffmpegProcess.kill();
          reject(new Error('비디오 자르기 작업 시간 초과 (180초)'));
        }, 180000);

        ffmpegProcess.on('close', (code) => {
          clearTimeout(timeoutId);

          if (code === 0) {
            try {
              // 생성된 파일의 크기 조회
              const fileSize = fs.statSync(outputPath).size;

              resolve({
                fileName: outputFileName,
                timeFolder,
                filePath: `crop/${timeFolder}/${outputFileName}`,
                fileSize,
                startTime,
                endTime,
                duration: endTime - startTime
              });
            } catch (error) {
              reject(new Error('파일 통계 조회 실패: ' + error.message));
            }
          } else {
            reject(new Error(`FFmpeg 종료 코드: ${code}, stderr: ${stderr}`));
          }
        });

        ffmpegProcess.on('error', (error) => {
          clearTimeout(timeoutId);
          reject(new Error('FFmpeg 프로세스 오류: ' + error.message));
        });
      });
    } catch (error) {
      sendLogToRenderer('비디오 자르기 오류: ' + error.message);
      throw error;
    }
  });

  /**
   * 비디오 병합 IPC 핸들러
   * 여러 비디오 파일을 하나로 병합하거나 단일 파일의 경우 경로 반환
   */
  ipcMain.handle('merge-videos', async (event, requestBody) => {
    let concatFilePath = null;

    try {
      // 요청 본문에서 파일 경로 배열 추출
      const { filePaths } = requestBody;

      // 파일 경로 유효성 검사
      if (!Array.isArray(filePaths) || filePaths.length < 1) {
        throw new Error('최소 1개 이상의 파일 경로가 필요합니다');
      }

      const videoDir = getVideoDir();

      // 단일 파일의 경우 처리
      if (filePaths.length === 1) {
        const sourceFilePath = path.join(videoDir, filePaths[0]);

        if (!fs.existsSync(sourceFilePath)) {
          throw new Error(`파일을 찾을 수 없음: ${filePaths[0]}`);
        }

        const fileName = path.basename(filePaths[0]);
        const fileSize = fs.statSync(sourceFilePath).size;

        return {
          fileName,
          filePath: filePaths[0],
          fileSize,
          mergedFrom: filePaths,
          absolutePath: sourceFilePath,
          isSingleFile: true
        };
      }

      // 다중 파일의 경우 병합 처리
      const now = new Date();
      const timestamp = now
        .toISOString()
        .replace(/[-T:]/g, '')
        .replace(/\.\d+Z/, '');
      const outputFileName = `merged_${timestamp}.mp4`;
      const outputPath = path.join(videoDir, outputFileName);

      // 임시 concat 파일 생성
      const tempDir = path.join(process.cwd(), 'temp');
      fs.mkdirSync(tempDir, { recursive: true });
      concatFilePath = path.join(tempDir, `concat_${Date.now()}.txt`);

      // concat 파일에 파일 경로 작성
      const concatContent = filePaths
        .map((filePath) => {
          const fullPath = path.join(videoDir, filePath);
          const normalizedPath = fullPath.replace(/\\\\/g, '/');
          return `file '${normalizedPath}'`;
        })
        .join('\n');

      fs.writeFileSync(concatFilePath, concatContent);

      // FFmpeg 프로세스를 Promise로 래핑하여 반환
      return new Promise((resolve, reject) => {
        const ffmpegPath = getFFmpegPath();
        const args = [
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          concatFilePath,
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          '-y',
          outputPath
        ];

        const ffmpegProcess = spawn(ffmpegPath, args);
        let stderr = '';
        let stdout = '';

        ffmpegProcess.stdout.on('data', (data) => {
          stdout += data.toString();
          sendLogToRenderer('비디오 병합 stdout: ' + data.toString());
        });

        ffmpegProcess.stderr.on('data', (data) => {
          stderr += data.toString();
          sendLogToRenderer('비디오 병합 stderr: ' + data.toString());
        });

        // 300초 타임아웃 설정
        const timeoutId = setTimeout(() => {
          ffmpegProcess.kill();

          // 타임아웃 시 concat 파일 정리
          try {
            if (concatFilePath && fs.existsSync(concatFilePath)) {
              fs.unlinkSync(concatFilePath);
            }
          } catch (cleanupError) {
            sendLogToRenderer('Concat 파일 정리 실패: ' + cleanupError.message);
          }

          reject(new Error('비디오 병합 작업 시간 초과 (300초)'));
        }, 300000);

        ffmpegProcess.on('close', (code) => {
          clearTimeout(timeoutId);

          try {
            // concat 파일 정리
            if (concatFilePath && fs.existsSync(concatFilePath)) {
              fs.unlinkSync(concatFilePath);
            }
          } catch (cleanupError) {
            sendLogToRenderer('Concat 파일 정리 실패: ' + cleanupError.message);
          }

          if (code === 0) {
            try {
              // 병합된 파일의 크기 조회
              const fileSize = fs.statSync(outputPath).size;

              resolve({
                fileName: outputFileName,
                filePath: outputFileName,
                fileSize,
                mergedFrom: filePaths,
                absolutePath: outputPath
              });
            } catch (error) {
              reject(new Error('파일 통계 조회 실패: ' + error.message));
            }
          } else {
            reject(new Error(`FFmpeg 종료 코드: ${code}, stderr: ${stderr}`));
          }
        });

        ffmpegProcess.on('error', (error) => {
          clearTimeout(timeoutId);

          try {
            // 오류 발생 시 concat 파일 정리
            if (concatFilePath && fs.existsSync(concatFilePath)) {
              fs.unlinkSync(concatFilePath);
            }
          } catch (cleanupError) {
            sendLogToRenderer('Concat 파일 정리 실패: ' + cleanupError.message);
          }

          reject(new Error('FFmpeg 프로세스 오류: ' + error.message));
        });
      });
    } catch (error) {
      // 초기 오류 발생 시 concat 파일 정리
      try {
        if (concatFilePath && fs.existsSync(concatFilePath)) {
          fs.unlinkSync(concatFilePath);
        }
      } catch (cleanupError) {
        sendLogToRenderer('Concat 파일 정리 실패: ' + cleanupError.message);
      }

      sendLogToRenderer('비디오 병합 오류: ' + error.message);
      throw error;
    }
  });
}
