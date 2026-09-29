// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'apps/api/src/generated/**',
      '_bmad/**',
      '_bmad-output/**',
      '.agents/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Chỉ module `media` được nói chuyện với S3 (AD-1, AD-6); module khác gọi service public của `media`.
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/modules/media/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@aws-sdk/*', 'aws-sdk', 'aws-sdk/*'],
              message: 'Chỉ module media (apps/api/src/modules/media) được import S3 SDK.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs}', 'apps/admin/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // Web và admin là client mỏng: không được chạm DB, S3 hay mã nguồn của API (AD modular monolith).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@prisma/*',
                'prisma',
                'prisma/*',
                'pg',
                'pg/*',
                'pg-*',
                'postgres',
                'postgres/*',
                '@aws-sdk/*',
                'aws-sdk',
                'aws-sdk/*',
                '@piano-daily/api',
                '@piano-daily/api/*',
                '**/apps/api/**',
                '**/api/src/**',
                '**/api/dist/**',
              ],
              message: 'Web/admin là client mỏng: chỉ gọi API qua HTTP.',
            },
          ],
        },
      ],
    },
  },
);
