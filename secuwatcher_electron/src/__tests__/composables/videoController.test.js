/**
 * Tests for videoController composable
 *
 * Tests core video playback, frame navigation, playback rate, and zoom functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createVideoController } from '../../composables/videoController';

describe('createVideoController', () => {
  let mockVideo;
  let mockStores;
  let controller;

  beforeEach(() => {
    // Setup mock video element
    mockVideo = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      paused: true,
      currentTime: 50,
      duration: 100,
      playbackRate: 1,
      style: {},
    };

    // Setup mock stores
    mockStores = {
      video: {
        videoPlaying: false,
        frameRate: 30,
        zoomLevel: 1,
        currentPlaybackRate: 1,
        progress: 50,
      },
      detection: {},
      mode: {},
      file: {
        selectedFileIndex: 0,
      },
    };

    // Create dependencies
    const deps = {
      getStores: () => mockStores,
      getVideo: () => mockVideo,
    };

    controller = createVideoController(deps);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('togglePlay', () => {
    it('should play video when paused', () => {
      mockVideo.paused = true;

      controller.togglePlay();

      expect(mockVideo.play).toHaveBeenCalled();
      expect(mockStores.video.videoPlaying).toBe(true);
    });

    it('should pause video when playing', () => {
      mockVideo.paused = false;

      controller.togglePlay();

      expect(mockVideo.pause).toHaveBeenCalled();
      expect(mockStores.video.videoPlaying).toBe(false);
    });

    it('should handle null video element gracefully', () => {
      const depsNoVideo = {
        getStores: () => mockStores,
        getVideo: () => null,
      };
      const controllerNoVideo = createVideoController(depsNoVideo);

      expect(() => controllerNoVideo.togglePlay()).not.toThrow();
    });
  });

  describe('jumpForward', () => {
    it('should advance video by one frame', () => {
      mockVideo.currentTime = 0;
      mockStores.video.frameRate = 30;

      controller.jumpForward();

      expect(mockVideo.currentTime).toBeCloseTo(1 / 30);
    });

    it('should not exceed video duration', () => {
      mockVideo.currentTime = 99;
      mockVideo.duration = 100;
      mockStores.video.frameRate = 30;

      controller.jumpForward();

      expect(mockVideo.currentTime).toBe(100);
    });

    it('should handle zero frameRate gracefully', () => {
      mockVideo.currentTime = 50;
      mockStores.video.frameRate = 0;

      controller.jumpForward();

      expect(mockVideo.currentTime).toBe(50);
    });
  });

  describe('jumpBackward', () => {
    it('should go back by one frame', () => {
      mockVideo.currentTime = 1;
      mockStores.video.frameRate = 30;

      controller.jumpBackward();

      expect(mockVideo.currentTime).toBeCloseTo(1 - 1 / 30);
    });

    it('should not go below zero', () => {
      mockVideo.currentTime = 0.01;
      mockStores.video.frameRate = 30;

      controller.jumpBackward();

      expect(mockVideo.currentTime).toBe(0);
    });

    it('should handle zero frameRate gracefully', () => {
      mockVideo.currentTime = 50;
      mockStores.video.frameRate = 0;

      controller.jumpBackward();

      expect(mockVideo.currentTime).toBe(50);
    });
  });

  describe('setPlaybackRate', () => {
    it('should increase playback rate with "fast"', () => {
      mockVideo.playbackRate = 1;
      mockVideo.duration = 100;

      controller.setPlaybackRate('fast');

      expect(mockVideo.playbackRate).toBe(1.5);
      expect(mockStores.video.currentPlaybackRate).toBe(1.5);
    });

    it('should decrease playback rate with "slow"', () => {
      mockVideo.playbackRate = 1.5;

      controller.setPlaybackRate('slow');

      expect(mockVideo.playbackRate).toBe(1);
      expect(mockStores.video.currentPlaybackRate).toBe(1);
    });

    it('should respect minimum playback rate (0.5)', () => {
      mockVideo.playbackRate = 0.5;

      controller.setPlaybackRate('slow');

      expect(mockVideo.playbackRate).toBe(0.5);
    });

    it('should respect maximum playback rate for short videos (2.5)', () => {
      mockVideo.playbackRate = 2;
      mockVideo.duration = 5;

      controller.setPlaybackRate('fast');

      expect(mockVideo.playbackRate).toBe(2.5);
    });

    it('should respect maximum playback rate for long videos (3.5)', () => {
      mockVideo.playbackRate = 3;
      mockVideo.duration = 100;

      controller.setPlaybackRate('fast');

      expect(mockVideo.playbackRate).toBe(3.5);
    });
  });

  describe('zoomIn', () => {
    it('should increase zoom level by 0.1', () => {
      mockStores.video.zoomLevel = 1;

      controller.zoomIn();

      expect(mockStores.video.zoomLevel).toBe(1.1);
    });

    it('should apply transform to video element', () => {
      mockStores.video.zoomLevel = 1;

      controller.zoomIn();

      expect(mockVideo.style.transform).toBe('scale(1.1)');
    });

    it('should handle null video element', () => {
      const depsNoVideo = {
        getStores: () => mockStores,
        getVideo: () => null,
      };
      const controllerNoVideo = createVideoController(depsNoVideo);
      mockStores.video.zoomLevel = 1;

      expect(() => controllerNoVideo.zoomIn()).not.toThrow();
      expect(mockStores.video.zoomLevel).toBe(1.1);
    });
  });

  describe('zoomOut', () => {
    it('should decrease zoom level by 0.1', () => {
      mockStores.video.zoomLevel = 1.5;

      controller.zoomOut();

      expect(mockStores.video.zoomLevel).toBe(1.4);
    });

    it('should not go below minimum zoom (0.5)', () => {
      mockStores.video.zoomLevel = 0.5;

      controller.zoomOut();

      expect(mockStores.video.zoomLevel).toBe(0.5);
    });

    it('should apply transform to video element', () => {
      mockStores.video.zoomLevel = 1.5;

      controller.zoomOut();

      expect(mockVideo.style.transform).toBe('scale(1.4)');
    });
  });

  describe('updateVideoProgress', () => {
    it('should set video currentTime based on progress percentage', () => {
      mockStores.video.progress = 50;
      mockVideo.duration = 100;

      controller.updateVideoProgress();

      expect(mockVideo.currentTime).toBe(50);
    });

    it('should work with various progress percentages', () => {
      mockVideo.duration = 100;

      mockStores.video.progress = 25;
      controller.updateVideoProgress();
      expect(mockVideo.currentTime).toBe(25);

      mockStores.video.progress = 75;
      controller.updateVideoProgress();
      expect(mockVideo.currentTime).toBe(75);
    });

    it('should handle null video element', () => {
      const depsNoVideo = {
        getStores: () => mockStores,
        getVideo: () => null,
      };
      const controllerNoVideo = createVideoController(depsNoVideo);

      expect(() => controllerNoVideo.updateVideoProgress()).not.toThrow();
    });
  });

  describe('getMaxPlaybackRate', () => {
    it('should return 2.5 for short videos (duration < 10s)', () => {
      mockVideo.duration = 5;

      const maxRate = controller.getMaxPlaybackRate();

      expect(maxRate).toBe(2.5);
    });

    it('should return 3.5 for long videos (duration >= 10s)', () => {
      mockVideo.duration = 100;

      const maxRate = controller.getMaxPlaybackRate();

      expect(maxRate).toBe(3.5);
    });

    it('should handle null video element', () => {
      const depsNoVideo = {
        getStores: () => mockStores,
        getVideo: () => null,
      };
      const controllerNoVideo = createVideoController(depsNoVideo);

      const maxRate = controllerNoVideo.getMaxPlaybackRate();

      expect(maxRate).toBeUndefined();
    });
  });

  describe('isInputFocused', () => {
    it('should return true when input is focused', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const result = controller.isInputFocused();

      expect(result).toBe(true);
      document.body.removeChild(input);
    });

    it('should return true when textarea is focused', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      const result = controller.isInputFocused();

      expect(result).toBe(true);
      document.body.removeChild(textarea);
    });

    it('should return false when no input is focused', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);
      div.focus();

      const result = controller.isInputFocused();

      expect(result).toBe(false);
      document.body.removeChild(div);
    });
  });

  describe('handleKeyDown', () => {
    it('should toggle play on Space key', () => {
      const event = new KeyboardEvent('keydown', { code: 'Space' });
      event.preventDefault = vi.fn();
      mockVideo.paused = true;

      controller.handleKeyDown(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockVideo.play).toHaveBeenCalled();
    });

    it('should jump forward on KeyD', () => {
      mockVideo.currentTime = 0;
      const event = new KeyboardEvent('keydown', { code: 'KeyD' });
      event.preventDefault = vi.fn();

      controller.handleKeyDown(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockVideo.currentTime).toBeGreaterThan(0);
    });

    it('should jump backward on KeyA', () => {
      mockVideo.currentTime = 10;
      const event = new KeyboardEvent('keydown', { code: 'KeyA' });
      event.preventDefault = vi.fn();

      controller.handleKeyDown(event);

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should not handle keys when input is focused', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', { code: 'Space' });
      event.preventDefault = vi.fn();

      controller.handleKeyDown(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });
  });
});
