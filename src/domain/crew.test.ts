import { describe, expect, it } from 'vitest'
import { CREW, DEFAULT_CREW_ID, findCrewMember, isCrewId } from './crew'

describe('crew', () => {
  it('seeds the default crew member', () => {
    expect(findCrewMember(DEFAULT_CREW_ID)).toEqual({ id: 'morgan', name: 'A. Morgan', role: 'Flight Engineer' })
  })

  it('gives every crew member a well-formed, unique id', () => {
    expect(CREW.every((member) => isCrewId(member.id))).toBe(true)
    expect(new Set(CREW.map((member) => member.id)).size).toBe(CREW.length)
  })

  it('rejects ids that could not be used as a file name or key', () => {
    for (const bad of ['', 'Morgan', '../etc', 'a b', '9lives', 'x'.repeat(33), 7, null, undefined]) {
      expect(isCrewId(bad)).toBe(false)
    }
  })

  it('does not find a crew member who is not on the crew', () => {
    expect(findCrewMember('nobody')).toBeUndefined()
  })
})
