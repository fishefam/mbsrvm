import path from 'path'

import { isErrorWithCode, UsageError, WebExtError } from '../errors.js'
import { prepareArtifactsDir } from '../util/artifacts.js'
import { createLogger } from '../util/logger.js'
import getValidatedManifest, { getManifestId } from '../util/manifest.js'
import { defaultAsyncFsReadFile, signAddon as defaultSubmitAddonSigner } from '../util/submit-addon.js'
import { withTempDir } from '../util/temp-dir.js'
import defaultBuilder from './build.js'
const log = createLogger(import.meta.url)
export const extensionIdFile = '.web-extension-id'
export const uploadUuidFile = '.amo-upload-uuid'

// Sign command types and implementation.

export default function sign(
  {
    amoBaseUrl,
    amoMetadata,
    apiKey,
    apiProxy,
    apiSecret,
    approvalTimeout,
    artifactsDir,
    channel,
    id,
    ignoreFiles = [],
    sourceDir,
    timeout,
    uploadSourceCode,
    webextVersion,
  },
  {
    asyncFsReadFile = defaultAsyncFsReadFile,
    build = defaultBuilder,
    preValidatedManifest,
    submitAddon = defaultSubmitAddonSigner,
  } = {},
) {
  return withTempDir(async function (tmpDir) {
    await prepareArtifactsDir(artifactsDir)
    let manifestData
    const savedIdPath = path.join(sourceDir, extensionIdFile)
    const savedUploadUuidPath = path.join(sourceDir, uploadUuidFile)
    if (preValidatedManifest) {
      manifestData = preValidatedManifest
    } else {
      manifestData = await getValidatedManifest(sourceDir)
    }
    const [buildResult, idFromSourceDir] = await Promise.all([
      build(
        {
          artifactsDir: tmpDir.path(),
          ignoreFiles,
          sourceDir,
        },
        {
          manifestData,
          showReadyMessage: false,
        },
      ),
      getIdFromFile(savedIdPath),
    ])
    const manifestId = getManifestId(manifestData)
    if (id && !manifestId) {
      throw new UsageError(`Cannot set custom ID ${id} - The add-on ID must be specified in the manifest.json file.`)
    }
    if (idFromSourceDir && !manifestId) {
      throw new UsageError(
        'Cannot use previously auto-generated extension ID ' +
          `${idFromSourceDir} - This add-on ID must be specified in the manifest.json file.`,
      )
    }
    if (id && manifestId) {
      throw new UsageError(`Cannot set custom ID ${id} because manifest.json ` + `already defines ID ${manifestId}`)
    }
    if (id) {
      log.info(`Using custom ID declared as --id=${id}`)
    }
    if (manifestId) {
      id = manifestId
    }
    if (!id && idFromSourceDir) {
      log.info(`Using previously auto-generated extension ID: ${idFromSourceDir}`)
      id = idFromSourceDir
    }
    if (!id) {
      log.warn('No extension ID specified (it will be auto-generated)')
    }
    if (!channel) {
      throw new UsageError('You must specify a channel')
    }
    let metaDataJson
    if (amoMetadata) {
      const metadataFileBuffer = await asyncFsReadFile(amoMetadata)
      try {
        metaDataJson = JSON.parse(metadataFileBuffer.toString())
      } catch (err) {
        throw new UsageError('Invalid JSON in listing metadata')
      }
    }
    const userAgentString = `web-ext/${webextVersion}`
    const signSubmitArgs = {
      apiKey,
      apiProxy,
      apiSecret,
      channel,
      downloadDir: artifactsDir,
      id,
      xpiPath: buildResult.extensionPath,
    }
    try {
      const result = await submitAddon({
        ...signSubmitArgs,
        amoBaseUrl,
        approvalCheckTimeout: approvalTimeout !== undefined ? approvalTimeout : timeout,
        channel,
        metaDataJson,
        savedIdPath,
        savedUploadUuidPath,
        submissionSource: uploadSourceCode,
        userAgentString,
        validationCheckTimeout: timeout,
      })
      return result
    } catch (clientError) {
      throw new WebExtError(clientError.message)
    }
  })
}
export async function getIdFromFile(filePath, asyncFsReadFile = defaultAsyncFsReadFile) {
  let content
  try {
    content = await asyncFsReadFile(filePath)
  } catch (error) {
    if (isErrorWithCode('ENOENT', error)) {
      log.debug(`No ID file found at: ${filePath}`)
      return
    }
    throw error
  }
  let lines = content.toString().split('\n')
  lines = lines.filter((line) => {
    line = line.trim()
    if (line && !line.startsWith('#')) {
      return line
    }
  })
  const id = lines[0]
  log.debug(`Found extension ID ${id} in ${filePath}`)
  if (!id) {
    throw new UsageError(`No ID found in extension ID file ${filePath}`)
  }
  return id
}
