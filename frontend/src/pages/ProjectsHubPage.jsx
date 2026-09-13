import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { createPortal } from 'react-dom'
import HeroBackground from '../components/HeroBackground'

const NAVBAR_H = 108

// storagePath may be an absolute Windows path or 'uploads/file.ext'
function buildImageUrl(storagePath, baseUrl) {
  if (!storagePath) return null
  if (storagePath.startsWith('http')) return storagePath
  const serverRoot = baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
  const filename = storagePath.split(/[/\\]/).pop()
  return serverRoot + '/uploads/' + filename
}

// Mouse-spotlight glow card
function GlowCard({ children, onClick, dashed = false, style = {}, className = '' }) {
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
        (isHovered ? '-translate-y-1.5 ' : '') +
        className
      }
      style={{
        borderRadius: 14,
        border: dashed
          ? (isHovered ? '1px dashed #484848' : '1px dashed #242424')
          : (isHovered ? '1px solid #3c3c3c' : '1px solid #1a1a1a'),
        background: dashed
          ? (isHovered ? 'rgba(255,255,255,0.02)' : 'transparent')
          : (isHovered ? '#121212' : '#0b0b0b'),
        boxShadow: isHovered
          ? '0 20px 40px -12px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)'
          : '0 4px 12px rgba(0,0,0,0.4)',
        outline: 'none',
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, borderRadius: 14,
          pointerEvents: 'none', zIndex: 1,
          background: 'radial-gradient(320px circle at var(--gx) var(--gy), rgba(255,255,255,0.08) 0%, transparent 70%)',
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

// Modal to create a new project
function CreateProjectModal({ onClose, onConfirm }) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Project name is required.'); return }
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(trimmed)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create project.')
      setSubmitting(false)
    }
  }

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 99998,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-modal-title"
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(440px, calc(100vw - 2rem))',
          background: '#0f0f0f',
          border: '1px solid #2a2a2a',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
          zIndex: 99999,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1a1a1a' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2
              id="hub-modal-title"
              className="font-mono text-[11px] uppercase tracking-[0.22em]"
              style={{ color: '#a1a1aa' }}
            >
              New Project
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none',
                color: '#555555', cursor: 'pointer',
                fontSize: 18, lineHeight: 1, padding: '2px 4px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#555555' }}
            >
              x
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              htmlFor="hub-project-name"
              className="font-mono text-[10px] uppercase tracking-[0.2em]"
              style={{ color: '#555555' }}
            >
              Project Name
            </label>
            <input
              autoFocus
              id="hub-project-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (error) setError('') }}
              placeholder="e.g. Recon Mission Alpha"
              disabled={submitting}
              className="font-mono text-[13px]"
              style={{
                background: '#141414',
                border: '1px solid ' + (error ? '#5a2a2a' : '#2e2e2e'),
                color: '#ffffff',
                padding: '10px 12px',
                outline: 'none',
                borderRadius: 0,
                width: '100%',
              }}
              onFocus={(e) => { if (!error) e.target.style.borderColor = '#555555' }}
              onBlur={(e) => { if (!error) e.target.style.borderColor = '#2e2e2e' }}
            />
            {error && (
              <span className="font-mono text-[10px]" style={{ color: '#a85555' }}>
                {error}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="font-mono text-[10px] uppercase tracking-[0.18em] cursor-pointer"
              style={{
                background: 'transparent',
                border: '1px solid #2a2a2a',
                color: '#737373',
                padding: '9px 20px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#404040'; e.currentTarget.style.color = '#a1a1aa' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#737373' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="font-mono text-[10px] uppercase tracking-[0.18em] font-bold cursor-pointer"
              style={{
                background: submitting ? '#b0b0b0' : '#e5e5e5',
                border: '1px solid #e5e5e5',
                color: '#000000',
                padding: '9px 20px',
                opacity: !name.trim() ? 0.4 : 1,
                cursor: !name.trim() ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => { if (name.trim() && !submitting) e.currentTarget.style.background = '#ffffff' }}
              onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.background = '#e5e5e5' }}
            >
              {submitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body
  )
}

// One card = one uploaded image (Jump Back In section)
function RecentImageCard({ image, projectName, onClick }) {
  const [imgError, setImgError] = useState(false)
  const hasImage = !!image.url && !imgError
  const date = image.uploadedAt
    ? new Date(image.uploadedAt).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
    : null

  return (
    <GlowCard
      onClick={onClick}
      style={{ padding: 0, display: 'flex', flexDirection: 'column', width: '100%' }}
    >
      {/* Thumbnail */}
      <div
        className="w-full relative flex items-center justify-center overflow-hidden"
        style={{ height: 185, background: '#080808', borderRadius: '14px 14px 0 0' }}
      >
        {hasImage ? (
          <img
            src={image.url}
            alt={image.filename || projectName}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 group-hover:brightness-110"
          />
        ) : (
          <div className="flex flex-col items-center gap-2.5" style={{ opacity: 0.35 }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="#888" strokeWidth="1.2" />
              <circle cx="8.5" cy="10" r="1.5" stroke="#888" strokeWidth="1.2" />
              <path d="M3 16l5-4 4 3 3-2 6 4" stroke="#888" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#666]">No preview</span>
          </div>
        )}

        {/* Hover overlay */}
        <div
          className="absolute inset-0 flex items-end justify-between p-3.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
            borderRadius: '14px 14px 0 0',
          }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white font-medium">
            Open Project
          </span>
          <span className="font-mono text-[13px] text-white">&#8599;</span>
        </div>
      </div>

      {/* Info */}
      <div className="px-5 pt-4 pb-5 flex flex-col gap-1.5">
        <span className="font-mono text-[14px] font-semibold text-[#e5e5e5] group-hover:text-white transition-colors duration-200 truncate block tracking-wide">
          {projectName}
        </span>
        {date && (
          <span className="font-mono text-[11px] text-[#555555]">{date}</span>
        )}
        {image.filename && (
          <span className="font-mono text-[10px] text-[#303030] truncate block mt-0.5">
            {image.filename}
          </span>
        )}
      </div>
    </GlowCard>
  )
}

// Project card for the All Projects grid
function ProjectCard({ project, onClick }) {
  const imageCount = project.imageCount || 0
  const date = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
    : null

  return (
    <GlowCard
      onClick={onClick}
      style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}
    >
      <div className="flex items-start gap-3 mb-4">
        <span
          className="text-xl flex-shrink-0 group-hover:scale-110 transition-transform duration-200"
          style={{ marginTop: 1 }}
        >
          &#128193;
        </span>
        <span className="font-mono text-[15px] font-semibold text-white tracking-wide leading-snug truncate">
          {project.name}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] text-[#444444] group-hover:text-[#666666] transition-colors">
          {imageCount} {imageCount === 1 ? 'image' : 'images'}
        </span>
        {date && (
          <span className="font-mono text-[11px] text-[#3a3a3a]">{date}</span>
        )}
      </div>

      <div
        className="mt-auto pt-4 flex items-center"
        style={{ borderTop: '1px solid #1a1a1a' }}
      >
        <span className="font-mono text-[10px] text-[#444444] uppercase tracking-[0.18em] group-hover:text-white group-hover:translate-x-1 transition-all duration-200">
          Open &#8594;
        </span>
      </div>
    </GlowCard>
  )
}

// Dashed "add new" card
function CreateNewCard({ onClick }) {
  return (
    <GlowCard
      dashed
      onClick={onClick}
      style={{
        padding: '24px', minHeight: 200,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        width: '100%',
      }}
    >
      <span
        className="text-[#333333] group-hover:text-white group-hover:scale-125 transition-all duration-300"
        style={{ fontSize: 44, lineHeight: 1, marginBottom: 14 }}
      >
        +
      </span>
      <span className="font-mono text-[12px] uppercase tracking-[0.2em] text-[#404040] group-hover:text-[#d4d4d4] transition-colors duration-200">
        New Project
      </span>
    </GlowCard>
  )
}

// Section heading with decorative rule
function SectionLabel({ icon, text }) {
  return (
    <div className="flex items-center gap-3.5 mb-8">
      {icon && <span className="text-xl sm:text-2xl">{icon}</span>}
      <span className="font-mono text-[16px] sm:text-[18px] uppercase tracking-[0.22em] text-[#e5e5e5] font-bold">
        {text}
      </span>
      <div
        className="flex-1 h-px ml-3"
        style={{ background: 'linear-gradient(to right, #2a2a2a, rgba(42,42,42,0.1) 80%, transparent)' }}
      />
    </div>
  )
}

// Loading skeleton
function HubSkeleton() {
  return (
    <div>
      <div className="mb-12">
        <div className="h-2 rounded animate-pulse mb-8" style={{ width: '140px', background: '#1a1a1a' }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-[14px] overflow-hidden" style={{ background: '#0f0f0f', border: '1px solid #1a1a1a' }}>
              <div className="animate-pulse" style={{ height: 185, background: '#141414' }} />
              <div className="p-5">
                <div className="h-3 animate-pulse mb-2 rounded" style={{ width: '65%', background: '#1a1a1a' }} />
                <div className="h-2 animate-pulse rounded" style={{ width: '40%', background: '#141414' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[14px] p-6" style={{ background: '#0f0f0f', border: '1px solid #1a1a1a' }}>
            <div className="h-4 animate-pulse mb-4 rounded" style={{ width: '70%', background: '#1a1a1a' }} />
            <div className="h-2 animate-pulse mb-2 rounded" style={{ width: '45%', background: '#141414' }} />
            <div className="h-2 animate-pulse rounded" style={{ width: '30%', background: '#141414' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function ProjectsHubPage() {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const baseUrl = import.meta.env.VITE_API_BASE_URL

  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  // Flat list of all images across all projects, sorted newest-first
  const [recentUploads, setRecentUploads] = useState([])

  const fetchProjects = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true)
      const token = await getToken()

      const res = await fetch(baseUrl + '/projects', {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!res.ok) throw new Error('Failed to fetch projects')
      const json = await res.json()
      const list = json.data || (Array.isArray(json) ? json : [])

      const allUploads = []

      const enhanced = await Promise.all(
        list.map(async (p) => {
          const pId = p._id || p.id
          if (!pId) return p
          try {
            const dRes = await fetch(baseUrl + '/projects/' + pId, {
              headers: { Authorization: 'Bearer ' + token },
            })
            if (!dRes.ok) return p
            const dJson = await dRes.json()
            const payload = dJson.data || dJson
            const imgs = payload.images || (payload.project && payload.project.images) || []

            imgs.forEach((img) => {
              const url = buildImageUrl(img.storagePath, baseUrl)
              allUploads.push({
                url,
                filename: img.filename || null,
                uploadedAt: img.uploadedAt || img.createdAt || null,
                projectId: pId,
                projectName: p.name,
              })
            })

            return Object.assign({}, p, { imageCount: imgs.length })
          } catch (_) {
            return p
          }
        })
      )

      // Newest uploads first; keep top 6
      allUploads.sort((a, b) => {
        const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
        const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
        return tb - ta
      })

      setRecentUploads(allUploads.slice(0, 6))
      setProjects(enhanced)
    } catch (err) {
      console.error('Hub fetch error:', err)
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [baseUrl, getToken])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // Poll every 20 s + react to same-tab upload/delete/result events
  useEffect(() => {
    const interval = setInterval(() => fetchProjects(true), 20000)
    const onActivity = () => fetchProjects(true)
    window.addEventListener('dw_activity', onActivity)
    return () => {
      clearInterval(interval)
      window.removeEventListener('dw_activity', onActivity)
    }
  }, [fetchProjects])

  const handleCreate = useCallback(async (projectName) => {
    const token = await getToken()
    const res = await fetch(baseUrl + '/projects', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: projectName }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.message || ('Server error ' + res.status))
    }
    const json = await res.json()
    const created = json.data || json
    setProjects((prev) => [...prev, created])
    navigate('/projects/' + (created._id || created.id))
  }, [baseUrl, getToken, navigate])

  return (
    <>
      <HeroBackground />
      <div
        className="min-h-screen relative z-10"
        style={{ paddingTop: NAVBAR_H, background: 'transparent' }}
      >
        <div style={{ maxWidth: 1500, margin: '0 auto', paddingLeft: 40, paddingRight: 40, paddingTop: 64, paddingBottom: 64 }}>

          {/* Page header */}
          <div
            className="flex items-center justify-between pt-6 pb-12 mb-16"
            style={{ borderBottom: '1px solid #1c1c1c' }}
          >
            <div>
              <h1 className="font-mono text-[32px] uppercase tracking-[0.22em] text-white font-semibold mb-3 leading-tight">
                DepthWizard Hub
              </h1>
              <p className="font-mono text-[13px] text-[#444444] tracking-wide">
                {isLoading
                  ? 'Loading\u2026'
                  : projects.length + ' project' + (projects.length !== 1 ? 's' : '')}
              </p>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2.5 font-mono text-[13px] uppercase tracking-[0.2em] cursor-pointer transition-all duration-150"
              style={{
                background: 'transparent',
                border: '1px solid #2a2a2a',
                color: '#a1a1aa',
                padding: '14px 28px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#555555'
                e.currentTarget.style.color = '#ffffff'
                e.currentTarget.style.background = '#111111'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#2a2a2a'
                e.currentTarget.style.color = '#a1a1aa'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
              New Project
            </button>
          </div>

          {isLoading ? (
            <HubSkeleton />
          ) : (
            <>
              {/* Jump Back In — one slot per recently-uploaded image */}
              {recentUploads.length > 0 && (
                <section className="mb-20">
                  <SectionLabel icon="&#9889;" text="Jump Back In" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    {recentUploads.map((img, idx) => (
                      <RecentImageCard
                        key={img.projectId + '-' + (img.filename || '') + '-' + idx}
                        image={img}
                        projectName={img.projectName}
                        onClick={() => navigate('/projects/' + img.projectId)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* All Projects */}
              <section className="mt-6">
                <SectionLabel icon="&#128193;" text={'All Projects (' + projects.length + ')'} />
                {projects.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center py-28"
                    style={{ border: '1px dashed #1c1c1c', borderRadius: 14 }}
                  >
                    <span className="text-[#2a2a2a] text-6xl mb-6">&#9672;</span>
                    <p className="font-mono text-[14px] text-[#404040] mb-8 tracking-wide">
                      No projects yet. Create your first one.
                    </p>
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="font-mono text-[13px] uppercase tracking-[0.2em] cursor-pointer"
                      style={{
                        background: '#e5e5e5', color: '#000',
                        border: '1px solid #e5e5e5', padding: '13px 32px',
                      }}
                    >
                      + Create Project
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    {projects.map((p) => (
                      <ProjectCard
                        key={p._id || p.id}
                        project={p}
                        onClick={() => navigate('/projects/' + (p._id || p.id))}
                      />
                    ))}
                    <CreateNewCard onClick={() => setIsModalOpen(true)} />
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {isModalOpen && (
          <CreateProjectModal
            onClose={() => setIsModalOpen(false)}
            onConfirm={handleCreate}
          />
        )}
      </div>
    </>
  )
}
