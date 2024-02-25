import { spawnSync } from 'child_process'
import getPort from 'detect-port'
import esbuild from 'esbuild'
import { type } from 'os'
import { resolve } from 'path'
import { cmd } from 'web-ext'

import BASE_OPTION from './.esbuildrc.js'

main()

async function main() {
  let isInit = true
  const port = await getPort(8000)
  const context = await esbuild.context({
    ...BASE_OPTION,
    plugins: [...BASE_OPTION.plugins, webext(isInit, port)],
    sourcemap: true,
  })
  console.log('\nStarting...')
  context.serve({ port })
  context.watch()
}

function webext(isInit, port) {
  return {
    name: 'webext',
    setup: ({ onEnd }) =>
      onEnd(() => {
        if (isInit) startWebext(port)
        isInit = false
      }),
  }
}

async function startWebext(port) {
  const run = await cmd.run({
    args: [`-new-tab=http://localhost:${port}`, '-devtools'],
    firefox: getFirefoxExecutablePath() || '',
    firefoxProfile: getFirefoxProfilePath() || '',
    sourceDir: resolve(import.meta.dirname, 'dist'),
  })
  const { extensionRunners } = run
  const [runner] = extensionRunners
  runner.runningInfo.firefox.on('close', () => {
    console.log('Cleaning up and stopping process.\n')
    process.exit(0)
  })
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
