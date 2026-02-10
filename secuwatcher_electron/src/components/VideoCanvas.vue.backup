<template>
  <div class="video-container">
    <video id="video" ref="videoPlayer" class="video-player"></video>

    <div v-if="conversion.inProgress" class="conversion-overlay">
      <div class="conversion-info">
        <h4>{{ conversion.currentFile }} 변환 중...</h4>
        <div class="conversion-progress-bar">
          <div class="conversion-progress-fill" :style="{ width: conversion.progress + '%' }"></div>
        </div>
        <p>진행률: {{ conversion.progress }}%</p>
        <p>재생을 위해 MP4로 변환하고 있습니다.</p>
      </div>
    </div>

    <!-- preview 전용 캔버스 하나만 남기고, v-show로 토글 -->
    <canvas
      ref="maskPreview"
      class="mask-preview-canvas"
      :style="{ display: exportAllMasking === 'Yes' ? 'block' : 'none' }"
    ></canvas>

    <canvas
      ref="maskingCanvas"
      id="canvas"
      @click="$emit('canvas-click', $event)"
      @mousedown="$emit('canvas-mousedown', $event)"
      @mousemove="$emit('canvas-mousemove', $event)"
      @mouseup="$emit('canvas-mouseup', $event)"
      @contextmenu.prevent="$emit('canvas-contextmenu', $event)"
      :style="{ pointerEvents: selectMode ? 'auto' : 'none' }"
    ></canvas>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useVideoStore } from '../stores/videoStore';
import { useModeStore } from '../stores/modeStore';

export default {
  name: 'VideoCanvas',
  emits: ['canvas-click', 'canvas-mousedown', 'canvas-mousemove', 'canvas-mouseup', 'canvas-contextmenu'],
  computed: {
    ...mapWritableState(useVideoStore, ['conversion']),
    ...mapWritableState(useModeStore, ['exportAllMasking', 'selectMode']),
  },
};
</script>
