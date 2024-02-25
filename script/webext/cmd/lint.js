import { createInstance as defaultLinterCreator } from 'addons-linter'

import { createFileFilter as defaultFileFilterCreator } from '../util/file-filter.js'
import { createLogger } from '../util/logger.js'
const log = createLogger(import.meta.url)

// Lint command types and implementation.

export default function lint(
  {
    artifactsDir,
    boring,
    firefoxPreview = [],
    ignoreFiles,
    metadata,
    output,
    pretty,
    privileged,
    selfHosted,
    sourceDir,
    verbose,
    warningsAsErrors,
  },
  { createFileFilter = defaultFileFilterCreator, createLinter = defaultLinterCreator, shouldExitProgram = true } = {},
) {
  const fileFilter = createFileFilter({
    artifactsDir,
    ignoreFiles,
    sourceDir,
  })
  const config = {
    // the directory to the extension.
    _: [sourceDir],
    boring,
    logLevel: verbose ? 'debug' : 'fatal',
    maxManifestVersion: 3,
    metadata,
    minManifestVersion: 2,
    output,
    pretty,
    privileged,
    selfHosted,
    shouldScanFile: (fileName) => fileFilter.wantFile(fileName),
    stack: Boolean(verbose),
    // This mimics the first command line argument from yargs, which should be
    warningsAsErrors,
  }
  if (firefoxPreview.includes('mv3')) {
    log.warn(
      [
        'Manifest Version 3 is now officially supported and',
        '"--firefox-preview=mv3" is no longer needed.',
        'In addition, the "mv3" value will be removed in the future.',
      ].join(' '),
    )
  }
  log.debug(`Running addons-linter on ${sourceDir}`)
  const linter = createLinter({
    config,
    runAsBinary: shouldExitProgram,
  })
  return linter.run()
}
