import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      '**/.next/**',
      '.research/**',
      '**/next-env.d.ts',
      '**/node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
