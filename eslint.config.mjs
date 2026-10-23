import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // 뷰 코드는 브라우저 전역(window/document)을 사용한다.
    files: ['ui/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  { ignores: ['dist', 'public', 'node_modules', '*.config.ts', '*.config.mjs'] },
);
