import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from '@clerk/clerk-react'
import fullLogo from '../assets/fulllogo.png'

// ── Chevron icon ─────────────────────────────────────
function ChevronDown({ open }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
        flexShrink: 0,
      }}
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Skeleton loader row ───────────────────────────────
function SkeletonRow() {
  return (
    <div className="px-3 py-2 flex items-center gap-2">
      <div
        className="h-2 rounded-full animate-pulse"
        style={{ width: '60%', background: '#1e1e1e' }}
      />
    </div>
  )
}

// ── Create Project Modal ─────────────────────────────
function CreateProjectModal({ onClose, onConfirm }) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // Focus input on open
  useEffect(() => { inputRef.current?.focus() }, [])

  // Close on Escape
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
      setError(err.message ?? 'Failed to create project. Try again.')
      setSubmitting(false)
    }
  }

  return createPortal(
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 99998,
        }}
      />

      {/* ── Panel ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(440px, calc(100vw - 2rem))',
          background: '#0f0f0f',
          border: '1px solid #2a2a2a',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1a1a1a' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2
              id="modal-title"
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
              aria-label="Close"
              onMouseEnter={e => { e.currentTarget.style.color = '#ffffff' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#555555' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Name field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              htmlFor="project-name"
              className="font-mono text-[10px] uppercase tracking-[0.2em]"
              style={{ color: '#555555' }}
            >
              Project Name
            </label>
            <input
              ref={inputRef}
              id="project-name"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); if (error) setError('') }}
              placeholder="e.g. Recon Mission Alpha"
              disabled={submitting}
              className="font-mono text-[13px]"
              style={{
                background: '#141414',
                border: `1px solid ${error ? '#5a2a2a' : '#2e2e2e'}`,
                color: '#ffffff',
                padding: '10px 12px',
                outline: 'none',
                borderRadius: 0,
                width: '100%',
                transition: 'border-color 150ms',
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = '#555555' }}
              onBlur={e => { if (!error) e.target.style.borderColor = '#2e2e2e' }}
            />
            {error && (
              <span className="font-mono text-[10px]" style={{ color: '#a85555' }}>
                {error}
              </span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="font-mono text-[10px] uppercase tracking-[0.18em] cursor-pointer transition-colors duration-150"
              style={{
                background: 'transparent',
                border: '1px solid #2a2a2a',
                color: '#737373',
                padding: '9px 20px',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#404040'; e.currentTarget.style.color = '#a1a1aa' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#737373' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="font-mono text-[10px] uppercase tracking-[0.18em] font-bold cursor-pointer transition-all duration-150"
              style={{
                background: submitting ? '#b0b0b0' : '#e5e5e5',
                border: '1px solid #e5e5e5',
                color: '#000000',
                padding: '9px 20px',
                opacity: !name.trim() ? 0.4 : 1,
                cursor: !name.trim() ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => { if (name.trim() && !submitting) e.currentTarget.style.background = '#ffffff' }}
              onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = '#e5e5e5' }}
            >
              {submitting ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body
  )
}

// ── Project Selector dropdown ─────────────────────────
function ProjectSelector({ baseUrl, getToken }) {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const wrapperRef = useRef(null)

  // ── Fetch projects ──────────────────────────────────
  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true)
      const token = await getToken();
      console.log("My generated token is:", token);
      const res = await fetch(`${baseUrl}/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to fetch projects')
      const data = await res.json()
      // Support both { projects: [] } and a bare array
      const list = Array.isArray(data) ? data : (data.projects ?? [])
      setProjects(list)
      if (list.length > 0 && !selectedProject) setSelectedProject(list[0])
    } catch (err) {
      console.error('ProjectSelector: fetch error —', err)
    } finally {
      setIsLoading(false)
    }
  }, [baseUrl, getToken, selectedProject])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // ── Close on outside click ──────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Create project (called by modal onConfirm) ───────
  const handleCreateProject = useCallback(async (projectName) => {
    const token = await getToken()
    const res = await fetch(`${baseUrl}/projects`, {
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
    const created = await res.json()
    const newProject = created.project ?? created
    setProjects(prev => [...prev, newProject])
    setSelectedProject(newProject)
    setIsDropdownOpen(false)
    // isModalOpen closed by modal itself after onConfirm resolves
  }, [baseUrl, getToken])

  const displayName = selectedProject?.name ?? 'Select Project...'

  return (
    <div ref={wrapperRef} className="relative ml-6">
      {/* ── Trigger ── */}
      <button
        onClick={() => setIsDropdownOpen(o => !o)}
        className="flex items-center gap-2 cursor-pointer transition-colors duration-150"
        style={{
          height: '30px',
          padding: '0 10px',
          background: '#141414',
          border: `1px solid ${isDropdownOpen ? '#444444' : '#2e2e2e'}`,
          borderRadius: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1c1c1c'; e.currentTarget.style.borderColor = '#3a3a3a' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#141414'; e.currentTarget.style.borderColor = isDropdownOpen ? '#444444' : '#2e2e2e' }}
      >
        {/* Folder icon */}
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 3.5C1 2.948 1.448 2.5 2 2.5h2.17a1 1 0 0 1 .707.293L5.5 3.5H9c.552 0 1 .448 1 1V8c0 .552-.448 1-1 1H2a1 1 0 0 1-1-1V3.5Z"
            stroke="#555555" strokeWidth="1" fill="none" />
        </svg>
        <span
          className="font-mono tracking-wide whitespace-nowrap"
          style={{
            fontSize: '11px',
            color: selectedProject ? '#c8c8c8' : '#555555',
            maxWidth: '140px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayName}
        </span>
        <span style={{ color: '#555555' }}>
          <ChevronDown open={isDropdownOpen} />
        </span>
      </button>

      {/* ── Dropdown panel ── */}
      {isDropdownOpen && (
        <div
          className="absolute flex flex-col"
          style={{
            top: 'calc(100% + 6px)',
            left: 0,
            width: '220px',
            background: 'rgba(10,10,10,0.97)',
            backdropFilter: 'blur(16px) saturate(140%)',
            WebkitBackdropFilter: 'blur(16px) saturate(140%)',
            border: '1px solid #2a2a2a',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)',
            zIndex: 9999,
          }}
        >
          {/* Header */}
          <div
            className="px-3 py-2 flex items-center justify-between"
            style={{ borderBottom: '1px solid #1e1e1e' }}
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#404040]">
              Projects
            </span>
            <span className="font-mono text-[9px] text-[#2e2e2e]">
              {isLoading ? '…' : `${projects.length}`}
            </span>
          </div>

          {/* Project list */}
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {isLoading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : projects.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <span className="font-mono text-[10px] text-[#383838]">No projects yet</span>
              </div>
            ) : (
              projects.map((proj) => {
                const isSelected = selectedProject?.id === proj.id
                return (
                  <button
                    key={proj.id ?? proj._id ?? proj.name}
                    onClick={() => { setSelectedProject(proj); setIsDropdownOpen(false) }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 transition-colors duration-100 cursor-pointer"
                    style={{
                      background: isSelected ? '#1a1a1a' : 'transparent',
                      border: 'none',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#161616' }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#1a1a1a' : 'transparent' }}
                  >
                    {/* Active indicator */}
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        flexShrink: 0,
                        background: isSelected ? '#a1a1aa' : 'transparent',
                        border: isSelected ? '1px solid #a1a1aa' : '1px solid #333333',
                        borderRadius: '50%',
                      }}
                    />
                    <span
                      className="font-mono text-[11px] tracking-wide truncate"
                      style={{ color: isSelected ? '#e5e5e5' : '#737373' }}
                    >
                      {proj.name}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* Create project footer */}
          <div style={{ borderTop: '1px solid #1e1e1e' }}>
            <button
              onClick={() => { setIsDropdownOpen(false); setIsModalOpen(true) }}
              className="w-full text-left flex items-center gap-2 px-3 py-2.5 transition-colors duration-100 cursor-pointer"
              style={{ background: 'transparent', border: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#141414' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ color: '#555555', fontSize: 14, lineHeight: 1 }}>+</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-white">
                Create Project
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── Create Project Modal (portal) ── */}
      {isModalOpen && (
        <CreateProjectModal
          onClose={() => setIsModalOpen(false)}
          onConfirm={handleCreateProject}
        />
      )}
    </div>
  )
}

// ── Navbar ────────────────────────────────────────────
export default function Navbar() {
  const { getToken, isSignedIn } = useAuth()
  const baseUrl = import.meta.env.VITE_API_BASE_URL

  return (
    <header
      style={{
        background: '#000000',
        borderBottom: '1px solid #1c1c1c',
        boxShadow: '0 1px 0 rgba(255,255,255,0.03)',
      }}
      className="fixed top-0 left-0 right-0 z-50 h-[108px]"
    >
      <div
        className="flex items-center justify-between h-full"
        style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
      >

        {/* ── Left: Logo + Project Selector ── */}
        <div className="flex items-center flex-shrink-0">
          <img
            src={fullLogo}
            alt="DepthWizard"
            style={{ height: '84px', width: 'auto', objectFit: 'contain' }}
            draggable={false}
          />

          {/* Project Selector — authenticated users only */}
          <SignedIn>
            <ProjectSelector baseUrl={baseUrl} getToken={getToken} />
          </SignedIn>
        </div>

        {/* ── Right: Auth controls ── */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
          <SignedOut>

            {/* Sign In */}
            <SignInButton mode="modal">
              <button
                className="font-mono text-[11px] uppercase tracking-[0.18em] font-medium cursor-pointer transition-all duration-150"
                style={{
                  color: '#c8c8c8',
                  border: '1px solid #4a4a4a',
                  background: 'transparent',
                  padding: '10px 24px',
                  lineHeight: 1,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#ffffff'
                  e.currentTarget.style.border = '1px solid #6a6a6a'
                  e.currentTarget.style.background = '#1a1a1a'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = '#c8c8c8'
                  e.currentTarget.style.border = '1px solid #4a4a4a'
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                Sign In
              </button>
            </SignInButton>

            {/* Sign Up */}
            <SignUpButton mode="modal">
              <button
                className="font-mono text-[11px] uppercase tracking-[0.18em] font-bold cursor-pointer transition-all duration-150"
                style={{
                  color: '#000000',
                  background: '#e5e5e5',
                  border: '1px solid #e5e5e5',
                  padding: '10px 24px',
                  lineHeight: 1,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#ffffff'
                  e.currentTarget.style.border = '1px solid #ffffff'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#e5e5e5'
                  e.currentTarget.style.border = '1px solid #e5e5e5'
                }}
                onMouseDown={e => { e.currentTarget.style.background = '#d4d4d4' }}
                onMouseUp={e => { e.currentTarget.style.background = '#e5e5e5' }}
              >
                Sign Up
              </button>
            </SignUpButton>

          </SignedOut>

          <SignedIn>
            <UserButton appearance={{ elements: { avatarBox: 'h-9 w-9' } }} />
          </SignedIn>
        </div>

      </div>
    </header>
  )
}
