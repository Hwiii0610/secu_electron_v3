<template>
  <div class="merge-modal" v-if="show">
    <div class="merge-modal-content">
      <div class="merge-modal-header">
        <h3>구간 편집할 영상 선택</h3>
        <button class="close-button" @click="$emit('close')">&times;</button>
      </div>
      <div class="merge-modal-body">
        <div class="select-all-container">
          <input type="checkbox" :checked="allSelected" @change="toggleSelectAll" />
          <span class="select-all-text">전체 선택</span>
          <span class="select-all-size"></span>
        </div>
        <div class="merge-file-list">
          <div v-for="(file, index) in sessionCroppedFiles" :key="index" class="merge-file-item">
            <input type="checkbox" v-model="selections[index]" @change="updateAllSelected" />
            <span class="merge-file-name">{{ file.name }}</span>
            <span class="merge-file-size">{{ file.size }}</span>
          </div>
        </div>
      </div>
      <div class="merge-modal-footer">
        <button class="action-button" @click="$emit('execute')">구간 편집 실행</button>
        <button class="action-button cancel" @click="$emit('close')">취소</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useFileStore } from '../../stores/fileStore';

export default {
  name: 'MergeModal',
  props: {
    show: Boolean,
    selections: Array,
    allSelected: Boolean,
  },
  emits: ['close', 'execute', 'update:selections', 'update:allSelected'],
  computed: {
    ...mapWritableState(useFileStore, ['sessionCroppedFiles']),
  },
  methods: {
    toggleSelectAll() {
      const newVal = !this.allSelected;
      this.$emit('update:allSelected', newVal);
      this.$emit('update:selections', this.sessionCroppedFiles.map(() => newVal));
    },
    updateAllSelected() {
      this.$emit('update:allSelected', this.selections.every(Boolean));
    },
  },
};
</script>
