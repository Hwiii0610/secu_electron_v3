import { app, BrowserWindow, ipcMain, dialog, globalShortcut, shell, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { spawn } from 'node:child_process';
import dirConfig from './dirConfig.json';
import crypto from 'crypto';
import config from './resources/config.json';
import apiPython from './apiRequest'
import FormData from 'form-data'
import { validateLicense, saveLicense, loadLicense, checkExpiry } from './license/licenseValidator';
import { generateHardwareId } from './license/hardwareId';

let licenseValid = false;

function handleSquirrelEvent() {
  if (process.platform !== 'win32') return false;

  const squirrelEvent = process.argv[1];
  if (!squirrelEvent || !squirrelEvent.startsWith('--squirrel')) return false;

  const appFolder = path.dirname(process.execPath);

  const shortcutBaseDir = (dirConfig.shortcutDir || '').replace(/\//g, '\\');
  const shortcutName = 'SecuWatcher Export.lnk';
  const customShortcutPath = path.join(shortcutBaseDir, shortcutName);

  const makeCustomShortcut = () => {
    if (!shortcutBaseDir) return;
    try {
      if (!fs.existsSync(shortcutBaseDir)) {
        fs.mkdirSync(shortcutBaseDir, { recursive: true });
      }
      const ok = shell.writeShortcutLink(customShortcutPath, {
        target: process.execPath,
        cwd: appFolder,
        icon: process.execPath,
        iconIndex: 0,
        description: 'SecuWatcher Export'
      });
      sendLogToRenderer('custom shortcut created:', ok, customShortcutPath);
    } catch (err) {
      console.error('makeCustomShortcut failed:', err);
    }
  };

  const removeCustomShortcut = () => {
    try {
      if (fs.existsSync(customShortcutPath)) {
        fs.unlinkSync(customShortcutPath);
      }
    } catch { /* noop */ }
  };

  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      // 원하는 경로에 사용자 지정 바로가기 생성
      makeCustomShortcut();
      setTimeout(() => app.quit(), 700);
      return true;

    case '--squirrel-uninstall':
      // 사용자 지정 바로가기 삭제
      removeCustomShortcut();
      setTimeout(() => app.quit(), 700);
      return true;

    case '--squirrel-obsolete':
      app.quit();
      return true;

    default:
      return false;
  }
}

if (handleSquirrelEvent()) {
  // 설치 이벤트 처리 후 종료
  process.exit(0);
}

function handleFirstRun() {
  writeLogToFile('첫 실행 감지 중...');
  try {
    // 수정: app.getPath() 제거하고 dirConfig.shortcutDir 직접 사용
    const firstRunFlagPath = path.join(dirConfig.shortcutDir, 'first-run-completed.json');
    
    writeLogToFile('플래그 파일 경로:', firstRunFlagPath);
    
    // 첫 실행 플래그 파일이 존재하는지 확인
    if (!fs.existsSync(firstRunFlagPath)) {
      writeLogToFile('첫 실행이 감지되었습니다. 앱을 종료합니다.');
      
      // 첫 실행 완료 플래그 파일 생성
      const firstRunData = {
        firstRunCompleted: true,
        completedDate: new Date().toISOString(),
        version: app.getVersion()
      };
      
      try {
        // 디렉토리가 없으면 생성
        if (!fs.existsSync(dirConfig.shortcutDir)) {
          fs.mkdirSync(dirConfig.shortcutDir, { recursive: true });
          writeLogToFile('디렉토리 생성:', dirConfig.shortcutDir);
        }
        
        fs.writeFileSync(firstRunFlagPath, JSON.stringify(firstRunData, null, 2), 'utf-8');
        writeLogToFile('첫 실행 플래그 파일이 생성되었습니다:', firstRunFlagPath);
      } catch (error) {
        writeLogToFile('첫 실행 플래그 파일 생성 실패:', error.message || JSON.stringify(error));
      }
      
      // 앱 종료
      setTimeout(() => {
        writeLogToFile('첫 실행 처리 완료. 앱을 종료합니다.');
        app.quit();
      }, 1000);
      
      return true;
    }
    
    writeLogToFile('이전에 실행된 적이 있는 앱입니다. 정상 실행을 계속합니다.');
    return false;
  } catch (error) {
    // 더 상세한 오류 로깅
    writeLogToFile('첫 실행 감지 중 오류 발생:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return false;
  }
}
function writeLogToFile(message, data = null) {
  const logDir = path.join(dirConfig.logDir);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'export_front.log');
  const timestamp = new Date().toISOString();
  
  let dataStr = '';
  if (data) {
    // Error 객체인 경우 특별 처리
    if (data instanceof Error) {
      dataStr = JSON.stringify({
        name: data.name,
        message: data.message,
        code: data.code,
        stack: data.stack,
        ...data // 추가 속성들
      }, null, 2);
    } 
    // 일반 객체인 경우
    else if (typeof data === 'object') {
      try {
        dataStr = JSON.stringify(data, null, 2);
      } catch (e) {
        dataStr = String(data);
      }
    } 
    // 문자열이나 숫자 등
    else {
      dataStr = String(data);
    }
  }
  
  const logEntry = `[${timestamp}] ${message} ${dataStr}\n`;
  fs.appendFileSync(logFile, logEntry, 'utf-8');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-video', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true}}
]);

let mainWindow;

const CONFIG_INI_PATH = path.join(dirConfig.exportConfig, 'config.ini');

function sendLogToRenderer(message, data = null) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('main-log', { message, data, timestamp: new Date().toISOString() });
  }
}


function loadIniSettings() {
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
function normalizeWinPath(p) {
  if (!p) return '';
  let s = String(p);
  if (s.startsWith('file:///')) s = decodeURI(s.replace(/^file:\/\//, '')); // C:/...
  // 역슬래시로 통일하고 끝의 슬래시는 제거
  s = s.replace(/\//g, '\\').replace(/\\+$/, '');
  return s;
}
function getVideoDir() {
  const ini = loadIniSettings();
  const iniVideoPath = ini?.path?.video_path;
  const rawPath = (iniVideoPath && iniVideoPath.trim()) ? iniVideoPath : dirConfig.videoDir;
  return normalizeWinPath(rawPath); // 경로 정규화 적용
}

function getFFmpegPath() {
  let resourcesPath;
  
  if (app.isPackaged) {
    // 패키징된 앱에서는 process.resourcesPath 사용
    resourcesPath = path.join(process.resourcesPath, 'resources');
  } else {
    // 개발 환경에서는 프로젝트 루트에서 src/resources로 직접 접근
    resourcesPath = path.join(process.cwd(), 'src', 'resources');
  }
  
  const ffmpegPath = path.join(resourcesPath, 'ffmpeg.exe');
  
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg 바이너리를 찾을 수 없습니다: ${ffmpegPath}`);
  }

  return ffmpegPath;
}

function getFFprobePath() {
  let resourcesPath;
  
  if (app.isPackaged) {
    // 패키징된 앱에서는 process.resourcesPath 사용
    resourcesPath = path.join(process.resourcesPath, 'resources');
  } else {
    // 개발 환경에서는 프로젝트 루트에서 src/resources로 직접 접근
    resourcesPath = path.join(process.cwd(), 'src', 'resources');
  }
  
  const ffprobePath = path.join(resourcesPath, 'ffprobe.exe');
  
  if (!fs.existsSync(ffprobePath)) {
    throw new Error(`FFprobe 바이너리를 찾을 수 없습니다: ${ffprobePath}`);
  }

  return ffprobePath;
}

const createWindow = () => {
  writeLogToFile('createWindow 호출');
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 930,
    icon: path.join(__dirname, '../src/assets', 'APP_LOGO.ico'),
    frame: false,
    backgroundColor: '#121519',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    ...(process.platform === 'darwin' && {
      titleBarOverlay : {
        color: '#0078d7',
        symbolColor: '#0078d7',
        height: 30
      }
    })
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  if(!app.isPackaged){
    mainWindow.webContents.openDevTools();
  }

  //배포 단계에서 개발자도구 확인 코드
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });
};

const createLicenseWindow = () => {
  const licenseWindow = new BrowserWindow({
    width: 630,
    height: 650,
    icon: path.join(__dirname, '../src/assets', 'APP_LOGO.ico'),
    frame: true,
    backgroundColor: '#121519',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  let licenseHtmlPath;

  if(app.isPackaged){
    licenseHtmlPath = path.join(process.resourcesPath, 'license.html');
  }else{
    licenseHtmlPath = path.join(process.cwd(), 'license.html');
  }

  licenseWindow.loadFile(licenseHtmlPath);

  // 개발 환경에서 개발자 도구 열기
  if (!app.isPackaged) {
    licenseWindow.webContents.openDevTools();
  }

  // 라이센스 인증 성공 후 메인 윈도우 생성
  licenseWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      if (licenseWindow.webContents.isDevToolsOpened()) {
        licenseWindow.webContents.closeDevTools();
      } else {
        licenseWindow.webContents.openDevTools();
      }
    }
  });

  return licenseWindow;
}

/* 라이센스 관련 메소드 */
ipcMain.handle('get-hardware-id', async () => {
  return await generateHardwareId();
});

ipcMain.handle('select-license-file', async (event) => {
  try {
    const result = await dialog.showOpenDialog({
      title: '라이센스 파일 선택',
      defaultPath: app.getPath('downloads'),
      filters: [
        { name: '라이센스 파일', extensions: ['json', 'txt'] },
        { name: '모든 파일', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    const filePath = result.filePaths[0];
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    return {
      success: true,
      filePath: filePath,
      fileName: path.basename(filePath),
      content: fileContent
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('validate-license', async (event, licenseKey, licenseFilePath) => {
  const result = await validateLicense(licenseKey);
  if (result.success) {
    const userDataPath = app.getPath('userData');
    saveLicense(result.data, userDataPath);
    licenseValid = true;

    // 인증 성공 후 파일들 삭제
    const filesToDelete = [];
    
    // 1. 하드웨어 ID 파일
    const desktopPath = app.getPath('desktop');
    const hardwareIdPath = path.join(desktopPath, 'hardwareId.json');
    if (fs.existsSync(hardwareIdPath)) {
      filesToDelete.push({ path: hardwareIdPath, name: 'hardwareId.json' });
    }
    
    // 2. 라이센스 파일 (업로드한 경우)
    if (licenseFilePath && fs.existsSync(licenseFilePath)) {
      filesToDelete.push({ path: licenseFilePath, name: path.basename(licenseFilePath) });
    }
    
    // 삭제 확인
    if (filesToDelete.length > 0) {
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          writeLogToFile(`파일 삭제 완료: ${file.name}`);
        } catch (deleteError) {
          writeLogToFile(`파일 삭제 실패 (${file.name}):`, deleteError.message);
        }
      });
    }

    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    if (currentWindow) {
      currentWindow.close();
    }
    createWindow();
  }
  return result;
});

ipcMain.handle('export-hardware-id', async (event, hardwareId) => {
  try {
    const desktopPath = app.getPath('desktop');
    const fileName = `hardwareId.json`;
    const filePath = path.join(desktopPath, fileName);
    
    const jsonData = {
      hardwareId: hardwareId,
      exportDate: new Date().toISOString(),
      computerName: require('os').hostname()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
    
    return {
      success: true,
      filePath: filePath,
      fileName: fileName
    };
  } catch (error) {
    console.error('하드웨어 ID 내보내기 실패:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('get-desktop-dir', async () => {
  return app.getPath('desktop');
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', async () => {
  if (mainWindow) {
    // 종료 확인 팝업 표시
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['확인', '취소'],
      defaultId: 0,
      cancelId: 1,
      title: '종료 확인',
      message: '정말로 종료하시겠습니까?',
      detail: '진행 중인 작업이 있다면 저장 후 종료하시기 바랍니다.'
    });

    // 사용자가 '확인' 버튼을 클릭한 경우에만 종료
    if (result.response === 0) {
      mainWindow.destroy(); // 강제 종료
    }
    // 취소를 누르면 아무것도 하지 않음 (창이 닫히지 않음)
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('save-temp-file', async (event, arrayBuffer, fileName) => {
  try {
    // 절대 경로로 temp 디렉토리 설정 (process.cwd() 사용)
    const tempDir = path.join(process.cwd(), 'temp');
    
    // temp 디렉토리가 없으면 생성
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // 파일명 정규화 (한글, 특수문자 처리)
    const sanitizedFileName = sanitizeFileName(fileName);
    const tempFilePath = path.join(tempDir, sanitizedFileName);
    const buffer = Buffer.from(arrayBuffer);
    
    console.log('임시 파일 저장 경로:', tempFilePath); // 디버그용
    
    await promisify(fs.writeFile)(tempFilePath, buffer);
    return tempFilePath;
  } catch (error) {
    console.error('임시 파일 저장 실패:', error);
    throw error;
  }
});


/* 외부 json 파일 읽기 */
// 외부 JSON 파일 읽기 함수 추가
function getExternalJsonPath(filename) {
  if (app.isPackaged) {
    // 패키징된 앱에서는 실행 파일과 같은 경로
    return path.join(path.dirname(process.execPath), filename);
  } else {
    // 개발 환경에서는 프로젝트 루트
    return path.join(process.cwd(), filename);
  }
}

// 외부 JSON 파일을 읽는 함수
function readExternalJsonFile(filename) {
  try {
    const jsonPath = getExternalJsonPath(filename);
    console.log('JSON 파일 경로:', jsonPath);
    
    if (fs.existsSync(jsonPath)) {
      const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(jsonContent);
    } else {
      console.warn(`JSON 파일을 찾을 수 없습니다: ${jsonPath}`);
      return null;
    }
  } catch (error) {
    console.error('JSON 파일 읽기 오류:', error);
    return null;
  }
}

// 외부 JSON 파일 쓰기 함수
function writeExternalJsonFile(filename, data) {
  try {
    const jsonPath = getExternalJsonPath(filename);
    const jsonContent = JSON.stringify(data, null, 2);
    fs.writeFileSync(jsonPath, jsonContent, 'utf-8');
    console.log('JSON 파일 저장 완료:', jsonPath);
    return true;
  } catch (error) {
    console.error('JSON 파일 저장 오류:', error);
    return false;
  }
}

ipcMain.handle('read-external-json', async (event, filename) => {
  return readExternalJsonFile(filename);
});

ipcMain.handle('write-external-json', async (event, filename, data) => {
  return writeExternalJsonFile(filename, data);
});

// 실행 파일 경로 확인용 핸들러
ipcMain.handle('get-app-path', async (event) => {
  return {
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    execDir: path.dirname(process.execPath),
    cwd: process.cwd(),
    resourcesPath: process.resourcesPath
  };
});
/* 외부 json 파일 읽기 끝 */

// 파일명 정규화 함수 추가
function sanitizeFileName(fileName) {
  // 한글과 특수문자를 안전한 문자로 변경
  let sanitized = fileName
    .replace(/[<>:"/\\|?*]/g, '_') // Windows 금지 문자 제거
    .replace(/[\u3131-\u318E\uAC00-\uD7A3]/g, (match) => {
      // 한글을 영문으로 변환 (간단한 방법)
      return encodeURIComponent(match).replace(/%/g, '');
    })
    .replace(/\s+/g, '_') // 공백을 언더스코어로
    .replace(/\.+$/, '') // 끝의 마침표들 제거
    .substring(0, 100); // 파일명 길이 제한
  
  // 확장자 보존
  const ext = path.extname(fileName);
  const nameWithoutExt = path.basename(sanitized, ext);
  
  return `${nameWithoutExt}_${Date.now()}${ext}`; // 타임스탬프 추가로 중복 방지
}

ipcMain.handle('show-message', async (event, message) => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    message: message,
    buttons: ['확인']
  });
});

ipcMain.handle('confirm-message', async (event, message) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    message: message,
    buttons: ['확인', '취소'],
    defaultId: 0,
    cancelId: 1
  });
  return result.response === 0;
});

ipcMain.handle('area-masking-message', async (event, message) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    message: message,
    buttons: ['다각형', '사각형', '취소'],
    defaultId: 0,
    cancelId: 2
  });
  return result.response;
});

ipcMain.handle('delete-temp-file', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      await promisify(fs.unlink)(filePath);
    }
    return true;
  } catch (error) {
    console.error('임시 파일 삭제 실패:', error);
    throw error;
  }
});

function analyzeVideo(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ];

    const ffprobeProcess = spawn(getFFprobePath(), args, {
      cwd: path.dirname(filePath),
      env: { ...process.env }
    });

    let output = '';
    ffprobeProcess.stdout.on('data', (data) => (output += data.toString()));
    ffprobeProcess.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(output));
        } catch (err) {
          reject(new Error(`JSON 파싱 오류: ${err.message}`));
        }
      } else {
        reject(new Error(`ffprobe 오류 (코드 ${code})`));
      }
    });
  });
}

function fixVideo(inputPath, duration, startTime) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath();
    const tempPath = inputPath.replace(/(\.[^.]+)$/, '_fixed$1');

    let args;
    
    if (duration === 0) {
      // duration이 0인 경우: 간단한 복사
      args = ['-i', inputPath, '-c', 'copy', tempPath];
      sendLogToRenderer('🔧 Duration 문제 복구 중:', inputPath);
    } else if (startTime !== 0) {
      // start_time이 0이 아닌 경우: 타임스탬프 정규화
      args = [
        '-i', inputPath,
        '-c', 'copy',
        '-map', '0',
        '-avoid_negative_ts', 'make_zero',
        '-fflags', '+genpts',
        tempPath
      ];
      sendLogToRenderer('🔧 Start time 문제 복구 중:', inputPath, 'startTime:', startTime);
    } else {
      // 일반적인 복구
      args = [
        '-i', inputPath,
        '-c', 'copy',
        '-map', '0',
        '-movflags', 'faststart',
        tempPath
      ];
      sendLogToRenderer('🔧 일반 복구 중:', inputPath);
    }

    // [추가] 진행률 출력을 위해 pipe:1 설정
    args.push('-progress', 'pipe:1');

    sendLogToRenderer('FFmpeg 복구 명령:', args.join(' '));
    const ffmpegProcess = spawn(ffmpegPath, args);

    let stderrOutput = '';

    // [추가] 진행률 파싱 및 전송
    ffmpegProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.startsWith('out_time=')) {
          const timeStr = line.split('=')[1];
          const currentTime = parseTimeToSeconds(timeStr);
          
          // duration이 유효할 때만 진행률 전송
          if (duration > 0) {
            const progress = Math.min(100, (currentTime / duration) * 100);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('conversion-progress', {
                progress: Math.round(progress),
                currentTime,
                totalTime: duration
              });
            }
          }
        }
      }
    });
    
    ffmpegProcess.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          fs.renameSync(tempPath, inputPath);
          sendLogToRenderer('✅ 파일 복구 완료:', inputPath);
          resolve(inputPath);
        } catch (err) {
          reject(new Error(`파일 교체 실패: ${err.message}`));
        }
      } else {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        sendLogToRenderer('❌ FFmpeg stderr:', stderrOutput);
        reject(new Error(`ffmpeg 복구 실패 (코드 ${code}): ${stderrOutput}`));
      }
    });

    ffmpegProcess.on('error', (error) => {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      reject(new Error(`FFmpeg 실행 오류: ${error.message}`));
    });
  });
}

function fixFrameRate(videoPath, avgFrameRate, frameRate, duration = 0) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath();
    const tempPath = videoPath.replace(/(\.[^.]+)$/, '_fixed$1');
    
    const args = [
      '-y',
      '-i', videoPath,
      '-r', avgFrameRate.toString(),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'copy',
      tempPath
    ];

    // [추가] 진행률 파싱을 위한 옵션
    args.push('-progress', 'pipe:1');

    sendLogToRenderer('🔧 프레임 레이트 보정 시작 (VFR -> CFR):', avgFrameRate);
    sendLogToRenderer('FFmpeg 명령:', args.join(' '));

    const ffmpegProcess = spawn(ffmpegPath, args);

    let stderrOutput = '';

    // [추가] 진행률 파싱 및 전송
    ffmpegProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.startsWith('out_time=')) {
          const timeStr = line.split('=')[1];
          const currentTime = parseTimeToSeconds(timeStr);
          
          if (duration > 0) {
            const progress = Math.min(100, (currentTime / duration) * 100);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('conversion-progress', {
                progress: Math.round(progress),
                currentTime,
                totalTime: duration
              });
            }
          }
        }
      }
    });
    
    ffmpegProcess.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        try {
          if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
          fs.renameSync(tempPath, videoPath);
          sendLogToRenderer('✅ 프레임 레이트 보정 완료:', videoPath);
          resolve(videoPath);
        } catch (err) {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          reject(new Error(`파일 교체 실패: ${err.message}`));
        }
      } else {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        sendLogToRenderer('❌ FFmpeg stderr:', stderrOutput);
        reject(new Error(`ffmpeg 프레임 보정 실패 (코드 ${code}): ${stderrOutput}`));
      }
    });

    ffmpegProcess.on('error', (error) => {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      reject(new Error(`FFmpeg 실행 오류: ${error.message}`));
    });
  });
}

ipcMain.handle('get-video-info', async (event, videoPath) => {
  try {
    sendLogToRenderer('📊 비디오 분석 시작:', videoPath);
    let jsonData = await analyzeVideo(videoPath);
    let videoInfo = parseVideoInfo(jsonData);
    let { duration, startTime, avgFrameRate, frameRate } = videoInfo;

    sendLogToRenderer('jsonData:', jsonData);
    sendLogToRenderer(`분석 결과: duration=${duration}, startTime=${startTime}`);

    if (duration === 0 || startTime !== 0) {
      sendLogToRenderer('⚠️ 비디오 문제 감지 → 복구 시작');
      await fixVideo(videoPath, duration, startTime);

      sendLogToRenderer('📊 복구된 파일 재분석 중...');
      jsonData = await analyzeVideo(videoPath);
      videoInfo = parseVideoInfo(jsonData);
      // 재분석 후 갱신된 duration 사용
      duration = videoInfo.duration; 
      sendLogToRenderer('✅ 복구 완료:', videoInfo);
    }

    if (avgFrameRate !== frameRate) {
      sendLogToRenderer('⚠️ 프레임 레이트 불일치 감지 → 복구 시작');
      // [수정] duration 인자 전달
      await fixFrameRate(videoPath, avgFrameRate, frameRate, duration);

      sendLogToRenderer('📊 프레임 복구된 파일 재분석 중...');
      jsonData = await analyzeVideo(videoPath);
      videoInfo = parseVideoInfo(jsonData);
      sendLogToRenderer('✅ 프레임 복구 후 최종 정보:', videoInfo);
    }

    sendLogToRenderer('✅ 분석 완료');
    return videoInfo;

  } catch (err) {
    sendLogToRenderer('❌ 비디오 분석/복구 오류:', err);
    throw err;
  }
});

ipcMain.handle('convert-video', async (event, inputPath, outputPath, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const ffmpegPath = getFFmpegPath();
      
      // 재생 전용 최적화 옵션 (오디오 완전 제거)
      const args = [
        '-fflags', '+genpts',
        '-hwaccel', 'auto',
        '-i', inputPath,
        '-y',
        '-progress', 'pipe:1',
        '-an', // 오디오 스트림 제거 (Audio None)
        '-c:v', options.videoCodec || 'libx264',
        '-preset', 'ultrafast', // 가장 빠른 인코딩
        '-crf', (options.crf || 28).toString(),
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', // 웹 재생 최적화
        '-f', 'mp4', // 명시적으로 MP4 포맷 지정
        outputPath
      ];
      
      // 해상도 설정 (선택사항)
      if (options.scale) {
        const scaleIndex = args.indexOf('-pix_fmt') + 2;
        args.splice(scaleIndex, 0, '-vf', `scale=${options.scale}`);
      }
      
      // 프레임 레이트 설정 (선택사항)
      if (options.fps) {
        const fpsIndex = args.indexOf('-pix_fmt') + 2;
        args.splice(fpsIndex, 0, '-r', options.fps.toString());
      }
      
      console.log('FFmpeg 명령어:', ffmpegPath);
      console.log('FFmpeg 인수:', args.join(' '));
      
      const ffmpegProcess = spawn(ffmpegPath, args);
      let stderrOutput = '';
      
      ffmpegProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        // FFmpeg progress 출력 파싱
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('out_time=')) {
            const timeStr = line.split('=')[1];
            const currentTime = parseTimeToSeconds(timeStr);
            
            if (options.duration && currentTime > 0) {
              const progress = Math.min(100, (currentTime / options.duration) * 100);
              
              // 진행률을 렌더러 프로세스에 전송
              mainWindow?.webContents.send('conversion-progress', {
                progress: Math.round(progress),
                currentTime,
                totalTime: options.duration
              });
            }
          }
        }
      });
      
      ffmpegProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        stderrOutput += errorOutput;
        console.log('FFmpeg stderr:', errorOutput);
      });
      
      ffmpegProcess.on('close', (code) => {
        console.log('FFmpeg 종료 코드:', code);
        
        if (code === 0) {
          resolve({ success: true, outputPath });
        } else {
          console.log('FFmpeg stderr 전체:', stderrOutput);
          reject(new Error(`FFmpeg 프로세스가 코드 ${code}로 종료되었습니다.\nFFmpeg 에러:\n${stderrOutput}`));
        }
      });
      
      ffmpegProcess.on('error', (error) => {
        reject(new Error(`FFmpeg 실행 오류: ${error.message}`));
      });
      
    } catch (error) {
      reject(error);
    }
  });
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
  } catch (error) {
    console.error('Save dialog error:', error);
    throw error;
  }
});

ipcMain.handle('get-temp-path', async (event, fileName) => {
  const tempDir = path.join(process.cwd(), 'temp'); // 동일한 경로 사용
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // 파일명 정규화
  const sanitizedFileName = sanitizeFileName(fileName);
  const tempPath = path.join(tempDir, sanitizedFileName);
  
  console.log('임시 파일 경로 생성:', tempPath); // 디버그용
  
  return tempPath;
});

ipcMain.handle('get-temp-file-as-blob', async (event, filePath) => {
  try {
    const buffer = await promisify(fs.readFile)(filePath);
    return buffer;
  } catch (error) {
    console.error('임시 파일 읽기 실패:', error);
    throw error;
  }
});

ipcMain.handle('stat-file', async (event, filePath) => {
  try {
    const stat = fs.statSync(filePath);
    return { size: stat.size };
  } catch (e) {
    console.error('stat-file error:', e);
    throw new Error(`파일 정보를 읽을 수 없습니다: ${filePath}`);
  }
});


// 유틸리티 함수들
function parseVideoInfo(jsonData) {
  const info = {
    duration: 0,
    startTime: 0,  // ✅ start_time 추가
    resolution: '',
    frameRate: 0,
    totalFrames: 0,
    avgFrameRate: 0,
    bitrate: '',
    format: '',
    codec: ''
  };
  
  try {
    // Format 정보
    if (jsonData.format) {
      info.duration = parseFloat(jsonData.format.duration) || 0;
      info.startTime = parseFloat(jsonData.format.start_time) || 0; // ✅ start_time 읽기
      info.bitrate = jsonData.format.bit_rate ? `${Math.round(jsonData.format.bit_rate / 1000)} kb/s` : '';
      info.format = jsonData.format.format_name || '';
    }
    sendLogToRenderer('parseVideoInfo - info:', info);
    
    // Video stream 정보
    const videoStream = jsonData.streams?.find(stream => stream.codec_type === 'video');
    if (videoStream) {
      info.resolution = `${videoStream.width}x${videoStream.height}`;
      
      // 프레임 레이트 계산
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
      
      // 총 프레임 수 계산
      if (info.duration && info.frameRate) {
        info.totalFrames = Math.round(info.duration * info.frameRate);
      }
      info.codec = (videoStream.codec_name || '').toLowerCase();
    }
    
  } catch (error) {
    console.error('비디오 정보 파싱 오류:', error);
  }
  
  return info;
}

function parseTimeToSeconds(timeStr) {
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


/* 기존 웹에 요청하는 메소드 */
// 최신 방식: VideoDir → VideoPath의 폴더 → Desktop 순서로 후보를 탐색
ipcMain.handle('load-csv', async (e, { VideoName, VideoPath, VideoDir }) => {
  try {
    // 확장자 제거한 베이스명
    const base = (VideoName || '').replace(/\.[^.]+$/, '');
    if (!base) return ''; // 이름 없으면 조용히 빈 문자열 반환

    const desktop = app.getPath('desktop');

    // "file:///..." 같은 스킴 제거
    const fromPath = (p) => (p ? p.replace(/^file:\/+/, '') : '');

    // 힌트 디렉터리들
    const hintDirA = (VideoDir || '').trim();
    const hintDirB = fromPath(VideoPath || '').replace(/[/\\][^/\\]+$/, ''); // 파일명 제거해서 디렉터리만

    // 탐색 후보 (앞에서부터 우선)
    const candidates = [
      hintDirA && path.join(hintDirA, `${base}.csv`),
      hintDirB && path.join(hintDirB, `${base}.csv`),
      path.join(desktop, `${base}.csv`),
    ].filter(Boolean);

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          // 그대로 텍스트 반환 (렌더러에서 문자열로 바로 파싱)
          return fs.readFileSync(p, 'utf8');
        }
      } catch (err) {
        console.warn('CSV read fail:', p, err);
      }
    }

    // 없으면 조용히 빈 문자열 (프론트에서 박스 비표시)
    return '';
  } catch (err) {
    console.error('load-csv fatal:', err);
    return '';
  }
});


ipcMain.handle('save-csv', async (event, payload) => {
  const fileName = payload.fileName;
  const csvContent = payload.csvContent;

  if (!fileName || !csvContent) {
    throw new Error('파일명 또는 CSV 내용이 없습니다.');
  }

  try {
    // videoDir 경로 사용
    const videoDir = getVideoDir();
    const fullPath = path.join(videoDir, fileName);
    
    console.log('videoDir:', videoDir);
    console.log('CSV 저장 경로:', fullPath);

    // 이미 파일이 존재하는 경우 저장 중단
    if (fs.existsSync(fullPath)) {
      console.log('이미 존재하는 CSV 파일:', fullPath);
      throw new Error('이미 같은 이름의 CSV 파일이 존재합니다.');
    }

    // 저장 진행
    const contentWithNewline = csvContent.endsWith('\n') ? csvContent : csvContent + '\n';
    fs.writeFileSync(fullPath, contentWithNewline, 'utf-8');
    console.log('새 CSV 저장 완료:', fullPath);
    
    return `CSV 저장 완료: ${fullPath}`;
  } catch (error) {
    console.error(error);
    throw new Error(`CSV 저장 실패: ${error.message}`);
  }
});

ipcMain.handle('update-csv', async (event, maskingList) => {
  if (!maskingList || maskingList.length === 0 || !maskingList[0].videoName) {
    throw new Error('videoName이 누락되었습니다.');
  }

  const videoName = maskingList[0].videoName;
  const baseName = videoName.replace(/\.[^.]+$/, '');
  const videoDir = getVideoDir();
  const localFilePath = path.join(videoDir, baseName + '.csv');

  console.log('videoDir:', videoDir);
  console.log('CSV 업데이트 경로:', localFilePath);

  try {
    let lines;

    // 파일이 존재하지 않으면 헤더 추가
    if (!fs.existsSync(localFilePath)) {
      lines = ['frame,track_id,bbox,score,class_id,type,object'];
    } else {
      const fileContent = fs.readFileSync(localFilePath, 'utf-8');
      lines = fileContent.split('\n').filter(line => line.trim() !== '');
    }

    let addedCount = 0;
    
    for (const entry of maskingList) {
      const frameStr = entry.frame;
      const trackId = entry.track_id;
      const bbox = entry.bbox;
      const type = entry.type;

      if (frameStr == null || bbox == null) {
        console.log('누락된 데이터:', entry);
        continue;
      }

      // 원하는 필드 순서에 맞게 문자열 구성
      const newLine = `${frameStr},${trackId},"${bbox}",,,${type},1`;

      // 중복 체크
      const alreadyExists = lines.some(line => line.trim() === newLine);
      if (alreadyExists) {
        console.log('중복 항목 생략:', newLine);
        continue;
      }

      lines.push(newLine);
      console.log('CSV에 새 항목 추가');
      addedCount++;
    }

    // 파일에 저장
    const csvContent = lines.join('\n') + '\n';
    fs.writeFileSync(localFilePath, csvContent, 'utf-8');
    
    return `일괄 CSV 업데이트 완료: ${addedCount}개 추가됨`;
  } catch (error) {
    console.error(error);
    throw new Error(`CSV 업데이트 실패: ${error.message}`);
  }
});

ipcMain.handle('update-filtered-csv', async (event, requestBody) => {
  const videoName = requestBody.videoName;
  const maskingData = requestBody.data;
  
  if (!videoName || videoName.trim() === '') {
    throw new Error('videoName이 누락되었습니다.');
  }
  
  const baseName = videoName.replace(/\.[^.]+$/, '');
  const videoDir = getVideoDir();
  const localFilePath = path.join(videoDir, baseName + '.csv');
  
  console.log('videoDir:', videoDir);
  console.log('CSV 전체 교체 경로:', localFilePath);
  
  try {
    // 새 CSV 파일 내용 생성
    let csvContent = 'frame,track_id,bbox,score,class_id,type,object\n';
    
    // 전달받은 데이터만으로 CSV 파일 생성
    for (const entry of maskingData) {
      const frame = String(entry.frame || '');
      const trackId = String(entry.track_id || '');
      const bbox = String(entry.bbox || '').replace(/"/g, '\\"'); // 따옴표 이스케이프
      const score = String(entry.score || '');
      const class_id = String(entry.class_id || '');
      const type = String(entry.type || '');
      const object = entry.object != null ? String(entry.object) : '1';
      
      csvContent += `${frame},${trackId},"${bbox}",${score},${class_id},${type},${object}\n`;
    }
    
    // 파일 저장
    const finalContent = csvContent.endsWith('\n') ? csvContent : csvContent + '\n';
    fs.writeFileSync(localFilePath, finalContent, 'utf-8');
    
    console.log('CSV 파일 전체 교체 완료:', localFilePath);
    return `CSV 파일이 성공적으로 업데이트되었습니다. 총 ${maskingData.length}개 항목 저장됨`;
  } catch (error) {
    console.error(error);
    throw new Error(`CSV 파일 업데이트 실패: ${error.message}`);
  }
});

ipcMain.handle('trim-video', async (event, requestBody) => {
  const videoName = requestBody.videoName;
  const startTime = parseFloat(requestBody.startTime);
  const endTime = parseFloat(requestBody.endTime);
  
  if (!videoName || videoName.trim() === '') {
    throw new Error('videoName이 누락되었습니다.');
  }
  
  // 입력 파일 경로 확인
  const inputFile = findVideoFile(videoName);
  if (!fs.existsSync(inputFile)) {
    throw new Error('비디오 파일을 찾을 수 없습니다.');
  }
  
  // 현재 날짜시간분으로 폴더명 생성 (예: 202505271124)
  const now = new Date();
  const timeFolder = now.toISOString().replace(/[-:T]/g, '').slice(0, 12); // yyyyMMddHHmm
  
  const videoDir = getVideoDir();
  const cropBaseDir = path.join(videoDir, 'crop');
  const cropTimeDir = path.join(cropBaseDir, timeFolder);
  
  // crop 폴더 구조 생성
  fs.mkdirSync(cropTimeDir, { recursive: true });
  
  // 파일명 생성 (원본파일명_crop숫자.mp4)
  const baseName = videoName.replace(/\.[^.]+$/, '');
  const extension = '.mp4';
  
  // 해당 시간 폴더에서 crop 번호 확인
  let cropCount = 1;
  if (fs.existsSync(cropTimeDir)) {
    const existingFiles = fs.readdirSync(cropTimeDir);
    const cropPrefix = baseName + '_crop';
    
    for (const file of existingFiles) {
      if (file.startsWith(cropPrefix) && file.endsWith(extension)) {
        try {
          const countStr = file.substring(cropPrefix.length, file.length - extension.length);
          const count = parseInt(countStr);
          if (!isNaN(count)) {
            cropCount = Math.max(cropCount, count + 1);
          }
        } catch (e) {
          // 숫자 변환 실패 시 무시
        }
      }
    }
  }
  
  const outputFileName = baseName + '_crop' + cropCount + extension;
  const outputPath = path.join(cropTimeDir, outputFileName);
  
  console.log('입력 파일:', inputFile);
  console.log('출력 파일:', outputPath);
  console.log('트림 시간:', startTime, '~', endTime);
  
  return new Promise((resolve, reject) => {
    try {
      const ffmpegPath = getFFmpegPath();
      
      // FFmpeg 명령어 구성
      const args = [
        '-ss', startTime.toString(),
        '-to', endTime.toString(),
        '-i', inputFile,
        '-c', 'copy',
        '-y',
        outputPath
      ];
      
      console.log('FFmpeg 명령어:', ffmpegPath);
      console.log('FFmpeg 인수:', args.join(' '));
      
      const ffmpegProcess = spawn(ffmpegPath, args);
      let stderrOutput = '';
      
      ffmpegProcess.stdout.on('data', (data) => {
        console.log('FFmpeg stdout:', data.toString());
      });
      
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderrOutput += output;
        console.log('FFmpeg stderr:', output);
      });
      
      ffmpegProcess.on('close', (code) => {
        console.log('FFmpeg 종료 코드:', code);
        
        if (code === 0) {
          try {
            const fileSize = fs.statSync(outputPath).size;
            
            // 응답 생성
            const response = {
              fileName: outputFileName,
              timeFolder: timeFolder,
              filePath: `crop/${timeFolder}/${outputFileName}`,
              fileSize: fileSize,
              startTime: startTime,
              endTime: endTime,
              duration: endTime - startTime
            };
            
            console.log('비디오 트림 완료:', response);
            resolve(response);
          } catch (error) {
            reject(new Error(`파일 정보 조회 실패: ${error.message}`));
          }
        } else {
          console.log('FFmpeg stderr 전체:', stderrOutput);
          reject(new Error(`FFmpeg 처리 실패 (코드 ${code}): ${stderrOutput}`));
        }
      });
      
      ffmpegProcess.on('error', (error) => {
        reject(new Error(`FFmpeg 실행 오류: ${error.message}`));
      });
      
      // 180초 타임아웃 설정
      setTimeout(() => {
        ffmpegProcess.kill();
        reject(new Error('FFmpeg 처리 시간 초과 (180초)'));
      }, 180000);
      
    } catch (error) {
      reject(error);
    }
  });
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  try {
    const opts = { ...(options || {}) };
    const desktop = app.getPath('desktop');

    // defaultPath 정규화/보정
    if (typeof opts.defaultPath === 'string' && opts.defaultPath.trim()) {
      let p = opts.defaultPath.trim();
      if (process.platform === 'win32') p = p.replace(/\//g, '\\');

      if (!fs.existsSync(p)) {
        const maybeDir = path.extname(p) ? path.dirname(p) : p;
        opts.defaultPath = fs.existsSync(maybeDir) ? maybeDir : desktop;
      } else {
        opts.defaultPath = p;
      }
    } else {
      // 옵션이 없으면 바탕화면으로
      opts.defaultPath = desktop;
    }

    return await dialog.showOpenDialog(mainWindow, opts);
  } catch (error) {
    console.error('Open dialog error:', error);
    throw error;
  }
});


ipcMain.handle('show-video-dialog', async (event, options) => {
  try {
    const opts = { ...(options || {}) };
    const desktop = app.getPath('desktop');

    // defaultPath 정규화/보정
    if (typeof opts.defaultPath === 'string' && opts.defaultPath.trim()) {
      let p = opts.defaultPath.trim();
      if (process.platform === 'win32') p = p.replace(/\//g, '\\');

      if (!fs.existsSync(p)) {
        const maybeDir = path.extname(p) ? path.dirname(p) : p;
        opts.defaultPath = fs.existsSync(maybeDir) ? maybeDir : desktop;
      } else {
        opts.defaultPath = p;
      }
    } else {
      // 옵션이 없으면 바탕화면으로
      opts.defaultPath = desktop;
    }

    // 비디오 다이얼로그 기본 옵션(필요 시 유지)
    opts.title = opts.title || '영상 파일 선택';
    opts.properties = opts.properties || ['openFile', 'multiSelections'];
    opts.filters = opts.filters || [
      { name: 'Videos', extensions: ['mp4','avi','mkv','mov','wmv','flv','webm'] }
    ];

    console.log('showVideoDialog options:', opts);
    return await dialog.showOpenDialog(mainWindow, opts);
  } catch (error) {
    console.error('Open dialog error:', error);
    throw error;
  }
});



// 워터마크 이미지 복사 핸들러 추가
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
  
  // 파일 확장자 검증
  const allowedExtensions = ['jpg', 'jpeg', 'png'];
  const fileExtension = fileName.split('.').pop().toLowerCase();
  
  if (!allowedExtensions.includes(fileExtension)) {
    throw new Error('JPG, JPEG, PNG 파일만 지원합니다.');
  }
  
  try {
    // 대상 경로 설정
    const targetPath = path.join(dirConfig.exportConfig, fileName);
    
    console.log('원본 경로:', sourcePath);
    console.log('대상 경로:', targetPath);
    
    // 디렉토리가 존재하지 않으면 생성
    const dirPath = path.dirname(targetPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log('디렉토리 생성:', dirPath);
    }
    
    // 파일 존재 여부 확인
    if (!overwrite && fs.existsSync(targetPath)) {
      throw new Error(`동일한 이름의 파일이 이미 존재합니다: ${fileName}`);
    }
    
    // 파일 복사
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


const scanVideoFiles = (dir, extensions, currentDepth, maxDepth) => {
  let results = [];
  
  // 폴더 읽기
  const list = fs.readdirSync(dir, { withFileTypes: true });

  list.forEach(dirent => {
    const fullPath = path.join(dir, dirent.name);

    if (dirent.isDirectory()) {
      // 폴더인 경우: 현재 깊이가 최대 깊이보다 작을 때만 더 들어갑니다.
      // 예: 현재가 2(depth)이고 최대가 3이면, 2 < 3 이므로 3(depth)로 재귀 호출
      if (currentDepth < maxDepth) {
        results = results.concat(scanVideoFiles(fullPath, extensions, currentDepth + 1, maxDepth));
      }
    } else if (dirent.isFile()) {
      // 파일인 경우: 확장자 확인 후 추가
      const ext = path.extname(dirent.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  });

  return results;
};
// [추가] 폴더 내부의 영상 파일 스캔 (1 depth)
ipcMain.handle('scan-directory', async (event, folderPath) => {
  try {
    if (!fs.existsSync(folderPath)) return [];

    const extensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
    
    // 초기 호출: currentDepth는 1부터 시작, maxDepth는 3으로 설정
    // 이렇게 하면 folderPath(1) -> 하위(2) -> 하위의 하위(3) 까지만 탐색합니다.
    const videoFiles = scanVideoFiles(folderPath, extensions, 1, 4);

    return videoFiles;
  } catch (error) {
    console.error('폴더 스캔 중 오류:', error);
    return [];
  }
});

// [추가] 다이얼로그에서 선택 유형을 묻는 팝업
ipcMain.handle('show-selection-mode-dialog', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['파일 선택', '폴더 선택', '취소'],
    title: '추가 방식 선택',
    message: '어떤 방식으로 영상을 추가하시겠습니까?',
    defaultId: 0,
    cancelId: 2,
  });
  return result.response; // 0: 파일, 1: 폴더, 2: 취소
});



ipcMain.handle('merge-videos', async (event, requestBody) => {
  try {
    const filePaths = requestBody.filePaths; // 전체 경로 받기
    
    if (!filePaths || filePaths.length === 0) {
      throw new Error('최소 1개 파일이 필요합니다.');
    }
    const videoDir = getVideoDir();
    
    // 파일이 1개인 경우: 원본 파일 정보 반환
    if (filePaths.length === 1) {
      const sourceFilePath = path.join(videoDir, filePaths[0]);
      
      if (!fs.existsSync(sourceFilePath)) {
        throw new Error('파일을 찾을 수 없습니다: ' + filePaths[0]);
      }
      
      const fileSize = fs.statSync(sourceFilePath).size;
      const response = {
        fileName: path.basename(filePaths[0]),
        filePath: filePaths[0],
        fileSize: fileSize,
        mergedFrom: filePaths,
        absolutePath: sourceFilePath,
        isSingleFile: true // 단일 파일임을 표시
      };
      
      sendLogToRenderer('단일 파일 반환:', response);
      return response;
    }
    
    // 출력 파일명 생성 (videoDir에 직접 저장)
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15); // yyyyMMdd_HHmmss
    const outputFileName = `merged_${timestamp}.mp4`;
    const outputPath = path.join(videoDir, outputFileName);
    
    sendLogToRenderer('출력 파일:', outputPath);
    sendLogToRenderer('합칠 파일들:', filePaths);
    
    // FFmpeg concat 파일 생성 (임시 파일)
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const concatFile = path.join(tempDir, `concat_${Date.now()}.txt`);
    const concatLines = filePaths.map(filePath => {
      const fullPath = path.join(videoDir, filePath);
      return `file '${fullPath.replace(/\\/g, '/')}'`; // Windows 경로 처리
    });
    
    fs.writeFileSync(concatFile, concatLines.join('\n'), 'utf-8');
    sendLogToRenderer('Concat 파일 생성:', concatFile);
    sendLogToRenderer('Concat 내용:', concatLines);
    
    return new Promise((resolve, reject) => {
      try {
        const ffmpegPath = getFFmpegPath();
        
        // FFmpeg 실행 (H.264 인코딩)
        const args = [
          '-f', 'concat',
          '-safe', '0',
          '-i', concatFile,
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          '-y',
          outputPath
        ];
        
        const ffmpegProcess = spawn(ffmpegPath, args);
        let stderrOutput = '';
        
        ffmpegProcess.stdout.on('data', (data) => {
          console.log('FFmpeg stdout:', data.toString());
        });
        
        ffmpegProcess.stderr.on('data', (data) => {
          const output = data.toString();
          stderrOutput += output;
          console.log('FFmpeg stderr:', output);
        });
        
        ffmpegProcess.on('close', (code) => {
          console.log('FFmpeg 종료 코드:', code);
          
          // 임시 파일 정리
          try {
            if (fs.existsSync(concatFile)) {
              fs.unlinkSync(concatFile);
              console.log('?? Concat 임시 파일 삭제:', concatFile);
            }
          } catch (cleanupError) {
            console.error('임시 파일 삭제 실패:', cleanupError);
          }
          
          if (code === 0) {
            try {
              const fileSize = fs.statSync(outputPath).size;
              
              // 응답 생성
              const response = {
                fileName: outputFileName,
                filePath: outputFileName, // videoDir 루트에 저장됨
                fileSize: fileSize,
                mergedFrom: filePaths,
                absolutePath: outputPath
              };
              
              sendLogToRenderer('비디오 합치기 완료:', response);
              resolve(response);
            } catch (error) {
              reject(new Error(`파일 정보 조회 실패: ${error.message}`));
            }
          } else {
            console.log('FFmpeg stderr 전체:', stderrOutput);
            reject(new Error(`비디오 합치기 실패 (코드 ${code}): ${stderrOutput}`));
          }
        });
        
        ffmpegProcess.on('error', (error) => {
          // 에러 발생 시에도 임시 파일 정리
          try {
            if (fs.existsSync(concatFile)) {
              fs.unlinkSync(concatFile);
            }
          } catch (cleanupError) {
            console.error('임시 파일 삭제 실패:', cleanupError);
          }
          
          reject(new Error(`FFmpeg 실행 오류: ${error.message}`));
        });
        
        // 300초 타임아웃 설정
        setTimeout(() => {
          ffmpegProcess.kill();
          
          // 타임아웃 시에도 임시 파일 정리
          try {
            if (fs.existsSync(concatFile)) {
              fs.unlinkSync(concatFile);
            }
          } catch (cleanupError) {
            console.error('임시 파일 삭제 실패:', cleanupError);
          }
          
          reject(new Error('FFmpeg 처리 시간 초과 (300초)'));
        }, 300000);
        
      } catch (error) {
        // 초기 에러 발생 시에도 임시 파일 정리
        try {
          if (fs.existsSync(concatFile)) {
            fs.unlinkSync(concatFile);
          }
        } catch (cleanupError) {
          console.error('임시 파일 삭제 실패:', cleanupError);
        }
        
        reject(error);
      }
    });
    
  } catch (error) {
    console.error('비디오 합치기 오류:', error);
    throw new Error(`서버 오류: ${error.message}`);
  }
});

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
  
  // 파일 확장자 검증 - jpg, png만 허용
  const allowedExtensions = ['jpg', 'jpeg', 'png'];
  const fileExtension = fileName.split('.').pop().toLowerCase();
  
  if (!allowedExtensions.includes(fileExtension)) {
    throw new Error('JPG, JPEG, PNG 파일만 지원합니다.');
  }
  
  try {
    // 이미지 저장 경로 설정 (dirConfig의 exportConfig 사용)
    const imagePath = path.join(dirConfig.exportConfig, fileName);
    
    console.log('exportConfig:', dirConfig.exportConfig);
    console.log('워터마크 저장 경로:', imagePath);
    console.log('원본 경로:', originalPath);
    
    // 디렉토리가 존재하지 않으면 생성
    const dirPath = path.dirname(imagePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log('디렉토리 생성:', dirPath);
    }
    
    // 파일 존재 여부 확인 (덮어쓰기 모드가 아닌 경우)
    if (!overwrite && fs.existsSync(imagePath)) {
      console.log('이미 존재하는 워터마크 파일:', imagePath);
      throw new Error(`동일한 이름의 파일이 이미 존재합니다: ${fileName}`);
    }
    
    // Base64 이미지를 Buffer로 변환하여 저장
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

ipcMain.handle('get-settings', async (event) => {
  try {
    const configFile = path.join(dirConfig.exportConfig, 'config.ini');
    
    // 파일 존재 여부 확인
    if (!fs.existsSync(configFile)) {
      throw new Error(`설정 파일을 찾을 수 없습니다: ${configFile}`);
    }
    
    // 파일 읽기
    const fileContent = fs.readFileSync(configFile, 'utf-8');
    const lines = fileContent.split('\n');
    
    const settings = {};
    let currentSection = null;
    
    for (let line of lines) {
      line = line.trim();
      
      // 빈 줄이나 주석 무시
      if (!line || line.startsWith(';') || line.startsWith('#')) {
        continue;
      }
      
      // 섹션 처리 [section]
      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.substring(1, line.length - 1).toLowerCase();
        settings[currentSection] = {};
        continue;
      }
      
      // 키=값 처리
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

      // 섹션 시작
      if (/^\[.+\]$/.test(trimmed)) {
        currentSectionLower = trimmed.slice(1, -1).toLowerCase();
        return `[${currentSectionLower}]`;
      }

      // 주석, 빈 줄, 섹션 외부
      if (!trimmed || trimmed.startsWith(';') || !currentSectionLower) {
        return line; // 그대로 유지
      }

      // key=value 형식 처리
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const keyLower = trimmed.slice(0, equalIndex).trim().toLowerCase();
        const currentValue = trimmed.slice(equalIndex + 1).trim();

        const has = !!(norm[currentSectionLower] &&
          Object.prototype.hasOwnProperty.call(norm[currentSectionLower], keyLower));

        if (has) {
          const newValue = String(norm[currentSectionLower][keyLower]);
          // 값이 같아도 키는 소문자로 정규화해서 기록
          return `${keyLower}=${currentValue === newValue ? currentValue : newValue}`;
        }
        // 이번 저장에서 건드릴 키가 아니면 원래 라인 유지
        return line;
      }

      // '=' 없는 라인은 그대로
      return line;
    });

    // 2) 파일에 없는(새로 추가해야 하는) 키들 처리: 섹션별로 추가
    const presentSections = new Set();
    for (const l of updatedLines) {
      const t = l.trim();
      if (/^\[.+\]$/.test(t)) presentSections.add(t.slice(1, -1));
    }
 
    const finalLines = [];
    let currentSec = null;
    const seenPairs = new Set();
    const pendingKeys = {}; // 섹션별로 추가해야 할 키들

    // 먼저 어떤 키가 이미 있는지 파악
    for (const l of updatedLines) {
      const t = l.trim();
      if (/^\[.+\]$/.test(t)) currentSec = t.slice(1, -1);
      else if (currentSec && t && !t.startsWith(';') && t.includes('=')) {
        const eq = t.indexOf('=');
        const k = t.slice(0, eq).trim().toLowerCase();
        seenPairs.add(`${currentSec}::${k}`);
      }
    }

    // 각 섹션별로 추가해야 할 키 목록 생성
    for (const [sec, obj] of Object.entries(norm)) {
      for (const [k, v] of Object.entries(obj || {})) {
        const key = k.toLowerCase();
        if (!seenPairs.has(`${sec}::${key}`)) {
          pendingKeys[sec] = pendingKeys[sec] || [];
          pendingKeys[sec].push(`${key}=${String(v)}`);
        }
      }
    }

    // 파일을 다시 순회하면서 각 섹션 끝에 새 키 삽입
    currentSec = null;
    for (let i = 0; i < updatedLines.length; i++) {
      const line = updatedLines[i];
      const t = line.trim();
      
      // 새 섹션 시작 전에, 이전 섹션의 pending keys 추가
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

    // 마지막 섹션의 pending keys 추가
    if (currentSec && pendingKeys[currentSec]) {
      for (const newLine of pendingKeys[currentSec]) {
        finalLines.push(newLine);
      }
      delete pendingKeys[currentSec];
    }

    // 완전히 새로운 섹션 추가 (파일에 없던 섹션)
    for (const [sec, keys] of Object.entries(pendingKeys)) {
      if (!presentSections.has(sec)) {
        finalLines.push('');
        finalLines.push(`[${sec}]`);
        for (const newLine of keys) {
          finalLines.push(newLine);
        }
      }
    }

    // 파일 저장
    fs.writeFileSync(configFile, finalLines.join('\n'), 'utf-8');

    return '설정이 성공적으로 업데이트되었습니다.';
  } catch (error) {
    console.error('설정 저장 오류:', error);
    throw new Error('설정 파일 저장 실패: ' + error.message);
  }
});

ipcMain.handle('encrypt-file', async (event, requestData) => {
  const { file, videoPw, userId } = requestData;
  
  const resultMap = await encryptFile(file, videoPw, userId);
  return resultMap;
});

// 파일 암호화 함수
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
    formData.append('file', file); // 파일 이름만 문자열로 보냄
    
    const encryptUrl = config.encrypt
    
    console.log('Python 서버 요청:', encryptUrl);
    
    const response = await apiPython.post(encryptUrl, formData, {
      headers: {
        'Encryption-Key': encryptedKeyB64,
        'User-Id': userId,
        ...formData.getHeaders()
      },
      timeout: 300000 // 5분 타임아웃
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

// 비밀번호 암호화 함수
async function encryptPw(plainText) {
  try {
    console.log('비밀번호 암호화 시작');
    
    // 1. 해시 생성 + 길이에 따라 자를 바이트 수 결정
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
    
    // 2. 공개키 로드
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
    
    // 3. RSA-OAEP(SHA-1) 암호화
    const encrypted = crypto.publicEncrypt({
      key: pemContent,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1'
    }, plainBytes);
    
    // 4. Base64 인코딩
    const base64Encrypted = encrypted.toString('base64');
    
    console.log('비밀번호 암호화 완료');
    return base64Encrypted;
    
  } catch (error) {
    console.error('비밀번호 암호화 실패:', error);
    return null;
  }
}

// 비디오 파일 찾기 헬퍼 함수
function findVideoFile(videoName) {
  const videoDir = getVideoDir();
  // 직접 경로 확인
  const directPath = path.join(videoDir, videoName);
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  
  // 일반적인 비디오 확장자들로 확인
  const extensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
  const baseName = videoName.replace(/\.[^.]+$/, '');
  
  for (const ext of extensions) {
    const testPath = path.join(videoDir, baseName + ext);
    if (fs.existsSync(testPath)) {
      return testPath;
    }
  }
  
  // 폴더 내 파일 검색
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

ipcMain.handle('load-watermark', async (event, waterimgpath) => {
  try {
    if (!waterimgpath || waterimgpath.trim() === '') {
      throw new Error('워터마크 이미지 경로가 누락되었습니다.');
    }
    
    // 전체 경로에서 직접 로드
    const filePath = waterimgpath.trim();
    
    console.log('워터마크 이미지 경로:', filePath);
    
    // 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
      throw new Error(`이미지 파일을 찾을 수 없습니다: ${filePath}`);
    }
    
    // 파일 확장자 추출
    const lastDotIndex = filePath.lastIndexOf('.');
    if (lastDotIndex === -1) {
      throw new Error('파일 확장자를 찾을 수 없습니다.');
    }
    
    const extension = filePath.substring(lastDotIndex + 1).toLowerCase();
    
    // 확장자에 따른 MIME 타입 설정
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
    
    // 파일을 Buffer로 읽기
    const imageBuffer = fs.readFileSync(filePath);
    
    // Base64로 변환
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
/* 기조 웹에 요청하는 메소드 끝 */

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  protocol.registerFileProtocol('local-video', (request, callback) => {
    // local-video://stream/C:/Users/... 형태에서 앞부분 제거
    const url = request.url.replace(/^local-video:\/\/stream\//, '');
    const decodedUrl = decodeURI(url);
    
    // console.log('Stream Request:', decodedUrl); // 디버깅 필요시 주석 해제

    try {
      return callback(decodedUrl);
    } catch (error) {
      console.error('Protocol Error:', error);
      return callback(404);
    }
  });

  const userDataPath = app.getPath('userData');
  const savedLicense = loadLicense(userDataPath);

  writeLogToFile('Electron 준비 완료');
  if (handleFirstRun()) {
    writeLogToFile('첫 실행 감지 중...whenready');
    // 첫 실행인 경우 여기서 종료됨
    return;
  }

  if (savedLicense){
    const currentHwId = await generateHardwareId();
    
    // 하드웨어 ID 확인
    if (savedLicense.hardwareId === currentHwId){
      // 만료일 확인 추가! 🔒
      const expiryCheck = checkExpiry(savedLicense);
      
      if (expiryCheck.valid) {
        // 만료되지 않음 - 정상 실행
        licenseValid = true;
        createWindow();
        return;
      } else {
        // 만료됨 - 로그 출력 후 라이센스 창 표시
        writeLogToFile('❌ 저장된 라이센스가 만료되었습니다:', expiryCheck.error);
        
        // 만료된 라이센스 파일 삭제 (선택사항)
        try {
          const licensePath = path.join(userDataPath, '.license');
          if (fs.existsSync(licensePath)) {
            fs.unlinkSync(licensePath);
            writeLogToFile('만료된 라이센스 파일 삭제 완료');
          }
        } catch (deleteError) {
          writeLogToFile('만료된 라이센스 파일 삭제 실패:', deleteError.message);
        }
      }
    } else {
      writeLogToFile('❌ 하드웨어 ID 불일치');
    }
  }

  createLicenseWindow();
  
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 앱 종료 시 임시 파일 정리
app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  const tempDir = path.join(process.cwd(), 'temp'); // 동일한 경로 사용
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('임시 디렉토리 정리 완료:', tempDir);
    } catch (error) {
      console.error('임시 디렉토리 삭제 실패:', error);
    }
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.