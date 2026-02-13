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
import { mapWritableState } from 'pinia';
import { useModeStore } from '../stores/modeStore';
import { useDetectionStore } from '../stores/detectionStore';

export default {
  name: 'ContextMenu',
  emits: ['action'],
  computed: {
    ...mapWritableState(useModeStore, ['contextMenuVisible', 'contextMenuPosition', 'selectedShape']),
    ...mapWritableState(useDetectionStore, ['maskingLogs']),
    toggleLabel() {
      const trackId = this.selectedShape;
      if (!trackId) return '마스킹 적용/해제';
      const log = this.maskingLogs.find(l => l.track_id === trackId);
      if (!log) return '마스킹 적용/해제';
      return log.object === 1 ? '마스킹 해제' : '마스킹 적용';
    },
    isMaskType() {
      const trackId = this.selectedShape;
      if (!trackId) return false;
      const log = this.maskingLogs.find(l => l.track_id === trackId);
      return log && log.type === 4;
    },
  },
};
</script>
