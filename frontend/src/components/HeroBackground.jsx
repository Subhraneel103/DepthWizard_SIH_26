import { useEffect, useRef } from 'react'

/**
 * HeroBackground
 * Layers (back → front):
 *  1. Pure #0a0a0a base
 *  2. Fine dot grid — neutral gray
 *  3. Horizontal scanlines — depth texture
 *  4. Diagonal cross-hatch — subtle grain
 *  5. Edge vignette
 *  6. Drifting gray orb — top-left
 *  7. Drifting gray orb — bottom-right
 *  8. Mouse-following radial glow — neutral gray (R=G=B, zero color cast)
 */
export default function HeroBackground() {
  const glowRef = useRef(null)

  useEffect(() => {
    const el = glowRef.current
    if (!el) return

    let raf
    let tx = window.innerWidth / 2
    let ty = window.innerHeight / 2
    let cx = tx
    let cy = ty

    const onMove = (e) => {
      tx = e.clientX
      ty = e.clientY
    }

    const loop = () => {
      // Lerp — smooth lag
      cx += (tx - cx) * 0.07
      cy += (ty - cy) * 0.07
      // Strictly neutral gray (R=G=B) — no possible color cast
      el.style.background = `
        radial-gradient(500px circle at ${cx}px ${cy}px,
          rgba(155, 155, 155, 0.07) 0%,
          rgba(130, 130, 130, 0.04) 38%,
          rgba(100, 100, 100, 0.015) 60%,
          transparent 72%
        )
      `
      raf = requestAnimationFrame(loop)
    }

    window.addEventListener('mousemove', onMove)
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <>
      {/* ── Layer 1: Pure black base ── */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: -40, background: '#0a0a0a' }}
      />

      {/* ── Layer 2: Fine dot grid — 30px pitch, neutral gray ── */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: -30,
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)`,
          backgroundSize: '30px 30px',
        }}
      />

      {/* ── Layer 3: Horizontal scanlines — 4px repeat ── */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: -29,
          backgroundImage: `repeating-linear-gradient(
            0deg,
            rgba(255,255,255,0.012) 0px,
            rgba(255,255,255,0.012) 1px,
            transparent 1px,
            transparent 4px
          )`,
        }}
      />

      {/* ── Layer 4: Diagonal cross-hatch — subtle depth ── */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: -28,
          backgroundImage: `repeating-linear-gradient(
            45deg,
            rgba(255,255,255,0.008) 0px,
            rgba(255,255,255,0.008) 1px,
            transparent 1px,
            transparent 18px
          )`,
        }}
      />

      {/* ── Layer 5: Edge vignette — darkens corners ── */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: -20,
          background: `radial-gradient(
            ellipse 88% 78% at 50% 50%,
            transparent 38%,
            rgba(0, 0, 0, 0.72) 100%
          )`,
        }}
      />

      {/* ── Layer 6: Drifting orb — top-left, medium gray ── */}
      <div
        aria-hidden="true"
        className="fixed pointer-events-none orb-1"
        style={{
          zIndex: -18,
          width: '62vw',
          height: '62vw',
          maxWidth: 740,
          maxHeight: 740,
          borderRadius: '50%',
          top: '-20%',
          left: '-14%',
          background: 'radial-gradient(circle, rgba(90,90,90,0.13) 0%, rgba(60,60,60,0.05) 50%, transparent 70%)',
          filter: 'blur(14px)',
        }}
      />

      {/* ── Layer 7: Drifting orb — bottom-right, dark gray ── */}
      <div
        aria-hidden="true"
        className="fixed pointer-events-none orb-2"
        style={{
          zIndex: -18,
          width: '56vw',
          height: '56vw',
          maxWidth: 680,
          maxHeight: 680,
          borderRadius: '50%',
          bottom: '-18%',
          right: '-12%',
          background: 'radial-gradient(circle, rgba(70,70,70,0.12) 0%, rgba(50,50,50,0.04) 50%, transparent 68%)',
          filter: 'blur(14px)',
        }}
      />

      {/* ── Layer 8: Mouse-following gray glow ── */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: -10 }}
      />
    </>
  )
}
