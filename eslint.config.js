import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'probe-artifacts/**', 'references/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    files: ['src/content/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/credential-store', '**/credential-store.*'],
              message: 'Content Script 不得导入 credential-store（D-028）。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/options/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/credential-store'],
              importNames: ['readCredential', 'getCredentialMask', 'injectProviderAuthorization'],
              message: 'Options 只允许 write/delete 凭据（D-028）。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/background/**/*.{ts,tsx}'],
    ignores: ['src/background/credential-store.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/credential-store'],
              importNames: ['writeCredential', 'deleteCredential'],
              message: 'Background 只允许 read/inject 凭据（D-028）。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'vite.config.ts', 'manifest.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
);
