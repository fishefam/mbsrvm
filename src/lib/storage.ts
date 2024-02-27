import { TStorage, TStorageKey } from 'typing/storage'

import { getAllLocalStorageItem, getLocalStorageItem, setLocalStorageItem } from './generic'

export function getStorage<T extends TStorageKey>(...keys: T[]): { [key in T]: TStorage[T] } {
  if (keys.length) {
    const keySet = [...new Set(keys)].sort()
    const result = {} as { [key in T]: string }
    for (const key of keySet) result[key] = getLocalStorageItem(key)[key] ?? ''
    return result as { [key in T]: TStorage[T] }
  }
  return getAllLocalStorageItem() as { [key in T]: string } as { [key in T]: TStorage[T] }
}

export function setStorage<T extends TStorageKey>(...items: [T, string][]) {
  setLocalStorageItem(...items)
}

export function initStorage() {
  const theme: TStorage['theme'] = getStorage('withModernUI').withModernUI.length
    ? getStorage('theme').theme
    : window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  const codeEditorPlacement: TStorage['codeEditorPlacement'] = getStorage('codeEditorPlacement').codeEditorPlacement
    .length
    ? getStorage('codeEditorPlacement').codeEditorPlacement
    : 'left'
  const withModernUI: TStorage['withModernUI'] = getStorage('withModernUI').withModernUI.length
    ? getStorage('withModernUI').withModernUI
    : 'true'
  const items: TStorage = {
    algorithm: '',
    authorNoteCSS: '',
    authorNoteHTML: '',
    authorNoteJS: '',
    authorNoteSlateValue: '',
    classID: '',
    codeEditorPlacement,
    documentName: '',
    extensionURL: '',
    feedbackCSS: '',
    feedbackHTML: '',
    feedbackJS: '',
    feedbackSlateValue: '',
    hash: '',
    permission: '',
    questionCSS: '',
    questionHTML: '',
    questionJS: '',
    questionSlateValue: '',
    securityToken: '',
    theme,
    username: '',
    uuid: '',
    withModernUI,
  }
  setLocalStorageItem(...Object.entries(items))
}
