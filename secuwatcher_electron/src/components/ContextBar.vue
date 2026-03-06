<template>
  <div class="context-bar" role="region" aria-label="상단 파일 정보 바">
    <!-- 좌측: 파일명 + 메타 정보 -->
    <div class="context-bar-left">
      <span v-if="fileName" class="context-bar-file-name">{{ fileName }}</span>
      <span v-else class="context-bar-file-name">-</span>
      <span class="context-bar-meta">{{ metaInfo }}</span>
      <span class="context-bar-divider">|</span>
      <span class="context-bar-meta">{{ fileIndexInfo }}</span>
    </div>

    <!-- 우측: 프레임 정보 배지 -->
    <div class="context-bar-right">
      <span v-if="selectedFileIndex >= 0" class="context-bar-badge" aria-live="polite">▲▼ {{ frameStepLabel }}</span>
      <span class="context-bar-frame-info">F <b>{{ currentFrameFormatted }}</b></span>
    </div>
  </div>
</template>

<script>
import { mapState } from 'pinia';
import { useFileStore } from '../stores/fileStore';
import { useVideoStore } from '../stores/videoStore';

export default {
  name: 'ContextBar',
  computed: {
    ...mapState(useFileStore, ['fileInfoItems', 'files', 'selectedFileIndex']),
    ...mapState(useVideoStore, ['currentFrame', 'frameRate', 'frameStepLabel']),

    fileName() {
      if (this.selectedFileIndex < 0 || !this.files[this.selectedFileIndex]) {
        return '';
      }
      return this.files[this.selectedFileIndex].name || '';
    },

    metaInfo() {
      if (!this.fileInfoItems || this.fileInfoItems.length < 4) {
        return '';
      }
      // fileInfoItems[3] = resolution
      // fileInfoItems[4] = frameRate
      // fileInfoItems[2] = playTime (duration)
      const resolution = this.fileInfoItems[3]?.value || '-';
      const fps = this.fileInfoItems[4]?.value || '30';
      const duration = this.fileInfoItems[2]?.value || '00:00:00';

      return `${resolution} · ${fps} · ${duration}`;
    },

    fileIndexInfo() {
      if (this.selectedFileIndex < 0) {
        return '-';
      }
      return `파일 ${this.selectedFileIndex + 1}/${this.files.length}`;
    },

    currentFrameFormatted() {
      return String(this.currentFrame).padStart(4, '0');
    }
  }
};
</script>

<style scoped>
.context-bar {
  height: 36px;
  background: var(--color-bg-darkest);
  border-bottom: 1px solid var(--color-border-solid);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 12px;
  font-size: 11px;
  z-index: var(--z-contextbar);
  justify-content: space-between;
}

/* 좌측 영역 */
.context-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 0 1 auto;
}

.context-bar-file-name {
  color: var(--color-accent-button);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-bar-meta {
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.context-bar-divider {
  color: #555;
}

/* 중앙 영역: 로고 */
.context-bar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.context-bar-logo {
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  white-space: nowrap;
}

.context-bar-logo-secu {
  color: var(--color-accent-button);
}

/* 우측 영역 */
.context-bar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 1 auto;
}

.context-bar-badge {
  background: rgba(18, 21, 25, 0.88);
  border: 1px solid rgba(58, 130, 196, 0.4);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 10px;
  color: var(--color-accent-button);
  font-weight: 600;
  white-space: nowrap;
}

.context-bar-frame-info {
  color: var(--color-text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.context-bar-frame-info b {
  color: var(--color-text-primary);
  font-weight: 700;
}
</style>
