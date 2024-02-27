import { createElement } from 'lib/dom'
import { extractFromHTML, extractObject, prettier, resolveExtensionURL } from 'lib/generic'
import { isMobiusDataKey } from 'lib/mobius'
import { getStorage, initStorage, setStorage } from 'lib/storage'
import hash from 'shorthash2'
import { TCodeLang } from 'typing/generic'
import { TMobiusData } from 'typing/mobius'
import { TStorageKey } from 'typing/storage'

main()

async function main() {
  await intercept()
  await prepareStorage()
  injectApp()
  cleanup()
}

function cleanup() {
  console.clear()
}

async function intercept() {
  window.stop()
  document.documentElement.innerHTML = interpolateHTML({
    css: resolveExtensionURL('main.css'),
    favicon: resolveExtensionURL('asset/favicon.ico'),
    html: await getHTMLTemplate(),
  })
}

async function getHTMLTemplate() {
  const response = await fetch(resolveExtensionURL('index.html'))
  return await response.text()
}

function interpolateHTML({ css, favicon, html }: { [key in 'css' | 'favicon' | 'html']: string }) {
  let result = html.slice()
  const interpolationPack = { css, favicon }
  for (const [mark, value] of extractObject(interpolationPack, 'key-values'))
    result = result.replace(`%%${mark.toUpperCase()}%%`, value)
  return result.replace(/<!--(.*?)-->/g, '')
}

function injectApp() {
  createElement({
    attributes: { src: resolveExtensionURL('main.js') },
    parent: document.head,
    tag: 'script',
  })
}

async function prepareStorage() {
  initStorage()
  const { algorithm, authorNotesEditor, classId, commentEditor, editor, name, permission, uid, username } =
    await fetchData()
  const withModernUI = getStorage('withModernUI').withModernUI.length ? getStorage('withModernUI').withModernUI : 'true'

  const _prepareData = (input: string, language: Exclude<TCodeLang, 'ALGORITHM'>) =>
    prettier(extractFromHTML(input, language), language)

  const questionHTML = await _prepareData(editor, 'HTML')
  const questionCSS = await _prepareData(editor, 'CSS')
  const questionJS = await _prepareData(editor, 'JS')

  const feedbackHTML = await _prepareData(commentEditor, 'HTML')
  const feedbackCSS = await _prepareData(commentEditor, 'CSS')
  const feedbackJS = await _prepareData(commentEditor, 'JS')

  const authorNoteHTML = await _prepareData(authorNotesEditor, 'HTML')
  const authorNoteCSS = await _prepareData(authorNotesEditor, 'CSS')
  const authorNoteJS = await _prepareData(authorNotesEditor, 'JS')

  setStorage<TStorageKey>(
    ['algorithm', algorithm],
    ['authorNoteCSS', authorNoteCSS],
    ['authorNoteHTML', authorNoteHTML],
    ['authorNoteJS', authorNoteJS],
    ['classID', classId],
    ['documentName', name],
    ['extensionURL', resolveExtensionURL('')],
    ['feedbackCSS', feedbackCSS],
    ['feedbackHTML', feedbackHTML],
    ['feedbackJS', feedbackJS],
    ['hash', hash(uid)],
    ['permission', permission],
    ['questionCSS', questionCSS],
    ['questionHTML', questionHTML],
    ['questionJS', questionJS],
    ['securityToken', document.cookie.replace('AntiCsrfToken=', '')],
    ['username', username],
    ['uuid', uid],
    ['withModernUI', withModernUI],
  )
}

async function fetchData() {
  const data: TMobiusData & { permission: string; username: string } = {
    algorithm: '',
    authorNotesEditor: '',
    classId: '',
    commentEditor: '',
    editor: '',
    name: '',
    permission: '',
    uid: '',
    username: '',
  }
  if (!/localhost|blank/.test(location.href)) {
    const response = await fetch(location.href)
    const html = await response.text()
    const dom = new DOMParser().parseFromString(html, 'text/html')
    const forms = dom.forms[1] // Exact index of this form from mobius
    const formData = new FormData(forms)
    data.permission = extractUsername(dom, true)
    data.username = extractUsername(dom, false)
    formData.forEach((val, key) => !!val.toString() && isMobiusDataKey(key) && (data[key] = val.toString()))
  }
  return data
}

function extractUsername({ body }: Document, extractPermission = false): string {
  const navbarNodes = Array.from(body.querySelector('#top #global .container')?.childNodes ?? [])
  const textNodes = navbarNodes.filter(({ nodeName }) => nodeName === '#text')
  const username = textNodes.map((s) => s.textContent?.replace(/\n|\t|\|/g, '').trim()).filter((s) => s !== '')[0]
  if (!username) return ''
  if (extractPermission)
    return (
      username
        .match(/\(.*\)/)?.[0]
        .trim()
        .replace(/^\(|\)$/g, '')
        .trim() ?? ''
    )
  return username.replace(/\(.*\)/, '').trim()
}
