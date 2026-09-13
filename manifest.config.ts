import { defineManifest } from '@crxjs/vite-plugin';

const icons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

export default defineManifest({
  manifest_version: 3,
  name: 'GitHelper-CN',
  description: '面向中文 GitHub 新手的本地 Side Panel AI 助手。',
  version: '0.1.3',
  minimum_chrome_version: '114',
  icons,
  action: {
    default_title: '打开 GitHelper-CN',
    default_icon: icons,
  },
  commands: {
    'open-side-panel': {
      suggested_key: {
        default: 'Alt+Shift+G',
      },
      description: '打开 GitHelper-CN Side Panel',
    },
  },
  permissions: ['sidePanel', 'storage', 'activeTab'],
  host_permissions: [
    'https://github.com/*',
    'https://api.github.com/*',
    'https://api.deepseek.com/*',
    'https://uuapi.net/*',
    'https://openrouter.ai/*',
  ],
  optional_host_permissions: [
    'https://api.openai.com/*',
    'https://api.anthropic.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://dashscope.aliyuncs.com/*',
    'https://api.siliconflow.cn/*',
    'https://open.bigmodel.cn/*',
    'https://api.moonshot.cn/*',
    'https://api.x.ai/*',
    'https://*/*',
  ],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/panel/index.html',
  },
  options_page: 'src/options/index.html',
  content_scripts: [
    {
      matches: ['https://github.com/*'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
});
