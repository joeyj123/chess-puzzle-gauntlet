import { useEffect } from 'react'

// Shrinks the given element (via CSS `zoom`) just enough to eliminate
// horizontal overflow, so nothing gets clipped on narrow phone screens.
// No-ops (and stays at zoom 1) on screens wide enough to fit naturally —
// desktop/tablet layouts are unaffected.
export function useFitToScreen(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = null

    const fit = () => {
      // Reset before measuring so we don't compound previous shrinks.
      el.style.zoom = 1

      frame = requestAnimationFrame(() => {
        const viewportWidth = window.innerWidth
        const contentWidth = document.documentElement.scrollWidth
        if (contentWidth > viewportWidth + 1) {
          const scale = Math.max(0.7, viewportWidth / contentWidth)
          el.style.zoom = scale
        } else {
          el.style.zoom = ''
        }
      })
    }

    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
    }
  }, [ref])
}
