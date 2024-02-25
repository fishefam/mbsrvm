import { createWriteStream } from 'fs'
import { fs } from 'mz'
import parseJSON from 'parse-json'
import path from 'path'
import defaultFromEvent from 'promise-toolbox/fromEvent'
import stripBom from 'strip-bom'
import zipDir from 'zip-dir'

import { isErrorWithCode, UsageError } from '../errors.js'
import { prepareArtifactsDir } from '../util/artifacts.js'
import { createFileFilter as defaultFileFilterCreator } from '../util/file-filter.js'
import { createLogger } from '../util/logger.js'
import getValidatedManifest, { getManifestId } from '../util/manifest.js'
import defaultSourceWatcher from '../watcher.js'
const log = createLogger(import.meta.url)
const DEFAULT_FILENAME_TEMPLATE = '{name}-{version}.zip'
export function safeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '_')
}

// defaultPackageCreator types and implementation.

// This defines the _locales/messages.json type. See:
// https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Internationalization#Providing_localized_strings_in__locales

export async function getDefaultLocalizedName({ manifestData, messageFile }) {
  let messageData
  let messageContents
  let extensionName = manifestData.name
  try {
    messageContents = await fs.readFile(messageFile, {
      encoding: 'utf-8',
    })
  } catch (error) {
    throw new UsageError(`Error reading messages.json file at ${messageFile}: ${error}`)
  }
  messageContents = stripBom(messageContents)
  const { default: stripJsonComments } = await import('strip-json-comments')
  try {
    messageData = parseJSON(stripJsonComments(messageContents))
  } catch (error) {
    throw new UsageError(`Error parsing messages.json file at ${messageFile}: ${error}`)
  }
  extensionName = manifestData.name.replace(/__MSG_([A-Za-z0-9@_]+?)__/g, (match, messageName) => {
    if (!(messageData[messageName] && messageData[messageName].message)) {
      const error = new UsageError(`The locale file ${messageFile} ` + `is missing key: ${messageName}`)
      throw error
    } else {
      return messageData[messageName].message
    }
  })
  return Promise.resolve(extensionName)
}

// https://stackoverflow.com/a/22129960
export function getStringPropertyValue(prop, obj) {
  const properties = prop.split('.')
  const value = properties.reduce((prev, curr) => prev && prev[curr], obj)
  if (!['number', 'string'].includes(typeof value)) {
    throw new UsageError(`Manifest key "${prop}" is missing or has an invalid type: ${value}`)
  }
  const stringValue = `${value}`
  if (!stringValue.length) {
    throw new UsageError(`Manifest key "${prop}" value is an empty string`)
  }
  return stringValue
}
function getPackageNameFromTemplate(filenameTemplate, manifestData) {
  const packageName = filenameTemplate.replace(/{([A-Za-z0-9._]+?)}/g, (match, manifestProperty) => {
    return safeFileName(getStringPropertyValue(manifestProperty, manifestData))
  })

  // Validate the resulting packageName string, after interpolating the manifest property
  // specified in the template string.
  const parsed = path.parse(packageName)
  if (parsed.dir) {
    throw new UsageError(
      `Invalid filename template "${filenameTemplate}". ` + `Filename "${packageName}" should not contain a path`,
    )
  }
  if (!['.xpi', '.zip'].includes(parsed.ext)) {
    throw new UsageError(
      `Invalid filename template "${filenameTemplate}". ` +
        `Filename "${packageName}" should have a zip or xpi extension`,
    )
  }
  return packageName
}
export async function defaultPackageCreator(
  {
    artifactsDir,
    fileFilter,
    filename = DEFAULT_FILENAME_TEMPLATE,
    manifestData,
    overwriteDest,
    showReadyMessage,
    sourceDir,
  },
  { fromEvent = defaultFromEvent } = {},
) {
  let id
  if (manifestData) {
    id = getManifestId(manifestData)
    log.debug(`Using manifest id=${id || '[not specified]'}`)
  } else {
    manifestData = await getValidatedManifest(sourceDir)
  }
  const buffer = await zipDir(sourceDir, {
    filter: (...args) => fileFilter.wantFile(...args),
  })
  let filenameTemplate = filename
  let { default_locale } = manifestData
  if (default_locale) {
    default_locale = default_locale.replace(/-/g, '_')
    const messageFile = path.join(sourceDir, '_locales', default_locale, 'messages.json')
    log.debug('Manifest declared default_locale, localizing extension name')
    const extensionName = await getDefaultLocalizedName({
      manifestData,
      messageFile,
    })
    // allow for a localized `{name}`, without mutating `manifestData`
    filenameTemplate = filenameTemplate.replace(/{name}/g, extensionName)
  }
  const packageName = safeFileName(getPackageNameFromTemplate(filenameTemplate, manifestData))
  const extensionPath = path.join(artifactsDir, packageName)

  // Added 'wx' flags to avoid overwriting of existing package.
  const stream = createWriteStream(extensionPath, {
    flags: 'wx',
  })
  stream.write(buffer, () => {
    stream.end()
  })
  try {
    await fromEvent(stream, 'close')
  } catch (error) {
    if (!isErrorWithCode('EEXIST', error)) {
      throw error
    }
    if (!overwriteDest) {
      throw new UsageError(
        `Extension exists at the destination path: ${extensionPath}\n` + 'Use --overwrite-dest to enable overwriting.',
      )
    }
    log.info(`Destination exists, overwriting: ${extensionPath}`)
    const overwriteStream = createWriteStream(extensionPath)
    overwriteStream.write(buffer, () => {
      overwriteStream.end()
    })
    await fromEvent(overwriteStream, 'close')
  }
  if (showReadyMessage) {
    log.info(`Your web extension is ready: ${extensionPath}`)
  }
  return {
    extensionPath,
  }
}

// Build command types and implementation.

export default async function build(
  {
    artifactsDir,
    asNeeded = false,
    filename = DEFAULT_FILENAME_TEMPLATE,
    ignoreFiles = [],
    overwriteDest = false,
    sourceDir,
  },
  {
    createFileFilter = defaultFileFilterCreator,
    fileFilter = createFileFilter({
      artifactsDir,
      ignoreFiles,
      sourceDir,
    }),
    manifestData,
    onSourceChange = defaultSourceWatcher,
    packageCreator = defaultPackageCreator,
    showReadyMessage = true,
  } = {},
) {
  const rebuildAsNeeded = asNeeded // alias for `build --as-needed`
  log.info(`Building web extension from ${sourceDir}`)
  const createPackage = () =>
    packageCreator({
      artifactsDir,
      fileFilter,
      filename,
      manifestData,
      overwriteDest,
      showReadyMessage,
      sourceDir,
    })
  await prepareArtifactsDir(artifactsDir)
  const result = await createPackage()
  if (rebuildAsNeeded) {
    log.info('Rebuilding when files change...')
    onSourceChange({
      artifactsDir,
      onChange: () => {
        return createPackage().catch((error) => {
          log.error(error.stack)
          throw error
        })
      },
      shouldWatchFile: (...args) => fileFilter.wantFile(...args),
      sourceDir,
    })
  }
  return result
}
