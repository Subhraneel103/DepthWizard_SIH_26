import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'

const NAVBAR_H = 108

// ── Status badge ─────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    completed:  { bg: '#1c2a1c', color: '#5e9e5e', dot: '#5e9e5e', label: 'Completed'  },
    processing: { bg: '#2a2a1a', color: '#9e9a5e', dot: '#9e9a5e', label: 'Processing' },
    raw:        { bg: '#1c1c2a', color: '#5e6f9e', dot: '#5e6f9e', label: 'Raw / Idle' },
    idle:       { bg: '#1c1c2a', color: '#5e6f9e', dot: '#5e6f9e', label: 'Raw / Idle' },
    draft:      { bg: '#1c1c1c', color: '#555555', dot: '#555555', label: 'Draft'       },
  }
  const s = cfg[status?.toLowerCase()] ?? cfg.draft
  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] px-3 py-1"
      style={{ background: s.bg, color: s.color }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  )
}

// ── Image Card ────────────────────────────────────────
function ImageCard({ image, projectId, navigate }) {
  const filename = image.filename ?? image.name ?? 'unknown.jpg'
  const date     = image.createdAt
    ? new Date(image.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div
      className="flex flex-col cursor-pointer transition-all duration-200 group"
      style={{ background: '#0f0f0f', border: '1px solid #1e1e1e' }}
      onClick={() => navigate(`/projects/${projectId}/workspace/${image._id ?? image.id}`)}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#333333'; e.currentTarget.style.background = '#141414' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.background = '#0f0f0f' }}
    >
      {/* Thumbnail */}
      <div
        className="w-full flex items-center justify-center relative overflow-hidden"
        style={{ height: '160px', background: '#0a0a0a', borderBottom: '1px solid #1a1a1a' }}
      >
        {image.thumbnailUrl || image.url ? (
          <img src={image.thumbnailUrl ?? image.url} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="1" stroke="#2a2a2a" strokeWidth="1.2" />
            <circle cx="8.5" cy="10" r="1.5" stroke="#2a2a2a" strokeWidth="1.2" />
            <path d="M3 16l5-4 4 3 3-2 6 4" stroke="#2a2a2a" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        )}
        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white">
            Open Workspace ↗
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className="p-4 flex flex-col gap-2">
        <span className="font-mono text-[13px] text-[#d4d4d4] truncate font-medium">{filename}</span>
        <StatusBadge status={image.status ?? 'raw'} />
        <span className="font-mono text-[11px] text-[#444444] mt-0.5">{date}</span>
      </div>
    </div>
  )
}

// ── Drop Zone ─────────────────────────────────────────
function UploadZone({ onFilesSelected }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length) onFilesSelected(files)
  }

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files)
    if (files.length) onFilesSelected(files)
    e.target.value = ''
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragEnter={() => setIsDragOver(true)}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className="flex flex-col items-center justify-center cursor-pointer transition-all duration-200 select-none"
      style={{
        border: `1px dashed ${isDragOver ? '#555555' : '#2a2a2a'}`,
        background: isDragOver ? '#111111' : 'transparent',
        padding: '60px 32px',
        minHeight: '200px',
      }}
      onMouseEnter={e => { if (!isDragOver) { e.currentTarget.style.borderColor = '#3a3a3a'; e.currentTarget.style.background = '#0a0a0a' } }}
      onMouseLeave={e => { if (!isDragOver) { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.background = 'transparent' } }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Cloud icon */}
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="mb-5">
        <path
          d="M8 17H6a4 4 0 0 1 0-8h.5A5.5 5.5 0 0 1 17.5 10H18a3 3 0 0 1 0 6h-2"
          stroke={isDragOver ? '#a1a1aa' : '#404040'} strokeWidth="1.3" strokeLinecap="round"
        />
        <path d="M12 13v6M9 16l3-3 3 3" stroke={isDragOver ? '#a1a1aa' : '#404040'} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <p className="font-mono text-[15px] text-[#555555] mb-2.5">
        {isDragOver ? 'Drop imagery here' : 'Drag & Drop Drone Imagery Here'}
      </p>
      <p className="font-mono text-[13px] text-[#383838]">
        or{' '}
        <span className="text-[#737373] underline underline-offset-2 cursor-pointer">Browse Files</span>
      </p>
      <p className="font-mono text-[11px] text-[#2a2a2a] mt-4 uppercase tracking-[0.15em]">
        JPG · PNG · TIFF · WebP
      </p>
    </div>
  )
}

// ── Pending upload preview ────────────────────────────
function PendingUploadItem({ file, status }) {
  const statusCfg = {
    pending:    { color: '#555555', label: 'Queued'     },
    uploading:  { color: '#9e9a5e', label: 'Uploading…' },
    done:       { color: '#5e9e5e', label: 'Done'       },
    error:      { color: '#9e5e5e', label: 'Failed'     },
  }
  const s = statusCfg[status] ?? statusCfg.pending
  return (
    <div className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: '1px solid #111111' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="14" rx="1" stroke="#333333" strokeWidth="1.2" />
        <circle cx="8.5" cy="10" r="1.5" stroke="#333333" strokeWidth="1.2" />
        <path d="M3 16l5-4 4 3 3-2 6 4" stroke="#333333" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-[10px] text-[#737373] flex-1 truncate">{file.name}</span>
      <span className="font-mono text-[9px]" style={{ color: s.color }}>{s.label}</span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────
export default function ProjectDetailPage() {
  const { projectId }    = useParams()
  const navigate         = useNavigate()
  const { getToken }     = useAuth()
  const baseUrl          = import.meta.env.VITE_API_BASE_URL

  const [project, setProject]           = useState(null)
  const [images, setImages]             = useState([])
  const [isLoading, setIsLoading]       = useState(true)
  const [pendingFiles, setPendingFiles] = useState([])  // { file, status }
  const [uploadError, setUploadError]   = useState('')

  // ── Fetch project + its images ─────────────────────
  const fetchProject = useCallback(async () => {
    try {
      setIsLoading(true)
      const token = await getToken()
      const res   = await fetch(`${baseUrl}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Project not found')
      const json = await res.json()
      const data = json.data ?? json
      setProject(data)
      // Images may be nested or on a separate field
      const imgs = data.images ?? []
      setImages(imgs)
    } catch (err) {
      console.error('ProjectDetail: fetch error —', err)
    } finally {
      setIsLoading(false)
    }
  }, [baseUrl, getToken, projectId])

  useEffect(() => { fetchProject() }, [fetchProject])

  // ── Handle file drop / selection ──────────────────
  const handleFilesSelected = useCallback(async (files) => {
    setUploadError('')
    const newPending = files.map(f => ({ file: f, status: 'pending' }))
    setPendingFiles(prev => [...prev, ...newPending])

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      // Update status → uploading
      setPendingFiles(prev =>
        prev.map(p => p.file === file ? { ...p, status: 'uploading' } : p)
      )
      try {
        const token   = await getToken()
        const formData = new FormData()
        formData.append('image', file)
        const res = await fetch(`${baseUrl}/projects/${projectId}/images`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        if (!res.ok) throw new Error(`Upload failed (${res.status})`)
        const json    = await res.json()
        const created = json.data ?? json
        setImages(prev => [...prev, created])
        setPendingFiles(prev =>
          prev.map(p => p.file === file ? { ...p, status: 'done' } : p)
        )
      } catch (err) {
        setPendingFiles(prev =>
          prev.map(p => p.file === file ? { ...p, status: 'error' } : p)
        )
        setUploadError(err.message)
      }
    }

    // Clear completed items after 2 s
    setTimeout(() => {
      setPendingFiles(prev => prev.filter(p => p.status !== 'done'))
    }, 2000)
  }, [baseUrl, getToken, projectId])

  // ── Delete project ────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm(`Delete "${project?.name}"? This cannot be undone.`)) return
    try {
      const token = await getToken()
      await fetch(`${baseUrl}/projects/${projectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      navigate('/projects')
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  if (isLoading) return <DetailSkeleton />

  if (!project) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ paddingTop: NAVBAR_H, background: '#0a0a0a' }}>
      <p className="font-mono text-[12px] text-[#555555]">Project not found.</p>
      <button
        onClick={() => navigate('/projects')}
        className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] cursor-pointer"
        style={{ color: '#a1a1aa', background: 'transparent', border: '1px solid #2a2a2a', padding: '8px 16px' }}
      >← Back to Projects</button>
    </div>
  )

  return (
    <div className="min-h-screen relative z-10" style={{ paddingTop: NAVBAR_H, background: '#0a0a0a' }}>
      <div className="max-w-[1600px] mx-auto px-10 py-10">

        {/* ── Breadcrumbs ── */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            to="/"
            className="font-mono text-[13px] text-[#444444] hover:text-[#888888] transition-colors"
          >
            Home
          </Link>
          <span className="font-mono text-[13px] text-[#2e2e2e]">/</span>
          <Link
            to="/projects"
            className="font-mono text-[13px] text-[#444444] hover:text-[#888888] transition-colors"
          >
            Projects
          </Link>
          <span className="font-mono text-[13px] text-[#2e2e2e]">/</span>
          <span className="font-mono text-[13px] text-[#d4d4d4] font-semibold tracking-wide">
            {project.name}
          </span>
        </div>

        {/* ── Project header ── */}
        <div
          className="flex items-start justify-between mb-10 pb-8"
          style={{ borderBottom: '1px solid #1c1c1c' }}
        >
          <div>
            <div className="flex items-center gap-4 mb-3">
              <span className="text-2xl">📁</span>
              <h1
                className="font-mono text-[22px] uppercase tracking-[0.2em] text-white font-bold"
              >
                {project.name}
              </h1>
            </div>
            <p className="font-mono text-[13px] text-[#444444]">
              Total Imagery: {images.length} {images.length === 1 ? 'file' : 'files'}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.15em] cursor-pointer transition-all duration-150"
              style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#737373', padding: '10px 20px' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#404040'; e.currentTarget.style.color = '#a1a1aa' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#737373' }}
            >
              <span>⚙</span> Settings
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.15em] cursor-pointer transition-all duration-150"
              style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#555555', padding: '10px 20px' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#5a2a2a'; e.currentTarget.style.color = '#9e5e5e' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#555555' }}
            >
              <span>🗑</span> Delete
            </button>
          </div>
        </div>

        {/* ── Upload Zone ── */}
        <section className="mb-10">
          <div className="flex items-center gap-4 mb-5">
            <span className="font-mono text-[14px] uppercase tracking-[0.2em] text-[#a1a1aa] font-semibold">Upload Zone</span>
            <div className="flex-1 h-px" style={{ background: '#1c1c1c' }} />
          </div>

          <UploadZone onFilesSelected={handleFilesSelected} />

          {/* Pending uploads list */}
          {pendingFiles.length > 0 && (
            <div className="mt-2" style={{ border: '1px solid #1a1a1a', background: '#0a0a0a' }}>
              {pendingFiles.map((p, i) => (
                <PendingUploadItem key={i} file={p.file} status={p.status} />
              ))}
            </div>
          )}
          {uploadError && (
            <p className="font-mono text-[10px] mt-2" style={{ color: '#9e5e5e' }}>
              ⚠ {uploadError}
            </p>
          )}
        </section>

        {/* ── Image Gallery ── */}
        <section>
          <div className="flex items-center gap-4 mb-5">
            <span className="font-mono text-[14px] uppercase tracking-[0.2em] text-[#a1a1aa] font-semibold">Image Gallery</span>
            <span className="font-mono text-[12px] text-[#404040]">
              {images.length} {images.length === 1 ? 'file' : 'files'}
            </span>
            <div className="flex-1 h-px" style={{ background: '#1c1c1c' }} />
          </div>

          {images.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-20"
              style={{ border: '1px dashed #1c1c1c' }}
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
            <div
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-px"
              style={{ background: '#1a1a1a' }}
            >
              {images.map((img) => (
                <ImageCard
                  key={img._id ?? img.id ?? img.filename}
                  image={img}
                  projectId={projectId}
                  navigate={navigate}
                />
              ))}
            </div>
          )}

          {/* Workspace hint */}
          {images.length > 0 && (
            <p className="font-mono text-[11px] text-[#333333] mt-5 tracking-wide">
              ↳ Click any image to open the 3D Workspace ({' '}
              <span className="text-[#484848]">/projects/:projectId/workspace/:id</span>
              {' '})
            </p>
          )}
        </section>

      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────
function DetailSkeleton() {
  return (
    <div className="min-h-screen" style={{ paddingTop: NAVBAR_H, background: '#0a0a0a' }}>
      <div className="max-w-[1600px] mx-auto px-10 py-10">
        <div className="h-2 animate-pulse rounded mb-6" style={{ width: '240px', background: '#141414' }} />
        <div className="h-4 animate-pulse rounded mb-3" style={{ width: '180px', background: '#141414' }} />
        <div className="h-2 animate-pulse rounded mb-10" style={{ width: '100px', background: '#141414' }} />
        <div className="h-40 animate-pulse mb-8" style={{ background: '#0f0f0f', border: '1px dashed #1c1c1c' }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ background: '#1a1a1a' }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ background: '#0f0f0f' }}>
              <div className="h-28 animate-pulse" style={{ background: '#141414' }} />
              <div className="p-3">
                <div className="h-2 animate-pulse rounded mb-2" style={{ width: '70%', background: '#141414' }} />
                <div className="h-2 animate-pulse rounded" style={{ width: '40%', background: '#141414' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
