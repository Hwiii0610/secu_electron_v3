/**
 * Test Setup File
 *
 * Initializes global mocks for:
 * - window.electronAPI (Electron IPC bridge)
 * - Pinia store mocking utilities
 */

import { vi } from 'vitest';

// Mock window.electronAPI (Electron preload API)
if (!window.electronAPI) {
  window.electronAPI = {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
  };
}

// Mock HTMLVideoElement methods that might not be available in jsdom
if (HTMLVideoElement.prototype.play === undefined) {
  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
}

if (HTMLVideoElement.prototype.pause === undefined) {
  HTMLVideoElement.prototype.pause = vi.fn();
}

// Mock canvas context if needed
if (HTMLCanvasElement.prototype.getContext === undefined) {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    transform: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
  });
}

// Global test configuration
global.testConfig = {
  mockVideoElement: () => {
    const mockVideo = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      paused: true,
      currentTime: 0,
      duration: 100,
      playbackRate: 1,
      style: {},
    };
    return mockVideo;
  },

  mockStores: () => {
    return {
      video: {
        videoPlaying: false,
        frameRate: 30,
        zoomLevel: 1,
        currentPlaybackRate: 1,
        progress: 0,
      },
      detection: {},
      mode: {},
      file: {
        selectedFileIndex: 0,
      },
    };
  },
};
