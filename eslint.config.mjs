import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * `npm run lint` previously failed outright: the project is on ESLint 9, which
 * only reads flat config, and no eslint.config.* existed. eslint-config-next 16
 * ships flat config directly, so it is composed here.
 */
const config = [
  {
    ignores: [
      '.next/**', 'node_modules/**', 'backups/**', 'exports/**', 'data/**',
      'seed-data/**', 'supabase/**', 'next-env.d.ts', 'scripts/**', '.vercel/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
]

export default config
