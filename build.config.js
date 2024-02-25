import autoprefixer from 'autoprefixer'
import clean from 'esbuild-plugin-clean'
import style from 'esbuild-style-plugin'
import tailwindcss from 'tailwindcss'

export default {
  bundle: true,
  entryPoints: getEntryPoints(),
  format: 'iife',
  jsx: 'transform',
  loader: { '.json': 'copy' },
  logLevel: 'info',
  outdir: 'dist',
  plugins: [clean({ patterns: 'dist' }), style({ postcss: { plugins: [autoprefixer(), tailwindcss()] } })],
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
