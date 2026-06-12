import confetti from 'canvas-confetti'

// Canvas-confetti's default canvas is sized from
// `document.documentElement.clientWidth/Height`, which can drift from the
// actual visible viewport (scrollbars, mobile safe-area quirks, etc.) and
// makes `origin: { x: 0.5 }` land off-center. We use our own canvas pinned
// to the viewport with `inset: 0`, so its rect always matches
// `window.innerWidth/innerHeight` exactly.
let instance = null

function getInstance() {
  if (instance) return instance
  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '9999'
  document.body.appendChild(canvas)
  instance = confetti.create(canvas, { resize: true, useWorker: true })
  return instance
}

/**
 * Fire confetti with its horizontal origin centered on `el` (a DOM element
 * or React ref). Falls back to viewport center if `el` isn't available yet.
 * `options.origin` (if provided) can still override x/y individually.
 */
export function fireConfettiFromElement(el, options = {}) {
  const node = el && 'current' in el ? el.current : el
  let x = 0.5
  let y = 0.5
  if (node && typeof node.getBoundingClientRect === 'function') {
    const rect = node.getBoundingClientRect()
    if (rect.width || rect.height) {
      x = (rect.left + rect.width / 2) / window.innerWidth
      y = (rect.top + rect.height / 2) / window.innerHeight
    }
  }
  const { origin, ...rest } = options
  getInstance()({ ...rest, origin: { x, y, ...origin } })
}
