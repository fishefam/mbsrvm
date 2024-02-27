import { TMobiusDataKey } from 'typing/mobius'

export function isMobiusDataKey(key: string): key is TMobiusDataKey {
  const mobiusKeys: TMobiusDataKey[] = [
    'algorithm',
    'authorNotesEditor',
    'classId',
    'commentEditor',
    'editor',
    'name',
    'uid',
  ]
  return mobiusKeys.includes(key as TMobiusDataKey)
}
