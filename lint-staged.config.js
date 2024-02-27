import { generateTempTSConfig } from './script/lint-staged.js'

/** @type {import('lint-staged').ConfigFn} */
export default function config(files) {
  generateTempTSConfig(files)
  return [
    'tsc --project tsconfig.temp.json',
    `prettier ${files.join(' ')} --write`,
    `eslint ${files.join(' ')} --fix`,
  ].map((command) => `node_modules/.bin/${command}`)
}
