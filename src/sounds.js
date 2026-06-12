/**
 * Tiny sound effects generated with the Web Audio API — no audio files needed.
 */

let ctx = null

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq, startTime, duration, type = 'sine', gainPeak = 0.18) {
  const ac = getCtx()
  if (!ac) return
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

/** Short pleasant ding for a correct intermediate move. */
export function playCorrect() {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(660, t, 0.18)
  tone(880, t + 0.06, 0.22)
}

/** Low buzz for a wrong move. */
export function playWrong() {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(160, t, 0.25, 'sawtooth', 0.12)
}

/** Celebratory ascending fanfare for solving a puzzle. */
export function playSolved() {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(523.25, t,        0.18) // C5
  tone(659.25, t + 0.12, 0.18) // E5
  tone(783.99, t + 0.24, 0.30) // G5
}

/** Bright chime for unlocking an achievement/badge. */
export function playAchievement() {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  tone(783.99, t,        0.16, 'triangle', 0.16) // G5
  tone(1046.5, t + 0.10, 0.16, 'triangle', 0.16) // C6
  tone(1318.5, t + 0.20, 0.35, 'triangle', 0.18) // E6
}
