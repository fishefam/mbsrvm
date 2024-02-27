import esbuild from 'esbuild'

import { BASE_PLUGIN_PARAM } from './_constant.js'
import { interpolateManifestHosts, prod_stripHTML } from './_plugin.js'
import { getOption } from './_util.js'
import BASE_OPTION from './baseconfig.js'

main()

function main() {
  const { SOURCE_MAP } = process.env
  const sourcemap = getOption(!!SOURCE_MAP, 'sourcemap', true)
  const customPlugins = [interpolateManifestHosts, prod_stripHTML].map((cb) => cb(BASE_PLUGIN_PARAM))
  esbuild.build({
    ...BASE_OPTION,
    ...sourcemap,
    minify: true,
    plugins: [...BASE_OPTION.plugins, ...customPlugins],
  })
}
