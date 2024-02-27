import { AllHTMLAttributes } from 'react'

export type TTagName = keyof HTMLElementTagNameMap
export type TElementAttribute<T extends TTagName> = keyof AllHTMLAttributes<T>
