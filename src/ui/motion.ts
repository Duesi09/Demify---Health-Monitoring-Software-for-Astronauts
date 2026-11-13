'use client'

import { createContext, useContext } from 'react'

/** Milliseconds one mission day lasts while the time-lapse plays. */
export const TIMELAPSE_STEP_MS = 180

/**
 * True while the time-lapse is playing. Components use it to move in step
 * with the playback instead of running their usual, slower animations.
 */
export const PlaybackContext = createContext(false)

export function usePlaying(): boolean {
  return useContext(PlaybackContext)
}
