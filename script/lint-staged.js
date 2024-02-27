import { cpSync, readFileSync, writeFileSync } from 'fs'
import micromatch from 'micromatch'

import { TEMP_TSCONFIG_FILE } from './_constant.js'
import { resolvePaths } from './_util.js'

/**
 *
 * @param {string[]} files
 */
export function generateTempTSConfig(files) {
  const tsFiles = micromatch(files, ['**/*.ts', '**/*.tsx'])
  const path = resolvePaths('.husky', TEMP_TSCONFIG_FILE)
  cpSync('tsconfig.json', path)
  const content = readFileSync(path, { encoding: 'utf-8' })
  const newContent = content.replace(
    /\}(?![\s\S]*\})/,
    `,"files": [${tsFiles.map((file) => `"${file}"`).join(',\n')}]\n}`,
  )
  writeFileSync(path, newContent)
}
