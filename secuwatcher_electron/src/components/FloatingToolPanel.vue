<template>
  <!-- 플로팅 도구 패널 — 마스킹 모드일 때만 표시 -->
  <div v-if="isVisible" class="floating-tool-panel">
    <div class="ftp-title">✦ {{ $t('masking.manualMasking') }}</div>

    <!-- 마스킹 형태 섹션 -->
    <div class="ftp-section">
      <div class="ftp-label">{{ $t('masking.maskingShape') }}</div>
      <div class="ftp-option" :class="{ 'ftp-option--active': maskMode === 'polygon' }" @click="selectMode('polygon')">
        <div class="ftp-radio"></div>
        <span>{{ $t('masking.polygon') }}</span>
      </div>
      <div class="ftp-option" :class="{ 'ftp-option--active': maskMode === 'rectangle' }" @click="selectMode('rectangle')">
        <div class="ftp-radio"></div>
        <span>{{ $t('masking.rectangle') }}</span>
      </div>
    </div>

    <div class="ftp-sep"></div>

    <!-- 적용 범위 섹션 -->
    <div class="ftp-section">
      <div class="ftp-label">{{ $t('masking.applyRange') }}</div>
      <div class="ftp-option" :class="{ 'ftp-option--active': maskRange === 'all' }" @click="selectRange('all')">
        <div class="ftp-radio"></div>
        <span>{{ $t('masking.allFromCurrentToEnd') }}</span>
      </div>
      <div class="ftp-option" :class="{ 'ftp-option--active': maskRange === 'to-here' }" @click="selectRange('to-here')">
        <div class="ftp-radio"></div>
        <span>{{ $t('masking.fromStartToHere') }}</span>
      </div>
      <div class="ftp-option" :class="{ 'ftp-option--active': maskRange === 'from-here' }" @click="selectRange('from-here')">
        <div class="ftp-radio"></div>
        <span>{{ $t('masking.fromHereToEnd') }}</span>
      </div>
      <div class="ftp-option" :class="{ 'ftp-option--active': maskRange === 'here-only' }" @click="selectRange('here-only')">
        <div class="ftp-radio"></div>
        <span>{{ $t('masking.currentFrameOnly') }}</span>
      </div>
    </div>

    <div class="ftp-sep"></div>

    <!-- 액션 버튼 -->
    <button class="ftp-btn ftp-btn--primary" @click="handleComplete">
      ✓ {{ $t('masking.complete') }}
    </button>
    <button class="ftp-btn ftp-btn--cancel" @click="handleCancel">
      {{ $t('masking.cancel') }}
    </button>
  </div>
</template>

<script>
import { mapState, mapWritableState } from 'pinia';
import { useModeStore } from '../stores/modeStore';

export default {
  name: 'FloatingToolPanel',
  emits: ['complete', 'cancel'],
  data() {
    return {
      maskRange: 'all', // 'all' | 'to-here' | 'from-here' | 'here-only'
    };
  },
  computed: {
    ...mapState(useModeStore, ['currentMode']),
    ...mapWritableState(useModeStore, ['maskMode']),
    isVisible() {
      return this.currentMode === 'mask';
    },
  },
  methods: {
    selectMode(mode) {
      this.maskMode = mode;
    },
    selectRange(range) {
      this.maskRange = range;
    },
    handleComplete() {
      // 마스킹 모드 값: 0 = polygon, 1 = rectangle
      const modeValue = this.maskMode === 'polygon' ? 0 : 1;

      // 범위 값: 0 = all, 1 = to-here, 2 = from-here, 3 = here-only
      const rangeValue = {
        'all': 0,
        'to-here': 1,
        'from-here': 2,
        'here-only': 3
      }[this.maskRange] || 0;

      this.$emit('complete', {
        mode: modeValue,
        range: rangeValue,
        modeLabel: this.maskMode,
        rangeLabel: this.maskRange
      });
    },
    handleCancel() {
      this.$emit('cancel');
    },
  },
};
</script>

<style scoped>
/* 플로팅 도구 패널 — 비디오 영역 좌상단 플로팅 */
.floating-tool-panel {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(18, 21, 25, 0.92);
  border: 1px solid #40404D;
  border-radius: 8px;
  padding: 10px 12px;
  backdrop-filter: blur(12px);
  z-index: var(--z-floating-tool-panel);
  width: 160px;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.ftp-title {
  font-size: 10px;
  font-weight: 700;
  color: #3A82C4;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ftp-section {
  margin-bottom: 8px;
}

.ftp-label {
  font-size: 8px;
  color: #A0A0A0;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ftp-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 10px;
  color: #aaa;
  cursor: pointer;
  transition: all 0.1s;
  margin-bottom: 2px;
  user-select: none;
}

.ftp-option:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #E8E8E8;
}

.ftp-option--active {
  background: rgba(58, 130, 196, 0.12);
  color: #3A82C4;
  font-weight: 600;
  border: 1px solid rgba(58, 130, 196, 0.3);
}

.ftp-radio {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid #555;
  flex-shrink: 0;
}

.ftp-option--active .ftp-radio {
  border-color: #3A82C4;
  background: radial-gradient(circle, #3A82C4 40%, transparent 45%);
}

.ftp-sep {
  height: 1px;
  background: #40404D;
  margin: 6px 0;
}

.ftp-btn {
  width: 100%;
  height: 26px;
  border-radius: 5px;
  background: rgba(58, 130, 196, 0.15);
  border: 1px solid rgba(58, 130, 196, 0.3);
  color: #3A82C4;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  margin-bottom: 4px;
  transition: all 0.15s;
}

.ftp-btn:hover {
  background: rgba(58, 130, 196, 0.25);
}

.ftp-btn--cancel {
  background: transparent;
  border-color: #40404D;
  color: #A0A0A0;
  margin-bottom: 0;
}

.ftp-btn--cancel:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #E8E8E8;
}
</style>
