import { spawnSync } from 'child_process'
import esbuild from 'esbuild'
import { type } from 'os'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import webext from 'web-ext'

import BASE_OPTION from './esbuild.config.js'

main()

async function main() {
  let isInit = true
  const context = await esbuild.context({
    ...BASE_OPTION,
    plugins: [...BASE_OPTION.plugins, webextPlugin(isInit)],
    sourcemap: true,
  })

  context.watch()
}

/** @returns {import('esbuild').Plugin} */
function webextPlugin(isInit) {
  return {
    name: 'webext',
    setup: ({ onEnd }) =>
      onEnd(() => {
        startWebext(isInit)
        isInit = false
      }),
  }
}

function startWebext(shouldRun) {
  if (shouldRun) {
    webext.cmd.run(
      {
        args: ['-new-tab=https://blank.page', '-devtools'],
        firefox: getFirefoxExecutablePath() || '',
        firefoxProfile: getFirefoxProfilePath() || '',
        sourceDir: resolve(dirname(fileURLToPath(import.meta.url)), 'dist'),
      },
      { shouldExitProgram: true },
    )
  }
}

function getFirefoxExecutablePath() {
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

function getFirefoxProfilePath() {
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
