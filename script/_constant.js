/*
 * RULES:
 *  - All contants are supposed to be used only in main scripting files. Files with '_' prefix are supporting files.
 *  - All paths must be relative to root folder and NOT started with './' or '/'
 *  - All declarations must follow the style of
 *        export const `var` = \/** @type {const} *\/ (value)
 *    for consistency and type hints. Note that the parenthese around the value is important.
 */

/** This is a replacement for __dirname in esmodule and it points to the current `script` direction */
export const DIR_NAME = /** @type {const} */ (import.meta.dirname)

export const BROWSER = /** @type {const} */ ({ chromium: 'chromium', firefox: 'firefox' })
export const BROWSERS = /** @type {const} */ (Object.values(BROWSER))
export const DEV_HOST = /** @type {const} */ ({ host0: 'https://blank.page', localhost: 'http://localhost' })
export const DEV_HOSTS = /** @type {const} */ (Object.values(DEV_HOST))
export const MANIFEST_MATCH_DEV_HOSTS = /** @type {const} */ (DEV_HOSTS.map((host) => host + '/*'))
export const MANIFEST_MATCH_HOSTS = /** @type {const} */ ([
  'https://*.mobius.cloud/*/addquestion',
  'https://*.mobius.cloud/qbeditor/*',
])

export const MANIFEST_DIR = /** @type {const} */ ('manifest')
export const OUT_DIR = /** @type {const} */ ('dist')
export const SOURCE_DIR = /** @type {const} */ ('src')
export const STATIC_DIR = /** @type {const} */ ('asset')

export const REACT_ENTRY_FILE = /** @type {const} */ ('main.tsx')
export const INDEX_HTML = /** @type {const} */ ('index.html')
export const BASE_ENTRIES = /** @type {const} */ (
  [
    { in: 'injection.ts', out: 'injection' },
    { in: 'background.ts', out: 'background' },
    { in: `app/${REACT_ENTRY_FILE}`, out: 'main' },
  ]
    .map((entry) => ({ in: `${SOURCE_DIR}/${entry.in}`, out: entry.out }))
    .concat([{ in: 'index.html', out: '' }])
)

export const DEV_STYLE_BLOCK = /** @type {const} */ ('<style data-env="dev"></style>')

/** @type {import('./_plugin').TPluginParam0} */
export const BASE_PLUGIN_PARAM = {
  browser: BROWSER,
  browsers: BROWSERS,
  devHost: DEV_HOST,
  devHosts: DEV_HOSTS,
  devStyleBlock: DEV_STYLE_BLOCK,
  indexHTML: INDEX_HTML,
  manifestMatchDevHosts: MANIFEST_MATCH_DEV_HOSTS,
  manifestMatchHosts: MANIFEST_MATCH_HOSTS,
  outdir: OUT_DIR,
  reactEntryFile: REACT_ENTRY_FILE,
  srcdir: SOURCE_DIR,
  staticdir: STATIC_DIR,
}
