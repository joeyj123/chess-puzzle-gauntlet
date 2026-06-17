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
    QRCodeLib.toCanvas(ref.current, url, {
      width: size,
      margin: 2,
      color: { dark: '#ffffff', light: '#1a1a2e' },
    }).catch(() => {
      // silently ignore if canvas rendering fails
    })
  }, [url, size])

  return <canvas ref={ref} className="qr-canvas" />
}
