<template>
  <div class="file-wrapper">
    <div class="file-container">
      <span class="file-title" style="font-weight: bold; font-size: 12px; margin-bottom: 5%">파일 정보</span>
      <span class="file-title">원본 파일 정보</span>

      <div class="file-info-header">
        <div v-for="(info, index) in fileInfoItems" :key="index" class="file-info-header-item">
          <div class="row-header">{{ info.label }}</div>
          <div class="row-content">{{ info.value ? info.value : '대기중..' }}</div>
        </div>
      </div>

      <div class="file-info-divider"></div>

      <span class="file-title" style="margin-bottom: 5%">파일 목록</span>

      <div class="file-info-body">
        <div>
          <span class="row-header">No.</span>
          <span class="row-content">파일 이름</span>
        </div>
        <div
          v-for="(file, index) in files"
          :key="index"
          class="file-item"
          :class="{ 'selected': selectedFileIndex === index }"
          @click="$emit('select-file', index)"
        >
          <span class="row-header">{{ index + 1 }}</span>
          <span class="row-content">{{ file.name }}</span>
        </div>
      </div>

      <div class="file-actions">
        <button class="action-button" @click="$emit('trigger-file-input')">추가</button>
        <button class="action-button cancel" @click="$emit('delete-file')">삭제</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useFileStore } from '../stores/fileStore';

export default {
  name: 'FilePanel',
  emits: ['select-file', 'trigger-file-input', 'delete-file'],
  computed: {
    ...mapWritableState(useFileStore, ['fileInfoItems', 'files', 'selectedFileIndex']),
  },
};
</script>
