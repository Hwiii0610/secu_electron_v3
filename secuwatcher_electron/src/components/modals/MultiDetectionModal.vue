<template>
  <div class="multi-auto-detection-modal" v-if="showMultiAutoDetectionModal">
    <div class="multi-auto-detection-modal-content">
      <div class="modal-header">
        <h3>다중파일 자동객체탐지</h3>
        <button class="close-button" @click="close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="file-list">
          <div class="file-list-header" style="display: flex; justify-content: space-between;">
            <input style="width: 20%; text-align: center" type="checkbox"
              :checked="allAutoDetectionSelected"
              @change="toggleAll" />
            <span style="width: 21%; text-align: center">파일 이름</span>
            <span style="width: 20%; text-align: center">진행률</span>
            <span style="width: 20%; text-align: center">상태</span>
            <span style="width: 19%; text-align: center">파일 크기</span>
          </div>
          <div v-for="(file, index) in files" :key="index" class="merge-list-item">
            <input style="width: 20%; text-align: center" type="checkbox" v-model="autoDetectionSelections[index]" />
            <span style="width: 21%; text-align: center" class="merge-file-name">{{ file.name }}</span>
            <span style="width: 20%; text-align: center">{{ fileProgressMap[file.name] ? fileProgressMap[file.name] : '0' }}%</span>
            <span style="width: 20%; text-align: center">{{
              fileProgressMap[file.name] === 100
              ? '탐지완료' : fileProgressMap[file.name] > 0
              ? '탐지중' : fileProgressMap[file.name] === -1
              ? '탐지실패' : '대기중' }}</span>
            <span style="width: 19%; text-align: center" class="merge-file-size">{{ file.size }}</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="action-button" @click="$emit('execute')">확인</button>
        <button class="action-button cancel" @click="close">취소</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState, mapState } from 'pinia';
import { useDetectionStore } from '../../stores/detectionStore';
import { useFileStore } from '../../stores/fileStore';

export default {
  name: 'MultiDetectionModal',
  emits: ['execute'],
  computed: {
    ...mapWritableState(useDetectionStore, ['showMultiAutoDetectionModal', 'autoDetectionSelections']),
    ...mapState(useDetectionStore, ['allAutoDetectionSelected']),
    ...mapWritableState(useFileStore, ['files', 'fileProgressMap']),
  },
  methods: {
    close() {
      this.showMultiAutoDetectionModal = false;
    },
    toggleAll() {
      const newValue = !this.allAutoDetectionSelected;
      this.autoDetectionSelections = this.files.map(() => newValue);
    },
  },
};
</script>
