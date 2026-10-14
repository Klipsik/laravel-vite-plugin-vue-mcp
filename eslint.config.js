// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    // the root package.json is the published package, it can't use the
    // pnpm-workspace `catalog:` protocol (npm installs from GitHub ignore it)
    pnpm: false,
  },
  {
    files: ['pnpm-workspace.yaml'],
    rules: {
      'pnpm/yaml-no-unused-catalog-item': 'off',
    },
  },
)
