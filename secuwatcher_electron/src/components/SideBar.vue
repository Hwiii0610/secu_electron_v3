<template>
  <div class="sidebar" role="navigation" aria-label="사이드바 메뉴">
    <!-- 자동탐지 -->
    <div
      class="sidebar-item"
      :class="{ 'sidebar-item--active': isActive('자동객체탐지'), 'sidebar-item--disabled': isDisabled('자동객체탐지') }"
      @click="handleClick('자동객체탐지')"
      role="button"
      tabindex="0"
      :title="`자동 객체 탐지${isDisabled('자동객체탐지') ? ' (비활성화됨)' : ''}`"
      @keydown.enter="handleClick('자동객체탐지')"
      @keydown.space.prevent="handleClick('자동객체탐지')"
      aria-label="자동 객체 탐지">
      <img class="sidebar-icon-img" src="../assets/autodetect_lg.png" alt="">
      <span>자동탐지</span>
    </div>

    <!-- 선택탐지 -->
    <div
      class="sidebar-item"
      :class="{ 'sidebar-item--active': isActive('선택객체탐지'), 'sidebar-item--disabled': isDisabled('선택객체탐지') }"
      @click="handleClick('선택객체탐지')"
      role="button"
      tabindex="0"
      :title="`선택 객체 탐지${isDisabled('선택객체탐지') ? ' (비활성화됨)' : ''}`"
      @keydown.enter="handleClick('선택객체탐지')"
      @keydown.space.prevent="handleClick('선택객체탐지')"
      aria-label="선택 객체 탐지">
      <img class="sidebar-icon-img" src="../assets/selectdetect_lg.png" alt="">
      <span>선택탐지</span>
    </div>

    <!-- 수동 마스킹 -->
    <div
      class="sidebar-item"
      :class="{ 'sidebar-item--active': isActive('수동 마스킹'), 'sidebar-item--disabled': isDisabled('수동 마스킹') }"
      @click="handleClick('수동 마스킹')"
      role="button"
      tabindex="0"
      :title="`수동 마스킹${isDisabled('수동 마스킹') ? ' (비활성화됨)' : ''}`"
      @keydown.enter="handleClick('수동 마스킹')"
      @keydown.space.prevent="handleClick('수동 마스킹')"
      aria-label="수동 마스킹">
      <img class="sidebar-icon-img" src="../assets/masking_lg.png" alt="">
      <span>수동</span>
    </div>

    <!-- 구분선 -->
    <div class="sidebar-separator"></div>

    <!-- 미리보기 -->
    <div
      class="sidebar-item"
      :class="{ 'sidebar-item--active': isActive('미리보기'), 'sidebar-item--disabled': isDisabled('미리보기') }"
      @click="handleClick('미리보기')"
      role="button"
      tabindex="0"
      :title="`미리보기${isDisabled('미리보기') ? ' (비활성화됨)' : ''}`"
      @keydown.enter="handleClick('미리보기')"
      @keydown.space.prevent="handleClick('미리보기')"
      aria-label="미리보기">
      <img class="sidebar-icon-img" src="../assets/preview_lg.png" alt="">
      <span>미리보기</span>
    </div>

    <!-- 스페이서 (flex-grow) -->
    <div class="sidebar-spacer"></div>

    <!-- 구분선 -->
    <div class="sidebar-separator"></div>

    <!-- 내보내기 -->
    <div
      class="sidebar-item"
      :class="{ 'sidebar-item--active': isActive('내보내기'), 'sidebar-item--disabled': isDisabled('내보내기') }"
      @click="handleClick('내보내기')"
      role="button"
      tabindex="0"
      :title="`내보내기${isDisabled('내보내기') ? ' (비활성화됨)' : ''}`"
      @keydown.enter="handleClick('내보내기')"
      @keydown.space.prevent="handleClick('내보내기')"
      aria-label="내보내기">
      <img class="sidebar-icon-img" src="../assets/export_lg.png" alt="">
      <span>내보내기</span>
    </div>

    <!-- 일괄처리 -->
    <div
      class="sidebar-item"
      :class="{ 'sidebar-item--active': isActive('일괄처리'), 'sidebar-item--disabled': isDisabled('일괄처리') }"
      @click="handleClick('일괄처리')"
      role="button"
      tabindex="0"
      :title="`일괄처리${isDisabled('일괄처리') ? ' (비활성화됨)' : ''}`"
      @keydown.enter="handleClick('일괄처리')"
      @keydown.space.prevent="handleClick('일괄처리')"
      aria-label="일괄처리">
      <img class="sidebar-icon-img" src="../assets/export_lg.png" alt="">
      <span>일괄</span>
    </div>

    <!-- 설정 -->
    <div
      class="sidebar-item"
      :class="{ 'sidebar-item--active': isActive('설정'), 'sidebar-item--disabled': isDisabled('설정') }"
      @click="handleClick('설정')"
      role="button"
      tabindex="0"
      title="설정"
      @keydown.enter="handleClick('설정')"
      @keydown.space.prevent="handleClick('설정')"
      aria-label="설정">
      <img class="sidebar-icon-img" src="../assets/setting_lg.png" alt="">
      <span>설정</span>
    </div>

    <!-- 하단 여백 -->
    <div class="sidebar-bottom-spacer"></div>
  </div>
</template>

<script>
import { mapState } from 'pinia';
import { useModeStore } from '../stores/modeStore';
import { useDetectionStore } from '../stores/detectionStore';
import { useFileStore } from '../stores/fileStore';

export default {
  name: 'SideBar',
  props: {
    handleMenuItemClick: {
      type: Function,
      required: true
    },
  },
  computed: {
    ...mapState(useModeStore, ['currentMode']),
    ...mapState(useDetectionStore, ['isBusy']),
    ...mapState(useFileStore, ['selectedFileIndex', 'files'])
  },
  methods: {
    handleClick(menuId) {
      if (!this.isDisabled(menuId)) {
        this.handleMenuItemClick(menuId);
      }
    },
    isDisabled(menuId) {
      // 설정은 항상 활성화
      if (menuId === '설정') return false;

      // 일괄처리는 isBusy에만 영향
      if (menuId === '일괄처리') return this.isBusy;

      // 나머지: isBusy 또는 파일 미선택 시 비활성화
      const requiresFile = [
        '자동객체탐지', '선택객체탐지', '수동 마스킹', '미리보기', '내보내기'
      ];

      if (requiresFile.includes(menuId)) {
        return this.isBusy || this.selectedFileIndex < 0;
      }

      return false;
    },
    isActive(menuId) {
      if (menuId === '자동객체탐지') {
        return this.currentMode === '' && this.isBusy;
      }
      if (menuId === '선택객체탐지') {
        return this.currentMode === 'select';
      }
      if (menuId === '수동 마스킹') {
        return this.currentMode === 'mask';
      }
      return false;
    }
  }
};
</script>

<style scoped>
/* Sidebar container */
.sidebar {
  width: 80px;
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border-solid);
  display: flex;
  flex-direction: column;
  padding: 8px 0 24px 0;
  z-index: var(--z-sidebar);
  flex-shrink: 0;
  overflow: hidden;
}

/* Sidebar items */
.sidebar-item {
  width: 80px;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 14px;
  border-left: 3px solid transparent;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.sidebar-item span {
  font-size: 11px;
  letter-spacing: -0.2px;
  font-weight: 500;
}

.sidebar-item:hover:not(.sidebar-item--disabled) {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.sidebar-item--active {
  color: var(--color-accent-button);
  border-left-color: var(--color-accent-button);
  background: rgba(58, 130, 196, 0.08);
}

.sidebar-item--disabled {
  opacity: 0.35;
  pointer-events: none;
  cursor: not-allowed;
}

/* File icon */
.sidebar-file-icon {
  padding: 0;
}

.sidebar-file-icon svg {
  width: 26px;
  height: 26px;
}

/* Icon image (PNG) */
.sidebar-icon-img {
  width: 26px;
  height: 26px;
  object-fit: contain;
  pointer-events: none;
}

/* Separator */
.sidebar-separator {
  height: 1px;
  background: var(--color-border);
  margin: 10px 14px;
  flex-shrink: 0;
}

/* Spacer */
.sidebar-spacer {
  flex: 1;
}

/* Bottom spacer */
.sidebar-bottom-spacer {
  height: 20px;
  flex-shrink: 0;
}
</style>
