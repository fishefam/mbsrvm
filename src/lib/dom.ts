import { TElementAttribute, TTagName } from 'typing/dom'

type TParam_createElement<T extends TTagName> = {
  attributes?: { [key in TElementAttribute<T>]?: string }
  classnames?: string[]
  innerHtml?: string
  isPrepending?: boolean
  parent?: Element | string
  tag: T
  text?: string
}

export function select(selector: string) {
  return document.querySelector(selector)
}

export function createElement<T extends TTagName>(options: TParam_createElement<T>): HTMLElement {
  const { attributes, classnames, innerHtml, isPrepending = false, parent, tag, text } = options
  const element = document.createElement(tag)
  if (innerHtml) element.innerHTML = innerHtml
  if (!innerHtml && text) element.textContent = text
  if (attributes) for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
  if (classnames) element.className = classnames.join(' ')
  if (typeof parent === 'string' && isPrepending) document.querySelector(parent)?.prepend(element)
  if (typeof parent === 'string' && !isPrepending) document.querySelector(parent)?.appendChild(element)
  if (parent instanceof Element && isPrepending) parent.prepend(element)
  if (parent instanceof Element && !isPrepending) parent.appendChild(element)
  return element
}
