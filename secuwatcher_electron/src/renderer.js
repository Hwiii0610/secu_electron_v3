import { createApp } from 'vue';
import { createPinia } from 'pinia';
import i18n from './i18n/index.js';
import App from './App.vue';

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
// [UIUX-01] 글로벌 에러 핸들러
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, info);
  const event = new CustomEvent('vue-error', { detail: { message: err.message } });
  window.dispatchEvent(event);
};
app.mount('#app');

document.addEventListener('DOMContentLoaded', () => {
  const minimizeBtn = document.getElementById('minimize-btn');
  const maximizeBtn = document.getElementById('maximize-btn');
  const closeBtn = document.getElementById('close-btn');

  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      window.electronAPI.minimizeWindow();
    });
  }

  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', async () => {
      window.electronAPI.maximizeWindow();
      
      // 최대화 상태에 따라 아이콘 변경
      const isMaximized = await window.electronAPI.isWindowMaximized();
      document.body.classList.toggle('maximized', isMaximized);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.electronAPI.closeWindow();
    });
  }
});