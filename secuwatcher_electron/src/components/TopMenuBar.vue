<template>
  <div class="export-container" role="menubar" :aria-label="$t('common.menu')">
    <div v-for="(item, index) in menuItems"
         :key="item.id"
         role="menuitem"
         :tabindex="focusedIndex === index ? 0 : -1"
         :aria-label="`${getMenuLabel(item.id)}. ${item.shortcut ? '단축키: ' + item.shortcut : ''}`"
         :title="`${getMenuLabel(item.id)}${item.shortcut ? ' (' + item.shortcut + ')' : ''}`"
         @click="onMenuClick(item.id)"
         @keydown.enter="onMenuClick(item.id)"
         @keydown.space="onMenuClick(item.id)"
         @keydown.right="focusNext()"
         @keydown.left="focusPrev()"
         @focus="focusedIndex = index"
         :class="{ disabled: isItemDisabled(item.id), active: isItemActive(item.id) }">
      <img :src="`../../src/assets/${item.icon}`" alt="" role="presentation">
      <span>{{ getMenuLabel(item.id) }}</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'TopMenuBar',
  props: {
    isBusy: { type: Boolean, default: false },
    noFile: { type: Boolean, default: true },
    currentMode: { type: String, default: '' },
    detectionEventType: { type: String, default: '' },
  },
  emits: ['menu-click'],
  data() {
    return {
      focusedIndex: -1,
      menuItems: [
        { id: '자동객체탐지', icon: 'autodetect.png', shortcut: 'Ctrl+Shift+A' },
        { id: '선택객체탐지', icon: 'selectdetect.png', shortcut: 'Ctrl+Shift+S' },
        { id: '수동 마스킹', icon: 'masking.png', shortcut: 'Ctrl+M' },
        { id: '전체마스킹', icon: 'all_masking.png', shortcut: 'Ctrl+Alt+M' },
        { id: '미리보기', icon: 'preview.png', shortcut: 'Ctrl+P' },
        { id: '내보내기', icon: 'export.png', shortcut: 'Ctrl+E' },
        { id: '일괄처리', icon: 'export.png', shortcut: 'Ctrl+B' },
        { id: '설정', icon: 'setting.png', shortcut: 'Ctrl+,' },
      ]
    };
  },
  mounted() {
    window.addEventListener('keydown', this.handleGlobalShortcuts);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleGlobalShortcuts);
  },
  methods: {
    getMenuLabel(id) {
      const labels = {
        '자동객체탐지': this.$t('menu.autoDetect'),
        '선택객체탐지': this.$t('menu.selectDetect'),
        '수동 마스킹': this.$t('menu.manualMasking'),
        '전체마스킹': this.$t('menu.fullMasking'),
        '미리보기': this.$t('menu.preview'),
        '내보내기': this.$t('menu.export'),
        '일괄처리': this.$t('menu.batchProcess'),
        '설정': this.$t('menu.settings'),
      };
      return labels[id] || id;
    },
    onMenuClick(item) {
      this.$emit('menu-click', item);
    },
    isItemDisabled(id) {
      if (id === '설정') return false;
      if (id === '일괄처리') return this.isBusy;
      if (['자동객체탐지', '선택객체탐지', '수동 마스킹', '내보내기'].includes(id)) {
        return this.isBusy || this.noFile;
      }
      return this.noFile;
    },
    isItemActive(id) {
      if (id === '자동객체탐지') {
        return this.currentMode === '' && this.isBusy && this.detectionEventType === '1';
      }
      if (id === '선택객체탐지') {
        return this.currentMode === 'select';
      }
      if (id === '수동 마스킹') {
        return this.currentMode === 'mask';
      }
      return false;
    },
    focusNext() {
      const nextIndex = (this.focusedIndex + 1) % this.menuItems.length;
      this.focusedIndex = nextIndex;
      this.$nextTick(() => {
        const items = document.querySelectorAll('[role="menuitem"]');
        items[nextIndex]?.focus();
      });
    },
    focusPrev() {
      const prevIndex = (this.focusedIndex - 1 + this.menuItems.length) % this.menuItems.length;
      this.focusedIndex = prevIndex;
      this.$nextTick(() => {
        const items = document.querySelectorAll('[role="menuitem"]');
        items[prevIndex]?.focus();
      });
    },
    handleGlobalShortcuts(event) {
      if (!event.ctrlKey && !event.metaKey) return;

      const itemMap = {
        'KeyO': '자동객체탐지',
        'Shift+KeyA': '자동객체탐지',
        'Shift+KeyS': '선택객체탐지',
        'KeyM': '수동 마스킹',
        'Alt+KeyM': '전체마스킹',
        'KeyP': '미리보기',
        'KeyE': '내보내기',
        'KeyB': '일괄처리',
        'Comma': '설정',
      };

      const key = event.shiftKey ? `Shift+${event.code}` :
                  event.altKey ? `Alt+${event.code}` : event.code;

      const menuId = itemMap[key];
      if (menuId && !this.isItemDisabled(menuId)) {
        event.preventDefault();
        this.onMenuClick(menuId);
      }
    }
  },
};
</script>
