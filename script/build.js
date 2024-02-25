import esbuild from 'esbuild'

import BASE_OPTION from './.esbuildrc.js'

main()

function main() {
  const { SOURCE_MAP } = process.env
  const sourcemap = getOption(!!SOURCE_MAP, 'sourcemap', true)
  esbuild.build({
    ...BASE_OPTION,
    ...sourcemap,
    minify: true,
  })
}

/**
 *
 * @template {import('esbuild').BuildOptions} T
 * @template {keyof T} U
 * @param {boolean} condition
 * @param {U} key
 * @param {T[U]} value
 * @returns {{[key in U]: T[U]}}
 */
function getOption(condition, key, value) {
  return condition ? { [key]: value } : {}
}
