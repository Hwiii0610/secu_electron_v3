<template>
  <div class="file-panel-container" :class="{ 'file-panel-collapsed': collapsed }">
    <!-- 토글 탭 핸들 — 패널 우측 중앙에 돌출 -->
    <div class="file-panel-toggle-tab" @click="$emit('toggle')">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <polygon v-if="collapsed" points="9,7 15,12 9,17"/>
        <polygon v-else points="15,7 9,12 15,17"/>
      </svg>
    </div>
    <div class="file-container">
      <span class="file-title" style="font-weight: bold; font-size: 12px; margin-bottom: 5%">{{ $t('file.fileInfo') }}</span>
      <span class="file-title">{{ $t('file.originalFileInfo') }}</span>

      <div class="file-info-header">
        <div v-for="(info, index) in fileInfoItems" :key="index" class="file-info-header-item">
          <div class="row-header">{{ $t(info.label) }}</div>
          <div class="row-content">{{ info.value ? info.value : $t('file.waiting') }}</div>
        </div>
      </div>

      <div class="file-info-divider"></div>

      <div class="file-info-body" role="listbox" :aria-label="$t('file.fileList')">
        <div v-if="files.length === 0" class="empty-state">
          <p class="empty-state__text">{{ $t('file.noFilesMessage') }}</p>
          <p class="empty-state__hint">{{ $t('file.noFilesHint') }}</p>
        </div>
        <template v-else>
          <div>
            <span class="row-header">{{ $t('file.fileNumber') }}</span>
            <span class="row-content">{{ $t('file.fileName') }}</span>
          </div>
          <div
            v-for="(file, index) in files"
            :key="index"
            class="file-item"
            role="option"
            :aria-selected="selectedFileIndex === index"
            :tabindex="selectedFileIndex === index ? 0 : -1"
            :class="{ 'selected': selectedFileIndex === index }"
            @click="$emit('select-file', index)"
            @keydown.enter="$emit('select-file', index)"
          >
            <span class="row-header">{{ index + 1 }}</span>
            <span class="row-content">{{ file.name }}</span>
          </div>
        </template>
      </div>

      <div class="file-actions">
        <button class="action-button" :aria-label="$t('file.addButton')" @click="$emit('trigger-file-input')">{{ $t('file.addButton') }}</button>
        <button class="action-button cancel" :aria-label="$t('file.deleteButton')" @click="$emit('delete-file')">{{ $t('file.deleteButton') }}</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useFileStore } from '../stores/fileStore';

export default {
  name: 'FilePanel',
  emits: ['select-file', 'trigger-file-input', 'delete-file', 'close', 'toggle'],
  props: {
    collapsed: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    ...mapWritableState(useFileStore, ['fileInfoItems', 'files', 'selectedFileIndex']),
  },
};
</script>
