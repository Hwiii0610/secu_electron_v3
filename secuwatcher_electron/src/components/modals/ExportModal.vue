<template>
  <div v-if="exporting" class="setting-modal">
    <template v-if="exportProgress > 0">
      <div class="auto-detect-content">
        <div class="auto-detect-text">{{ exportMessage }}</div>
        <div class="auto-progress-bar-container">
          <div ref="progressBar2" class="auto-progress-bar" :style="{ width: exportProgress + '%' }"></div>
          <div ref="progressLabel2" class="auto-progress-label">{{ exportProgress }}%</div>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="setting-modal-content">
        <div class="setting-modal-header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3>{{ $t('export.exportTitle') }}</h3>
          <button class="close-button" :aria-label="$t('common.close')" @click="exporting = false">&times;</button>
        </div>

        <div class="setting-modal-body">
          <div class="setting-row">
            <div class="setting-row-content">
              <label><input type="radio" v-model="exportFileNormal" @change="exportFilePassword = ''" :value="true"/> {{ $t('export.normalFileSave') }}</label>
              <label><input type="radio" v-model="exportFileNormal" :value="false"/> {{ $t('export.encryptedFileSave') }}</label>
            </div>
          </div>

          <div
            class="file-path-row"
            style="display: flex; align-items: center; gap: 10px; margin: 18px 0 22px 0;
              background: #181c22; border-radius: 7px; padding: 8px 14px 8px 10px; box-shadow: 0 1px 6px #20222244;">
            <span style="font-size: 22px; color: #58a3ff;">📁</span>
            <input type="text" :value="selectedExportDir" readonly
              :placeholder="$t('export.exportDirSelection')"
              style="flex: 1; background: transparent; color: #fff; border: none;
                font-size: 15px; outline: none; letter-spacing: 0.5px;"
              :aria-label="$t('export.exportDirSelection')" />
            <button
              style="background: #3383e2; color: #fff; border: none; border-radius: 5px;
                padding: 7px 18px; font-weight: bold; font-size: 15px; cursor: pointer;
                box-shadow: 0 1px 2px #22334430; transition: background 0.15s;"
              :aria-label="$t('export.browseButton')"
              @click="$emit('find-dir')">{{ $t('export.browseButton') }}</button>
          </div>

          <div>
            <div class="setting-row">
              <h4>{{ $t('export.drm') }}</h4>
              <div class="setting-row-content">
                <span>{{ $t('export.playCount') }}</span>
                <input type="text" placeholder="0" v-model="drmInfo.drmPlayCount" :aria-label="$t('export.playCount')">
                <span>{{ $t('export.playPeriod') }}</span>
                <VueDatePicker v-model="drmInfo.drmExportPeriod" locale="ko" hide-input-icon :teleport="true" :enable-time-picker="false" style="width: 35%; padding: 0;" :aria-label="$t('export.playPeriod')"/>
              </div>
            </div>

            <div class="setting-row" v-if="!exportFileNormal">
              <h4>{{ $t('export.saveSection') }}</h4>
              <div class="setting-row-content">
                <span>{{ $t('export.playPassword') }}</span>
                <input class="password-input" v-model="exportFilePassword" :type="showPassword ? 'text' : 'password'" maxlength="32" :aria-label="$t('export.playPassword')">
                <img role="button" tabindex="0" style="cursor: pointer" v-if="!showPassword" src="../../../src/assets/eye-off.png" alt="" @click="showPassword = !showPassword" @keydown.enter="showPassword = !showPassword" :aria-label="$t('common.close')">
                <img role="button" tabindex="0" style="cursor: pointer" v-else src="../../../src/assets/eye.png" alt="" @click="showPassword = !showPassword" @keydown.enter="showPassword = !showPassword" :aria-label="$t('common.close')">
                <span v-if="exportFilePassword"
                  :class="{
                    'password-length-valid': [16, 24, 32].includes(exportFilePassword.length),
                    'password-length-invalid': ![16, 24, 32].includes(exportFilePassword.length)
                  }">
                  {{ $t('export.passwordStrength', { length: exportFilePassword.length }) }}
                </span>
              </div>
              <div v-if="exportFilePassword" class="password-strength">
                <div class="password-strength__bar" :style="{ width: passwordStrengthPercent + '%' }" :class="passwordStrengthClass"></div>
                <span class="password-strength__text">{{ passwordStrengthLabel }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="setting-modal-footer">
          <button class="action-button" :aria-label="$t('export.exportButton')" @click="$emit('send-export')">{{ $t('export.exportButton') }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import VueDatePicker from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import { mapWritableState } from 'pinia';
import { useExportStore } from '../../stores/exportStore';
import { useConfigStore } from '../../stores/configStore';
import { useFileStore } from '../../stores/fileStore';

export default {
  name: 'ExportModal',
  components: { VueDatePicker },
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
