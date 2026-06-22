import confetti from 'canvas-confetti'

// We use a dedicated full-viewport canvas so that origin fractions are always
// relative to the true viewport — canvas-confetti's default canvas uses
// document.documentElement.clientWidth/Height which can drift from the visible
// area due to scrollbars or mobile safe-area quirks.
//
// Critical: we must set canvas.width / canvas.height (the PIXEL BUFFER, not
// just the CSS size) to match the viewport.  Without this the buffer defaults
// to 300×150 px, so origin: { x: 0.5 } maps to pixel 150 of a 300px buffer —
// which, when the CSS stretches the canvas to e.g. 1400px wide, lands at
// 150/1400 ≈ 0.11 of the viewport (far left corner on desktop).
let instance = null
let canvas   = null

function syncCanvasSize() {
  if (!canvas) return
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
}

function getInstance() {
  if (instance) return instance
  canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;width:100%;height:100%'
  syncCanvasSize()
  document.body.appendChild(canvas)
  window.addEventListener('resize', syncCanvasSize)
  instance = confetti.create(canvas, { resize: true, useWorker: true })
  return instance
}

/**
 * Fire confetti centred on `el` (a DOM element or React ref).
 * Falls back to viewport centre if `el` is unavailable.
 * `options.origin` can still override x/y individually.
 */
export function fireConfettiFromElement(el, options = {}) {
  const node = el && 'current' in el ? el.current : el
  let x = 0.5
  let y = 0.5
  if (node && typeof node.getBoundingClientRect === 'function') {
    const rect = node.getBoundingClientRect()
    if (rect.width || rect.height) {
      x = (rect.left + rect.width  / 2) / window.innerWidth
      y = (rect.top  + rect.height / 2) / window.innerHeight
    }
  }
  const { origin, ...rest } = options
  getInstance()({ ...rest, origin: { x, y, ...origin } })
}
