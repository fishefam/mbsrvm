/**
 * This module provide an ExtensionRunner subclass that manage an extension executed
 * in a Firefox for Android instance.
 */

import path from 'path'
import readline from 'readline'

import { MultiExtensionsReloadError, UsageError, WebExtError } from '../errors.js'
import { findFreeTcpPort } from '../firefox/remote.js'
import DefaultADBUtils from '../util/adb.js'
import { createLogger } from '../util/logger.js'
import { isTTY, setRawMode } from '../util/stdin.js'
import { withTempDir } from '../util/temp-dir.js'
const log = createLogger(import.meta.url)
const ignoredParams = {
  args: '--args',
  browserConsole: '--browser-console',
  keepProfileChanges: '--keep-profile-changes',
  preInstall: '--pre-install',
  profilePath: '--profile-path',
  startUrl: '--start-url',
}

// Default adbHost to 127.0.0.1 to prevent issues with nodejs 17
// (because if not specified adbkit may default to ipv6 while
// adb may still only be listening on the ipv4 address),
// see https://github.com/mozilla/web-ext/issues/2337.
const DEFAULT_ADB_HOST = '127.0.0.1'
const getIgnoredParamsWarningsMessage = (optionName) => {
  return `The Firefox for Android target does not support ${optionName}`
}

/**
 * Implements an IExtensionRunner which manages a Firefox for Android instance.
 */
export class FirefoxAndroidExtensionRunner {
  // Wait for at most 3 minutes before giving up.
  static unixSocketDiscoveryMaxTime = 3 * 60 * 1000
  // Wait 3s before the next unix socket discovery loop.
  static unixSocketDiscoveryRetryInterval = 3 * 1000
  adbExtensionsPathBySourceDir
  adbUtils
  cleanupCallbacks
  exiting
  params
  reloadableExtensions
  remoteFirefox
  selectedAdbDevice
  selectedArtifactsDir
  selectedFirefoxApk
  selectedRDPSocketFile
  selectedTCPPort
  constructor(params) {
    this.params = params
    this.cleanupCallbacks = new Set()
    this.adbExtensionsPathBySourceDir = new Map()
    this.reloadableExtensions = new Map()

    // Print warning for not currently supported options (e.g. preInstall,
    // cloned profiles, browser console).
    this.printIgnoredParamsWarnings()
  }

  async adbDevicesDiscoveryAndSelect() {
    const { adbUtils } = this
    const { adbDevice } = this.params
    let devices = []
    log.debug('Listing android devices')
    devices = await adbUtils.discoverDevices()
    if (devices.length === 0) {
      throw new UsageError(
        'No Android device found through ADB. ' + 'Make sure the device is connected and USB debugging is enabled.',
      )
    }
    if (!adbDevice) {
      const devicesMsg = devices.map((dev) => ` - ${dev}`).join('\n')
      log.info(`\nAndroid devices found:\n${devicesMsg}`)
      throw new UsageError('Select an android device using --android-device=<name>')
    }
    const foundDevices = devices.filter((device) => {
      return device === adbDevice
    })
    if (foundDevices.length === 0) {
      const devicesMsg = JSON.stringify(devices)
      throw new UsageError(`Android device ${adbDevice} was not found in list: ${devicesMsg}`)
    }
    this.selectedAdbDevice = foundDevices[0]
    log.info(`Selected ADB device: ${this.selectedAdbDevice}`)
  }

  // Method exported from the IExtensionRunner interface.

  async adbDiscoveryAndForwardRDPUnixSocket() {
    const {
      adbUtils,
      params: { adbDiscoveryTimeout },
      selectedAdbDevice,
      selectedFirefoxApk,
    } = this
    const stdin = this.params.stdin || process.stdin
    const { unixSocketDiscoveryRetryInterval } = FirefoxAndroidExtensionRunner
    let { unixSocketDiscoveryMaxTime } = FirefoxAndroidExtensionRunner
    if (typeof adbDiscoveryTimeout === 'number') {
      unixSocketDiscoveryMaxTime = adbDiscoveryTimeout
    }
    const handleCtrlC = (str, key) => {
      if (key.ctrl && key.name === 'c') {
        adbUtils.setUserAbortDiscovery(true)
      }
    }

    // TODO: use noInput property to decide if we should
    // disable direct keypress handling.
    if (isTTY(stdin)) {
      readline.emitKeypressEvents(stdin)
      setRawMode(stdin, true)
      stdin.on('keypress', handleCtrlC)
    }
    try {
      // Got a debugger socket file to connect.
      this.selectedRDPSocketFile = await adbUtils.discoverRDPUnixSocket(selectedAdbDevice, selectedFirefoxApk, {
        maxDiscoveryTime: unixSocketDiscoveryMaxTime,
        retryInterval: unixSocketDiscoveryRetryInterval,
      })
    } finally {
      if (isTTY(stdin)) {
        stdin.removeListener('keypress', handleCtrlC)
      }
    }
    log.debug(`RDP Socket File selected: ${this.selectedRDPSocketFile}`)
    const tcpPort = await findFreeTcpPort()

    // Log the choosen tcp port at info level (useful to the user to be able
    // to connect the Firefox DevTools to the Firefox for Android instance).
    log.info(`You can connect to this Android device on TCP port ${tcpPort}`)
    const forwardSocketSpec = this.selectedRDPSocketFile.startsWith('@')
      ? `localabstract:${this.selectedRDPSocketFile.substr(1)}`
      : `localfilesystem:${this.selectedRDPSocketFile}`
    await adbUtils.setupForward(selectedAdbDevice, forwardSocketSpec, `tcp:${tcpPort}`)
    this.selectedTCPPort = tcpPort
  }

  async adbForceStopSelectedPackage() {
    const { adbUtils, selectedAdbDevice, selectedFirefoxApk } = this
    log.info(`Stopping existing instances of ${selectedFirefoxApk}...`)
    await adbUtils.amForceStopAPK(selectedAdbDevice, selectedFirefoxApk)
  }

  async adbPrepareProfileDir() {
    const {
      adbUtils,
      params: { adbRemoveOldArtifacts, customPrefs, firefoxApp },
      selectedAdbDevice,
      selectedFirefoxApk,
    } = this
    // Create the preferences file and the Fennec temporary profile.
    log.debug(`Preparing a temporary profile for ${selectedFirefoxApk}...`)
    const profile = await firefoxApp.createProfile({
      app: 'fennec',
      customPrefs,
    })

    // Check if there are any artifacts dirs from previous runs and
    // automatically remove them if adbRemoteOldArtifacts is true.
    const foundOldArtifacts = await adbUtils.detectOrRemoveOldArtifacts(selectedAdbDevice, adbRemoveOldArtifacts)
    if (foundOldArtifacts) {
      if (adbRemoveOldArtifacts) {
        log.info('Old web-ext artifacts have been found and removed ' + `from ${selectedAdbDevice} device`)
      } else {
        log.warn(
          `Old artifacts directories have been found on ${selectedAdbDevice} ` +
            'device. Use --adb-remove-old-artifacts to remove them automatically.',
        )
      }
    }

    // Choose a artifacts dir name for the assets pushed to the
    // Android device.
    this.selectedArtifactsDir = await adbUtils.getOrCreateArtifactsDir(selectedAdbDevice)
    const deviceProfileDir = this.getDeviceProfileDir()
    await adbUtils.runShellCommand(selectedAdbDevice, ['mkdir', '-p', deviceProfileDir])
    await adbUtils.pushFile(selectedAdbDevice, path.join(profile.profileDir, 'user.js'), `${deviceProfileDir}/user.js`)
    log.debug(`Created temporary profile at ${deviceProfileDir}.`)
  }

  async adbStartSelectedPackage() {
    const {
      adbUtils,
      params: { firefoxApkComponent },
      selectedAdbDevice,
      selectedFirefoxApk,
    } = this
    const deviceProfileDir = this.getDeviceProfileDir()
    log.info(`Starting ${selectedFirefoxApk}...`)
    log.debug(`Using profile ${deviceProfileDir} (ignored by Fenix)`)
    await adbUtils.startFirefoxAPK(selectedAdbDevice, selectedFirefoxApk, firefoxApkComponent, deviceProfileDir)
  }

  async apkPackagesDiscoveryAndSelect() {
    const {
      adbUtils,
      params: { firefoxApk },
      selectedAdbDevice,
    } = this
    // Discovery and select a Firefox for Android version.
    const packages = await adbUtils.discoverInstalledFirefoxAPKs(selectedAdbDevice, firefoxApk)
    if (packages.length === 0) {
      throw new UsageError('No Firefox packages were found on the selected Android device')
    }
    const pkgsListMsg = (pkgs) => {
      return pkgs.map((pkg) => ` - ${pkg}`).join('\n')
    }
    if (!firefoxApk) {
      log.info(`\nPackages found:\n${pkgsListMsg(packages)}`)
      if (packages.length > 1) {
        throw new UsageError('Select one of the packages using --firefox-apk')
      }

      // If only one APK has been found, select it even if it has not been
      // specified explicitly on the comment line.
      this.selectedFirefoxApk = packages[0]
      log.info(`Selected Firefox for Android APK: ${this.selectedFirefoxApk}`)
      return
    }
    const filteredPackages = packages.filter((line) => line === firefoxApk)
    if (filteredPackages.length === 0) {
      const pkgsList = pkgsListMsg(filteredPackages)
      throw new UsageError(`Package ${firefoxApk} was not found in list: ${pkgsList}`)
    }
    this.selectedFirefoxApk = filteredPackages[0]
    log.debug(`Selected Firefox for Android APK: ${this.selectedFirefoxApk}`)
  }

  // Private helper methods.

  async buildAndPushExtension(sourceDir) {
    const {
      adbUtils,
      params: { buildSourceDir },
      selectedAdbDevice,
      selectedArtifactsDir,
    } = this
    await withTempDir(async (tmpDir) => {
      const { extensionPath } = await buildSourceDir(sourceDir, tmpDir.path())
      const extFileName = path.basename(extensionPath, '.zip')
      let adbExtensionPath = this.adbExtensionsPathBySourceDir.get(sourceDir)
      if (!adbExtensionPath) {
        adbExtensionPath = `${selectedArtifactsDir}/${extFileName}.xpi`
      }
      log.debug(`Uploading ${extFileName} on the android device`)
      await adbUtils.pushFile(selectedAdbDevice, extensionPath, adbExtensionPath)
      log.debug(`Upload completed: ${adbExtensionPath}`)
      this.adbExtensionsPathBySourceDir.set(sourceDir, adbExtensionPath)
    })
  }

  async buildAndPushExtensions() {
    for (const { sourceDir } of this.params.extensions) {
      await this.buildAndPushExtension(sourceDir)
    }
  }

  /**
   * Exits the runner, by closing the managed Firefox instance.
   */
  async exit() {
    const { adbUtils, selectedAdbDevice, selectedArtifactsDir } = this
    this.exiting = true

    // If a Firefox for Android instance has been started,
    // we should ensure that it has been stopped when we exit.
    await this.adbForceStopSelectedPackage()
    if (selectedArtifactsDir) {
      log.debug('Cleaning up artifacts directory on the Android device...')
      await adbUtils.clearArtifactsDir(selectedAdbDevice)
    }

    // Call all the registered cleanup callbacks.
    for (const fn of this.cleanupCallbacks) {
      try {
        fn()
      } catch (error) {
        log.error(error)
      }
    }
  }

  getDeviceProfileDir() {
    return `${this.selectedArtifactsDir}/profile`
  }

  /**
   * Returns the runner name.
   */
  getName() {
    return 'Firefox Android'
  }

  printIgnoredParamsWarnings() {
    Object.keys(ignoredParams).forEach((ignoredParam) => {
      if (this.params[ignoredParam]) {
        log.warn(getIgnoredParamsWarningsMessage(ignoredParams[ignoredParam]))
      }
    })
  }

  async rdpInstallExtensions() {
    const {
      params: { extensions, firefoxClient },
      selectedTCPPort,
    } = this
    const remoteFirefox = (this.remoteFirefox = await firefoxClient({
      port: selectedTCPPort,
    }))

    // Exit and cleanup the extension runner if the connection to the
    // remote Firefox for Android instance has been closed.
    remoteFirefox.client.on('end', () => {
      if (!this.exiting) {
        log.info('Exiting the device because Firefox for Android disconnected')
        this.exit()
      }
    })

    // Install all the temporary addons.
    for (const extension of extensions) {
      const { sourceDir } = extension
      const adbExtensionPath = this.adbExtensionsPathBySourceDir.get(sourceDir)
      if (!adbExtensionPath) {
        throw new WebExtError(`ADB extension path for "${sourceDir}" was unexpectedly empty`)
      }
      const addonId = await remoteFirefox.installTemporaryAddon(adbExtensionPath).then((installResult) => {
        return installResult.addon.id
      })
      if (!addonId) {
        throw new WebExtError(
          'Received an empty addonId from ' + `remoteFirefox.installTemporaryAddon("${adbExtensionPath}")`,
        )
      }
      this.reloadableExtensions.set(extension.sourceDir, addonId)
    }
  }

  /**
   * Register a callback to be called when the runner has been exited
   * (e.g. the Firefox instance exits or the user has requested web-ext
   * to exit).
   */
  registerCleanup(fn) {
    this.cleanupCallbacks.add(fn)
  }

  /**
   * Reloads all the extensions, collect any reload error and resolves to
   * an array composed by a single ExtensionRunnerReloadResult object.
   */
  async reloadAllExtensions() {
    const runnerName = this.getName()
    const reloadErrors = new Map()
    for (const { sourceDir } of this.params.extensions) {
      const [res] = await this.reloadExtensionBySourceDir(sourceDir)
      if (res.reloadError instanceof Error) {
        reloadErrors.set(sourceDir, res.reloadError)
      }
    }
    if (reloadErrors.size > 0) {
      return [
        {
          reloadError: new MultiExtensionsReloadError(reloadErrors),
          runnerName,
        },
      ]
    }
    return [
      {
        runnerName,
      },
    ]
  }

  /**
   * Reloads a single extension, collect any reload error and resolves to
   * an array composed by a single ExtensionRunnerReloadResult object.
   */
  async reloadExtensionBySourceDir(extensionSourceDir) {
    const runnerName = this.getName()
    const addonId = this.reloadableExtensions.get(extensionSourceDir)
    if (!addonId) {
      return [
        {
          reloadError: new WebExtError(
            'Extension not reloadable: ' + `no addonId has been mapped to "${extensionSourceDir}"`,
          ),
          runnerName,
          sourceDir: extensionSourceDir,
        },
      ]
    }
    try {
      await this.buildAndPushExtension(extensionSourceDir)
      await this.remoteFirefox.reloadAddon(addonId)
    } catch (error) {
      return [
        {
          reloadError: error,
          runnerName,
          sourceDir: extensionSourceDir,
        },
      ]
    }
    return [
      {
        runnerName,
        sourceDir: extensionSourceDir,
      },
    ]
  }

  async run() {
    const { adbBin, adbHost = DEFAULT_ADB_HOST, adbPort, ADBUtils = DefaultADBUtils } = this.params
    this.adbUtils = new ADBUtils({
      adbBin,
      adbHost,
      adbPort,
    })
    await this.adbDevicesDiscoveryAndSelect()
    await this.apkPackagesDiscoveryAndSelect()
    await this.adbForceStopSelectedPackage()

    // Create profile prefs (with enabled remote RDP server), prepare the
    // artifacts and temporary directory on the selected device, and
    // push the profile preferences to the remote profile dir.
    await this.adbPrepareProfileDir()

    // NOTE: running Firefox for Android on the Android Emulator can be
    // pretty slow, we can run the following 3 steps in parallel to speed up
    // it a bit.
    await Promise.all([
      // Start Firefox for Android instance if not started yet.
      // (Fennec would run in an temporary profile and so it is explicitly
      // stopped, Fenix runs on its usual profile and so it may be already
      // running).
      this.adbStartSelectedPackage(),
      // Build and push to devices all the extension xpis
      // and keep track of the xpi built and uploaded by extension sourceDir.
      this.buildAndPushExtensions(),
      // Wait for RDP unix socket file created and
      // Create an ADB forward connection on a free tcp port
      this.adbDiscoveryAndForwardRDPUnixSocket(),
    ])

    // Connect to RDP socket on the local tcp server, install all the pushed extension
    // and keep track of the built and installed extension by extension sourceDir.
    await this.rdpInstallExtensions()
  }
}