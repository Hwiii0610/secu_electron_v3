<template>
  <div class="control-container">
    <!-- 타임라인 영역 -->
    <div class="timeline-area">
      <div class="time-label time-current">{{ currentTime }}</div>
      <div class="timeline-track">
        <div class="slider-container">
          <!-- 탐지 진행률 오버레이 -->
          <div
            v-if="isDetecting"
            class="detection-progress-overlay"
            :style="{ width: detectionProgress + '%' }"
          ></div>
          <!-- 트림 선택 범위 하이라이트 -->
          <div
            v-if="trimStartPosition > 0 || trimEndPosition < 100"
            class="trim-range-highlight"
            :style="{
              left: trimStartPosition + '%',
              width: (trimEndPosition - trimStartPosition) + '%'
            }"
          ></div>
          <input
            type="range"
            v-model="progress"
            min="0"
            max="100"
            @input="$emit('update-progress')"
            :style="{ background: sliderBackground }"
            class="slider"
            aria-label="재생 위치"
          >
          <!-- 트림 시작 마커 -->
          <div
            class="trim-marker trim-start"
            :style="{ left: trimStartPosition + '%' }"
            @mousedown="$emit('marker-mousedown', 'start', $event)"
            title="트림 시작"
          >
            <div class="trim-grip"></div>
          </div>
          <!-- 트림 끝 마커 -->
          <div
            class="trim-marker trim-end"
            :style="{ left: trimEndPosition + '%' }"
            @mousedown="$emit('marker-mousedown', 'end', $event)"
            title="트림 끝"
          >
            <div class="trim-grip"></div>
          </div>
        </div>
      </div>
      <div class="time-label time-total">{{ totalTime }}</div>
    </div>

    <!-- 프레임 정보 (타임라인 아래 중앙) -->
    <div class="frame-info">
      Frame {{ typeof currentFrame === 'number' && !isNaN(currentFrame) ? Math.round(currentFrame) + 1 : '--' }}
    </div>

    <!-- 컨트롤 버튼 영역 -->
    <div class="controls-row">
      <!-- 줌 그룹 -->
      <div class="btn-group">
        <button class="ctrl-btn" @click="$emit('zoom-in')" title="확대">
          <img src="../../src/assets/plus.png" alt="" aria-hidden="true">
        </button>
        <button class="ctrl-btn" @click="$emit('zoom-out')" title="축소">
          <img src="../../src/assets/minus.png" alt="" aria-hidden="true">
        </button>
      </div>

      <div class="btn-divider"></div>

      <!-- 재생 그룹 -->
      <div class="btn-group">
        <button class="ctrl-btn" @click="$emit('jump-backward')" title="이전">
          <img src="../../src/assets/previous.png" alt="" aria-hidden="true">
        </button>
        <button class="ctrl-btn" @click="$emit('set-playback-rate', 'slow')" title="느리게">
          <img src="../../src/assets/slower.png" alt="" aria-hidden="true">
        </button>
        <button class="ctrl-btn ctrl-btn--play" @click="$emit('toggle-play')" :title="videoPlaying ? '일시정지' : '재생'">
          <img v-if="videoPlaying" src="../../src/assets/pause.png" alt="" aria-hidden="true">
          <img v-else src="../../src/assets/play.png" alt="" aria-hidden="true">
        </button>
        <button class="ctrl-btn" @click="$emit('set-playback-rate', 'fast')" title="빠르게">
          <img src="../../src/assets/faster.png" alt="" aria-hidden="true">
        </button>
        <button class="ctrl-btn" @click="$emit('jump-forward')" title="다음">
          <img src="../../src/assets/next.png" alt="" aria-hidden="true">
        </button>
      </div>

      <!-- 속도 표시 -->
      <span class="speed-badge">×{{ currentPlaybackRate }}</span>

      <div class="btn-divider"></div>

      <!-- 편집 그룹 -->
      <div class="btn-group">
        <button class="ctrl-btn" @click="$emit('trim-video')" title="트림">
          <img src="../../src/assets/crop.png" alt="" aria-hidden="true">
        </button>
        <button class="ctrl-btn" @click="$emit('merge-video')" title="병합">
          <img src="../../src/assets/merge.png" alt="" aria-hidden="true">
        </button>
      </div>
    </div>

    <!-- 로고 -->
    <div class="control-footer">
      <img src="../../src/assets/SPHEREAX_CI_Simple_White.png" alt="logo">
    </div>
  </div>
</template>

<script>
import { mapWritableState, mapState } from 'pinia';
import { useVideoStore } from '../stores/videoStore';
import { useDetectionStore } from '../stores/detectionStore';

export default {
  name: 'VideoControls',
  emits: [
    'update-progress', 'marker-mousedown', 'zoom-in', 'zoom-out',
    'jump-backward', 'jump-forward', 'toggle-play',
    'set-playback-rate', 'trim-video', 'merge-video'
  ],
  computed: {
    ...mapWritableState(useVideoStore, [
      'currentTime', 'totalTime', 'progress', 'videoPlaying',
      'currentPlaybackRate', 'currentFrame'
    ]),
    ...mapState(useVideoStore, ['sliderBackground', 'trimStartPosition', 'trimEndPosition']),
    ...mapState(useDetectionStore, ['isDetecting', 'detectionProgress']),
  },
};
</script>
