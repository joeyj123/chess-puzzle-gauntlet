import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

/**
 * Renders a QR code for the given URL onto a <canvas> element.
 * Dark-mode styled to match the app's dark background.
 */
export default function QRShareCode({ url, size = 160 }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !url) return
    try {
      // qrcode is a CJS package; toCanvas may live on the default export or the module root
      const toCanvas = QRCodeLib?.toCanvas ?? QRCodeLib?.default?.toCanvas
      if (typeof toCanvas !== 'function') return
      toCanvas(ref.current, url, {
        width: size,
        margin: 2,
        color: { dark: '#ffffff', light: '#1a1a2e' },
      }).catch(() => {})
    } catch {
      // silently ignore — QR code is cosmetic
    }
  }, [url, size])

  return <canvas ref={ref} className="qr-canvas" />
}
