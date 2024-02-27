import micromatch from 'micromatch'

import { generateTempTSConfig } from './script/lint-staged.js'

/** @type {import('lint-staged').ConfigFn} */
export default function config(files) {
  const tsFiles = micromatch(files, ['**/*.ts', '**/*.tsx'])
  generateTempTSConfig(files)
  return [
    ...(tsFiles.length ? ['tsc --project tsconfig.temp.json'] : []),
    `prettier ${files.join(' ')} --write`,
    `eslint ${files.join(' ')} --fix`,
  ].map((command) => `node_modules/.bin/${command}`)
}
