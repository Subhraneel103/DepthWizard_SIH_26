import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import HeroBackground from '../components/HeroBackground'

const NAVBAR_H = 108

// Build a proper URL from storagePath (same logic as hub page)
function buildImageUrl(storagePath, baseUrl) {
  if (!storagePath) return null
  if (storagePath.startsWith('http')) return storagePath
  const serverRoot = baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
  const filename = storagePath.split(/[/\\]/).pop()
  return serverRoot + '/uploads/' + filename
}

// Mouse-spotlight glow card (same as hub)
function GlowCard({ children, onClick, style = {}, className = '' }) {
  const ref = useRef(null)
  const [isHovered, setIsHovered] = useState(false)

  const onMove = (e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--gx', (e.clientX - r.left) + 'px')
    el.style.setProperty('--gy', (e.clientY - r.top) + 'px')
    el.style.setProperty('--go', '1')
  }
  const onEnter = () => setIsHovered(true)
  const onLeave = () => {
    setIsHovered(false)
    if (ref.current) ref.current.style.setProperty('--go', '0')
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick && onClick(e) }}
      onMouseMove={onMove}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={
        'group relative overflow-hidden text-left cursor-pointer transition-all duration-300 ease-out ' +
        (isHovered ? '-translate-y-1 ' : '') +
        className
      }
      style={{
        borderRadius: 12,
        border: isHovered ? '1px solid #3c3c3c' : '1px solid #1a1a1a',
        background: isHovered ? '#121212' : '#0b0b0b',
        boxShadow: isHovered
          ? '0 20px 40px -12px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05)'
          : '0 4px 12px rgba(0,0,0,0.5)',
        outline: 'none',
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, borderRadius: 12,
          pointerEvents: 'none', zIndex: 1,
          background: 'radial-gradient(300px circle at var(--gx) var(--gy), rgba(255,255,255,0.07) 0%, transparent 70%)',
          opacity: 'var(--go)',
          transition: 'opacity 0.2s',
        }}
      />
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}

// Section heading with decorative rule
function SectionLabel({ icon, text, count }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      {icon && <span className="text-lg">{icon}</span>}
      <span className="font-mono text-[14px] sm:text-[16px] uppercase tracking-[0.22em] text-[#e5e5e5] font-bold">
        {text}
      </span>
      {count !== undefined && (
        <span className="font-mono text-[12px] text-[#404040]">{count}</span>
      )}
      <div
        className="flex-1 h-px ml-2"
        style={{ background: 'linear-gradient(to right, #2a2a2a, rgba(42,42,42,0.1) 80%, transparent)' }}
      />
    </div>
  )
}

// Image card with glow + working image URL
function ImageCard({ image, projectId, navigate, baseUrl }) {
  const filename = image.filename || image.name || 'image'
  const date = image.uploadedAt || image.createdAt
    ? new Date(image.uploadedAt || image.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : null

  // Build the actual display URL from storagePath
  const imageUrl = buildImageUrl(image.storagePath, baseUrl) || image.thumbnailUrl || image.url || null
  const [imgError, setImgError] = useState(false)

  return (
    <GlowCard
      onClick={() => navigate('/projects/' + projectId + '/workspace/' + (image._id || image.id))}
      style={{ padding: 0, display: 'flex', flexDirection: 'column' }}
    >
      {/* Thumbnail */}
      <div
        className="w-full relative flex items-center justify-center overflow-hidden"
        style={{ height: 190, background: '#080808', borderRadius: '12px 12px 0 0' }}
      >
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={filename}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 group-hover:brightness-110"
          />
        ) : (
          <div className="flex flex-col items-center gap-2" style={{ opacity: 0.3 }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="#888" strokeWidth="1.2" />
              <circle cx="8.5" cy="10" r="1.5" stroke="#888" strokeWidth="1.2" />
              <path d="M3 16l5-4 4 3 3-2 6 4" stroke="#888" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#555]">No preview</span>
          </div>
        )}

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex items-end justify-between p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
            borderRadius: '12px 12px 0 0',
          }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white font-medium">
            Open Workspace
          </span>
          <span className="font-mono text-[13px] text-white">&#8599;</span>
        </div>
      </div>

      {/* Meta */}
      <div className="px-4 pt-3.5 pb-4 flex flex-col gap-1">
        <span className="font-mono text-[13px] text-[#d4d4d4] group-hover:text-white transition-colors truncate font-medium">
          {filename}
        </span>
        {date && (
          <span className="font-mono text-[11px] text-[#444444]">{date}</span>
        )}
      </div>
    </GlowCard>
  )
}

// Drop Zone
function UploadZone({ onFilesSelected }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length) onFilesSelected(files)
  }

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files)
    if (files.length) onFilesSelected(files)
    e.target.value = ''
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragEnter={() => setIsDragOver(true)}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current && inputRef.current.click()}
      className="flex flex-col items-center justify-center cursor-pointer transition-all duration-200 select-none"
      style={{
        border: '1px dashed ' + (isDragOver ? '#555555' : '#2a2a2a'),
        background: isDragOver ? '#111111' : 'transparent',
        padding: '64px 32px',
        minHeight: '200px',
        borderRadius: 12,
      }}
      onMouseEnter={(e) => {
        if (!isDragOver) {
          e.currentTarget.style.borderColor = '#3a3a3a'
          e.currentTarget.style.background = '#0a0a0a'
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragOver) {
          e.currentTarget.style.borderColor = '#2a2a2a'
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="mb-5">
        <path
          d="M8 17H6a4 4 0 0 1 0-8h.5A5.5 5.5 0 0 1 17.5 10H18a3 3 0 0 1 0 6h-2"
          stroke={isDragOver ? '#a1a1aa' : '#404040'}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M12 13v6M9 16l3-3 3 3"
          stroke={isDragOver ? '#a1a1aa' : '#404040'}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="font-mono text-[15px] text-[#555555] mb-2.5">
        {isDragOver ? 'Drop imagery here' : 'Drag & Drop Drone Imagery Here'}
      </p>
      <p className="font-mono text-[13px] text-[#383838]">
        or{' '}
        <span className="text-[#737373] underline underline-offset-2">Browse Files</span>
      </p>
      <p className="font-mono text-[11px] text-[#2a2a2a] mt-4 uppercase tracking-[0.15em]">
        JPG · PNG · TIFF · WebP
      </p>
    </div>
  )
}

// Pending upload item
function PendingUploadItem({ file, status }) {
  const cfg = {
    pending:   { color: '#555555', label: 'Queued' },
    uploading: { color: '#9e9a5e', label: 'Uploading...' },
    done:      { color: '#5e9e5e', label: 'Done' },
    error:     { color: '#9e5e5e', label: 'Failed' },
  }
  const s = cfg[status] || cfg.pending
  return (
    <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid #111111' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="14" rx="1" stroke="#333333" strokeWidth="1.2" />
        <circle cx="8.5" cy="10" r="1.5" stroke="#333333" strokeWidth="1.2" />
        <path d="M3 16l5-4 4 3 3-2 6 4" stroke="#333333" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-[11px] text-[#737373] flex-1 truncate">{file.name}</span>
      <span className="font-mono text-[10px]" style={{ color: s.color }}>{s.label}</span>
    </div>
  )
}

// Skeleton loader
function DetailSkeleton() {
  return (
    <div className="min-h-screen" style={{ paddingTop: NAVBAR_H, background: 'transparent' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto', paddingLeft: 80, paddingRight: 80, paddingTop: 64, paddingBottom: 64 }}>
        <div className="h-2 animate-pulse rounded mb-8" style={{ width: '220px', background: '#141414' }} />
        <div className="h-5 animate-pulse rounded mb-3" style={{ width: '160px', background: '#141414' }} />
        <div className="h-2 animate-pulse rounded mb-12" style={{ width: '100px', background: '#141414' }} />
        <div className="h-48 animate-pulse rounded-[12px] mb-10" style={{ background: '#0f0f0f', border: '1px dashed #1c1c1c' }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-[12px] overflow-hidden" style={{ background: '#0f0f0f', border: '1px solid #1a1a1a' }}>
              <div className="animate-pulse" style={{ height: 190, background: '#141414' }} />
              <div className="p-4">
                <div className="h-3 animate-pulse mb-2 rounded" style={{ width: '65%', background: '#1a1a1a' }} />
                <div className="h-2 animate-pulse rounded" style={{ width: '40%', background: '#141414' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { projectId } = useParams()
  const navigate      = useNavigate()
  const { getToken }  = useAuth()
  const baseUrl       = import.meta.env.VITE_API_BASE_URL

  const [project, setProject]         = useState(null)
  const [images, setImages]           = useState([])
  const [isLoading, setIsLoading]     = useState(true)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploadError, setUploadError] = useState('')

  const fetchProject = useCallback(async () => {
    try {
      setIsLoading(true)
      const token = await getToken()
      const res   = await fetch(baseUrl + '/projects/' + projectId, {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!res.ok) throw new Error('Project not found')
      const json    = await res.json()
      const payload = json.data || json
      const projData = payload.project || payload
      const imgData  = payload.images || projData.images || []
      setProject(projData)
      setImages(imgData)
    } catch (err) {
      console.error('ProjectDetail fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [baseUrl, getToken, projectId])

  useEffect(() => { fetchProject() }, [fetchProject])

  const handleFilesSelected = useCallback(async (files) => {
    setUploadError('')
    const newPending = files.map((f) => ({ file: f, status: 'pending' }))
    setPendingFiles((prev) => [...prev, ...newPending])

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setPendingFiles((prev) =>
        prev.map((p) => (p.file === file ? { ...p, status: 'uploading' } : p))
      )
      try {
        const token    = await getToken()
        const formData = new FormData()
        formData.append('image', file)
        const res = await fetch(baseUrl + '/projects/' + projectId + '/images', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          body: formData,
        })
        if (!res.ok) throw new Error('Upload failed (' + res.status + ')')
        const json    = await res.json()
        const created = json.data || json
        setImages((prev) => [...prev, created])
        setPendingFiles((prev) =>
          prev.map((p) => (p.file === file ? { ...p, status: 'done' } : p))
        )
        window.dispatchEvent(new CustomEvent('dw_activity'))
      } catch (err) {
        setPendingFiles((prev) =>
          prev.map((p) => (p.file === file ? { ...p, status: 'error' } : p))
        )
        setUploadError(err.message)
      }
    }
    setTimeout(() => {
      setPendingFiles((prev) => prev.filter((p) => p.status !== 'done'))
    }, 2000)
  }, [baseUrl, getToken, projectId])

  const handleDelete = async () => {
    const name = project && (project.name || project.projectName || project.title) || 'this project'
    if (!window.confirm('Delete "' + name + '"? This cannot be undone.')) return
    try {
      const token = await getToken()
      const res   = await fetch(baseUrl + '/projects/' + projectId, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.message || 'Delete failed (' + res.status + ')')
        return
      }
      window.dispatchEvent(new CustomEvent('dw_activity'))
      navigate('/projects')
    } catch (err) {
      console.error('Delete error:', err)
      alert('Network error — could not delete project.')
    }
  }

  if (isLoading) return (
    <>
      <HeroBackground />
      <DetailSkeleton />
    </>
  )

  if (!project) return (
    <>
      <HeroBackground />
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ paddingTop: NAVBAR_H }}>
        <p className="font-mono text-[13px] text-[#555555] mb-6">Project not found.</p>
        <button
          onClick={() => navigate('/projects')}
          className="font-mono text-[11px] uppercase tracking-[0.18em] cursor-pointer"
          style={{ color: '#a1a1aa', background: 'transparent', border: '1px solid #2a2a2a', padding: '10px 20px' }}
        >
          &#8592; Back to Projects
        </button>
      </div>
    </>
  )

  const projectName = project.name || project.projectName || project.title || projectId

  return (
    <>
      <HeroBackground />
      <div
        className="min-h-screen relative z-10"
        style={{ paddingTop: NAVBAR_H, background: 'transparent' }}
      >
        <div style={{ maxWidth: 1500, margin: '0 auto', paddingLeft: 80, paddingRight: 80, paddingTop: 56, paddingBottom: 80 }}>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-2.5 mb-10">
            <Link
              to="/"
              className="font-mono text-[12px] text-[#404040] transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.color = '#888888' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#404040' }}
            >
              Home
            </Link>
            <span className="font-mono text-[12px] text-[#2a2a2a]">/</span>
            <Link
              to="/projects"
              className="font-mono text-[12px] text-[#404040] transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.color = '#888888' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#404040' }}
            >
              Projects
            </Link>
            <span className="font-mono text-[12px] text-[#2a2a2a]">/</span>
            <span className="font-mono text-[12px] text-[#d4d4d4] font-semibold">
              {projectName}
            </span>
          </div>

          {/* Project header */}
          <div
            className="flex items-start justify-between mb-14 pb-10"
            style={{ borderBottom: '1px solid #1c1c1c' }}
          >
            <div>
              <div className="flex items-center gap-4 mb-3">
                <span className="text-2xl">&#128193;</span>
                <h1 className="font-mono text-[28px] uppercase tracking-[0.2em] text-white font-bold leading-tight">
                  {projectName}
                </h1>
              </div>
              <p className="font-mono text-[13px] text-[#444444]">
                Total Imagery: {images.length} {images.length === 1 ? 'file' : 'files'}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.15em] cursor-pointer transition-all duration-150"
                style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#737373', padding: '10px 20px', borderRadius: 6 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#404040'; e.currentTarget.style.color = '#a1a1aa' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#737373' }}
              >
                <span>&#9881;</span> Settings
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.15em] cursor-pointer transition-all duration-150"
                style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#555555', padding: '10px 20px', borderRadius: 6 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#5a2a2a'; e.currentTarget.style.color = '#c97070'; e.currentTarget.style.background = 'rgba(90,42,42,0.12)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#555555'; e.currentTarget.style.background = 'transparent' }}
              >
                <span>&#128465;</span> Delete
              </button>
            </div>
          </div>

          {/* Upload Zone */}
          <section className="mb-14">
            <SectionLabel icon="&#8679;" text="Upload Zone" />
            <UploadZone onFilesSelected={handleFilesSelected} />
            {pendingFiles.length > 0 && (
              <div className="mt-3" style={{ border: '1px solid #1a1a1a', background: '#0a0a0a', borderRadius: 8 }}>
                {pendingFiles.map((p, i) => (
                  <PendingUploadItem key={i} file={p.file} status={p.status} />
                ))}
              </div>
            )}
            {uploadError && (
              <p className="font-mono text-[11px] mt-3" style={{ color: '#9e5e5e' }}>
                &#9888; {uploadError}
              </p>
            )}
          </section>

          {/* Image Gallery */}
          <section>
            <SectionLabel icon="&#128247;" text="Image Gallery" count={images.length + ' ' + (images.length === 1 ? 'file' : 'files')} />

            {images.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-24"
                style={{ border: '1px dashed #1c1c1c', borderRadius: 12 }}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mb-5">
                  <rect x="3" y="5" width="18" height="14" rx="1" stroke="#2a2a2a" strokeWidth="1.2" />
                  <circle cx="8.5" cy="10" r="1.5" stroke="#2a2a2a" strokeWidth="1.2" />
                  <path d="M3 16l5-4 4 3 3-2 6 4" stroke="#2a2a2a" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                <p className="font-mono text-[14px] text-[#383838] tracking-wide">
                  No imagery yet — upload your first file above.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                  {images.map((img) => (
                    <ImageCard
                      key={img._id || img.id || img.filename}
                      image={img}
                      projectId={projectId}
                      navigate={navigate}
                      baseUrl={baseUrl}
                    />
                  ))}
                </div>
                <p className="font-mono text-[11px] text-[#2e2e2e] mt-6 tracking-wide">
                  &#8627; Click any image to open the 3D Workspace
                </p>
              </>
            )}
          </section>

        </div>
      </div>
    </>
  )
}
