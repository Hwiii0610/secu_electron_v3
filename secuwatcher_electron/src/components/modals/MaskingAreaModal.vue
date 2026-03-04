<template>
  <div v-if="isVisible" class="masking-area-modal-overlay" @click="handleBackdropClick">
    <div class="masking-area-modal" role="dialog" aria-labelledby="masking-modal-title">
      <!-- 헤더 -->
      <div class="masking-modal-header">
        <h2 id="masking-modal-title">{{ $t('masking.areaMaskingMethodSelect') }}</h2>
        <button
          type="button"
          class="close-btn"
          :aria-label="$t('common.close')"
          @click="handleCancel"
        >
          ✕
        </button>
      </div>

      <!-- 본문: 마스킹 옵션 -->
      <div class="masking-modal-body">
        <p class="masking-description">
          {{ $t('masking.selectMaskingAreaMethod') }}
        </p>

        <!-- 다각형 모드 -->
        <div class="masking-option" :class="{ selected: selectedMode === 'polygon' }">
          <input
            type="radio"
            id="mode-polygon"
            v-model="selectedMode"
            value="polygon"
            :disabled="isProcessing"
          />
          <label for="mode-polygon" class="option-label">
            <div class="option-icon polygon-icon">⬠</div>
            <div class="option-content">
              <div class="option-title">{{ $t('masking.polygonMasking') }}</div>
              <div class="option-description">
                여러 점을 클릭하여 임의의 모양으로 마스킹합니다.
                정교한 영역 선택에 적합합니다.
              </div>
            </div>
          </label>
        </div>

        <!-- 사각형 모드 -->
        <div class="masking-option" :class="{ selected: selectedMode === 'rectangle' }">
          <input
            type="radio"
            id="mode-rectangle"
            v-model="selectedMode"
            value="rectangle"
            :disabled="isProcessing"
          />
          <label for="mode-rectangle" class="option-label">
            <div class="option-icon rectangle-icon">■</div>
            <div class="option-content">
              <div class="option-title">{{ $t('masking.rectangleMasking') }}</div>
              <div class="option-description">
                두 점으로 사각형 영역을 빠르게 선택합니다.
                직사각형 객체 마스킹에 최적입니다.
              </div>
            </div>
          </label>
        </div>

        <!-- 마스킹 대상 선택 (마스킹 범위) -->
        <div class="masking-divider"></div>

        <p class="masking-description">
          {{ $t('masking.selectMaskingMethod') }}
        </p>

        <!-- 마스킹 범위 옵션 -->
        <div class="masking-option" :class="{ selected: selectedRange === 'all' }">
          <input
            type="radio"
            id="range-all"
            v-model="selectedRange"
            value="all"
            :disabled="isProcessing"
          />
          <label for="range-all" class="option-label">
            <div class="option-icon range-icon all">모두</div>
            <div class="option-content">
              <div class="option-title">{{ $t('masking.allVideo') }}</div>
              <div class="option-description">
                현재 프레임부터 영상 끝까지 마스킹을 적용합니다.
              </div>
            </div>
          </label>
        </div>

        <div class="masking-option" :class="{ selected: selectedRange === 'to-here' }">
          <input
            type="radio"
            id="range-to-here"
            v-model="selectedRange"
            value="to-here"
            :disabled="isProcessing"
          />
          <label for="range-to-here" class="option-label">
            <div class="option-icon range-icon">←</div>
            <div class="option-content">
              <div class="option-title">{{ $t('masking.fromStartToHere') }}</div>
              <div class="option-description">
                영상 시작부터 현재 프레임까지 마스킹을 적용합니다.
              </div>
            </div>
          </label>
        </div>

        <div class="masking-option" :class="{ selected: selectedRange === 'from-here' }">
          <input
            type="radio"
            id="range-from-here"
            v-model="selectedRange"
            value="from-here"
            :disabled="isProcessing"
          />
          <label for="range-from-here" class="option-label">
            <div class="option-icon range-icon">→</div>
            <div class="option-content">
              <div class="option-title">{{ $t('masking.fromHereToEnd') }}</div>
              <div class="option-description">
                현재 프레임부터 영상 끝까지 마스킹을 적용합니다.
              </div>
            </div>
          </label>
        </div>

        <div class="masking-option" :class="{ selected: selectedRange === 'here-only' }">
          <input
            type="radio"
            id="range-here-only"
            v-model="selectedRange"
            value="here-only"
            :disabled="isProcessing"
          />
          <label for="range-here-only" class="option-label">
            <div class="option-icon range-icon">●</div>
            <div class="option-content">
              <div class="option-title">{{ $t('masking.currentFrameOnly') }}</div>
              <div class="option-description">
                현재 프레임에만 마스킹을 적용합니다.
              </div>
            </div>
          </label>
        </div>
      </div>

      <!-- 푸터: 버튼 -->
      <div class="masking-modal-footer">
        <button
          type="button"
          class="btn btn--cancel"
          @click="handleCancel"
          :disabled="isProcessing"
          :aria-label="$t('masking.cancel')"
        >
          {{ $t('masking.cancel') }}
        </button>
        <button
          type="button"
          class="btn btn--primary"
          @click="handleConfirm"
          :disabled="isProcessing"
          aria-label="확인 및 마스킹 시작"
        >
          {{ $t('masking.start') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * 마스킹 영역 선택 모달 컴포넌트
 *
 * 사용자가 마스킹 방식(다각형/사각형)과 범위를 선택할 수 있는 대화상자입니다.
 * 선택 후 동의(확인) 버튼을 누르면 실제 마스킹 모드로 진입합니다.
 */
export default {
  name: 'MaskingAreaModal',
  emits: ['confirm', 'cancel', 'confirm-selection'],
  props: {
    isVisible: {
      type: Boolean,
      default: false
    },
    isProcessing: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      selectedMode: 'rectangle',  // 'polygon' | 'rectangle'
      selectedRange: 'all',        // 'all' | 'to-here' | 'from-here' | 'here-only'
    };
  },
  methods: {
    handleConfirm() {
      // 선택 결과 반환 (0: polygon, 1: rectangle)
      const modeValue = this.selectedMode === 'polygon' ? 0 : 1;

      // 범위 값 (0: 전체, 1: 여기까지, 2: 여기서부터, 3: 여기만, 4: 취소)
      const rangeValue = {
        'all': 0,
        'to-here': 1,
        'from-here': 2,
        'here-only': 3
      }[this.selectedRange] || 0;

      this.$emit('confirm-selection', {
        mode: modeValue,
        range: rangeValue,
        modeLabel: this.selectedMode,
        rangeLabel: this.selectedRange
      });

      this.$emit('confirm');
    },
    handleCancel() {
      this.$emit('cancel');
    },
    handleBackdropClick(event) {
      // 배경 클릭 시 닫기 (Escape 처럼)
      if (event.target === event.currentTarget) {
        this.handleCancel();
      }
    }
  }
};
</script>

<style scoped>
/* [UIUX-38] 마스킹 다이얼로그 UX 개선 */

.masking-area-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal-base);
}

.masking-area-modal {
  background-color: var(--color-bg-panel);
  border: 1px solid var(--color-border-solid);
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  max-width: 500px;
  width: 90%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.masking-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border-solid);
}

.masking-modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--color-text-primary);
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast);
}

.close-btn:hover {
  background-color: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.masking-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
}

.masking-description {
  color: var(--color-text-secondary);
  font-size: 14px;
  margin: 0 0 var(--spacing-md) 0;
  line-height: 1.5;
}

.masking-option {
  display: flex;
  align-items: stretch;
  padding: var(--spacing-md);
  border: 2px solid var(--color-border-solid);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  background-color: var(--color-bg-primary);
}

.masking-option:hover {
  border-color: var(--color-accent);
  background-color: var(--color-bg-secondary);
}

.masking-option.selected {
  border-color: var(--color-accent);
  background-color: rgba(59, 130, 246, 0.1);
}

.masking-option input[type="radio"] {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-right: var(--spacing-md);
  margin-top: 2px;
  cursor: pointer;
  accent-color: var(--color-accent);
}

.masking-option input[type="radio"]:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.option-label {
  display: flex;
  flex: 1;
  cursor: pointer;
  align-items: flex-start;
}

.option-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background-color: var(--color-bg-input);
  margin-right: var(--spacing-md);
  font-size: 18px;
  color: var(--color-accent);
}

.option-icon.polygon-icon {
  color: #3B82F6;
}

.option-icon.rectangle-icon {
  color: #3B82F6;
}

.option-icon.range-icon {
  font-size: 16px;
  font-weight: bold;
  color: var(--color-accent-hover);
}

.option-icon.range-icon.all {
  color: #10B981;
}

.option-content {
  flex: 1;
}

.option-title {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.option-description {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.masking-divider {
  height: 1px;
  background-color: var(--color-border-solid);
  margin: var(--spacing-lg) 0;
}

.masking-modal-footer {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border-top: 1px solid var(--color-border-solid);
  background-color: var(--color-bg-primary);
}

.btn {
  flex: 1;
  padding: var(--spacing-md) var(--spacing-lg);
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn--primary {
  background-color: var(--color-accent-button);
  color: var(--color-text-primary);
}

.btn--primary:hover:not(:disabled) {
  background-color: var(--color-accent-hover);
  transform: translateY(-1px);
}

.btn--primary:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.btn--cancel {
  background-color: var(--color-accent-cancel);
  color: var(--color-text-primary);
}

.btn--cancel:hover:not(:disabled) {
  background-color: var(--color-text-muted);
}

.btn--cancel:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 스크롤바 스타일 */
.masking-modal-body::-webkit-scrollbar {
  width: 8px;
}

.masking-modal-body::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.masking-modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.masking-modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}

/* 모바일 반응형 */
@media (max-width: 600px) {
  .masking-area-modal {
    width: 95%;
    max-height: 90vh;
  }

  .masking-modal-header {
    padding: var(--spacing-md);
  }

  .masking-modal-body {
    padding: var(--spacing-md);
  }

  .masking-modal-footer {
    padding: var(--spacing-md);
  }

  .masking-option {
    padding: var(--spacing-sm);
  }

  .option-icon {
    width: 36px;
    height: 36px;
    font-size: 16px;
  }
}
</style>
