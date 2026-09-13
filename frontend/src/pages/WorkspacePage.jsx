import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { createPortal } from 'react-dom'
import HeroBackground from '../components/HeroBackground'
import { fromArrayBuffer } from 'geotiff'

const NAVBAR_H = 72

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

// Build a proper display URL from previewPath or storagePath
// Handles: absolute URLs, /uploads/ web paths, and relative filesystem paths
function buildImageUrl(pathStr, baseUrl) {
  if (!pathStr) return null
  if (pathStr.startsWith('http')) return pathStr
  const serverRoot = baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
  if (pathStr.startsWith('/uploads/')) return serverRoot + pathStr
  const filename = pathStr.split(/[/\\]/).pop()
  return serverRoot + '/uploads/' + filename
}

async function apiFetch(url, token, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Error ' + res.status)
  }
  return (await res.json()).data
}

// ─────────────────────────────────────────────────────────────────────────────
// Mouse spotlight card — shared by all panels
// ─────────────────────────────────────────────────────────────────────────────

function GlowCard({ children, style = {}, className = '' }) {
  const ref = useRef(null)
  const onMove = (e) => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--gx', (e.clientX - r.left) + 'px')
    el.style.setProperty('--gy', (e.clientY - r.top) + 'px')
    el.style.setProperty('--go', '1')
  }
  const onLeave = () => { if (ref.current) ref.current.style.setProperty('--go', '0') }

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}
      className={'relative overflow-hidden ' + className}
      style={{ borderRadius: 20, border: '1px solid #1e1e1e', background: '#0b0b0b', ...style }}>
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, borderRadius: 20, pointerEvents: 'none', zIndex: 1,
        background: 'radial-gradient(300px circle at var(--gx) var(--gy), rgba(255,255,255,0.055) 0%, transparent 70%)',
        opacity: 'var(--go, 0)', transition: 'opacity 0.22s',
      }} />
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}

// Sub-box inside a panel — smaller rounded card with inner border
function SubBox({ children, style = {} }) {
  return (
    <div style={{
      borderRadius: 14, border: '1px solid #1c1c1c', background: 'rgba(255,255,255,0.018)',
      padding: '20px 22px', ...style,
    }}>
      {children}
    </div>
  )
}

// Sub-box section heading
function SubBoxTitle({ icon, label }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
      <span className="font-mono text-[10px] uppercase tracking-[0.28em]" style={{ color: '#484848' }}>{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

function PrimaryBtn({ onClick, disabled, children }) {
  return (
    <button onClick={disabled ? undefined : onClick}
      className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold w-full py-3.5"
      style={{
        background: disabled ? '#555' : '#e5e5e5', border: 'none', color: disabled ? '#999' : '#000',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        borderRadius: 10, fontFamily: 'inherit', transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#fff' }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = '#e5e5e5' }}>
      {children}
    </button>
  )
}

function SecondaryBtn({ onClick, disabled, children }) {
  return (
    <button onClick={disabled ? undefined : onClick}
      className="font-mono text-[11px] uppercase tracking-[0.16em] font-bold w-full py-3"
      style={{
        background: 'transparent', border: '1px solid #2a2a2a', color: '#737373',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        borderRadius: 10, fontFamily: 'inherit', transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = '#484848'; e.currentTarget.style.color = '#b0b0b0' } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#737373' }}>
      {children}
    </button>
  )
}

function DataRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-2 gap-3" style={{ borderBottom: '1px solid #141414' }}>
      <span className="font-mono text-[11px]" style={{ color: '#4a4a4a' }}>{label}</span>
      <span className="font-mono text-[12px] font-bold" style={{ color: accent || '#787878' }}>{value}</span>
    </div>
  )
}

function LayerToggle({ label, icon, active, locked, onClick }) {
  return (
    <button onClick={locked ? undefined : onClick}
      className="flex items-center gap-3 w-full text-left py-2.5 px-3 transition-all duration-150"
      style={{
        background: active ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: '1px solid', borderColor: active ? '#2e2e2e' : 'transparent',
        borderRadius: 9, cursor: locked ? 'default' : 'pointer', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { if (!locked && !active) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      <span style={{
        width: 8, height: 8, flexShrink: 0, borderRadius: '50%',
        background: locked ? 'transparent' : active ? '#a1a1aa' : 'transparent',
        border: locked ? '1px solid #282828' : active ? '1px solid #a1a1aa' : '1px solid #353535',
      }} />
      {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
      <span className="font-mono text-[12px]" style={{ color: locked ? '#303030' : active ? '#d4d4d4' : '#585858' }}>
        {label}
      </span>
      {locked && <span className="font-mono text-[9px] ml-auto" style={{ color: '#2a2a2a' }}>🔒</span>}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({ pct, label }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between mb-2">
        <span className="font-mono text-[10px]" style={{ color: '#404040' }}>{label}</span>
        <span className="font-mono text-[10px] font-bold" style={{ color: '#606060' }}>{pct}%</span>
      </div>
      <div style={{ height: 4, background: '#1a1a1a', borderRadius: 6 }}>
        <div style={{ height: '100%', background: '#a1a1aa', borderRadius: 6, width: pct + '%', transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Turbo colormap — 32 control points interpolated at runtime
// Gives beautiful blue→green→yellow→red elevation visualization
// ─────────────────────────────────────────────────────────────────────────────
const TURBO_SRGB = [
  [0.18995,0.07176,0.23217],[0.24984,0.10760,0.33891],[0.31264,0.14676,0.44556],[0.37684,0.18985,0.55277],
  [0.43040,0.23572,0.64625],[0.46818,0.28104,0.72007],[0.49073,0.32607,0.77957],[0.50311,0.37101,0.82248],
  [0.50587,0.41578,0.85082],[0.49995,0.46051,0.86354],[0.48440,0.50520,0.85978],[0.45636,0.55027,0.83827],
  [0.41317,0.59514,0.79905],[0.35788,0.63961,0.74485],[0.29477,0.68337,0.67575],[0.22826,0.72628,0.59575],
  [0.16818,0.76813,0.50903],[0.12074,0.80870,0.43415],[0.09076,0.84780,0.36610],[0.09181,0.88603,0.29810],
  [0.14325,0.91987,0.23925],[0.24309,0.94855,0.19142],[0.38209,0.97261,0.15502],[0.53667,0.99127,0.12970],
  [0.68828,0.99910,0.12311],[0.81421,0.98867,0.15469],[0.90563,0.96013,0.21735],[0.96199,0.91332,0.29969],
  [0.99055,0.84899,0.40266],[0.99810,0.77217,0.52007],[0.98877,0.68534,0.64311],[0.96351,0.59019,0.76688],
]
function turboColor(t) {
  const n = TURBO_SRGB.length - 1
  const idx = Math.min(Math.floor(t * n), n - 1)
  const f   = t * n - idx
  const c0  = TURBO_SRGB[idx]
  const c1  = TURBO_SRGB[Math.min(idx + 1, n)]
  return [
    Math.round((c0[0] + f * (c1[0] - c0[0])) * 255),
    Math.round((c0[1] + f * (c1[1] - c0[1])) * 255),
    Math.round((c0[2] + f * (c1[2] - c0[2])) * 255),
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// DsmHeatmapCanvas — fetches raw .tif, decodes with geotiff.js, renders Turbo
// heatmap to an HTML5 canvas, supports mouse pan + wheel zoom.
// ─────────────────────────────────────────────────────────────────────────────
function DsmHeatmapCanvas({ rasterUrl, dsmData, getToken, serverRoot }) {
  const canvasRef  = useRef(null)
  const wrapRef    = useRef(null)
  // pan/zoom state stored in a ref to avoid re-render on every frame
  const viewRef    = useRef({ ox: 0, oy: 0, scale: 1 })
  const dragRef    = useRef(null)
  const rasterRef  = useRef(null)   // { w, h, minZ, maxZ }

  const [status, setStatus] = useState('idle') // idle | loading | error | ready
  const [errMsg, setErrMsg] = useState('')

  // ── Draw the pre-rendered ImageData buffer onto the display canvas at current pan/zoom ──
  const redraw = useCallback(() => {
    const canvas  = canvasRef.current
    const wrap    = wrapRef.current
    const raster  = rasterRef.current
    if (!canvas || !wrap || !raster) return
    const { width: cw, height: ch } = wrap.getBoundingClientRect()
    canvas.width  = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, cw, ch)
    const { ox, oy, scale } = viewRef.current
    const dw = raster.w * scale
    const dh = raster.h * scale
    ctx.drawImage(raster.bmp, ox, oy, dw, dh)
    // Elevation legend bar
    const barW = 140, barH = 10, barX = 16, barY = ch - 34
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0)
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      const [r, g, b] = turboColor(t)
      grad.addColorStop(t, `rgb(${r},${g},${b})`)
    }
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(barX, barY, barW, barH, 4)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.roundRect(barX - 2, barY - 16, barW + 4, barH + 20, 5)
    ctx.fill()
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect(barX, barY, barW, barH, 4)
    ctx.fill()
    ctx.font = '9px monospace'
    ctx.fillStyle = '#555'
    ctx.fillText(raster.minZ.toFixed(1) + 'm', barX, barY - 3)
    ctx.fillStyle = '#555'
    ctx.textAlign = 'right'
    ctx.fillText(raster.maxZ.toFixed(1) + 'm', barX + barW, barY - 3)
    ctx.textAlign = 'left'
  }, [])

  // ── Fit the raster inside the container on first load ──
  const fitToContainer = useCallback(() => {
    const wrap   = wrapRef.current
    const raster = rasterRef.current
    if (!wrap || !raster) return
    const { width: cw, height: ch } = wrap.getBoundingClientRect()
    const scale = Math.min(cw / raster.w, ch / raster.h) * 0.9
    viewRef.current = {
      scale,
      ox: (cw - raster.w * scale) / 2,
      oy: (ch - raster.h * scale) / 2,
    }
  }, [])

  // ── Fetch + decode GeoTIFF, build an ImageBitmap ──
  useEffect(() => {
    if (!rasterUrl) return
    let cancelled = false
    setStatus('loading')
    ;(async () => {
      try {
        const token = await getToken()
        // rasterUrl may be web-relative like /uploads/dsm_xxx.tif
        const fullUrl = rasterUrl.startsWith('http') ? rasterUrl : serverRoot + rasterUrl
        const res = await fetch(fullUrl, { headers: { Authorization: 'Bearer ' + token } })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const buf  = await res.arrayBuffer()
        const tiff = await fromArrayBuffer(buf)
        const img  = await tiff.getImage()
        const [band] = await img.readRasters({ interleave: false })
        const w = img.getWidth()
        const h = img.getHeight()

        // Use backend stats if available, otherwise scan the band
        let minZ = dsmData?.stats?.minZ ?? dsmData?.minZ ?? Infinity
        let maxZ = dsmData?.stats?.maxZ ?? dsmData?.maxZ ?? -Infinity
        if (!isFinite(minZ) || !isFinite(maxZ)) {
          for (let i = 0; i < band.length; i++) {
            const v = band[i]
            if (isFinite(v) && v > -9999) { minZ = Math.min(minZ, v); maxZ = Math.max(maxZ, v) }
          }
        }
        const range = maxZ - minZ || 1

        // Build RGBA pixel array
        const rgba = new Uint8ClampedArray(w * h * 4)
        for (let i = 0; i < band.length; i++) {
          const v = band[i]
          if (!isFinite(v) || v <= -9999) {
            rgba[i*4] = rgba[i*4+1] = rgba[i*4+2] = 0; rgba[i*4+3] = 0
            continue
          }
          const t = Math.max(0, Math.min(1, (v - minZ) / range))
          const [r, g, b] = turboColor(t)
          rgba[i*4] = r; rgba[i*4+1] = g; rgba[i*4+2] = b; rgba[i*4+3] = 220
        }

        // Paint to an offscreen canvas and convert to ImageBitmap
        const offscreen = document.createElement('canvas')
        offscreen.width = w; offscreen.height = h
        offscreen.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0)
        const bmp = await createImageBitmap(offscreen)

        if (!cancelled) {
          rasterRef.current = { w, h, bmp, minZ, maxZ }
          fitToContainer()
          redraw()
          setStatus('ready')
        }
      } catch (e) {
        if (!cancelled) { setStatus('error'); setErrMsg(e.message) }
      }
    })()
    return () => { cancelled = true }
  }, [rasterUrl, dsmData, getToken, serverRoot, fitToContainer, redraw])

  // ── Re-draw on window resize ──
  useEffect(() => {
    const onResize = () => { fitToContainer(); redraw() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fitToContainer, redraw])

  // ── Pan (mouse drag) ──
  const onMouseDown = (e) => {
    dragRef.current = { startX: e.clientX - viewRef.current.ox, startY: e.clientY - viewRef.current.oy }
  }
  const onMouseMove = (e) => {
    if (!dragRef.current) return
    viewRef.current.ox = e.clientX - dragRef.current.startX
    viewRef.current.oy = e.clientY - dragRef.current.startY
    redraw()
  }
  const onMouseUp   = () => { dragRef.current = null }
  const onMouseLeave = () => { dragRef.current = null }

  // ── Zoom (wheel) ──
  const onWheel = (e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.12 : 0.89
    const rect   = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    viewRef.current.ox = mx + (viewRef.current.ox - mx) * factor
    viewRef.current.oy = my + (viewRef.current.oy - my) * factor
    viewRef.current.scale *= factor
    redraw()
  }

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 z-10"
      style={{ cursor: dragRef.current ? 'grabbing' : 'crosshair' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        onWheel={onWheel}
      />

      {/* Loading overlay */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 select-none" style={{ pointerEvents: 'none', zIndex: 20 }}>
          <div style={{ width: 36, height: 36, border: '2px solid #1e1e1e', borderTopColor: '#4a8a6a', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: '#404040' }}>Decoding raster…</span>
        </div>
      )}

      {/* Error overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none" style={{ pointerEvents: 'none', zIndex: 20 }}>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: '#6a2a2a' }}>⚠ Failed to load DSM</span>
          <span className="font-mono text-[9px]" style={{ color: '#3a1a1a' }}>{errMsg}</span>
        </div>
      )}

      {/* No rasterUrl — DSM not generated yet */}
      {!rasterUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none" style={{ pointerEvents: 'none', zIndex: 20 }}>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: '#303030' }}>DSM raster not available</span>
          <span className="font-mono text-[9px]" style={{ color: '#222' }}>Generate the 3D model first</span>
        </div>
      )}

      {/* Title badge — top right */}
      {status === 'ready' && (
        <div
          className="absolute font-mono text-[9px] uppercase tracking-[0.2em] px-2.5 py-1.5 select-none"
          style={{
            top: 14, right: 14, zIndex: 21, pointerEvents: 'none',
            border: '1px solid #1e3a2a', borderRadius: 7,
            background: 'rgba(8,20,14,0.75)', backdropFilter: 'blur(8px)',
            color: '#4a8a5a',
          }}
        >
          ● DSM Heatmap — Turbo
        </div>
      )}

      {/* Reset zoom hint — bottom right */}
      {status === 'ready' && (
        <button
          onClick={() => { fitToContainer(); redraw() }}
          className="absolute font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-1 select-none"
          style={{
            bottom: 14, right: 14, zIndex: 21,
            border: '1px solid #1e1e1e', borderRadius: 6,
            background: 'rgba(8,8,8,0.7)', backdropFilter: 'blur(6px)',
            color: '#383838', cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2e2e2e'; e.currentTarget.style.color = '#686868' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.color = '#383838' }}
        >
          ⊡ Fit
        </button>
      )}
    </div>
  )
}

function GridCanvas({ imageUrl, imageState, job, activeLayer, dsmData, getToken, serverRoot }) {
  // Derive the raster URL from DSM data (relative path like /uploads/dsm_xxx.tif)
  const rasterUrl = dsmData?.rasterUrl || dsmData?.storagePathGeotiff || null
  return (
    <GlowCard style={{ width: '100%', height: '100%', borderRadius: 20,
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)',
      backgroundSize: '44px 44px', background: '#080808' }}>

      {/* edge vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 38%, rgba(8,8,8,0.94) 100%)',
        zIndex: 3, borderRadius: 20,
      }} />

      {/* ── DSM HEATMAP layer ── */}
      {activeLayer === 'dsm' && (
        <DsmHeatmapCanvas
          rasterUrl={rasterUrl}
          dsmData={dsmData}
          getToken={getToken}
          serverRoot={serverRoot}
        />
      )}

      {/* ── RAW 2D / COMPLETED MESH image (shown when not in DSM mode) ── */}
      {activeLayer !== 'dsm' && imageState === 'idle' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6">
          {imageUrl ? (
            <div className="relative" style={{ maxWidth: '65%' }}>
              <img src={imageUrl} alt="Aerial"
                style={{ maxWidth: '100%', maxHeight: 400, border: '1px solid #1e1e1e', borderRadius: 12, display: 'block' }} />
              <div className="absolute inset-0 flex items-end justify-center pb-4"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 55%)', borderRadius: 12 }}>
                <span className="font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: '#444' }}>[ Flat Aerial Photo ]</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 select-none" style={{ opacity: 0.18 }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" stroke="#888" strokeWidth="0.7" rx="1.5" />
                <circle cx="8.5" cy="10" r="1.5" stroke="#888" strokeWidth="0.7" />
                <path d="M3 16l5-4 4 3 3-2 6 4" stroke="#888" strokeWidth="0.7" strokeLinejoin="round" />
              </svg>
              <span className="font-mono text-[14px] uppercase tracking-[0.3em]" style={{ color: '#333' }}>WebGL Canvas</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: '#252525' }}>Generate model to activate viewport</span>
            </div>
          )}
        </div>
      )}

      {activeLayer !== 'dsm' && imageState === 'processing' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-8 select-none">
          <div className="flex flex-col items-center gap-5">
            <span className="text-5xl" style={{ animation: 'spin 3s linear infinite', display: 'inline-block' }}>⚙️</span>
            <span className="font-mono text-[15px] uppercase tracking-[0.24em]" style={{ color: '#555' }}>AI Engine Active</span>
          </div>
          <div style={{ border: '1px solid #1e1e1e', background: '#0c0c0c', padding: '22px 32px', minWidth: 320, borderRadius: 14 }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] mb-4" style={{ color: '#303030' }}>Processing Pipeline</p>
            <div style={{ height: 4, background: '#1a1a1a', borderRadius: 6, marginBottom: 12 }}>
              <div style={{ height: '100%', background: '#a1a1aa', borderRadius: 6, width: (job?.progress ?? 0) + '%', transition: 'width 0.6s ease' }} />
            </div>
            <div className="flex justify-between">
              <span className="font-mono text-[10px]" style={{ color: '#404040' }}>{(job?.stage || 'initialising').replace(/_/g, ' ')}</span>
              <span className="font-mono text-[10px] font-bold" style={{ color: '#686868' }}>{job?.progress ?? 0}%</span>
            </div>
            {job?.jobHash && <p className="font-mono text-[9px] mt-2" style={{ color: '#242424' }}>Job {job.jobHash}</p>}
          </div>
        </div>
      )}

      {activeLayer !== 'dsm' && imageState === 'completed' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 select-none">
          {imageUrl ? (
            <div className="relative" style={{ maxWidth: '65%' }}>
              <img src={imageUrl} alt="Aerial"
                style={{ maxWidth: '100%', maxHeight: 400, border: '1px solid #1e1e1e', borderRadius: 12, display: 'block' }} />
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'rgba(40,80,120,0.14)', mixBlendMode: 'overlay', borderRadius: 12 }} />
              <div className="absolute inset-0 flex items-end justify-center pb-4"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 55%)', borderRadius: 12 }}>
                <span className="font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: '#506050' }}>[ 3D Surface — Mesh Reconstructed ]</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 select-none" style={{ opacity: 0.28 }}>
              <svg width="100" height="75" viewBox="0 0 80 60" fill="none">
                <path d="M40 4 L76 56 L4 56 Z" stroke="#555" strokeWidth="0.8" fill="none" />
                <path d="M40 4 L4 56" stroke="#333" strokeWidth="0.4" /><path d="M40 4 L76 56" stroke="#333" strokeWidth="0.4" />
                <path d="M16 38 L64 38" stroke="#2e2e2e" strokeWidth="0.4" /><path d="M24 22 L56 22" stroke="#292929" strokeWidth="0.4" />
              </svg>
              <span className="font-mono text-[14px] uppercase tracking-[0.28em]" style={{ color: '#3a3a3a' }}>3D Mesh Viewport</span>
            </div>
          )}
        </div>
      )}

      {/* ── Spatial overlay — bottom left ── */}
      <div className="absolute z-20 font-mono select-none" style={{ bottom: 20, left: 24 }}>
        <div className="text-[9px] uppercase tracking-[0.22em] mb-1.5" style={{ color: '#242424' }}>Spatial Data</div>
        <div className="text-[11px] mb-0.5" style={{ color: '#2c2c2c' }}>X: 28.6134° &nbsp; Y: 77.2090° &nbsp; Z: {imageState === 'completed' ? '21.4' : '—'} m</div>
        <div className="text-[11px]" style={{ color: '#2c2c2c' }}>GSD: {imageState === 'completed' ? '0.50' : '—'} cm/px &nbsp;·&nbsp; CRS: EPSG:4326</div>
      </div>

      {/* ── Status badge — top right ── */}
      <div className="absolute z-20" style={{ top: 16, right: 16 }}>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5" style={{
          border: '1px solid', borderRadius: 8,
          borderColor: imageState === 'completed' ? '#2a4a2a' : imageState === 'processing' ? '#4a4a1a' : '#222',
          color: imageState === 'completed' ? '#4a8a4a' : imageState === 'processing' ? '#8a8a4a' : '#363636',
          background: imageState === 'completed' ? 'rgba(42,74,42,0.18)' : imageState === 'processing' ? 'rgba(74,74,26,0.18)' : 'rgba(18,18,18,0.4)',
        }}>
          {imageState === 'completed' ? '● Completed' : imageState === 'processing' ? '◌ Processing' : '○ Idle'}
        </div>
      </div>

      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </GlowCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main WorkspacePage
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const { projectId, imageId } = useParams()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const baseUrl = import.meta.env.VITE_API_BASE_URL

  // ── Data state ──
  const [image, setImage]       = useState(null)
  const [project, setProject]   = useState(null)
  const [meshData, setMeshData] = useState(null)   // GET .../mesh
  const [dsmData, setDsmData]   = useState(null)   // GET .../dsm  (stats: minZ/maxZ/meanZ/stdDev)
  const [gcps, setGcps]         = useState([])     // GET .../gcps
  const [job, setJob]           = useState(null)
  const [dsmResultId, setDsmResultId] = useState(null) // _id from DsmResult — needed for validate
  const [validationReport, setValidationReport] = useState(null) // GET .../validation-report

  // ── UI state ──
  const [isLoading, setIsLoading]         = useState(true)
  const [error, setError]                 = useState(null)
  const [activeLayer, setActiveLayer]     = useState('raw')
  const [isGenerating, setIsGenerating]   = useState(false)
  const [genError, setGenError]           = useState(null)
  const [noteText, setNoteText]           = useState('')
  const [isSavingNote, setIsSavingNote]   = useState(false)
  const [annotations, setAnnotations]     = useState([])
  const [selectedAnnotation, setSelectedAnnotation] = useState(null) // for modal
  const [measureData, setMeasureData]     = useState(null)
  const [isMeasuring, setIsMeasuring]     = useState(false)
  const [waterLevel, setWaterLevel]       = useState(15)
  const [floodData, setFloodData]         = useState(null)
  const [isValidating, setIsValidating]   = useState(false)
  const [validationDone, setValidationDone] = useState(false)
  const [shareUrl, setShareUrl]           = useState(null)
  const [isSharing, setIsSharing]         = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportRef = useRef(null)

  const pollRef   = useRef(null)
  const floodTimer = useRef(null)

  const imageState =
    job?.status === 'completed' ? 'completed'
    : (job?.status === 'active' || job?.status === 'queued') ? 'processing'
    : 'idle'

  const load = useCallback(async () => {
    try {
      setIsLoading(true)
      const token = await getToken()

      // GET /api/images/:imageId/metadata
      const imgData = await apiFetch(baseUrl + '/images/' + imageId + '/metadata', token)
      setImage(imgData)

      // GET /api/projects/:projectId
      // Response shape: { project: {...}, images: [...] } (wrapped in ApiResponse.data)
      try {
        const projData = await apiFetch(baseUrl + '/projects/' + projectId, token)
        // projData.project is the actual Project document; projData itself may also be the doc
        setProject(projData?.project || projData)
      } catch {}

      // GET /api/images/:imageId/mesh — stats: vertexCount, faceCount, minElevation, maxElevation
      try {
        const mesh = await apiFetch(baseUrl + '/images/' + imageId + '/mesh', token)
        setMeshData(mesh)
      } catch {}

      // GET /api/images/:imageId/dsm — stats: minZ, maxZ, meanZ, stdDev + rasterUrl
      try {
        const dsm = await apiFetch(baseUrl + '/images/' + imageId + '/dsm', token)
        setDsmData(dsm)
        // dsmResultId may be embedded in DSM response if the pipeline stores it
        if (dsm?._id || dsm?.dsmResultId) {
          const rid = dsm._id || dsm.dsmResultId
          setDsmResultId(rid)
          // Try to fetch existing validation report for this DSM result
          try {
            const report = await apiFetch(baseUrl + '/dsm-results/' + rid + '/validation-report', token)
            setValidationReport(report)
          } catch {}
        }
      } catch {}

      // GET /api/images/:imageId/annotations
      try {
        const annData = await apiFetch(baseUrl + '/images/' + imageId + '/annotations', token)
        setAnnotations(Array.isArray(annData) ? annData : [])
      } catch {}

      // GET /api/images/:imageId/gcps
      try {
        const gcpData = await apiFetch(baseUrl + '/images/' + imageId + '/gcps', token)
        setGcps(gcpData || [])
      } catch {}

      // ── Restore latest job for this image ──
      // Route: GET /api/jobs/:jobId where :jobId = imageId
      // Backend matches Job.image === imageId and returns the latest job.
      try {
        const jobData = await apiFetch(baseUrl + '/jobs/' + imageId, token)
        if (jobData) {
          // jobData is a single job object (latest for this image)
          setJob(jobData)
          // If still running, resume 2.5s poll using the real job _id
          const jid = jobData.jobId || jobData._id
          if ((jobData.status === 'active' || jobData.status === 'queued') && jid) {
            clearInterval(pollRef.current)
            pollRef.current = setInterval(() => pollJob(jid), 2500)
          }
        }
      } catch {}

    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [baseUrl, imageId, projectId, getToken])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { clearInterval(pollRef.current); clearTimeout(floodTimer.current) }, [])

  // Close export dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // ── Poll job ──
  const pollJob = useCallback(async (jobId) => {
    try {
      const token = await getToken()
      const jData = await apiFetch(baseUrl + '/jobs/' + jobId, token)
      setJob(jData)
      if (jData.status === 'completed' || jData.status === 'failed') {
        clearInterval(pollRef.current); pollRef.current = null
        
        // ADD THIS LINE: Re-fetch data from the backend to get the new dsmResultId
        if (jData.status === 'completed') load(); 
      }
    } catch {}
  }, [baseUrl, getToken, load]) // Don't forget to add 'load' to this dependency array!
  // ── POST /api/images/:imageId/process ──
  const handleGenerate = useCallback(async () => {
    try {
      setIsGenerating(true); setGenError(null)
      const token = await getToken()
      const jobData = await apiFetch(baseUrl + '/images/' + imageId + '/process', token,
        { method: 'POST', body: JSON.stringify({ backbone: 'large' }) })
      setJob({ ...jobData, status: jobData.status || 'queued' })
      clearInterval(pollRef.current)
      pollRef.current = setInterval(() => pollJob(jobData.jobId), 2500)
    } catch (err) { setGenError(err.message) }
    finally { setIsGenerating(false) }
  }, [baseUrl, imageId, getToken, pollJob])

  // ── POST /api/images/:imageId/annotations ──
  // Backend requires: label + coordinates (from addAnnotation controller)
  const handleSaveNote = useCallback(async () => {
    if (!noteText.trim()) return
    try {
      setIsSavingNote(true)
      const token = await getToken()
      const saved = await apiFetch(baseUrl + '/images/' + imageId + '/annotations', token,
        {
          method: 'POST',
          body: JSON.stringify({
            label: noteText.trim().slice(0, 60), // label field required by backend
            coordinates: { x: 0, y: 0 },          // coordinates field required by backend
            notes: noteText.trim(),                // full text goes in notes
          })
        })
      // Backend returns the full updated annotations array
      const newList = Array.isArray(saved) ? saved : []
      if (newList.length > 0) {
        setAnnotations(newList)
      } else {
        // Optimistic fallback if backend returns single item or null
        setAnnotations(prev => [
          { note: noteText.trim(), notes: noteText.trim(), label: noteText.trim().slice(0,60), createdAt: new Date().toISOString(), _id: Date.now() },
          ...prev
        ])
      }
      setNoteText('')
    } catch (err) { console.error(err) }
    finally { setIsSavingNote(false) }
  }, [baseUrl, imageId, getToken, noteText])

  // ── POST /api/images/:imageId/measure ──
  const handleMeasure = useCallback(async () => {
    try {
      setIsMeasuring(true)
      const token = await getToken()
      const data = await apiFetch(baseUrl + '/images/' + imageId + '/measure', token,
        { method: 'POST', body: JSON.stringify({ startPoint: { x: 100, y: 100, z: 10 }, endPoint: { x: 300, y: 250, z: 18 } }) })
      setMeasureData(data)
    } catch (err) { console.error(err) }
    finally { setIsMeasuring(false) }
  }, [baseUrl, imageId, getToken])

  // ── POST /api/images/:imageId/flood-sim ──
  const handleFloodSim = useCallback(async (level) => {
    try {
      const token = await getToken()
      const data = await apiFetch(baseUrl + '/images/' + imageId + '/flood-sim', token,
        { method: 'POST', body: JSON.stringify({ waterLevel: level }) })
      setFloodData(data)
    } catch (err) { console.error(err) }
  }, [baseUrl, imageId, getToken])

  const onWaterLevelChange = (v) => {
    setWaterLevel(v)
    clearTimeout(floodTimer.current)
    if (imageState === 'completed') floodTimer.current = setTimeout(() => handleFloodSim(v), 500)
  }

  useEffect(() => {
    if (imageState === 'completed' && !floodData) handleFloodSim(waterLevel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageState])

  // ── POST /api/dsm-results/:dsmResultId/validate ──
  // Returns: { metrics: { rmse, mae, maxError }, accuracyGrade, residuals }
  // Then stores the report. Also fetches GET .../validation-report on success.
  const handleValidate = useCallback(async () => {
    if (!dsmResultId) {
      // No dsmResultId yet — show friendly error
      console.warn('No DSM result ID available for validation')
      return
    }
    try {
      setIsValidating(true)
      const token = await getToken()
      // POST triggers upsert of ValidationReport on the backend
      const report = await apiFetch(
        baseUrl + '/dsm-results/' + dsmResultId + '/validate',
        token,
        { method: 'POST', body: JSON.stringify({}) }
      )
      setValidationReport(report)
    } catch (err) {
      console.error('Validation failed:', err)
    } finally {
      setIsValidating(false)
    }
  }, [baseUrl, dsmResultId, getToken])

  // ── DELETE /api/images/:imageId/gcps/:gcpId/delete ──
  // Route: /:imageId/gcps/:gcpId/delete  (DELETE method, from image.route.js line 17)
  const handleDeleteGcp = useCallback(async (gcpId) => {
    try {
      const token = await getToken()
      await apiFetch(baseUrl + '/images/' + imageId + '/gcps/' + gcpId + '/delete', token, { method: 'DELETE' })
      setGcps(prev => prev.filter(g => (g._id || g.id) !== gcpId))
    } catch (err) { console.error(err) }
  }, [baseUrl, imageId, getToken])

  // ── POST /api/images/:imageId/share ──
  const handleShare = useCallback(async () => {
    try {
      setIsSharing(true)
      const token = await getToken()
      const data = await apiFetch(baseUrl + '/images/' + imageId + '/share', token,
        { method: 'POST', body: JSON.stringify({ permission: 'view', expiresInDays: 7 }) })
      setShareUrl(data.shareUrl)
      await navigator.clipboard.writeText(data.shareUrl).catch(() => {})
    } catch (err) { console.error(err) }
    finally { setIsSharing(false) }
  }, [baseUrl, imageId, getToken])

  // ── GET /api/images/:imageId/export ──
  const handleExportDownload = useCallback(async () => {
    try {
      const token = await getToken()
      const data = await apiFetch(baseUrl + '/images/' + imageId + '/export?format=geojson', token)
      alert('Export ready:\n' + data.downloadUrl)
    } catch (err) { console.error(err) }
    setShowExportMenu(false)
  }, [baseUrl, imageId, getToken])

  // ── POST /api/images/:imageId/export/package ──
  const handleExportPackage = useCallback(async () => {
    try {
      const token = await getToken()
      await apiFetch(baseUrl + '/images/' + imageId + '/export/package', token,
        { method: 'POST', body: JSON.stringify({ formats: ['geojson', 'las', 'obj'] }) })
      alert('Package export queued successfully.')
    } catch (err) { console.error(err) }
    setShowExportMenu(false)
  }, [baseUrl, imageId, getToken])

  // ── Derived ──
  // previewPath is the JPEG preview generated by sharp on upload.
  // The metadata endpoint already returns previewPath as storagePath,
  // but we also check image.previewPath directly as an explicit fallback.
  const imageUrl = image
    ? buildImageUrl(image.previewPath || image.storagePath, baseUrl)
    : null
  const filename    = image?.filename || imageId
  // project.name is the canonical field (Projects.model.js line 9)
  const projectName = project?.name || project?.project?.name || project?.projectName || projectId

  // ─────────────────────────────────────────
  // Loading / Error states
  // ─────────────────────────────────────────

  if (isLoading) return (
    <>
      <HeroBackground />
      <div className="flex items-center justify-center" style={{ height: '100svh', paddingTop: NAVBAR_H }}>
        <div className="flex flex-col items-center gap-4">
          <span className="text-3xl" style={{ animation: 'spin 2s linear infinite', display: 'inline-block' }}>⚙️</span>
          <span className="font-mono text-[13px] uppercase tracking-[0.26em]" style={{ color: '#2e2e2e' }}>Loading workspace…</span>
        </div>
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </>
  )

  if (error) return (
    <>
      <HeroBackground />
      <div className="flex flex-col items-center justify-center gap-6" style={{ height: '100svh', paddingTop: NAVBAR_H }}>
        <span className="font-mono text-[14px]" style={{ color: '#7a3a3a' }}>⚠ {error}</span>
        <button onClick={() => navigate('/projects/' + projectId)}
          className="font-mono text-[12px] uppercase tracking-[0.18em]"
          style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#737373', padding: '12px 28px', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 10 }}>
          ← Back to Project
        </button>
      </div>
    </>
  )

  // ─────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────

  return (
    <>
      <HeroBackground />

      {/* ── Workspace content — blurs when annotation modal is open ── */}
      <div style={{
        position: 'fixed', top: NAVBAR_H, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', zIndex: 1,
        padding: '14px 16px 16px', gap: 14,
        filter: selectedAnnotation ? 'blur(14px) brightness(0.55)' : 'none',
        transition: 'filter 0.25s ease',
        willChange: 'filter',
      }}>

        {/* ══ BREADCRUMB BAR — matches ProjectDetailPage style ══ */}
        <div className="flex items-center justify-between flex-shrink-0" style={{ paddingLeft: 4, paddingRight: 2 }}>

          {/* Breadcrumb: Home / Projects / ProjectName / filename */}
          <div className="flex items-center gap-2.5">
            <Link
              to="/"
              className="font-mono text-[12px] transition-colors"
              style={{ color: '#404040', textDecoration: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#888888' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#404040' }}
            >Home</Link>
            <span className="font-mono text-[12px]" style={{ color: '#2a2a2a' }}>/</span>
            <Link
              to="/projects"
              className="font-mono text-[12px] transition-colors"
              style={{ color: '#404040', textDecoration: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#888888' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#404040' }}
            >Projects</Link>
            <span className="font-mono text-[12px]" style={{ color: '#2a2a2a' }}>/</span>
            <Link
              to={'/projects/' + projectId}
              className="font-mono text-[12px] transition-colors"
              style={{ color: '#404040', textDecoration: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#888888' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#404040' }}
            >{projectName}</Link>
            <span className="font-mono text-[12px]" style={{ color: '#2a2a2a' }}>/</span>
            <span className="font-mono text-[12px] font-semibold truncate" style={{ color: '#d4d4d4', maxWidth: 260 }}>{filename}</span>
          </div>

          {/* Actions — Share + Export */}
          <div className="flex items-center gap-3">
            {/* Share Link */}
            <button onClick={handleShare} disabled={isSharing}
              className="font-mono text-[11px] uppercase tracking-[0.14em] flex items-center gap-1.5 px-3 py-1.5 transition-all duration-150"
              style={{
                background: shareUrl ? 'rgba(40,60,40,0.35)' : 'transparent',
                border: '1px solid', borderColor: shareUrl ? '#2a4a2a' : '#272727',
                color: shareUrl ? '#4a8a4a' : '#555',
                cursor: isSharing ? 'wait' : 'pointer', borderRadius: 7, fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { if (!isSharing) { e.currentTarget.style.borderColor = '#484848'; e.currentTarget.style.color = '#909090' } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = shareUrl ? '#2a4a2a' : '#272727'; e.currentTarget.style.color = shareUrl ? '#4a8a4a' : '#555' }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M9 1.5L12 4.5 9 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M12 4.5H5.5C3.567 4.5 2 6.067 2 8v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {isSharing ? 'Copying…' : shareUrl ? 'Copied!' : 'Share'}
            </button>

            {/* Export dropdown */}
            <div className="relative" ref={exportRef}>
              <button onClick={() => setShowExportMenu(v => !v)}
                className="font-mono text-[11px] uppercase tracking-[0.14em] flex items-center gap-1.5 px-3 py-1.5 transition-all duration-150"
                style={{ background: 'transparent', border: '1px solid #272727', color: '#555', cursor: 'pointer', borderRadius: 7, fontFamily: 'inherit' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#404040'; e.currentTarget.style.color = '#909090' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#272727'; e.currentTarget.style.color = '#555' }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v7M3 6l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Export ▾
              </button>
              {showExportMenu && (
                <div className="absolute right-0 flex flex-col" style={{
                  top: 'calc(100% + 6px)', minWidth: 200,
                  background: 'rgba(8,8,8,0.97)', backdropFilter: 'blur(12px)',
                  border: '1px solid #242424', borderRadius: 10,
                  boxShadow: '0 12px 36px rgba(0,0,0,0.8)', zIndex: 999,
                }}>
                  <button onClick={handleExportDownload}
                    className="font-mono text-[11px] text-left px-4 py-3 w-full transition-colors duration-100"
                    style={{ background: 'none', border: 'none', color: '#686868', cursor: 'pointer', fontFamily: 'inherit' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#b0b0b0' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#686868' }}>
                    ↓ Download GeoJSON
                  </button>
                  <div style={{ height: 1, background: '#1a1a1a', margin: '0 12px' }} />
                  <button onClick={handleExportPackage}
                    className="font-mono text-[11px] text-left px-4 py-3 w-full transition-colors duration-100"
                    style={{ background: 'none', border: 'none', color: '#686868', cursor: 'pointer', fontFamily: 'inherit' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#b0b0b0' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#686868' }}>
                    📦 Export Full Package
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            3-PANEL WORKSPACE
        ══════════════════════════════════════════ */}
        <div className="flex flex-1 gap-4 overflow-hidden min-h-0">

          {/* ══ LEFT PANEL — Pipeline & Layers ══ */}
          <GlowCard style={{ width: 286, flexShrink: 0, overflowY: 'auto', borderRadius: 20, padding: '24px 18px' }}>

            {/* Panel heading */}
            <div className="flex items-center gap-3 mb-6 px-2">
              <span style={{ fontSize: 16 }}>▤</span>
              <h2 className="font-sans text-[15px] font-semibold tracking-tight" style={{ color: '#e5e5e5' }}>Pipeline &amp; Layers</h2>
            </div>

            {/* ── Sub-box 1: Terrain Engine ── */}
            <SubBox style={{ marginBottom: 14 }}>
              <SubBoxTitle icon="⚙️" label="Terrain Engine" />

              {/* Show generate button only when NOT yet completed */}
              {imageState === 'idle' && (
                <>
                  <PrimaryBtn onClick={handleGenerate} disabled={isGenerating}>
                    {isGenerating ? '⏳ Queuing…' : '🚀 Generate 3D Model'}
                  </PrimaryBtn>
                  {genError && <p className="font-mono text-[10px] mt-3" style={{ color: '#8a4040' }}>⚠ {genError}</p>}
                  <p className="font-mono text-[10px] mt-3 text-center uppercase tracking-[0.16em]" style={{ color: '#2a2a2a' }}>Triggers POST /process</p>
                </>
              )}

              {imageState === 'processing' && (
                <div style={{ border: '1px solid #1c1c1c', borderRadius: 10, padding: 14, background: 'rgba(0,0,0,0.3)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{ fontSize: 12 }}>⏳</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: '#686868' }}>Processing…</span>
                  </div>
                  <ProgressBar pct={job?.progress ?? 0} label={(job?.stage || 'queued').replace(/_/g, ' ')} />
                  {job?.jobHash && <p className="font-mono text-[9px] mt-2" style={{ color: '#242424' }}>Job: {job.jobHash}</p>}
                </div>
              )}

              {/* Completed: hide generate button, show success + DSM/mesh info */}
              {imageState === 'completed' && (
                <div style={{ border: '1px solid #1e3a1e', borderRadius: 10, padding: 14, background: 'rgba(18,36,18,0.28)' }}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <span style={{ fontSize: 14 }}>✅</span>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: '#4a8a4a' }}>3D Model Ready</p>
                  </div>
                  <p className="font-mono text-[9px]" style={{ color: '#2a4a2a' }}>Terrain pipeline complete — all tools unlocked.</p>
                  {job?.completedAt && (
                    <p className="font-mono text-[9px] mt-1.5" style={{ color: '#1e3a1e' }}>
                      {new Date(job.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              )}
            </SubBox>

            {/* ── Sub-box 2: View Layers ── */}
            <SubBox style={{ marginBottom: 14 }}>
              <SubBoxTitle icon="👁️" label="View Layers" />
              <div className="flex flex-col gap-1.5">
                <LayerToggle label="Raw 2D Image" icon="🖼️" active={activeLayer === 'raw'} locked={false} onClick={() => setActiveLayer('raw')} />
                <LayerToggle label="DSM Heatmap" icon="🌡️" active={activeLayer === 'dsm'} locked={imageState !== 'completed'} onClick={() => imageState === 'completed' && setActiveLayer('dsm')} />
                <LayerToggle label="3D Surface Mesh" icon="🔷" active={activeLayer === 'mesh'} locked={imageState !== 'completed'} onClick={() => imageState === 'completed' && setActiveLayer('mesh')} />
              </div>
              {dsmData && (
                <p className="font-mono text-[9px] mt-3" style={{ color: '#303030' }}>DSM loaded · {dsmData.resolution ?? '—'} res</p>
              )}
            </SubBox>

            {/* ── Sub-box 3: Annotations ── */}
            <SubBox style={{ marginBottom: 14 }}>
              <SubBoxTitle icon="📝" label={'Annotations' + (annotations.length ? ' (' + annotations.length + ')' : '')} />

              {/* Input area */}
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Type a spatial note…"
                rows={3}
                className="font-mono text-[11px] w-full resize-none"
                style={{
                  background: 'rgba(0,0,0,0.4)', border: '1px solid #1e1e1e', borderRadius: 8,
                  color: '#888', padding: '10px 12px', outline: 'none', fontFamily: 'inherit',
                  marginBottom: 10,
                }}
                onFocus={(e) => { e.target.style.borderColor = '#383838' }}
                onBlur={(e) => { e.target.style.borderColor = '#1e1e1e' }}
              />
              <SecondaryBtn onClick={handleSaveNote} disabled={isSavingNote || !noteText.trim()}>
                {isSavingNote ? '⟳ Saving…' : '+ Add Annotation'}
              </SecondaryBtn>

              {/* Saved annotations list — GET /api/images/:imageId/annotations */}
              {annotations.length > 0 && (
                <div className="flex flex-col gap-2 mt-4">
                  <div style={{ height: 1, background: '#191919', marginBottom: 4 }} />
                  {annotations.map((ann, i) => {
                    const id = ann._id || ann.id || i
                    const text = ann.note || ann.text || ann.content || ''
                    const preview = text.length > 48 ? text.slice(0, 48) + '…' : text
                    const ts = ann.createdAt ? new Date(ann.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
                    return (
                      <button
                        key={id}
                        onClick={() => setSelectedAnnotation(ann)}
                        className="w-full text-left transition-all duration-150"
                        style={{
                          background: 'rgba(255,255,255,0.02)', border: '1px solid #1c1c1c',
                          borderRadius: 9, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.045)'; e.currentTarget.style.borderColor = '#2a2a2a' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = '#1c1c1c' }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-[11px] leading-relaxed truncate flex-1" style={{ color: '#686868' }}>{preview}</p>
                          {ts && <span className="font-mono text-[9px] flex-shrink-0" style={{ color: '#2e2e2e' }}>{ts}</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {annotations.length === 0 && (
                <p className="font-mono text-[10px] mt-4" style={{ color: '#272727' }}>No annotations yet.</p>
              )}
            </SubBox>

            {/* ── Annotation detail modal is rendered via portal to document.body (see end of return) ── */}

            {/* ── Sub-box 4: GCPs ── */}
            <SubBox>
              <SubBoxTitle icon="📍" label={'GCPs (' + gcps.length + ')'} />
              {gcps.length === 0 ? (
                <p className="font-mono text-[10px]" style={{ color: '#282828' }}>No GCPs set for this image.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {gcps.slice(0, 8).map((g, i) => {
                    const id = g._id || g.id
                    return (
                      <div key={id || i} className="flex items-center justify-between py-1.5 px-2"
                        style={{ borderRadius: 7, background: 'rgba(255,255,255,0.015)' }}>
                        <div className="flex items-center gap-2">
                          <span style={{ color: '#3a7a3a', fontSize: 10 }}>✓</span>
                          <span className="font-mono text-[11px]" style={{ color: '#505050' }}>{g.label || 'GCP-' + (i + 1)}</span>
                        </div>
                        <button onClick={() => handleDeleteGcp(id)}
                          className="font-mono text-[9px] transition-colors duration-100"
                          style={{ background: 'none', border: 'none', color: '#2a2a2a', cursor: 'pointer', fontFamily: 'inherit' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#8a4040' }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = '#2a2a2a' }}>
                          ✕
                        </button>
                      </div>
                    )
                  })}
                  {gcps.length > 8 && <p className="font-mono text-[9px] mt-1" style={{ color: '#2a2a2a' }}>+{gcps.length - 8} more</p>}
                </div>
              )}
            </SubBox>

          </GlowCard>

          {/* ══ CENTER CANVAS ══ */}
          <div className="flex-1 min-h-0 min-w-0">
            <GridCanvas
              imageUrl={imageUrl}
              imageState={imageState}
              job={job}
              activeLayer={activeLayer}
              dsmData={dsmData}
              getToken={getToken}
              serverRoot={baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')}
            />
          </div>

          {/* ══ RIGHT PANEL — Tools ══ */}
          <GlowCard style={{ width: 280, flexShrink: 0, overflowY: 'auto', borderRadius: 20, padding: '24px 18px' }}>

            {/* Panel heading */}
            <div className="flex items-center gap-3 mb-6 px-2">
              <span style={{ fontSize: 16 }}>◈</span>
              <h2 className="font-sans text-[15px] font-semibold tracking-tight" style={{ color: '#e5e5e5' }}>Tools</h2>
            </div>

            {/* ── Sub-box 1: Measure Tool ── */}
            <SubBox style={{ marginBottom: 14 }}>
              <SubBoxTitle icon="📏" label="Measure Tool" />
              {imageState !== 'completed' ? (
                <div className="flex items-center gap-2 py-1">
                  <span style={{ fontSize: 12 }}>🔒</span>
                  <span className="font-mono text-[11px]" style={{ color: '#303030' }}>Requires 3D mesh</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-0" style={{ marginBottom: 14 }}>
                    <DataRow label="Point A" value="—" />
                    <DataRow label="Point B" value="—" />
                    <DataRow label="Horiz. Dist." value={measureData ? measureData.horizontalDistanceMeters + 'm' : '106.1m'} accent="#787878" />
                    <DataRow label="Slope Angle" value={measureData ? measureData.slopeDegrees + '°' : '8.3°'} accent="#787878" />
                    <DataRow label="Elevation Δ" value={measureData ? measureData.elevationDeltaMeters + 'm' : '—'} />
                  </div>
                  <SecondaryBtn onClick={handleMeasure} disabled={isMeasuring}>
                    {isMeasuring ? '⟳ Measuring…' : 'Run Measurement'}
                  </SecondaryBtn>
                </>
              )}
            </SubBox>

            {/* ── Sub-box 2: Flood Simulation ── */}
            <SubBox style={{ marginBottom: 14 }}>
              <SubBoxTitle icon="🌊" label="Flood Simulation" />
              {imageState !== 'completed' ? (
                <div className="flex items-center gap-2 py-1">
                  <span style={{ fontSize: 12 }}>🔒</span>
                  <span className="font-mono text-[11px]" style={{ color: '#303030' }}>Requires elevation data</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: '#484848' }}>Water Level</span>
                    <span className="font-mono text-[14px] font-bold" style={{ color: '#707070' }}>{waterLevel}m</span>
                  </div>
                  <div className="flex items-center gap-2 mb-5">
                    <span className="font-mono text-[9px]" style={{ color: '#2a2a2a' }}>0m</span>
                    <input type="range" min="0" max="50" value={waterLevel}
                      onChange={(e) => onWaterLevelChange(Number(e.target.value))}
                      className="flex-1" style={{ accentColor: '#686868', cursor: 'pointer' }} />
                    <span className="font-mono text-[9px]" style={{ color: '#2a2a2a' }}>50m</span>
                  </div>

                  <div style={{ borderRadius: 10, border: '1px solid #181818', background: 'rgba(0,0,0,0.35)', padding: '14px 16px' }}>
                    <DataRow label="Submerged Area" value={floodData ? Number(floodData.floodedAreaSqMeters).toLocaleString() + 'm²' : '4,500m²'} />
                    <DataRow label="Flood %" value={floodData ? floodData.floodPercentage + '%' : '45.0%'} />
                    <DataRow label="Risk Zone"
                      value={floodData ? waterLevel > 30 ? 'CRITICAL' : waterLevel > 15 ? 'HIGH' : 'LOW' : 'HIGH'}
                      accent={floodData ? waterLevel > 30 ? '#c47a4a' : waterLevel > 15 ? '#c4a04a' : '#4a8a4a' : '#8a6a4a'} />
                  </div>
                </>
              )}
            </SubBox>

            {/* ── Sub-box 3: GCP Validation ── */}
            <SubBox>
              <SubBoxTitle icon="🎯" label="GCP Validation" />
              {imageState !== 'completed' ? (
                <div className="flex items-center gap-2 py-1">
                  <span style={{ fontSize: 12 }}>🔒</span>
                  <span className="font-mono text-[11px]" style={{ color: '#303030' }}>Requires DSM matrix</span>
                </div>
              ) : (
                <>
                  {/* Validation metrics \u2014 from POST /api/dsm-results/:dsmResultId/validate */}
                  <div className="flex flex-col gap-0 mb-4">
                    <DataRow
                      label="RMSE"
                      value={validationReport ? validationReport.metrics?.rmse + 'm' : '—'}
                      accent={validationReport ? '#8a8a4a' : undefined}
                    />
                    <DataRow
                      label="MAE"
                      value={validationReport ? validationReport.metrics?.mae + 'm' : '—'}
                    />
                    <DataRow
                      label="Max Error"
                      value={validationReport ? validationReport.metrics?.maxError + 'm' : '—'}
                    />
                    <DataRow label="GCP Count" value={gcps.length.toString()} />
                    <DataRow
                      label="Check Points"
                      value={validationReport ? (validationReport.residuals?.length ?? '—').toString() : '—'}
                    />
                    {validationReport && (
                      <DataRow
                        label="Grade"
                        value={validationReport.accuracyGrade ?? 'A'}
                        accent={validationReport.accuracyGrade === 'A' ? '#4a8a4a' : validationReport.accuracyGrade === 'B' ? '#8a8a4a' : '#8a4a4a'}
                      />
                    )}
                  </div>

                  <SecondaryBtn onClick={handleValidate} disabled={isValidating || !dsmResultId}>
                    {isValidating ? '⟳ Running report…' : validationReport ? '↺ Re-run Report' : 'Run Accuracy Report'}
                  </SecondaryBtn>

                  {!dsmResultId && (
                    <p className="font-mono text-[9px] mt-2 text-center" style={{ color: '#2a2a2a' }}>
                      DSM result ID not yet available
                    </p>
                  )}

                  {/* DSM Stats \u2014 from GET /api/images/:imageId/dsm (stats field) */}
                  {imageState === 'completed' && dsmData && (
                    <>
                      <div style={{ height: 1, background: '#191919', margin: '16px 0' }} />
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: '#383838' }}>DSM Stats</p>
                      <div className="flex flex-col gap-0">
                        <DataRow label="Min Z" value={(dsmData.stats?.minZ ?? dsmData.stats?.min_elevation ?? '—') + 'm'} />
                        <DataRow label="Max Z" value={(dsmData.stats?.maxZ ?? dsmData.stats?.max_elevation ?? '—') + 'm'} />
                        <DataRow label="Mean Z" value={(dsmData.stats?.meanZ ?? dsmData.stats?.mean_elevation ?? '—') + 'm'} />
                        <DataRow label="Std Dev" value={(dsmData.stats?.stdDev ?? dsmData.stats?.std_dev ?? '—') + 'm'} />
                        <DataRow label="Resolution" value={(dsmData.resolution ?? image?.resolution ?? '—') + ' GSD'} />
                        <DataRow label="CRS" value={dsmData.crs ?? image?.crs ?? 'EPSG:4326'} />
                        {/* Vertices from mesh data */}
                        {meshData?.stats?.vertexCount && (
                          <DataRow label="Vertices" value={Number(meshData.stats.vertexCount).toLocaleString()} />
                        )}
                        {meshData?.stats?.faceCount && (
                          <DataRow label="Faces" value={Number(meshData.stats.faceCount).toLocaleString()} />
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </SubBox>

          </GlowCard>

        </div>
      </div>

      {/* ── Annotation modal — portal to document.body so it escapes the blurred workspace div ── */}
      {selectedAnnotation && createPortal(
        (() => {
          const annText = selectedAnnotation.note || selectedAnnotation.notes || selectedAnnotation.text || selectedAnnotation.content || selectedAnnotation.label || ''
          const annTs = selectedAnnotation.createdAt
            ? new Date(selectedAnnotation.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : ''
          return (
            <>
              {/* Dark backdrop — click to close */}
              <div
                onClick={() => setSelectedAnnotation(null)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 99998,
                  background: 'rgba(0,0,0,0.55)',
                  cursor: 'pointer',
                }}
              />
              {/* Modal box */}
              <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 99999,
                  width: 'min(520px, calc(100vw - 48px))',
                  background: '#0e0e0e',
                  border: '1px solid #2a2a2a',
                  borderRadius: 20,
                  padding: '32px 34px',
                  boxShadow: '0 32px 80px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.045)',
                }}
              >
                <button
                  onClick={() => setSelectedAnnotation(null)}
                  aria-label="Close"
                  style={{
                    position: 'absolute', top: 18, right: 20,
                    background: 'none', border: 'none',
                    color: '#404040', cursor: 'pointer',
                    fontSize: 18, lineHeight: 1, fontFamily: 'inherit',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#e0e0e0' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#404040' }}
                >✕</button>
                <div className="flex items-center gap-3 mb-6">
                  <span style={{ fontSize: 16 }}>📝</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.28em]" style={{ color: '#484848' }}>Annotation</span>
                </div>
                <p style={{ color: '#c0c0c0', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
                  {annText}
                </p>
                {annTs && (
                  <p className="font-mono text-[10px] mt-6" style={{ color: '#2e2e2e' }}>{annTs}</p>
                )}
              </div>
            </>
          )
        })(),
        document.body
      )}
    </>
  )
}
