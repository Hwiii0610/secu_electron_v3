module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // Vue 관련
    'vue/multi-word-component-names': 'off',     // 단일 단어 컴포넌트명 허용
    'vue/no-v-html': 'off',                      // v-html 허용
    'vue/require-default-prop': 'off',            // prop 기본값 필수 아님
    'vue/max-attributes-per-line': 'off',         // 속성 줄바꿈 자유
    'vue/singleline-html-element-content-newline': 'off',
    'vue/html-self-closing': 'off',

    // JS 관련
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',                          // console 허용 (데스크톱 앱)
    'no-debugger': 'warn',
    'prefer-const': 'warn',
    'no-var': 'error',

    // 코드 스타일
    'semi': ['warn', 'always'],
    'quotes': ['warn', 'single', { avoidEscape: true }],
    'comma-dangle': ['warn', 'only-multiline'],
    'indent': 'off',                              // Prettier에 위임
  },
  globals: {
    // Electron preload API
    electronAPI: 'readonly',
  },
  ignorePatterns: [
    'node_modules/',
    '.vite/',
    'out/',
    'dist/',
    '*.config.mjs',
  ],
};
