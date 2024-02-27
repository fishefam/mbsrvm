import { type ClassValue, clsx } from 'clsx'
import { Options } from 'prettier'
import babel from 'prettier/plugins/babel'
import estree from 'prettier/plugins/estree'
import html from 'prettier/plugins/html'
import css from 'prettier/plugins/postcss'
import typescript from 'prettier/plugins/typescript'
import { format } from 'prettier/standalone'
import { twMerge } from 'tailwind-merge'
import { TCodeLang } from 'typing/generic'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLocalStorageItem<T extends string>(...keys: T[]) {
  const result: { [key in T]?: string } = {}
  for (const key of keys) {
    const value = localStorage.getItem(key)
    if (value) result[key] = value
  }
  return result
}

export function getAllLocalStorageItem() {
  return { ...localStorage } as { [key: string]: string }
}

export function clearLocalStorage() {
  localStorage.clear()
}

export function setLocalStorageItem(...items: [string, string][]) {
  for (const [key, value] of items) localStorage.setItem(key, value)
}

export function resolveExtensionURL(path: string) {
  if (chrome) return chrome.runtime.getURL(path)
  return browser.runtime.getURL(path)
}

export function extractObject<K extends 'key-values' | 'keys' | 'values', T extends string, U>(
  object: Record<T, U>,
  target: K,
): K extends 'keys' ? T[] : K extends 'values' ? U[] : K extends 'key-values' ? [T, U][] : [] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result = [] as any
  if (target === 'keys') result = Object.keys(object)
  if (target === 'values') result = Object.values(object)
  if (target === 'key-values') result = Object.entries(object)
  return result
}

export function extractFromHTML(input: string, language: Exclude<TCodeLang, 'ALGORITHM'>) {
  if (language === 'CSS') return trimHTMLSpace((input.match(/(?<=<style.*>)(.|\n)*?(?=<\/style>)/g) ?? []).join(' '))

  const dom = new DOMParser().parseFromString(input, 'text/html').body
  const elements = Array.from(dom.children).filter(({ nodeName }) =>
    language === 'HTML' ? nodeName !== 'SCRIPT' : nodeName === 'SCRIPT',
  ) as HTMLElement[]
  const htmls = elements.map(({ innerHTML, outerHTML }) => (language === 'HTML' ? outerHTML : innerHTML))
  return language === 'HTML' ? trimHTMLSpace(htmls.join('').replace(/<style.*>(.|\n)*?<\/style>/g, '')) : htmls.join('')
}

export function prettier(input: string, language: TCodeLang) {
  const option: Options = {
    parser: language === 'HTML' ? 'html' : language === 'CSS' ? 'css' : 'typescript',
    plugins: language === 'HTML' ? [babel, estree, html] : language === 'CSS' ? [css] : [typescript, estree, babel],
  }

  try {
    return format(input, { ...option, htmlWhitespaceSensitivity: 'strict', printWidth: 120 })
  } catch {
    return input
  }
}

export function trimHTMLSpace(html: string) {
  let result = html
  const matches = html.match(/(\s|\n|\r\|\r\n|\t)*<[^>]*>(\s|\n|\r\|\r\n|\t)*/gi)
  if (matches) for (const match of matches) result = result.replace(match, match.trim()).trim()
  return result.trim()
}
