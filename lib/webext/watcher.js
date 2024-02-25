import debounce from 'debounce'
import { fs } from 'mz'
import Watchpack from 'watchpack'

import { UsageError } from './errors.js'
import { createLogger } from './util/logger.js'
const log = createLogger(import.meta.url)

// onSourceChange types and implementation

export default function onSourceChange({
  artifactsDir,
  debounceTime = 500,
  onChange,
  shouldWatchFile,
  sourceDir,
  watchFile,
  watchIgnored,
}) {
  // When running on Windows, transform the ignored paths and globs
  // as Watchpack does translate the changed files path internally
  // (See https://github.com/webpack/watchpack/blob/v2.1.1/lib/DirectoryWatcher.js#L99-L103).
  const ignored =
    watchIgnored && process.platform === 'win32' ? watchIgnored.map((it) => it.replace(/\\/g, '/')) : watchIgnored

  // TODO: For network disks, we would need to add {poll: true}.
  const watcher = ignored
    ? new Watchpack({
        ignored,
      })
    : new Watchpack()

  // Allow multiple files to be changed before reloading the extension
  const executeImmediately = false
  onChange = debounce(onChange, debounceTime, executeImmediately)
  watcher.on('change', (filePath) => {
    proxyFileChanges({
      artifactsDir,
      filePath,
      onChange,
      shouldWatchFile,
    })
  })
  log.debug(`Watching ${watchFile ? watchFile.join(',') : sourceDir} for changes`)
  const watchedDirs = []
  const watchedFiles = []
  if (watchFile) {
    for (const filePath of watchFile) {
      if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isFile()) {
        throw new UsageError('Invalid --watch-file value: ' + `"${filePath}" is not a file.`)
      }
      watchedFiles.push(filePath)
    }
  } else {
    watchedDirs.push(sourceDir)
  }
  watcher.watch({
    directories: watchedDirs,
    files: watchedFiles,
    missing: [],
    startTime: Date.now(),
  })

  // TODO: support interrupting the watcher on Windows.
  // https://github.com/mozilla/web-ext/issues/225
  process.on('SIGINT', () => watcher.close())
  return watcher
}

// proxyFileChanges types and implementation.

export function proxyFileChanges({ artifactsDir, filePath, onChange, shouldWatchFile }) {
  if (filePath.indexOf(artifactsDir) === 0 || !shouldWatchFile(filePath)) {
    log.debug(`Ignoring change to: ${filePath}`)
  } else {
    log.debug(`Changed: ${filePath}`)
    log.debug(`Last change detection: ${new Date().toTimeString()}`)
    onChange()
  }
}
