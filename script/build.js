import esbuild from 'esbuild'

import BASE_OPTION from './.esbuildrc.js'

main()

function main() {
  esbuild.build({
    ...BASE_OPTION,
    minify: true,
  })
}
