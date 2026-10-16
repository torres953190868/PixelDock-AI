import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: '../entrypoints',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    envPrefix: ['VITE_', 'WXT_', 'DEEPSEEK_', 'WORD_'],
  }),
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
  webExt: {
    disabled: true,
  },
  manifest: {
    name: 'PixelDock AI',
    description: 'A pixel-style floating AI dock for translation, vocabulary, and social writing.',
    permissions: ['storage', 'contextMenus', 'activeTab', 'scripting', 'alarms', 'notifications'],
    host_permissions: ['https://api.deepseek.com/*', 'https://open.bigmodel.cn/*'],
    icons: {
      128: '/icons/128.png',
    },
    action: {
      default_title: 'PixelDock AI',
    },
  },
});
