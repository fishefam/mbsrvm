import { cpSync, readFileSync, writeFileSync } from 'fs'
import micromatch from 'micromatch'

import { TEMP_TSCONFIG_FILE } from './_constant'
import { resolvePaths } from './_util'

/**
 *
 * @param {string[]} files
 */
export function generateTempTSConfig(files) {
  const tsFiles = micromatch(files, ['**/*.ts', '**/*.tsx'])
  cpSync('tsconfig.json', TEMP_TSCONFIG_FILE)
  const content = readFileSync(resolvePaths(TEMP_TSCONFIG_FILE), { encoding: 'utf-8' })
  const newContent = content.replace(
    /\}(?![\s\S]*\})/,
    `,"  files": [${tsFiles.map((file) => `"${file}"`).join(',\n')}]\n}`,
  )
  writeFileSync(resolvePaths(TEMP_TSCONFIG_FILE), newContent)
}
