import autoprefixer from 'autoprefixer'
import clean from 'esbuild-plugin-clean'
import style from 'esbuild-style-plugin'
import { cpSync, readFileSync, writeFileSync } from 'fs'
import jsonMin from 'jsonminify'
import { resolve } from 'path'
import tailwindcss from 'tailwindcss'

/**
 * @type {import('esbuild').BuildOptions}
 */
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
    copyAsset(),
  ],
  target: 'es2016',
  treeShaking: true,
}

/**
 * Get the entry points for the esbuild configuration.
 * @returns {Array<{in: string, out: string}>} Array of entry points.
 */
function getEntryPoints() {
  const _resolve = (path) => 'src/' + path
  return [
    { in: _resolve('injection.ts'), out: 'injection' },
    { in: _resolve('manifest.json'), out: 'manifest' },
    { in: _resolve('app/main.tsx'), out: 'main' },
  ]
}

/**
 * Plugin to strip unnecessary content from the manifest file.
 * @returns {import('esbuild').Plugin} The esbuild plugin.
 */
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

/**
 * Plugin to copy assets from 'src' to 'dist'.
 * @returns {import('esbuild').Plugin} The esbuild plugin.
 */
function copyAsset() {
  return {
    name: 'copy-asset',
    setup: ({ onEnd }) =>
      onEnd(() => {
        try {
          const _resolve = (dir) => resolve(import.meta.dirname, '..', dir, 'asset')
          cpSync(_resolve('src'), _resolve('dist'), { recursive: true })
        } catch {}
      }),
  }
}
