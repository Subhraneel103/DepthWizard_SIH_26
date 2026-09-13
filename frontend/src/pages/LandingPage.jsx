import { useNavigate } from 'react-router-dom'
import { SignUpButton, useAuth } from '@clerk/clerk-react'

const NAVBAR_H = 108

const stats = [
  { value: '< 30s',  label: 'Processing Time'   },
  { value: 'Sub-m',  label: 'Elevation Accuracy' },
  { value: '12+',    label: 'Export Formats'     },
  { value: '100%',   label: 'Offline Capable'    },
]

const features = [
  {
    icon: '⬡',
    title: 'Photogrammetry',
    desc: 'Generate dense point clouds and DEMs from overlapping aerial or drone imagery with sub-centimetre precision.',
  },
  {
    icon: '◈',
    title: 'Satellite Fusion',
    desc: 'Fuse multi-spectral satellite tiles with ground-truth LiDAR for centimetre accuracy across any terrain type.',
  },
  {
    icon: '◇',
    title: '3D Mesh Export',
    desc: 'Export terrain as OBJ, GeoTIFF, LAS/LAZ or STL — immediately ready for GIS pipelines and 3D print.',
  },
]

function FeatureCard({ icon, title, desc }) {
  return (
    <div
      className="flex flex-col gap-5 p-10 text-left transition-colors duration-200 cursor-default"
      style={{ border: '1px solid #1e1e1e', background: '#0f0f0f' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#333333'; e.currentTarget.style.background = '#141414' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.background = '#0f0f0f' }}
    >
      <span className="text-5xl text-white/20 select-none">{icon}</span>
      <h3 className="font-sans text-[22px] font-semibold text-white tracking-tight">{title}</h3>
      <p className="font-mono text-[14px] leading-loose text-[#666666]">{desc}</p>
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { isSignedIn } = useAuth()

  const handleCTA = () => {
    if (isSignedIn) navigate('/projects')
  }

  return (
    <main
      className="flex-1 relative z-10"
      style={{ paddingTop: NAVBAR_H }}
    >
      {/* ══ HERO ══════════════════════════════════════════ */}
      <section
        className="flex flex-col items-center justify-center px-8 text-center"
        style={{ minHeight: `calc(100vh - ${NAVBAR_H}px)` }}
      >
        {/* Badge */}
        <div
          className="inline-flex items-center gap-3 mb-12 px-5 py-2.5"
          style={{ border: '1px solid #272727', background: '#111111' }}
        >
          <span className="h-2 w-2 flex-shrink-0" style={{ background: '#a1a1aa', borderRadius: '50%' }} />
          <span className="font-mono text-[12px] uppercase tracking-[0.28em] text-[#6b6b6b]">
            AI-Powered Elevation Intelligence
          </span>
          <span className="font-mono text-[12px] text-[#333333]">v2.0</span>
        </div>

        {/* Headline */}
        <h1
          className="font-sans font-bold text-white mb-8 w-full max-w-6xl"
          style={{
            fontSize: 'clamp(3.5rem, 9vw, 7.5rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
          }}
        >
          From Raw Imagery
          <br />
          <span style={{ color: '#a1a1aa' }}>to Precise Terrain</span>
        </h1>

        {/* Sub-headline */}
        <p className="font-sans text-2xl sm:text-3xl font-light text-[#4a4a4a] mb-5 max-w-3xl leading-relaxed">
          DepthWizard reconstructs 3D elevation models from satellite imagery,
          drone footage, and sonar data in minutes — not hours.
        </p>

        {/* Supporting detail */}
        <p className="font-mono text-[14px] text-[#383838] mb-14 max-w-2xl leading-loose">
          Trusted by geospatial engineers, hydrographic surveyors,
          and autonomous vehicle teams worldwide.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-wrap gap-5 justify-center mb-24">
          {isSignedIn ? (
            <button
              onClick={handleCTA}
              className="font-mono text-[15px] uppercase tracking-[0.2em] font-bold px-12 py-5 cursor-pointer transition-all duration-150 text-black"
              style={{ background: '#e5e5e5', border: '1px solid #e5e5e5' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#ffffff' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#e5e5e5'; e.currentTarget.style.borderColor = '#e5e5e5' }}
              onMouseDown={e => { e.currentTarget.style.background = '#d4d4d4' }}
              onMouseUp={e => { e.currentTarget.style.background = '#e5e5e5' }}
            >
              Go to My Projects →
            </button>
          ) : (
            <SignUpButton mode="modal">
              <button
                className="font-mono text-[15px] uppercase tracking-[0.2em] font-bold px-12 py-5 cursor-pointer transition-all duration-150 text-black"
                style={{ background: '#e5e5e5', border: '1px solid #e5e5e5' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#ffffff' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#e5e5e5'; e.currentTarget.style.borderColor = '#e5e5e5' }}
                onMouseDown={e => { e.currentTarget.style.background = '#d4d4d4' }}
                onMouseUp={e => { e.currentTarget.style.background = '#e5e5e5' }}
              >
                Start Free Mission
              </button>
            </SignUpButton>
          )}

          <button
            className="font-mono text-[15px] uppercase tracking-[0.2em] font-medium px-12 py-5 cursor-pointer transition-all duration-150 text-[#a1a1aa]"
            style={{ border: '1px solid #2a2a2a', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = '#141414'; e.currentTarget.style.borderColor = '#404040' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#2a2a2a' }}
          >
            Watch Demo ↗
          </button>
        </div>

        {/* Stats */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-px w-full max-w-5xl"
          style={{ border: '1px solid #1c1c1c', background: '#1c1c1c' }}
        >
          {stats.map(({ value, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 py-7 px-6"
              style={{ background: '#0a0a0a' }}
            >
              <span
                className="font-sans font-bold text-white"
                style={{ fontSize: '2.25rem', letterSpacing: '-0.03em' }}
              >
                {value}
              </span>
              <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-[#555555]">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FEATURES ══════════════════════════════════════ */}
      <section className="px-8 pb-40 w-full max-w-[1600px] mx-auto">
        {/* Section label */}
        <div className="flex items-center gap-6 mb-12">
          <div className="flex-1 h-px" style={{ background: '#1c1c1c' }} />
          <span className="font-mono text-[13px] uppercase tracking-[0.28em] text-[#505050]">
            Core Capabilities
          </span>
          <div className="flex-1 h-px" style={{ background: '#1c1c1c' }} />
        </div>

        {/* Feature cards — stretch full width */}
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-px"
          style={{ background: '#1a1a1a' }}
        >
          {features.map(f => <FeatureCard key={f.title} {...f} />)}
        </div>

        <p className="text-center font-mono text-[13px] text-[#2e2e2e] mt-16 tracking-widest uppercase">
          — Elevation data. Precision guaranteed. —
        </p>
      </section>
    </main>
  )
}
