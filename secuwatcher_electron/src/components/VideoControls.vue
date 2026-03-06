<template>
  <!-- 플로팅 컨트롤바 오버레이 — 비디오 영역 하단에 절대 위치 -->
  <div class="floating-control-bar">
    <!-- 좌측 플레이 버튼 -->
    <div class="fcb-play" @click="$emit('toggle-play')" :title="videoPlaying ? '일시정지' : '재생'">
      <span class="play-icon">{{ videoPlaying ? '⏸' : '▶' }}</span>
    </div>

    <!-- 중앙 타임라인 영역 -->
    <div class="fcb-timeline">
      <div class="fcb-timeline-row">
        <div class="fcb-ruler">
          <span style="left:0%">00:00</span>
          <span style="left:25%">00:34</span>
          <span class="fcb-now-t" style="left:50%">{{ currentTime }}</span>
          <span style="left:75%">01:42</span>
          <span style="left:100%">{{ totalTime }}</span>
        </div>
      </div>
      <div class="fcb-timeline-row">
        <div class="fcb-strip">
          <!-- 썸네일 레이어 -->
          <div class="fcb-thumbnail-layer">
            <div
              v-for="segment in segmentsWithLayout"
              :key="segment.id"
              class="fcb-segment"
              :class="{ active: segment.isActive }"
              :style="{
                left: segment.leftPercent + '%',
                width: segment.widthPercent + '%',
                backgroundImage: segment.spriteUrl
                  ? `url(${segment.spriteUrl})`
                  : 'none'
              }"
            >
              <span class="fcb-segment-duration">{{ segment.durationLabel }}</span>
            </div>
          </div>
          <!-- 탐지 진행률 오버레이 -->
          <div
            v-if="isDetecting"
            class="fcb-detection-overlay"
            :style="{ width: detectionProgress + '%' }"
          ></div>
          <!-- 트림 선택 범위 -->
          <div
            v-if="trimStartPosition > 0 || trimEndPosition < 100"
            class="fcb-trim-range"
            :style="{
              left: trimStartPosition + '%',
              width: (trimEndPosition - trimStartPosition) + '%'
            }"
          ></div>
          <!-- 슬라이더 -->
          <input
            type="range"
            v-model="progress"
            min="0"
            max="100"
            @input="$emit('update-progress')"
            class="fcb-slider"
            aria-label="재생 위치"
          >
          <!-- 재생 헤드 -->
          <div class="fcb-playhead"></div>
          <!-- 트림 마커 -->
          <div
            class="fcb-trim-marker fcb-trim-start"
            :style="{ left: trimStartPosition + '%' }"
            @mousedown="$emit('marker-mousedown', 'start', $event)"
            title="트림 시작"
          ></div>
          <div
            class="fcb-trim-marker fcb-trim-end"
            :style="{ left: trimEndPosition + '%' }"
            @mousedown="$emit('marker-mousedown', 'end', $event)"
            title="트림 끝"
          ></div>
        </div>
      </div>
    </div>

    <!-- 우측 액션 버튼 영역 -->
    <div class="fcb-actions">
      <button class="fcb-action-btn fcb-btn-primary" @click="$emit('trim-video')" title="분할">
        ✂ {{ $t('common.split') }}
      </button>
      <button class="fcb-action-btn" @click="handleCancel" title="취소">
        {{ $t('common.cancel') }}
      </button>
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
    ...mapState(useVideoStore, ['sliderBackground', 'trimStartPosition', 'trimEndPosition', 'segmentsWithLayout']),
    ...mapState(useDetectionStore, ['isDetecting', 'detectionProgress']),
  },
  methods: {
    handleCancel() {
      this.$emit('toggle-play');
    },
  },
};
</script>

<style scoped>
/* 플로팅 컨트롤바는 이제 floating-controls.css에서 관리됨 */
/* 여기서는 스코프된 스타일만 필요한 경우 정의 */
</style>
