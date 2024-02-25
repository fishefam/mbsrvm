import autoprefixer from 'autoprefixer'
import clean from 'esbuild-plugin-clean'
import style from 'esbuild-style-plugin'
import { readFileSync, writeFileSync } from 'fs'
import jsonMin from 'jsonminify'
import { resolve } from 'path'
import tailwindcss from 'tailwindcss'

export default {
  bundle: true,
  entryPoints: getEntryPoints(),
  format: 'iife',
  jsx: 'transform',
  loader: { '.json': 'copy' },
  logLevel: 'info',
  outdir: 'dist',
  plugins: [
    clean({ patterns: 'dist' }),
    style({ postcss: { plugins: [autoprefixer(), tailwindcss()] } }),
    stripManifest(),
  ],
  target: 'es2016',
  treeShaking: true,
}

function getEntryPoints() {
  const _resolve = (path) => 'src/' + path
  return [
    { in: _resolve('injection.ts'), out: 'injection' },
    { in: _resolve('manifest.json'), out: 'manifest' },
    { in: _resolve('app/main.tsx'), out: 'main' },
  ]
}

/** @returns {import('esbuild').Plugin} */
function stripManifest() {
  return {
    name: 'clean-manifest',
    setup: ({ onEnd }) =>
      onEnd(() => {
        const manifestPath = resolve(import.meta.dirname, '..', 'dist', 'manifest.json')
        const manifest = readFileSync(manifestPath, { encoding: 'utf-8' })
        const strippedManifest = manifest.replace('"$schema": "https://json.schemastore.org/chrome-manifest.json",', '')
        writeFileSync(manifestPath, jsonMin(strippedManifest))
      }),
  }
}
