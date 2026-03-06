<template>
  <div v-if="exporting" class="setting-modal">
    <template v-if="exportProgress > 0">
      <div class="auto-detect-content">
        <div class="auto-detect-text">{{ exportMessage }}</div>
        <div class="auto-progress-bar-container">
          <div ref="progressBar2" class="auto-progress-bar" :style="{ width: exportProgress + '%' }"></div>
        </div>
        <div class="auto-detect-info-row">
          <span class="auto-detect-frame-text">{{ exportMessage }}</span>
          <span class="auto-detect-percent">{{ exportProgress }}%</span>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="setting-modal-content export-modal-redesign">
        <div class="export-modal-header">
          <h3>↗ {{ $t('export.exportSettingsTitle') }}</h3>
        </div>

        <div class="export-modal-body">
          <!-- 파일 유형 -->
          <div class="export-section">
            <div class="export-section-label">{{ $t('export.fileType') }}</div>
            <div class="export-type-toggle">
              <button
                class="export-type-btn"
                :class="{ 'export-type-btn--active': exportFileNormal }"
                @click="exportFileNormal = true; exportFilePassword = ''"
              >
                📁 {{ $t('export.normalSave') }}
              </button>
              <button
                class="export-type-btn"
                :class="{ 'export-type-btn--active': !exportFileNormal }"
                @click="exportFileNormal = false"
              >
                🔒 {{ $t('export.encryptedSave') }}
              </button>
            </div>
          </div>

          <!-- 저장 경로 -->
          <div class="export-section">
            <div class="export-section-label">{{ $t('export.savePath') }}</div>
            <div class="export-path-container">
              <span class="export-path-icon">📁</span>
              <input type="text" class="export-path-input" :value="selectedExportDir" readonly
                :placeholder="$t('export.exportDirSelection')"
                :aria-label="$t('export.exportDirSelection')" />
              <button class="export-browse-button"
                :aria-label="$t('export.changeButton')"
                @click="$emit('find-dir')">{{ $t('export.changeButton') }}</button>
            </div>
          </div>

          <!-- 비밀번호 (암호화 시) -->
          <div v-if="!exportFileNormal" class="export-section">
            <div class="export-section-label">{{ $t('export.passwordLabel') }}</div>
            <div class="export-password-field">
              <input
                class="export-password-input"
                v-model="exportFilePassword"
                :type="showPassword ? 'text' : 'password'"
                maxlength="32"
                :aria-label="$t('export.passwordLabel')"
              />
              <button class="export-password-toggle" @click="showPassword = !showPassword" type="button">
                {{ showPassword ? '🙈' : '👁' }}
              </button>
            </div>
            <div v-if="exportFilePassword" class="export-password-strength">
              <div class="export-strength-bar">
                <div class="export-strength-fill" :style="{ width: passwordStrengthPercent + '%' }" :class="passwordStrengthClass"></div>
              </div>
              <span class="export-strength-text" :class="passwordStrengthClass">{{ passwordStrengthLabel }} ({{ exportFilePassword.length }}자)</span>
            </div>
          </div>

          <!-- DRM 설정 (선택) -->
          <div class="export-section">
            <div class="export-section-label">{{ $t('export.drmSettings') }}</div>
            <div class="export-drm-row">
              <div class="export-drm-pill">
                <span class="export-drm-pill-label">{{ $t('export.playCount') }}:</span>
                <span class="export-drm-pill-value">{{ drmInfo.drmPlayCount || $t('export.playCountValue') }}</span>
              </div>
              <div class="export-drm-pill">
                <span class="export-drm-pill-label">{{ $t('export.playPeriod') }}:</span>
                <span class="export-drm-pill-value">{{ drmInfo.drmExportPeriod || $t('export.playPeriodValue') }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="export-modal-footer">
          <button class="export-footer-btn export-footer-btn--cancel" @click="exporting = false">
            {{ $t('common.cancel') }}
          </button>
          <button class="export-footer-btn export-footer-btn--primary" @click="$emit('send-export')">
            ↗ {{ $t('export.startExport') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useExportStore } from '../../stores/exportStore';
import { useConfigStore } from '../../stores/configStore';
import { useFileStore } from '../../stores/fileStore';

export default {
  name: 'ExportModal',
  emits: ['send-export', 'find-dir'],
  computed: {
    ...mapWritableState(useExportStore, [
      'exporting', 'exportProgress', 'exportMessage',
      'exportFileNormal', 'exportFilePassword', 'showPassword'
    ]),
    ...mapWritableState(useConfigStore, ['drmInfo']),
    ...mapWritableState(useFileStore, ['selectedExportDir']),
    passwordStrengthPercent() {
      const pw = this.exportFilePassword || '';
      if (pw.length === 0) return 0;
      let score = 0;
      if (pw.length >= 8) score += 25;
      if (pw.length >= 12) score += 15;
      if (/[A-Z]/.test(pw)) score += 15;
      if (/[a-z]/.test(pw)) score += 15;
      if (/[0-9]/.test(pw)) score += 15;
      if (/[^A-Za-z0-9]/.test(pw)) score += 15;
      return Math.min(score, 100);
    },
    passwordStrengthClass() {
      const p = this.passwordStrengthPercent;
      if (p < 30) return 'strength--weak';
      if (p < 60) return 'strength--fair';
      if (p < 80) return 'strength--good';
      return 'strength--strong';
    },
    passwordStrengthLabel() {
      const p = this.passwordStrengthPercent;
      if (p < 30) return this.$t('export.weak');
      if (p < 60) return this.$t('export.fair');
      if (p < 80) return this.$t('export.good');
      return this.$t('export.veryStrong');
    }
  },
};
</script>
