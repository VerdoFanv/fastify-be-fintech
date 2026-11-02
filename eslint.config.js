import airbnb from 'eslint-config-flat-airbnb'
import eslintConfigPrettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default airbnb(
  {
    typescript: true,
    stylistic: true,
    overrides: {
      // Project style: no semicolons
      '@stylistic/semi': ['error', 'never'],
      // Backend / Fastify practical overrides
      'no-console': 'off',
      'import/prefer-default-export': 'off',
      'import/extensions': 'off',
      'import/no-unresolved': 'off',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'src/generated/**',
      'prisma.config.ts',
      'prisma/seed.ts',
      'tests/**',
      'vitest.config.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  eslintConfigPrettier,
  {
    rules: {
      // Keep after prettier so the no-semi rule stays enforced by ESLint
      '@stylistic/semi': ['error', 'never'],
      semi: ['error', 'never'],
    },
  },
)
