import esbuild from 'esbuild'

import BASE_OPTION from './.esbuildrc.js'

esbuild.build({
  ...BASE_OPTION,
  minify: true,
})
