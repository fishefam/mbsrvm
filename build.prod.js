import esbuild from 'esbuild'

import BASE_OPTION from './build.config.js'

esbuild.build({
  ...BASE_OPTION,
  minify: true,
})
