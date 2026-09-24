import { describe, expect, it } from 'vitest'
import { addAnnotation, newId, removeAnnotation, reorder, replaceAnnotation } from '@renderer/lib/doc'
import type { Annotation } from '@renderer/lib/types'

const rect = (id: string): Annotation => ({
  id,
  type: 'rect',
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  fill: 'none',
  color: '#e5372b',
  strokeWidth: 4,
  opacity: 1
})

const ids = (list: Annotation[]) => list.map((a) => a.id)
const list = [rect('a'), rect('b'), rect('c'), rect('d')]

describe('doc', () => {
  it('adds on top and replaces in place', () => {
    const added = addAnnotation(list, rect('e'))
    expect(ids(added)).toEqual(['a', 'b', 'c', 'd', 'e'])
    const moved = { ...rect('b'), x: 5 }
    const replaced = replaceAnnotation(list, moved)
    expect(replaced[1]).toBe(moved)
    expect(replaceAnnotation(list, rect('zz'))).toBe(list)
  })

  it('removes by id and returns the same list when nothing matches', () => {
    expect(ids(removeAnnotation(list, 'b'))).toEqual(['a', 'c', 'd'])
    expect(removeAnnotation(list, 'nope')).toBe(list)
  })

  it('reorders forward, backward, to front and to back', () => {
    expect(ids(reorder(list, 'b', 'forward'))).toEqual(['a', 'c', 'b', 'd'])
    expect(ids(reorder(list, 'c', 'backward'))).toEqual(['a', 'c', 'b', 'd'])
    expect(ids(reorder(list, 'a', 'front'))).toEqual(['b', 'c', 'd', 'a'])
    expect(ids(reorder(list, 'd', 'back'))).toEqual(['d', 'a', 'b', 'c'])
  })

  it('returns the same list when a reorder is a no-op', () => {
    expect(reorder(list, 'd', 'forward')).toBe(list)
    expect(reorder(list, 'a', 'back')).toBe(list)
    expect(reorder(list, 'missing', 'front')).toBe(list)
  })

  it('makes unique ids', () => {
    const set = new Set(Array.from({ length: 1000 }, newId))
    expect(set.size).toBe(1000)
  })
})
