import camelCase from 'camelcase'
import decamelize from 'decamelize'
import { readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import yargs from 'yargs'
import { Parser as yargsParser } from 'yargs/helpers'

import defaultCommands from './cmd/index.js'
import {
  applyConfigToArgv as defaultApplyConfigToArgv,
  discoverConfigFiles as defaultConfigDiscovery,
  loadJSConfigFile as defaultLoadJSConfigFile,
} from './config.js'
import { UsageError } from './errors.js'
import { coerceCLICustomPreference } from './firefox/preferences.js'
import { createLogger, consoleStream as defaultLogStream } from './util/logger.js'
import { checkForUpdates as defaultUpdateChecker } from './util/updates.js'
const log = createLogger(import.meta.url)
const envPrefix = 'WEB_EXT'
// Default to "development" (the value actually assigned will be interpolated
// by babel-plugin-transform-inline-environment-variables).
const defaultGlobalEnv = 'development' || 'development'
export const AMO_BASE_URL = 'https://addons.mozilla.org/api/v5/'

/*
 * The command line program.
 */
export class Program {
  absolutePackageDir
  commands
  demandedOptions
  options
  programArgv
  shouldExitProgram
  verboseEnabled
  yargs
  constructor(argv, { absolutePackageDir = process.cwd() } = {}) {
    // This allows us to override the process argv which is useful for
    // testing.
    // NOTE: process.argv.slice(2) removes the path to node and web-ext
    // executables from the process.argv array.
    argv = argv || process.argv.slice(2)
    this.programArgv = argv

    // NOTE: always initialize yargs explicitly with the package dir
    // to avoid side-effects due to yargs looking for its configuration
    // section from a package.json file stored in an arbitrary directory
    // (e.g. in tests yargs would end up loading yargs config from the
    // mocha package.json). web-ext package.json doesn't contain any yargs
    // section as it is deprecated and we configure yargs using
    // yargs.parserConfiguration. See web-ext#469 for rationale.
    const yargsInstance = yargs(argv, absolutePackageDir)
    this.absolutePackageDir = absolutePackageDir
    this.verboseEnabled = false
    this.shouldExitProgram = true
    this.yargs = yargsInstance
    this.yargs.parserConfiguration({
      'boolean-negation': true,
    })
    this.yargs.strict()
    this.yargs.wrap(this.yargs.terminalWidth())
    this.commands = {}
    this.options = {}
  }

  // defined (in the CLI or in a config file).
  checkRequiredArguments(adjustedArgv) {
    const validationInstance = this.yargs.getInternalMethods().getValidationInstance()
    validationInstance.requiredArguments(adjustedArgv, this.demandedOptions)
  }

  // or an option supported by the current command (See #793).
  cleanupProcessEnvConfigs(systemProcess) {
    const cmd = yargsParser(this.programArgv)._[0]
    const env = systemProcess.env || {}
    const toOptionKey = (k) =>
      decamelize(camelCase(k.replace(envPrefix, '')), {
        separator: '-',
      })
    if (cmd) {
      Object.keys(env)
        .filter((k) => k.startsWith(envPrefix))
        .forEach((k) => {
          const optKey = toOptionKey(k)
          const globalOpt = this.options[optKey]
          const cmdOpt = this.options[cmd] && this.options[cmd][optKey]
          if (!globalOpt && !cmdOpt) {
            log.debug(`Environment ${k} not supported by web-ext ${cmd}`)
            delete env[k]
          }
        })
    }
  }

  command(name, description, executor, commandOptions = {}) {
    this.options[camelCase(name)] = commandOptions
    this.yargs.command(name, description, (yargsForCmd) => {
      if (!commandOptions) {
        return
      }
      return (
        yargsForCmd
          // Make sure the user does not add any extra commands. For example,
          // this would be a mistake because lint does not accept arguments:
          // web-ext lint ./src/path/to/file.js
          .demandCommand(0, 0, undefined, 'This command does not take any arguments')
          .strict()
          .exitProcess(this.shouldExitProgram)
          // Calling env() will be unnecessary after
          // https://github.com/yargs/yargs/issues/486 is fixed
          .env(envPrefix)
          .options(commandOptions)
      )
    })
    this.commands[name] = executor
    return this
  }

  // Retrieve the yargs argv object and apply any further fix needed
  enableVerboseMode(logStream, version) {
    if (this.verboseEnabled) {
      return
    }
    logStream.makeVerbose()
    log.info('Version:', version)
    this.verboseEnabled = true
  }

  // getArguments() disables validation of required parameters, to allow us to
  // read parameters from config files first. Before the program continues, it
  // must call checkRequiredArguments() to ensure that required parameters are
  async execute({
    applyConfigToArgv = defaultApplyConfigToArgv,
    checkForUpdates = defaultUpdateChecker,
    discoverConfigFiles = defaultConfigDiscovery,
    getVersion = defaultVersionGetter,
    globalEnv = defaultGlobalEnv,
    loadJSConfigFile = defaultLoadJSConfigFile,
    logStream = defaultLogStream,
    shouldExitProgram = true,
    systemProcess = process,
  } = {}) {
    this.shouldExitProgram = shouldExitProgram
    this.yargs.exitProcess(this.shouldExitProgram)
    this.cleanupProcessEnvConfigs(systemProcess)
    const argv = this.getArguments()
    const cmd = argv._[0]
    const version = await getVersion(this.absolutePackageDir)
    const runCommand = this.commands[cmd]
    if (argv.verbose) {
      this.enableVerboseMode(logStream, version)
    }
    let adjustedArgv = {
      ...argv,
      webextVersion: version,
    }
    try {
      if (cmd === undefined) {
        throw new UsageError('No sub-command was specified in the args')
      }
      if (!runCommand) {
        throw new UsageError(`Unknown command: ${cmd}`)
      }
      if (globalEnv === 'production') {
        checkForUpdates({
          version,
        })
      }
      const configFiles = []
      if (argv.configDiscovery) {
        log.debug('Discovering config files. ' + 'Set --no-config-discovery to disable')
        const discoveredConfigs = await discoverConfigFiles()
        configFiles.push(...discoveredConfigs)
      } else {
        log.debug('Not discovering config files')
      }
      if (argv.config) {
        configFiles.push(path.resolve(argv.config))
      }
      if (configFiles.length) {
        const niceFileList = configFiles
          .map((f) => f.replace(process.cwd(), '.'))
          .map((f) => f.replace(os.homedir(), '~'))
          .join(', ')
        log.debug('Applying config file' + `${configFiles.length !== 1 ? 's' : ''}: ` + `${niceFileList}`)
      }
      for (const configFileName of configFiles) {
        const configObject = await loadJSConfigFile(configFileName)
        adjustedArgv = applyConfigToArgv({
          argv: adjustedArgv,
          argvFromCLI: argv,
          configFileName,
          configObject,
          options: this.options,
        })
      }
      if (adjustedArgv.verbose) {
        // Ensure that the verbose is enabled when specified in a config file.
        this.enableVerboseMode(logStream, version)
      }
      this.checkRequiredArguments(adjustedArgv)
      await runCommand(adjustedArgv, {
        shouldExitProgram,
      })
    } catch (error) {
      if (!(error instanceof UsageError) || adjustedArgv.verbose) {
        log.error(`\n${error.stack}\n`)
      } else {
        log.error(`\n${String(error)}\n`)
      }
      if (error.code) {
        log.error(`Error code: ${error.code}\n`)
      }
      log.debug(`Command executed: ${cmd}`)
      if (this.shouldExitProgram) {
        systemProcess.exit(1)
      } else {
        throw error
      }
    }
  }

  // Remove WEB_EXT_* environment vars that are not a global cli options
  // on the output of the yargs options parsing.
  getArguments() {
    // To support looking up required parameters via config files, we need to
    // temporarily disable the requiredArguments validation. Otherwise yargs
    // would exit early. Validation is enforced by the checkRequiredArguments()
    // method, after reading configuration files.
    //
    // This is an undocumented internal API of yargs! Unit tests to avoid
    // regressions are located at: tests/functional/test.cli.sign.js
    //
    // Replace hack if possible:  https://github.com/mozilla/web-ext/issues/1930
    const validationInstance = this.yargs.getInternalMethods().getValidationInstance()
    const { requiredArguments } = validationInstance
    // Initialize demandedOptions (which is going to be set to an object with one
    // property for each mandatory global options, then the arrow function below
    // will receive as its demandedOptions parameter a new one that also includes
    // all mandatory options for the sub command selected).
    this.demandedOptions = this.yargs.getDemandedOptions()
    validationInstance.requiredArguments = (args, demandedOptions) => {
      this.demandedOptions = demandedOptions
    }
    let argv
    try {
      argv = this.yargs.argv
    } catch (err) {
      if (err.name === 'YError' && err.message.startsWith('Unknown argument: ')) {
        throw new UsageError(err.message)
      }
      throw err
    }
    validationInstance.requiredArguments = requiredArguments

    // Yargs boolean options doesn't define the no* counterpart
    // with negate-boolean on Yargs 15. Define as expected by the
    // web-ext execute method.
    if (argv.configDiscovery != null) {
      argv.noConfigDiscovery = !argv.configDiscovery
    }
    if (argv.reload != null) {
      argv.noReload = !argv.reload
    }

    // Yargs doesn't accept --no-input as a valid option if there isn't a
    // --input option defined to be negated, to fix that the --input is
    // defined and hidden from the yargs help output and we define here
    // the negated argument name that we expect to be set in the parsed
    // arguments (and fix https://github.com/mozilla/web-ext/issues/1860).
    if (argv.input != null) {
      argv.noInput = !argv.input
    }

    // Replacement for the "requiresArg: true" parameter until the following bug
    // is fixed: https://github.com/yargs/yargs/issues/1098
    if (argv.ignoreFiles && !argv.ignoreFiles.length) {
      throw new UsageError('Not enough arguments following: ignore-files')
    }
    if (argv.startUrl && !argv.startUrl.length) {
      throw new UsageError('Not enough arguments following: start-url')
    }
    if (Array.isArray(argv.firefoxPreview) && !argv.firefoxPreview.length) {
      argv.firefoxPreview = ['mv3']
    }
    return argv
  }

  setGlobalOptions(options) {
    // This is a convenience for setting global options.
    // An option is only global (i.e. available to all sub commands)
    // with the `global` flag so this makes sure every option has it.
    this.options = {
      ...this.options,
      ...options,
    }
    Object.keys(options).forEach((key) => {
      options[key].global = true
      if (options[key].demandOption === undefined) {
        // By default, all options should be "demanded" otherwise
        // yargs.strict() will think they are missing when declared.
        options[key].demandOption = true
      }
    })
    this.yargs.options(options)
    return this
  }
}

// A defintion of type of argument for defaultVersionGetter

export async function defaultVersionGetter(absolutePackageDir, { globalEnv = defaultGlobalEnv } = {}) {
  if (globalEnv === 'production') {
    log.debug('Getting the version from package.json')
    const packageData = readFileSync(path.join(absolutePackageDir, 'package.json'))
    return JSON.parse(packageData).version
  } else {
    log.debug('Getting version from the git revision')
    // This branch is only reached during development.
    // git-rev-sync is in devDependencies, and lazily imported using require.
    // This also avoids logspam from https://github.com/mozilla/web-ext/issues/1916
    const git = await import('git-rev-sync')
    return `${git.branch(absolutePackageDir)}-${git.long(absolutePackageDir)}`
  }
}
export function throwUsageErrorIfArray(errorMessage) {
  return (value) => {
    if (Array.isArray(value)) {
      throw new UsageError(errorMessage)
    }
    return value
  }
}
export async function main(
  absolutePackageDir,
  { argv, commands = defaultCommands, getVersion = defaultVersionGetter, runOptions = {} } = {},
) {
  const program = new Program(argv, {
    absolutePackageDir,
  })
  const version = await getVersion(absolutePackageDir)

  // This is an option shared by some commands but not all of them, hence why
  // it isn't a global option.
  const firefoxPreviewOption = {
    demandOption: false,
    describe: 'Turn on developer preview features in Firefox' + ' (defaults to "mv3")',
    type: 'array',
  }

  // yargs uses magic camel case expansion to expose options on the
  // final argv object. For example, the 'artifacts-dir' option is alternatively
  // available as argv.artifactsDir.
  program.yargs
    .usage(
      `Usage: $0 [options] command

Option values can also be set by declaring an environment variable prefixed
with $${envPrefix}_. For example: $${envPrefix}_SOURCE_DIR=/path is the same as
--source-dir=/path.

To view specific help for any given command, add the command name.
Example: $0 --help run.
`,
    )
    .help('help')
    .alias('h', 'help')
    .env(envPrefix)
    .version(version)
    .demandCommand(1, 'You must specify a command')
    .strict()
    .recommendCommands()
  program.setGlobalOptions({
    'artifacts-dir': {
      alias: 'a',
      default: path.join(process.cwd(), 'web-ext-artifacts'),
      describe: 'Directory where artifacts will be saved.',
      normalize: true,
      requiresArg: true,
      type: 'string',
    },
    'config': {
      alias: 'c',
      default: undefined,
      demandOption: false,
      describe: 'Path to a CommonJS config file to set ' + 'option defaults',
      requiresArg: true,
      type: 'string',
    },
    'config-discovery': {
      default: true,
      demandOption: false,
      describe:
        'Discover config files in home directory and ' + 'working directory. Disable with --no-config-discovery.',
      type: 'boolean',
    },
    'ignore-files': {
      alias: 'i',
      demandOption: false,
      describe:
        'A list of glob patterns to define which files should be ' +
        'ignored. (Example: --ignore-files=path/to/first.js ' +
        'path/to/second.js "**/*.log")',
      // The following option prevents yargs>=11 from parsing multiple values,
      // so the minimum value requirement is enforced in execute instead.
      // Upstream bug: https://github.com/yargs/yargs/issues/1098
      // requiresArg: true,
      type: 'array',
    },
    'input': {
      // This option is defined to make yargs to accept the --no-input
      demandOption: false,
      // defined above, but we hide it from the yargs help output.
      hidden: true,
      type: 'boolean',
    },
    'no-input': {
      demandOption: false,
      describe: 'Disable all features that require standard input',
      type: 'boolean',
    },
    'source-dir': {
      alias: 's',
      coerce: (arg) => (arg != null ? path.resolve(arg) : undefined),
      default: process.cwd(),
      describe: 'Web extension source directory.',
      requiresArg: true,
      type: 'string',
    },
    'verbose': {
      alias: 'v',
      demandOption: false,
      describe: 'Show verbose output',
      type: 'boolean',
    },
  })
  program
    .command('build', 'Create an extension package from source', commands.build, {
      'as-needed': {
        describe: 'Watch for file changes and re-build as needed',
        type: 'boolean',
      },
      'filename': {
        alias: 'n',
        coerce: (arg) =>
          arg == null ? undefined : throwUsageErrorIfArray('Multiple --filename/-n option are not allowed')(arg),
        default: undefined,
        demandOption: false,
        describe: 'Name of the created extension package file.',
        normalize: false,
        requiresArg: true,
        type: 'string',
      },
      'overwrite-dest': {
        alias: 'o',
        describe: 'Overwrite destination package if it exists.',
        type: 'boolean',
      },
    })
    .command('dump-config', 'Run config discovery and dump the resulting config data as JSON', commands.dumpConfig, {})
    .command('sign', 'Sign the extension so it can be installed in Firefox', commands.sign, {
      'amo-base-url': {
        default: AMO_BASE_URL,
        demandOption: true,
        describe: 'Submission API URL prefix',
        type: 'string',
      },
      'amo-metadata': {
        describe:
          'Path to a JSON file containing an object with metadata to be passed to the API. ' +
          'See https://addons-server.readthedocs.io/en/latest/topics/api/addons.html for details.',
        type: 'string',
      },
      'api-key': {
        demandOption: true,
        describe: 'API key (JWT issuer) from addons.mozilla.org',
        type: 'string',
      },
      'api-proxy': {
        demandOption: false,
        describe: 'Use a proxy to access the signing API. ' + 'Example: https://yourproxy:6000 ',
        type: 'string',
      },
      'api-secret': {
        demandOption: true,
        describe: 'API secret (JWT secret) from addons.mozilla.org',
        type: 'string',
      },
      'approval-timeout': {
        describe:
          'Number of milliseconds to wait for approval before giving up. ' +
          'Set to 0 to disable waiting for approval. Fallback to `timeout` if not set.',
        type: 'number',
      },
      'channel': {
        demandOption: true,
        describe: 'The channel for which to sign the addon. Either \'listed\' or \'unlisted\'.',
        type: 'string',
      },
      'id': {
        demandOption: false,
        describe:
          'A custom ID for the extension. This has no effect if the ' +
          'extension already declares an explicit ID in its manifest.',
        type: 'string',
      },
      'timeout': {
        describe: 'Number of milliseconds to wait before giving up',
        type: 'number',
      },
      'upload-source-code': {
        describe:
          'Path to an archive file containing human readable source code of this submission, ' +
          'if the code in --source-dir has been processed to make it unreadable. ' +
          'See https://extensionworkshop.com/documentation/publish/source-code-submission/ for ' +
          'details. Only used with `use-submission-api`',
        type: 'string',
      },
    })
    .command('run', 'Run the extension', commands.run, {
      // Firefox for Android CLI options.
      'adb-bin': {
        demandOption: false,
        describe: 'Specify a custom path to the adb binary',
        requiresArg: true,
        type: 'string',
      },
      'adb-device': {
        alias: ['android-device'],
        demandOption: false,
        describe: 'Connect to the specified adb device name',
        requiresArg: true,
        type: 'string',
      },
      'adb-discovery-timeout': {
        demandOption: false,
        describe: 'Number of milliseconds to wait before giving up',
        requiresArg: true,
        type: 'number',
      },
      'adb-host': {
        demandOption: false,
        describe: 'Connect to adb on the specified host',
        requiresArg: true,
        type: 'string',
      },
      'adb-port': {
        demandOption: false,
        describe: 'Connect to adb on the specified port',
        requiresArg: true,
        type: 'string',
      },
      'adb-remove-old-artifacts': {
        demandOption: false,
        describe: 'Remove old artifacts directories from the adb device',
        type: 'boolean',
      },
      'args': {
        alias: ['arg'],
        demandOption: false,
        describe: 'Additional CLI options passed to the Browser binary',
        type: 'array',
      },
      'browser-console': {
        alias: ['bc'],
        demandOption: false,
        describe: 'Open the DevTools Browser Console.',
        type: 'boolean',
      },
      'chromium-binary': {
        demandOption: false,
        describe:
          'Path or alias to a Chromium executable such as ' +
          'google-chrome, google-chrome.exe or opera.exe etc. ' +
          'If not specified, the default Google Chrome will be used.',
        type: 'string',
      },
      'chromium-profile': {
        demandOption: false,
        describe: 'Path to a custom Chromium profile',
        type: 'string',
      },
      'devtools': {
        demandOption: false,
        describe: 'Open the DevTools for the installed add-on ' + '(Firefox 106 and later)',
        type: 'boolean',
      },
      'firefox': {
        alias: ['f', 'firefox-binary'],
        demandOption: false,
        describe:
          'Path or alias to a Firefox executable such as firefox-bin ' +
          'or firefox.exe. ' +
          'If not specified, the default Firefox will be used. ' +
          'You can specify the following aliases in lieu of a path: ' +
          'firefox, beta, nightly, firefoxdeveloperedition (or deved). ' +
          'For Flatpak, use `flatpak:org.mozilla.firefox` where ' +
          '`org.mozilla.firefox` is the application ID.',
        type: 'string',
      },
      'firefox-apk': {
        demandOption: false,
        describe: 'Run a specific Firefox for Android APK. ' + 'Example: org.mozilla.fennec_aurora',
        requiresArg: true,
        type: 'string',
      },
      'firefox-apk-component': {
        demandOption: false,
        describe: 'Run a specific Android Component (defaults to <firefox-apk>/.App)',
        requiresArg: true,
        type: 'string',
      },
      'firefox-preview': firefoxPreviewOption,
      'firefox-profile': {
        alias: 'p',
        demandOption: false,
        describe:
          'Run Firefox using a copy of this profile. The profile ' +
          'can be specified as a directory or a name, such as one ' +
          'you would see in the Profile Manager. If not specified, ' +
          'a new temporary profile will be created.',
        type: 'string',
      },
      'keep-profile-changes': {
        demandOption: false,
        describe: 'Run Firefox directly in custom profile. Any changes to ' + 'the profile will be saved.',
        type: 'boolean',
      },
      'pre-install': {
        demandOption: false,
        describe:
          'Pre-install the extension into the profile before ' +
          'startup. This is only needed to support older versions ' +
          'of Firefox.',
        type: 'boolean',
      },
      'pref': {
        coerce: (arg) => (arg != null ? coerceCLICustomPreference(arg) : undefined),
        demandOption: false,
        describe:
          'Launch firefox with a custom preference ' +
          '(example: --pref=general.useragent.locale=fr-FR). ' +
          'You can repeat this option to set more than one ' +
          'preference.',
        requiresArg: true,
        type: 'array',
      },
      'profile-create-if-missing': {
        demandOption: false,
        describe: 'Create the profile directory if it does not already exist',
        type: 'boolean',
      },
      'reload': {
        default: true,
        demandOption: false,
        describe: 'Reload the extension when source files change.' + 'Disable with --no-reload.',
        type: 'boolean',
      },
      'start-url': {
        alias: ['u', 'url'],
        demandOption: false,
        describe: 'Launch firefox at specified page',
        type: 'array',
      },
      'target': {
        alias: 't',
        choices: ['firefox-desktop', 'firefox-android', 'chromium'],
        default: 'firefox-desktop',
        demandOption: false,
        describe:
          'The extensions runners to enable. Specify this option ' + 'multiple times to run against multiple targets.',
        type: 'array',
      },
      'watch-file': {
        alias: ['watch-files'],
        demandOption: false,
        describe:
          'Reload the extension only when the contents of this' +
          ' file changes. This is useful if you use a custom' +
          ' build process for your extension',
        type: 'array',
      },
      'watch-ignored': {
        demandOption: false,
        describe:
          'Paths and globs patterns that should not be ' +
          'watched for changes. This is useful if you want ' +
          'to explicitly prevent web-ext from watching part ' +
          'of the extension directory tree, ' +
          'e.g. the node_modules folder.',
        type: 'array',
      },
    })
    .command('lint', 'Validate the extension source', commands.lint, {
      'boring': {
        default: false,
        describe: 'Disables colorful shell output',
        type: 'boolean',
      },
      'firefox-preview': firefoxPreviewOption,
      'metadata': {
        default: false,
        describe: 'Output only metadata as JSON',
        type: 'boolean',
      },
      'output': {
        alias: 'o',
        choices: ['json', 'text'],
        default: 'text',
        describe: 'The type of output to generate',
        type: 'string',
      },
      'pretty': {
        default: false,
        describe: 'Prettify JSON output',
        type: 'boolean',
      },
      'privileged': {
        default: false,
        describe: 'Treat your extension as a privileged extension',
        type: 'boolean',
      },
      'self-hosted': {
        default: false,
        describe:
          'Your extension will be self-hosted. This disables messages ' + 'related to hosting on addons.mozilla.org.',
        type: 'boolean',
      },
      'warnings-as-errors': {
        alias: 'w',
        default: false,
        describe: 'Treat warnings as errors by exiting non-zero for warnings',
        type: 'boolean',
      },
    })
    .command('docs', 'Open the web-ext documentation in a browser', commands.docs, {})
  return program.execute({
    getVersion,
    ...runOptions,
  })
}
