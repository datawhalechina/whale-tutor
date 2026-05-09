import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import vuePlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettierConfig from 'eslint-config-prettier';

// Node 运行时全局 — 给 .mjs/.cjs/.js 脚本和 cli 用(@eslint/js recommended 默认不知道这些)。
const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  globalThis: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  fetch: 'readonly', // Node 18+ 内置
  URL: 'readonly',
  URLSearchParams: 'readonly',
};

// Node 18 之前的 require/module 在新代码用得少,但 server/scripts/verify-knowledge.js 仍是 CJS。
const commonjsGlobals = {
  require: 'readonly',
  module: 'readonly',
  exports: 'readonly',
};

// 浏览器侧 — web/* 和 *.vue 用。挑常用的 DOM/BOM 全局,够覆盖现有代码。
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  queueMicrotask: 'readonly',
  HTMLElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  Element: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  MessageEvent: 'readonly',
  Worker: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      'packages/cli-node/_bundle/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  {
    // Node 脚本(scripts/*.mjs、cli-node 的 bin/lib)默认带 Node globals
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
  {
    // CommonJS Node 脚本 — server/scripts/*.js 用 require()
    files: ['server/scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...nodeGlobals, ...commonjsGlobals },
    },
  },
  {
    // Web Worker — pyodide.worker.js 跑在 worker scope,有 self / importScripts
    files: ['**/workers/**/*.{js,ts}', '**/*.worker.{js,ts}'],
    languageOptions: {
      globals: {
        ...browserGlobals,
        self: 'readonly',
        importScripts: 'readonly',
        postMessage: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: { ...nodeGlobals, ...browserGlobals },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TS 自己的类型检查器已经处理标识符存在性,no-undef 在 .ts 上重复且常误报(类型 vs 值的混用)
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: browserGlobals,
    },
    plugins: {
      vue: vuePlugin,
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...vuePlugin.configs['vue3-recommended'].rules,
      'vue/multi-word-component-names': 'off',
      // 项目里所有 v-html 都走 utils/markdown.ts 的 renderMarkdown(marked + DOMPurify),
      // 内容已 sanitize,XSS 风险已被收口处理。规则保持开会让每个 markdown 渲染点都要写 disable 注释,噪音大。
      'vue/no-v-html': 'off',
    },
  },
  prettierConfig,
];
