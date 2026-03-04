/**
 * 동적 디렉토리 설정 모듈
 * macOS/Windows/Linux 크로스플랫폼 경로를 자동 생성합니다.
 *
 * [UIUX-macOS] dirConfig.json의 Windows 하드코딩 경로를
 * 런타임 기반 동적 경로로 교체
 *
 * 개발 모드: process.cwd() (프로젝트 루트) — config/, videos/ 등이 이미 존재
 * 패키징 모드: app.getPath('userData') — 사용자별 데이터 디렉토리
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// 개발 모드: 프로젝트 루트 (config/config.ini가 여기에 있음)
// 패키징 모드: 사용자 데이터 디렉토리
const baseDir = app.isPackaged
  ? app.getPath('userData')
  : process.cwd();

const dirConfig = {
  exportConfig: path.join(baseDir, 'config'),
  videoDir: path.join(baseDir, 'videos', 'org'),
  MaskingDir: path.join(baseDir, 'videos', 'masking'),
  shortcutDir: path.join(baseDir, 'export'),
  logDir: path.join(baseDir, 'log'),
};

// 필요한 디렉토리 자동 생성 (없으면 생성)
for (const dir of Object.values(dirConfig)) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export default dirConfig;
