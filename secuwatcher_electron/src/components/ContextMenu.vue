<template>
  <div
    v-if="contextMenuVisible"
    class="context-menu"
    :style="{ top: contextMenuPosition.y + 'px', left: contextMenuPosition.x + 'px' }"
  >
    <ul>
      <template v-if="currentMode === 'mask'">
        <li @click="$emit('action', 'set-frame')">프레임 설정</li>
        <li @click="$emit('action', 'toggle-identified')">지정객체 / 미지정객체</li>
        <li @click="$emit('action', 'delete-selected')">선택된 객체 삭제</li>
        <li @click="$emit('action', 'delete-all')">전체 객체 삭제</li>
      </template>
      <template v-else>
        <ul>
          <li @click="$emit('action', 'toggle-identified')">지정객체 / 미지정객체</li>
          <li @click="$emit('action', 'delete-selected')">선택된 객체 삭제</li>
          <li class="submenu-parent">객체 삭제
            <ul class="submenu">
              <li @click="$emit('action', 'delete-all-types')">전체객체탐지 삭제</li>
              <li @click="$emit('action', 'delete-auto')">자동객체탐지 삭제</li>
              <li @click="$emit('action', 'delete-select')">선택객체탐지 삭제</li>
              <li @click="$emit('action', 'delete-masking')">영역마스킹 삭제</li>
              <li @click="$emit('action', 'delete-manual')">수동객체탐지 삭제</li>
            </ul>
          </li>
        </ul>
      </template>
    </ul>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useModeStore } from '../stores/modeStore';

export default {
  name: 'ContextMenu',
  emits: ['action'],
  computed: {
    ...mapWritableState(useModeStore, ['contextMenuVisible', 'contextMenuPosition', 'currentMode']),
  },
};
</script>
