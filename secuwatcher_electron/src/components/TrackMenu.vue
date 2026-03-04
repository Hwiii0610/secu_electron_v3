<template>
  <div
    v-if="trackMenuVisible"
    class="context-menu"
    :style="{ top: trackMenuPosition.y + 'px', left: trackMenuPosition.x + 'px' }"
  >
    <ul>
      <li @click="$emit('action', 'jump-to-start')">시작 프레임으로 이동 (A)</li>
      <li @click="$emit('action', 'jump-to-end')">끝 프레임으로 이동 (D)</li>
    </ul>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useModeStore } from '../stores/modeStore';

export default {
  name: 'TrackMenu',
  emits: ['action'],
  computed: {
    ...mapWritableState(useModeStore, ['trackMenuVisible', 'trackMenuPosition', 'trackMenuTrackId']),
  },
  methods: {
    onClickOutside(event) {
      if (this.trackMenuVisible && !this.$el.contains(event.target)) {
        this.trackMenuVisible = false;
      }
    },
  },
  watch: {
    trackMenuVisible(val) {
      if (val) {
        setTimeout(() => document.addEventListener('mousedown', this.onClickOutside), 0);
      } else {
        document.removeEventListener('mousedown', this.onClickOutside);
      }
    },
  },
  beforeUnmount() {
    document.removeEventListener('mousedown', this.onClickOutside);
  },
};
</script>
