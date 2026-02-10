<template>
  <div class="control-container">
    <div class="control-bar">
      <div class="time-display">{{ currentTime }}</div>
      <div class="progress-bar">
        <div class="slider-container">
          <input
            type="range"
            v-model="progress"
            min="0"
            max="100"
            @input="$emit('update-progress')"
            :style="{ background: sliderBackground }"
            class="slider"
          >
          <!-- 트림 시작/끝 마커 -->
          <div
            class="trim-marker start-marker"
            :style="{ left: trimStartPosition + '%' }"
            @mousedown="$emit('marker-mousedown', 'start', $event)"
          ></div>
          <div
            class="trim-marker end-marker"
            :style="{ left: trimEndPosition + '%' }"
            @mousedown="$emit('marker-mousedown', 'end', $event)"
          ></div>
        </div>
      </div>
      <!---->
      <div style="position: relative;">
        <div class="time-display" style="text-align:right;">
          {{ totalTime }}
        </div>
        <div style="
          position: absolute;
          right: 0;
          top: 24px;
          font-weight: bold;
          font-size: 12px;
          color: #ffffff;
          min-width: 98px;
          padding-left: 8px;
          letter-spacing: 1px;
          line-height: 18px;
        ">
          Frame: {{ typeof currentFrame === 'number' && !isNaN(currentFrame) ? Math.round(currentFrame) : '--' }}
        </div>
      </div>
    </div>

    <!-- 영상 속도 조절 버튼 -->
    <div class="control-buttons">
      <div class="button-layer">
        <img @click="$emit('zoom-in')" src="../../src/assets/plus.png" alt="zoomIn">
        <img @click="$emit('zoom-out')" src="../../src/assets/minus.png" alt="zoomOut">
        <img @click="$emit('jump-backward')" src="../../src/assets/previous.png" alt="jumpBackward">
        <img @click="$emit('toggle-play')" v-if="videoPlaying" src="../../src/assets/pause.png" alt="pause">
        <img @click="$emit('toggle-play')" v-else src="../../src/assets/play.png" alt="play">
        <img @click="$emit('jump-forward')" src="../../src/assets/next.png" alt="jumpForward">
        <img @click="$emit('set-playback-rate', 'slow')" src="../../src/assets/slower.png" alt="slower">
        <span>X {{ currentPlaybackRate }}</span>
        <img @click="$emit('set-playback-rate', 'fast')" src="../../src/assets/faster.png" alt="faster">
        <img @click="$emit('trim-video')" src="../../src/assets/crop.png" alt="trim">
        <img @click="$emit('merge-video')" src="../../src/assets/merge.png" alt="merge">
      </div>
    </div>

    <div class="control-footer">
      <img src="/src/assets/SPHEREAX_CI_Simple_White.png" alt="logo">
    </div>
  </div>
</template>

<script>
import { mapWritableState, mapState } from 'pinia';
import { useVideoStore } from '../stores/videoStore';

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
  },
};
</script>
