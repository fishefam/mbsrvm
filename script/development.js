import getPort from 'detect-port'
import esbuild from 'esbuild'

import { BASE_PLUGIN_PARAM } from './_constant.js'
import { dev_inlinecss, dev_webext, interpolateManifestHosts } from './_plugin.js'
import { checkConnection } from './_util.js'
import BASE_OPTION from './baseconfig.js'

main()

/**
 * Entry point function.
 */
async function main() {
  /** @type {import("./_plugin.js").TPluginParam1} */
  const controller = {
    isDevMode: true,
    isInit: true,
    isNetworkConnected: await checkConnection(),
    port: await getPort(7000),
  }
  const customPlugins = [interpolateManifestHosts, dev_webext, dev_inlinecss].map((cb) =>
    cb({ ...BASE_PLUGIN_PARAM, ...controller }),
  )
  const context = await esbuild.context({
    ...BASE_OPTION,
    plugins: [...BASE_OPTION.plugins, ...customPlugins],
    sourcemap: true,
  })
  if (!controller.isNetworkConnected) console.log('\nNetwork connection not available. Starting in offline mode...')
  if (controller.isNetworkConnected) console.log('\nStarting...')
  context.serve({ port: controller.port })
  context.watch()
}
