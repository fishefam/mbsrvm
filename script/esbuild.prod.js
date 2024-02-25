import esbuild from 'esbuild'

import BASE_OPTION from './esbuild.config.js'

esbuild.build({
  ...BASE_OPTION,
  minify: true,
})
