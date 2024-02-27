import _clean from 'esbuild-plugin-clean'
import _style from 'esbuild-style-plugin'
import { cpSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import _stripHTMLComment from 'strip-html-comments'

// eslint-disable-next-line unused-imports/no-unused-imports
import * as TConstant from './_constant.js'
import { createOnEndPlugin, formatHTML, resolvePaths, startWebext, stripFileContent } from './_util.js'

/**
 * @typedef {{
 *  browser: TConstant['BROWSER'],
 *  browsers: TConstant['BROWSERS'],
 *  devHost: TConstant['DEV_HOST'],
 *  devHosts: TConstant['DEV_HOSTS'],
 *  devStyleBlock: TConstant['DEV_STYLE_BLOCK'],
 *  devStyleBlock: TConstant['DEV_STYLE_BLOCK'],
 *  indexHTML: TConstant['INDEX_HTML'],
 *  manifestMatchDevHosts: TConstant['MANIFEST_MATCH_DEV_HOSTS'],
 *  manifestMatchHosts: TConstant['MANIFEST_MATCH_HOSTS'],
 *  outdir: TConstant['OUT_DIR']
 *  reactEntryFile: TConstant['REACT_ENTRY_FILE'],
 *  srcdir: TConstant['SOURCE_DIR'],
 *  staticdir: TConstant['STATIC_DIR'],
 * }} TPluginParam0
 * @typedef {{isInit: boolean, port: number, isDevMode?: boolean, isNetworkConnected: boolean}} TPluginParam1
 */
export const pluginTypeDef = {}

/* =========================================== SHARED PLUGINS =============================================== */

/* Re-export plugins from node for style consistency purpose */

export const clean = _clean
export const style = _style

/**
 * Plugin to copy index.html to out dir on build end
 * @param {TPluginParam0} param Object that contains all required information
 */
export function copyIndexHTML(param) {
  return createOnEndPlugin('copy-index-html', () => {
    const { browsers, outdir, srcdir } = param
    const resolve = (dir) => resolvePaths(dir, 'index.html')
    for (const browser of browsers) cpSync(resolve(srcdir), resolve(`${outdir}/${browser}`))
  })
}

/**
 * Plugin to copy manifest to out dir on build end
 * @param {TPluginParam0} param Object that contains all required information
 */
export function copyManifest(param) {
  return createOnEndPlugin('copy-manifest', () => {
    const { browsers, outdir, srcdir } = param
    const resolve = (dir, file) => resolvePaths(dir, file)
    for (const browser of browsers)
      cpSync(resolve(`${srcdir}/manifest`, `${browser}.json`), resolve(`${outdir}/${browser}`, 'manifest.json'))
  })
}

/**
 * Plugin to copy static folder that contains asset to out dir on build end.
 * @param {TPluginParam0} param Object that contains all required information
 */
export function copyStatic(param) {
  return createOnEndPlugin('copy-static', () => {
    const { browsers, outdir, srcdir, staticdir } = param
    const resolve = (dir = '') => resolvePaths(dir, staticdir)
    for (const browser of browsers) cpSync(resolve(srcdir), resolve(`${outdir}/${browser}`), { recursive: true })
  })
}

/**
 * Plugin to strip all development props from manifest files on build end.
 * @param {TPluginParam0} param Object that contains all required information
 */
export function stripManifest(param) {
  return createOnEndPlugin('strip-manifest', () => {
    const { browsers, outdir } = param
    for (const browser of browsers)
      stripFileContent({
        path: [outdir, browser, 'manifest.json'],
        pattern: /"\$schema":\s*"https:\/\/json.schemastore.org\/chrome-manifest.json",?/g,
        type: 'json',
      })
  })
}

/**
 * Plugin to strip comment from html files on build end. Root files only (non-recursive).
 * @param {TPluginParam0} param Object that contains all required information
 */
export function stripHTMLComment(param) {
  return createOnEndPlugin('strip-html-comment', () => {
    const { browsers, outdir } = param
    for (const browser of browsers) {
      const htmls = readdirSync(`${outdir}/${browser}`).filter((file) => /\.htm/.test(file))
      for (const file of htmls)
        stripFileContent({
          path: [outdir, browser, file],
          processor: _stripHTMLComment,
          type: 'html',
        })
    }
  })
}

/**
 * Plugin to cleanup after build ends.
 * @param {TPluginParam0 & TPluginParam1} param Object that contains all required information
 */
export function interpolateManifestHosts(param) {
  return createOnEndPlugin('interpolate-manifest-host', () => {
    const { browsers, isDevMode, manifestMatchDevHosts, manifestMatchHosts, outdir } = param
    for (const browser of browsers) {
      const hosts = isDevMode ? [...manifestMatchDevHosts, ...manifestMatchHosts] : manifestMatchHosts
      const path = resolvePaths(outdir, browser, 'manifest.json')
      const content = readFileSync(path, { encoding: 'utf-8' })
      const interpolatedContent = content.replace(
        /"matches": \[.*%%DO_NOT_CHANGE_THIS_LINE%%.*\]/,
        `"matches": [${hosts.map((host) => `"${host}"`).join(', ')}]`,
      )
      writeFileSync(path, interpolatedContent)
    }
  })
}

/**
 * Plugin to cleanup after build ends.
 * @param {TPluginParam0} param Object that contains all required information
 */
export function cleanup(param) {
  return createOnEndPlugin('clean-up', () => {
    const { outdir } = param
    const items = readdirSync(outdir)
    for (const item of items)
      try {
        const path = resolvePaths(outdir, item)
        readFileSync(path)
        unlinkSync(path)
      } catch (error) {
        /* empty */
      }
  })
}

/* =========================================== DEVELOPMENT PLUGINS =============================================== */

/**
 * Plugin to start web-ext with Firefox on build end
 * @param {TPluginParam0 & TPluginParam1} param Object that contains all required information
 */
export function dev_webext(param) {
  return createOnEndPlugin('web-ext', () => {
    const { browser, devHost, isInit, isNetworkConnected, outdir, port } = param
    if (isInit)
      startWebext({
        browser: browser.firefox,
        devHost: isNetworkConnected ? devHost.host0 : `${devHost.localhost}:${port}`,
        outdir,
      })
    param.isInit = false
  })
}

/**
 * Plugin to inline css to index.html on build end
 * @param {TPluginParam0 & TPluginParam1} param Object that contains all required information
 */
export function dev_inlinecss(param) {
  return createOnEndPlugin('inline-css', () => {
    const { browsers, devStyleBlock, indexHTML, isNetworkConnected, outdir, reactEntryFile } = param
    if (isNetworkConnected)
      for (const browser of browsers) {
        const cssPath = resolvePaths(outdir, browser, reactEntryFile.replace('tsx', 'css'))
        const css = readFileSync(cssPath, { encoding: 'utf-8' })
        const styleBlock = devStyleBlock.replace('</style>', '') + css + '</style>'

        const htmlPath = resolvePaths(outdir, browser, indexHTML)
        const html = readFileSync(htmlPath, { encoding: 'utf-8' })
        const cssInlinedHTML = formatHTML(html.replace(/<.*"%%CSS%%".*>/, '').replace('<head>', `<head>${styleBlock}`))
        writeFileSync(htmlPath, cssInlinedHTML)
      }
  })
}

/* =========================================== PRODUCTION PLUGINS =============================================== */

/**
 * Plugin to strip the development <style> block from index.html on build end
 * @param {TPluginParam0} param Object that contains all required information
 */
export function prod_stripHTML(param) {
  return createOnEndPlugin('strip-html', () => {
    const { browsers, devStyleBlock, outdir } = param
    for (const browser of browsers) {
      stripFileContent({
        path: [outdir, browser, 'index.html'],
        pattern: new RegExp(devStyleBlock, 'g'),
        type: 'html',
      })
    }
  })
}
