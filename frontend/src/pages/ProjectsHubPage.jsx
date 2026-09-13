import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { createPortal } from 'react-dom'

const NAVBAR_H = 108

// ── Status badge ─────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    completed:  { bg: '#1f2a1f', color: '#6b9e6b', label: 'Completed'  },
    active:     { bg: '#1a1f2a', color: '#6b7f9e', label: 'Active'      },
    processing: { bg: '#2a2a1a', color: '#9e9a6b', label: 'Processing'  },
    draft:      { bg: '#1c1c1c', color: '#555555', label: 'Draft'       },
  }
  const s = cfg[status?.toLowerCase()] ?? cfg.draft
  return (
    <span
      className="font-mono text-[11px] uppercase tracking-[0.15em] px-2.5 py-1"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}22` }}
    >
      {s.label}
    </span>
  )
}

// ── Create Project Modal (portal) ────────────────────
function CreateProjectModal({ onClose, onConfirm }) {
  const [name, setName]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')

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
      setError(err.message ?? 'Failed to create project.')
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
        role="dialog" aria-modal="true" aria-labelledby="hub-modal-title"
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
            <h2 id="hub-modal-title" className="font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: '#a1a1aa' }}>
              New Project
            </h2>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#555555', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ffffff' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#555555' }}
            >✕</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="hub-project-name" className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: '#555555' }}>
              Project Name
            </label>
            <input
              autoFocus
              id="hub-project-name"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); if (error) setError('') }}
              placeholder="e.g. Recon Mission Alpha"
              disabled={submitting}
              className="font-mono text-[13px]"
              style={{
                background: '#141414',
                border: `1px solid ${error ? '#5a2a2a' : '#2e2e2e'}`,
                color: '#ffffff', padding: '10px 12px',
                outline: 'none', borderRadius: 0, width: '100%',
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = '#555555' }}
              onBlur={e  => { if (!error) e.target.style.borderColor = '#2e2e2e' }}
            />
            {error && <span className="font-mono text-[10px]" style={{ color: '#a85555' }}>{error}</span>}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button" onClick={onClose} disabled={submitting}
              className="font-mono text-[10px] uppercase tracking-[0.18em] cursor-pointer"
              style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#737373', padding: '9px 20px' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#404040'; e.currentTarget.style.color = '#a1a1aa' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#737373' }}
            >Cancel</button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="font-mono text-[10px] uppercase tracking-[0.18em] font-bold cursor-pointer"
              style={{
                background: submitting ? '#b0b0b0' : '#e5e5e5',
                border: '1px solid #e5e5e5', color: '#000000',
                padding: '9px 20px',
                opacity: !name.trim() ? 0.4 : 1,
                cursor: !name.trim() ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => { if (name.trim() && !submitting) e.currentTarget.style.background = '#ffffff' }}
              onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = '#e5e5e5' }}
            >{submitting ? 'Creating…' : 'Create Project'}</button>
          </div>
        </form>
      </div>
    </>,
    document.body
  )
}

// ── Project Card ──────────────────────────────────────
function ProjectCard({ project, onClick }) {
  const imageCount = project.imageCount ?? project.images?.length ?? 0
  return (
    <button
      onClick={onClick}
      className="flex flex-col text-left transition-all duration-200 group cursor-pointer"
      style={{
        background: '#0f0f0f',
        border: '1px solid #1e1e1e',
        padding: '24px',
        width: '100%',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#333333'; e.currentTarget.style.background = '#141414' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.background = '#0f0f0f' }}
    >
      {/* Thumbnail strip */}
      <div
        className="w-full mb-5 flex items-center justify-center"
        style={{
          height: '130px',
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
        }}
      >
        {project.thumbnailUrl ? (
          <img src={project.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="1" stroke="#2a2a2a" strokeWidth="1.2" />
            <circle cx="8.5" cy="10" r="1.5" stroke="#2a2a2a" strokeWidth="1.2" />
            <path d="M3 16l5-4 4 3 3-2 6 4" stroke="#2a2a2a" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <span className="font-mono text-[15px] font-semibold text-white tracking-wide truncate w-full block mb-1">
        {project.name}
      </span>
      <span className="font-mono text-[12px] text-[#555555] mt-1">
        {imageCount} {imageCount === 1 ? 'image' : 'images'}
      </span>
    </button>
  )
}

// ── Create New Card ───────────────────────────────────
function CreateNewCard({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200"
      style={{
        background: 'transparent',
        border: '1px dashed #2a2a2a',
        padding: '24px',
        minHeight: '210px',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#555555'; e.currentTarget.style.background = '#0f0f0f' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.background = 'transparent' }}
    >
      <span className="text-[#404040] text-5xl mb-4 leading-none">+</span>
      <span className="font-mono text-[13px] uppercase tracking-[0.2em] text-[#555555]">Create New Project</span>
    </button>
  )
}

// ── Recent Image Card ─────────────────────────────────
function RecentCard({ project, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col text-left cursor-pointer transition-all duration-200"
      style={{
        background: '#0f0f0f',
        border: '1px solid #1e1e1e',
        padding: '24px',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#333333'; e.currentTarget.style.background = '#141414' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.background = '#0f0f0f' }}
    >
      {/* Thumbnail */}
      <div
        className="w-full mb-4 flex items-center justify-center"
        style={{ height: '100px', background: '#0a0a0a', border: '1px solid #1a1a1a' }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="14" rx="1" stroke="#2e2e2e" strokeWidth="1.2" />
          <circle cx="8.5" cy="10" r="1.5" stroke="#2e2e2e" strokeWidth="1.2" />
          <path d="M3 16l5-4 4 3 3-2 6 4" stroke="#2e2e2e" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </div>
      <span className="font-mono text-[15px] font-semibold text-[#d4d4d4] truncate w-full block mb-2">
        {project.name}
      </span>
      <StatusBadge status={project.status ?? 'draft'} />
    </button>
  )
}

// ── Section label ────────────────────────────────────
function SectionLabel({ icon, text }) {
  return (
    <div className="flex items-center gap-4 mb-7">
      {icon && <span className="text-xl">{icon}</span>}
      <span className="font-mono text-[14px] uppercase tracking-[0.2em] text-[#a1a1aa] font-semibold">
        {text}
      </span>
      <div className="flex-1 h-px" style={{ background: '#1c1c1c' }} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────
export default function ProjectsHubPage() {
  const navigate                = useNavigate()
  const { getToken }            = useAuth()
  const baseUrl                 = import.meta.env.VITE_API_BASE_URL

  const [projects, setProjects]     = useState([])
  const [isLoading, setIsLoading]   = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // ── Fetch all projects ────────────────────────────
  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true)
      const token = await getToken()
      const res   = await fetch(`${baseUrl}/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      const list = json.data ?? (Array.isArray(json) ? json : [])
      setProjects(list)
    } catch (err) {
      console.error('ProjectsHub: fetch error —', err)
    } finally {
      setIsLoading(false)
    }
  }, [baseUrl, getToken])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // ── Create project ────────────────────────────────
  const handleCreate = useCallback(async (projectName) => {
    const token = await getToken()
    const res   = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: projectName }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.message ?? `Server error ${res.status}`)
    }
    const json    = await res.json()
    const created = json.data ?? json
    setProjects(prev => [...prev, created])
    // Navigate straight into the new project
    navigate(`/projects/${created._id ?? created.id}`)
  }, [baseUrl, getToken, navigate])

  // Recent = last 3 projects (or however many we have)
  const recent = projects.slice(-3).reverse()

  return (
    <div
      className="min-h-screen relative z-10"
      style={{ paddingTop: NAVBAR_H, background: '#0a0a0a' }}
    >
      <div className="max-w-[1600px] mx-auto px-10 py-12">

        {/* ── Page header ── */}
        <div
          className="flex items-center justify-between mb-12 pb-8"
          style={{ borderBottom: '1px solid #1c1c1c' }}
        >
          <div>
            <h1
              className="font-mono text-[20px] uppercase tracking-[0.25em] text-white font-semibold mb-2"
            >
              DepthWizard Hub
            </h1>
            <p className="font-mono text-[13px] text-[#444444] tracking-wide">
              {isLoading ? '…' : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2.5 font-mono text-[13px] uppercase tracking-[0.2em] cursor-pointer transition-all duration-150"
            style={{
              background: 'transparent',
              border: '1px solid #2a2a2a',
              color: '#a1a1aa',
              padding: '12px 24px',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#555555'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = '#111111' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            New Project
          </button>
        </div>

        {isLoading ? (
          <HubSkeleton />
        ) : (
          <>
            {/* ── Jump Back In ── */}
            {recent.length > 0 && (
              <section className="mb-12">
                <SectionLabel icon="⚡" text="Jump Back In (Recent)" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ background: '#1a1a1a' }}>
                  {recent.map(p => (
                    <RecentCard
                      key={p._id ?? p.id}
                      project={p}
                      onClick={() => navigate(`/projects/${p._id ?? p.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── All Projects ── */}
            <section>
              <SectionLabel icon="📁" text={`All Projects (${projects.length})`} />
              {projects.length === 0 && !isLoading ? (
                <div
                  className="flex flex-col items-center justify-center py-28"
                  style={{ border: '1px dashed #1c1c1c' }}
                >
                  <span className="text-[#2a2a2a] text-6xl mb-6">◈</span>
                  <p className="font-mono text-[14px] text-[#404040] mb-8 tracking-wide">No projects yet. Create your first one.</p>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="font-mono text-[13px] uppercase tracking-[0.2em] cursor-pointer"
                    style={{ background: '#e5e5e5', color: '#000', border: '1px solid #e5e5e5', padding: '13px 32px' }}
                  >
                    + Create Project
                  </button>
                </div>
              ) : (
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-px"
                  style={{ background: '#1a1a1a' }}
                >
                  {projects.map(p => (
                    <ProjectCard
                      key={p._id ?? p.id}
                      project={p}
                      onClick={() => navigate(`/projects/${p._id ?? p.id}`)}
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
  )
}

// ── Skeleton loader ───────────────────────────────────
function HubSkeleton() {
  return (
    <div>
      <div className="mb-10">
        <div className="h-2 rounded animate-pulse mb-6" style={{ width: '120px', background: '#1a1a1a' }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ background: '#1a1a1a' }}>
          {[0,1,2].map(i => (
            <div key={i} className="p-4" style={{ background: '#0f0f0f' }}>
              <div className="h-14 animate-pulse mb-3" style={{ background: '#141414' }} />
              <div className="h-2 animate-pulse mb-2 rounded" style={{ width: '60%', background: '#141414' }} />
              <div className="h-2 animate-pulse rounded" style={{ width: '30%', background: '#141414' }} />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-px" style={{ background: '#1a1a1a' }}>
        {[0,1,2,3].map(i => (
          <div key={i} className="p-5" style={{ background: '#0f0f0f' }}>
            <div className="h-20 animate-pulse mb-4" style={{ background: '#141414' }} />
            <div className="h-2 animate-pulse mb-2 rounded" style={{ width: '70%', background: '#141414' }} />
            <div className="h-2 animate-pulse rounded" style={{ width: '40%', background: '#141414' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
