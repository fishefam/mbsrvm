import prettier from '@prettier/sync'
import _checkConnection from 'check-internet-connected'
import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { type } from 'os'
import { resolve } from 'path'
import { cmd } from 'web-ext'

import { DIR_NAME } from './_constant.js'

/**
 * The '..' is important since DIR_NAME points to this `script` directory, not root directory
 * @param  {...string} fracments
 * @returns  {string}
 */
export function resolvePaths(...fracments) {
  return resolve(DIR_NAME, '..', ...fracments)
}

/**
 * Get the entry points for the esbuild configuration.
 * @returns {Array<{in: string, out: string}>} Array of entry points.
 */
export function getEntryPoints(browsers, entries) {
  return browsers.map((browser) => entries.map((entry) => ({ in: entry.in, out: `${browser}/${entry.out}` }))).flat()
}

/**
 * Plugin factory function
 * @param {string} name
 * @param {import('esbuild').Plugin['setup']} setup
 * @returns {import('esbuild').Plugin} setup
 */
export function createPlugin(name, setup) {
  return { name, setup }
}

/**
 * Plugin factory function that handles only `onEnd` event
 * @template {import('esbuild').BuildResult} BuildResult
 * @param {string} name
 * @param {(result: BuildResult) => void} onEndHandler
 * @param {import('esbuild').Plugin['setup']} setup
 * @returns {import('esbuild').Plugin} setup
 */
export function createOnEndPlugin(name, onEndHandler) {
  return { name, setup: ({ onEnd }) => onEnd(onEndHandler) }
}

/**
 *
 * @template {import('esbuild').BuildOptions} T
 * @template {keyof T} U
 * @param {{condition: boolean, key: U, value: T[U]}} condition
 * @returns {{[key in U]: T[U]}}
 */
export function getOption(param) {
  const { condition, key, value } = param
  return condition ? { [key]: value } : {}
}

export async function startWebext({ browser, devHost, outdir }) {
  const run = await cmd.run({
    args: [`-new-tab=${devHost}`, '-devtools'],
    firefox: getFirefoxExecutablePath() || '',
    firefoxProfile: getFirefoxProfilePath() || '',
    sourceDir: resolvePaths(outdir, browser),
  })
  const { extensionRunners } = run
  const [runner] = extensionRunners
  runner.runningInfo.firefox.on('close', () => {
    console.log('Cleaning up and stopping process.\n')
    process.exit(0)
  })
}

/**
 * Get the path to the Firefox executable based on the operating system.
 * @returns {string | undefined} The path to the Firefox executable or undefined if not found.
 */
export function getFirefoxExecutablePath() {
  const system = type()
  if (system === 'Darwin') return '/Applications/Firefox.app/Contents/MacOS/firefox'
  if (system === 'Windows_NT') {
    const cp = spawnSync('powershell.exe', [
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\firefox.exe" /v Path',
    ])
    const output = cp.stdout.toString()
    const firefoxPath = output.replace(/HKEY_LOCAL_MACHINE(.|\n|\r\n|\r)*REG_SZ */i, '').trim() + '\\firefox.exe'
    return firefoxPath.trim()
  }
  if (system === 'Linux') {
    const cp = spawnSync('where', ['firefox'])
    const output = cp.stdout.toString()
    return output.toString().trim()
  }
}

/**
 * Get the path to the Firefox profile based on the operating system.
 * @returns {string | undefined} The path to the Firefox profile or undefined if not found.
 */
export function getFirefoxProfilePath() {
  const system = type()
  if (system === 'Windows_NT') {
    const cp = spawnSync('powershell.exe', [
      'Get-ChildItem "$env:APPDATA\\Mozilla\\Firefox\\Profiles" -directory | Select FullName',
    ])
    const output = cp.stdout
      .toString()
      .split(/\n|\r|\r\n/)
      .filter((value) => /\.default-release$/.test(value))
    return output[0]
  }
}

/**
 *
 * @param {string} html
 */
export function formatHTML(html) {
  return prettier.format(html, { parser: 'html' })
}

/**
 * Strips matching content from a file. Either pattern or processor function must be provided in the param.
 * If both are provided, the processor function takes precedence.
 * @param {{path: string[], type: 'html' | 'json', pattern?: RegExp, processor?: (input: string) => string}} param
 */
export function stripFileContent(param) {
  const { path, pattern, processor, type } = param
  const resolvedPath = resolvePaths(...path)
  const content = readFileSync(resolvedPath, { encoding: 'utf-8' })
  const strippedContent = prettier.format(processor ? processor(content) : content.replace(pattern ?? '', ''), {
    parser: type,
  })
  writeFileSync(resolvedPath, strippedContent)
}

export async function checkConnection() {
  try {
    await _checkConnection({ domain: 'https://google.com', retries: 3, timeout: 1000 })
    return true
  } catch (error) {
    return false
  }
}
