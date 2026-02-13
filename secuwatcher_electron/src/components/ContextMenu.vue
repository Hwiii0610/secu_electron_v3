<template>
  <div
    v-if="contextMenuVisible"
    class="context-menu"
    :style="{ top: contextMenuPosition.y + 'px', left: contextMenuPosition.x + 'px' }"
  >
    <ul>
      <li class="submenu-parent">{{ toggleLabel }}
        <ul class="submenu">
          <li @click="$emit('action', 'toggle-identified')">전체</li>
          <li @click="$emit('action', 'toggle-identified-forward')">여기서부터</li>
          <li @click="$emit('action', 'toggle-identified-backward')">여기까지</li>
        </ul>
      </li>
      <li v-if="isMaskType" @click="$emit('action', 'delete-mask')">삭제</li>
    </ul>
  </div>
</template>

<script>
import { mapWritableState, mapState } from 'pinia';
import { useModeStore } from '../stores/modeStore';
import { useDetectionStore } from '../stores/detectionStore';
import { useVideoStore } from '../stores/videoStore';

export default {
  name: 'ContextMenu',
  emits: ['action'],
  computed: {
    ...mapWritableState(useModeStore, ['contextMenuVisible', 'contextMenuPosition', 'selectedShape']),
    ...mapWritableState(useDetectionStore, ['maskingLogsMap']),
    ...mapState(useVideoStore, ['currentFrame']),
    currentLog() {
      const trackId = this.selectedShape;
      if (!trackId) return null;
      const logs = this.maskingLogsMap[this.currentFrame] || [];
      return logs.find(l => l.track_id === trackId) || null;
    },
    toggleLabel() {
      if (!this.currentLog) return '마스크설정/해제';
      return this.currentLog.object === 1 ? '마스크해제' : '마스크설정';
    },
    isMaskType() {
      return this.currentLog && this.currentLog.type === 4;
    },
  },
};
</script>
