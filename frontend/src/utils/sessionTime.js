// sessionTime.js — centralised session timing logic
// All canJoinNow / window calculations go here. No Supabase calls. Pure JS.

function resolvePreJoinMs(session, platformConfig, isHost) {
  if (isHost) {
    const mins = session.host_pre_join_minutes_override
      ?? platformConfig?.host_pre_join_minutes
      ?? 15
    return mins * 60000
  }
  const mins = session.guest_pre_join_minutes_override
    ?? platformConfig?.guest_pre_join_minutes
    ?? 5
  return mins * 60000
}

function resolveGraceMs(session, platformConfig, isHost) {
  if (isHost) {
    const mins = session.host_grace_minutes_override
      ?? platformConfig?.host_grace_minutes
      ?? 30
    return mins * 60000
  }
  const mins = session.guest_grace_minutes_override
    ?? platformConfig?.guest_grace_minutes
    ?? 15
  return mins * 60000
}

/**
 * getActivePart(session)
 *
 * For single sessions: returns null.
 * For series sessions: returns the part whose window is currently open,
 * or if none is open, returns the next upcoming part (smallest start > now).
 * If all parts are in the past, returns null.
 *
 * NOTE: does not need platformConfig — time window checks use a zero buffer here.
 * Callers that need buffer-aware checks should use canJoinNow / getSessionWindow.
 */
export function getActivePart(session) {
  if (session.session_type !== 'series') return null

  const parts = session.series_parts
  if (!Array.isArray(parts) || parts.length === 0) return null

  const now = Date.now()

  // Check if any part window is open (using raw start+duration, no buffers here)
  for (const part of parts) {
    const partStart = new Date(part.start).getTime()
    const partEnd = partStart + (part.duration_minutes || 60) * 60000
    if (now >= partStart && now <= partEnd) return part
  }

  // No window open — find the next upcoming part
  const futureParts = parts
    .filter(p => new Date(p.start).getTime() > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return futureParts[0] || null
}

/**
 * canJoinNow(session, platformConfig, isHost)
 *
 * Returns true if the current time is within the join window.
 * For single sessions: uses scheduled_at + duration_minutes.
 * For series sessions: returns true if ANY part window is currently open.
 */
export function canJoinNow(session, platformConfig, isHost) {
  const preJoinMs = resolvePreJoinMs(session, platformConfig, isHost)
  const graceMs = resolveGraceMs(session, platformConfig, isHost)
  const now = Date.now()

  if (session.session_type !== 'series') {
    const sessionStart = new Date(session.scheduled_at).getTime()
    const sessionEnd = sessionStart + (session.duration_minutes || 60) * 60000
    return now >= sessionStart - preJoinMs && now <= sessionEnd + graceMs
  }

  // series: open if any part window is active
  const parts = session.series_parts
  if (!Array.isArray(parts) || parts.length === 0) return false

  for (const part of parts) {
    const partStart = new Date(part.start).getTime()
    const partEnd = partStart + (part.duration_minutes || 60) * 60000
    if (now >= partStart - preJoinMs && now <= partEnd + graceMs) return true
  }

  return false
}

/**
 * getSessionWindow(session, platformConfig, isHost)
 *
 * Returns:
 *   { windowStart, windowEnd, activePart, nextPart, allDone }
 *
 * For single sessions:
 *   windowStart/windowEnd from scheduled_at + duration_minutes (no buffer — raw window)
 *   activePart = null, nextPart = null, allDone = whether grace has passed
 *
 * For series sessions:
 *   windowStart/windowEnd of the currently active or next upcoming part (raw, no buffer)
 *   activePart = the part whose window is open right now (or null)
 *   nextPart = the next part that hasn't started yet (or null)
 *   allDone = true if all parts are past their grace window
 */
export function getSessionWindow(session, platformConfig, isHost) {
  const graceMs = resolveGraceMs(session, platformConfig, isHost)
  const now = Date.now()

  if (session.session_type !== 'series') {
    const sessionStart = new Date(session.scheduled_at).getTime()
    const sessionEnd = sessionStart + (session.duration_minutes || 60) * 60000
    const allDone = now > sessionEnd + graceMs
    return {
      windowStart: sessionStart,
      windowEnd: sessionEnd,
      activePart: null,
      nextPart: null,
      allDone,
    }
  }

  const parts = session.series_parts
  if (!Array.isArray(parts) || parts.length === 0) {
    return { windowStart: null, windowEnd: null, activePart: null, nextPart: null, allDone: true }
  }

  const preJoinMs = resolvePreJoinMs(session, platformConfig, isHost)

  let activePart = null
  let nextPart = null

  for (const part of parts) {
    const partStart = new Date(part.start).getTime()
    const partEnd = partStart + (part.duration_minutes || 60) * 60000
    if (now >= partStart - preJoinMs && now <= partEnd + graceMs) {
      activePart = part
      break
    }
  }

  const futureParts = parts
    .filter(p => new Date(p.start).getTime() > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  nextPart = futureParts[0] || null

  // allDone: every part is past its grace window
  const allDone = parts.every(p => {
    const partStart = new Date(p.start).getTime()
    const partEnd = partStart + (p.duration_minutes || 60) * 60000
    return now > partEnd + graceMs
  })

  const targetPart = activePart || nextPart
  const windowStart = targetPart ? new Date(targetPart.start).getTime() : null
  const windowEnd = targetPart
    ? new Date(targetPart.start).getTime() + (targetPart.duration_minutes || 60) * 60000
    : null

  return { windowStart, windowEnd, activePart, nextPart, allDone }
}
