import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'

import { BASE_ENTRIES, BASE_PLUGIN_PARAM, BROWSERS, OUT_DIR } from './_constant.js'
import {
  clean,
  cleanup,
  copyIndexHTML,
  copyManifest,
  copyStatic,
  stripHTMLComment,
  stripManifest,
  style,
} from './_plugin.js'
import { getEntryPoints } from './_util.js'

const customPlugins = [copyStatic, copyIndexHTML, copyManifest, stripHTMLComment, stripManifest, cleanup].map((cb) =>
  cb(BASE_PLUGIN_PARAM),
)

/** @type {import('esbuild').BuildOptions} */
export default {
  bundle: true,
  entryPoints: getEntryPoints(BROWSERS, BASE_ENTRIES),
  format: 'iife',
  jsx: 'transform',
  loader: { '.html': 'copy' },
  logLevel: 'info',
  outdir: 'dist',
  plugins: [
    clean({ patterns: OUT_DIR }),
    style({ postcss: { plugins: [autoprefixer(), tailwindcss()] } }),
    ...customPlugins,
  ],
  target: 'es2016',
  treeShaking: true,
}
