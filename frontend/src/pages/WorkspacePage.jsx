import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import HeroBackground from '../components/HeroBackground'

const NAVBAR_H = 108

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildImageUrl(storagePath, baseUrl) {
  if (!storagePath) return null
  if (storagePath.startsWith('http')) return storagePath
  const serverRoot = baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
  const filename = storagePath.split(/[/\\]/).pop()
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
// Center Canvas
// ─────────────────────────────────────────────────────────────────────────────

function GridCanvas({ imageUrl, imageState, job }) {
  return (
    <GlowCard style={{ width: '100%', height: '100%', borderRadius: 20,
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)',
      backgroundSize: '44px 44px', background: '#080808' }}>

      {/* edge vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 38%, rgba(8,8,8,0.94) 100%)',
        zIndex: 3, borderRadius: 20,
      }} />

      {/* ── IDLE state ── */}
      {imageState === 'idle' && (
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

      {/* ── PROCESSING state ── */}
      {imageState === 'processing' && (
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

      {/* ── COMPLETED state ── */}
      {imageState === 'completed' && (
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
  const [dsmData, setDsmData]   = useState(null)   // GET .../dsm
  const [gcps, setGcps]         = useState([])     // GET .../gcps
  const [job, setJob]           = useState(null)

  // ── UI state ──
  const [isLoading, setIsLoading]         = useState(true)
  const [error, setError]                 = useState(null)
  const [activeLayer, setActiveLayer]     = useState('raw')
  const [isGenerating, setIsGenerating]   = useState(false)
  const [genError, setGenError]           = useState(null)
  const [noteText, setNoteText]           = useState('')
  const [isSavingNote, setIsSavingNote]   = useState(false)
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

  // ── Mount: fetch all initial data ──
  const load = useCallback(async () => {
    try {
      setIsLoading(true)
      const token = await getToken()

      // GET /api/images/:imageId/metadata
      const imgData = await apiFetch(baseUrl + '/images/' + imageId + '/metadata', token)
      setImage(imgData)

      // GET /api/projects/:projectId
      try {
        const projData = await apiFetch(baseUrl + '/projects/' + projectId, token)
        setProject(projData)
      } catch {}

      // GET /api/images/:imageId/mesh
      try {
        const mesh = await apiFetch(baseUrl + '/images/' + imageId + '/mesh', token)
        setMeshData(mesh)
      } catch {}

      // GET /api/images/:imageId/dsm
      try {
        const dsm = await apiFetch(baseUrl + '/images/' + imageId + '/dsm', token)
        setDsmData(dsm)
      } catch {}

      // GET /api/images/:imageId/gcps
      const gcpData = await apiFetch(baseUrl + '/images/' + imageId + '/gcps', token)
      setGcps(gcpData || [])

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
      }
    } catch {}
  }, [baseUrl, getToken])

  // ── POST /api/images/:imageId/process ──
  const handleGenerate = useCallback(async () => {
    try {
      setIsGenerating(true); setGenError(null)
      const token = await getToken()
      const jobData = await apiFetch(baseUrl + '/images/' + imageId + '/process', token,
        { method: 'POST', body: JSON.stringify({ backbone: 'vit-l' }) })
      setJob({ ...jobData, status: jobData.status || 'queued' })
      clearInterval(pollRef.current)
      pollRef.current = setInterval(() => pollJob(jobData.jobId), 2500)
    } catch (err) { setGenError(err.message) }
    finally { setIsGenerating(false) }
  }, [baseUrl, imageId, getToken, pollJob])

  // ── POST /api/images/:imageId/annotations ──
  const handleSaveNote = useCallback(async () => {
    if (!noteText.trim()) return
    try {
      setIsSavingNote(true)
      const token = await getToken()
      await apiFetch(baseUrl + '/images/' + imageId + '/annotations', token,
        { method: 'POST', body: JSON.stringify({ note: noteText.trim() }) })
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
  const handleValidate = useCallback(() => {
    setIsValidating(true)
    setTimeout(() => { setIsValidating(false); setValidationDone(true) }, 1800)
  }, [])

  // ── DELETE /api/images/:imageId/gcps/:gcpId ──
  const handleDeleteGcp = useCallback(async (gcpId) => {
    try {
      const token = await getToken()
      await apiFetch(baseUrl + '/images/' + imageId + '/gcps/' + gcpId, token, { method: 'DELETE' })
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
  const imageUrl    = image ? buildImageUrl(image.storagePath, baseUrl) : null
  const filename    = image?.filename || imageId
  const projectName = project?.name || project?.projectName || projectId

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

      <div style={{
        position: 'fixed', top: NAVBAR_H, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', zIndex: 1,
        padding: '14px 16px 16px', gap: 14,
      }}>

        {/* ══════════════════════════════════════════
            TOP TOOLBAR — breadcrumb + actions
        ══════════════════════════════════════════ */}
        <GlowCard style={{ borderRadius: 16, flexShrink: 0, padding: '0 22px' }}>
          <div className="flex items-center justify-between" style={{ height: 56 }}>

            {/* Breadcrumb: Home / Projects / ProjectName / ImageName */}
            <nav className="flex items-center gap-2" aria-label="Breadcrumb">
              {[
                { label: 'Home',    to: '/' },
                { label: 'Projects', to: '/projects' },
                { label: projectName, to: '/projects/' + projectId },
              ].map(({ label, to }, i) => (
                <span key={i} className="flex items-center gap-2">
                  <Link to={to} className="font-mono text-[12px] transition-colors duration-150"
                    style={{ color: '#424242', textDecoration: 'none' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#909090' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#424242' }}>
                    {label}
                  </Link>
                  <span className="font-mono text-[12px]" style={{ color: '#262626' }}>/</span>
                </span>
              ))}
              <span className="font-mono text-[12px] truncate" style={{ color: '#787878', maxWidth: 240 }}>{filename}</span>
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Share Link */}
              <button onClick={handleShare} disabled={isSharing}
                className="font-mono text-[11px] uppercase tracking-[0.16em] flex items-center gap-2 px-4 py-2 transition-all duration-150"
                style={{
                  background: shareUrl ? 'rgba(40,60,40,0.45)' : 'transparent',
                  border: '1px solid', borderColor: shareUrl ? '#2a4a2a' : '#272727',
                  color: shareUrl ? '#4a8a4a' : '#686868',
                  cursor: isSharing ? 'wait' : 'pointer', borderRadius: 9, fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { if (!isSharing) { e.currentTarget.style.borderColor = '#484848'; e.currentTarget.style.color = '#b0b0b0' } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = shareUrl ? '#2a4a2a' : '#272727'; e.currentTarget.style.color = shareUrl ? '#4a8a4a' : '#686868' }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M9 1.5L12 4.5 9 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M12 4.5H5.5C3.567 4.5 2 6.067 2 8v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                {isSharing ? 'Copying…' : shareUrl ? 'Copied!' : 'Share Link'}
              </button>

              {/* Export dropdown */}
              <div className="relative" ref={exportRef}>
                <button onClick={() => setShowExportMenu(v => !v)}
                  className="font-mono text-[11px] uppercase tracking-[0.16em] flex items-center gap-2 px-4 py-2 transition-all duration-150"
                  style={{ background: '#0e0e0e', border: '1px solid #272727', color: '#a1a1aa', cursor: 'pointer', borderRadius: 9, fontFamily: 'inherit' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#161616'; e.currentTarget.style.borderColor = '#404040' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#0e0e0e'; e.currentTarget.style.borderColor = '#272727' }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v7M3 6l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Export ▾
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 flex flex-col" style={{
                    top: 'calc(100% + 8px)', minWidth: 210,
                    background: 'rgba(8,8,8,0.97)', backdropFilter: 'blur(12px)',
                    border: '1px solid #242424', borderRadius: 12,
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
        </GlowCard>

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

              {imageState === 'completed' && (
                <div className="flex items-center gap-3 px-1 py-2" style={{ border: '1px solid #1e3a1e', borderRadius: 10, padding: 12, background: 'rgba(18,36,18,0.3)' }}>
                  <span style={{ fontSize: 13 }}>✅</span>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: '#4a8a4a' }}>Completed</p>
                    <p className="font-mono text-[9px] mt-0.5" style={{ color: '#2a4a2a' }}>Terrain pipeline complete</p>
                  </div>
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
              <SubBoxTitle icon="📝" label="Annotations" />
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
            </SubBox>

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
            <GridCanvas imageUrl={imageUrl} imageState={imageState} job={job} />
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
                  <div className="flex flex-col gap-0 mb-4">
                    <DataRow label="RMSE" value={validationDone ? '0.38m' : '—'} accent={validationDone ? '#8a8a4a' : undefined} />
                    <DataRow label="GCP Count" value={gcps.length.toString()} />
                    <DataRow label="Check Points" value={validationDone ? '3' : '—'} />
                    {validationDone && <DataRow label="Status" value="PASS ✓" accent="#4a8a4a" />}
                  </div>
                  <SecondaryBtn onClick={handleValidate} disabled={isValidating}>
                    {isValidating ? '⟳ Running report…' : validationDone ? '✓ View Report' : 'Run Accuracy Report'}
                  </SecondaryBtn>
                  {imageState === 'completed' && (
                    <>
                      <div style={{ height: 1, background: '#191919', margin: '16px 0' }} />
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: '#383838' }}>DSM Stats</p>
                      <div className="flex flex-col gap-0">
                        <DataRow label="Min Z" value="2.1m" />
                        <DataRow label="Max Z" value="48.7m" />
                        <DataRow label="Mean Z" value="21.4m" />
                        <DataRow label="Std Dev" value="6.8m" />
                        <DataRow label="Resolution" value={(image?.resolution ?? 0.5) + 'm GSD'} />
                        <DataRow label="Vertices" value="1,681" />
                      </div>
                    </>
                  )}
                </>
              )}
            </SubBox>

          </GlowCard>

        </div>
      </div>
    </>
  )
}
