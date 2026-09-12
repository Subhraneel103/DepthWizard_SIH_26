import { useEffect } from 'react'
import Navbar from './components/Navbar'
import HeroBackground from './components/HeroBackground'
import './App.css'

const NAVBAR_H = 108

const stats = [
  { value: '< 30s',  label: 'Processing Time'    },
  { value: 'Sub-m',  label: 'Elevation Accuracy'  },
  { value: '12+',    label: 'Export Formats'      },
  { value: '100%',   label: 'Offline Capable'     },
]

const features = [
  {
    icon: '⬡',
    title: 'Photogrammetry',
    desc: 'Generate dense point clouds and DEMs from overlapping aerial or drone imagery.',
  },
  {
    icon: '◈',
    title: 'Satellite Fusion',
    desc: 'Fuse multi-spectral satellite tiles with ground-truth LiDAR for centimetre accuracy.',
  },
  {
    icon: '◇',
    title: '3D Mesh Export',
    desc: 'Export terrain as OBJ, GeoTIFF, LAS/LAZ or STL — ready for GIS and print.',
  },
]

function FeatureCard({ icon, title, desc }) {
  return (
    <div
      className="flex flex-col gap-3 p-6 text-left transition-colors duration-200 cursor-default"
      style={{ border: '1px solid #1e1e1e', background: '#0f0f0f' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#333333'; e.currentTarget.style.background = '#141414' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.background = '#0f0f0f' }}
    >
      <span className="text-2xl text-white/30 select-none">{icon}</span>
      <h3 className="font-sans text-[15px] font-semibold text-white tracking-tight">{title}</h3>
      <p className="font-mono text-[12px] leading-relaxed text-[#555555]">{desc}</p>
    </div>
  )
}

function App() {
  

  return (
    <>
      <HeroBackground />
      <Navbar />

      <main className={`pt-[${NAVBAR_H}px] flex-1 relative z-10`} style={{ paddingTop: NAVBAR_H }}>

        {/* ══════════════════════════════════════════
            HERO — above the fold
        ══════════════════════════════════════════ */}
        <section
          className="flex flex-col items-center justify-center px-6 text-center"
          style={{ minHeight: `calc(100vh - ${NAVBAR_H}px)` }}
        >

          {/* Badge */}
          <div
            className="inline-flex items-center gap-2.5 mb-10 px-4 py-2"
            style={{ border: '1px solid #272727', background: '#111111' }}
          >
            <span className="h-1.5 w-1.5 flex-shrink-0" style={{ background: '#a1a1aa', borderRadius: '50%' }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#6b6b6b]">
              AI-Powered Elevation Intelligence
            </span>
            <span className="font-mono text-[10px] text-[#333333]">v2.0</span>
          </div>

          {/* Main headline */}
          <h1
            className="font-sans font-bold text-white mb-6 max-w-5xl"
            style={{
              fontSize: 'clamp(3rem, 8vw, 6rem)',
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
            }}
          >
            From Raw Imagery
            <br />
            <span style={{ color: '#a1a1aa' }}>to Precise Terrain</span>
          </h1>

          {/* Sub-headline */}
          <p
            className="font-sans text-xl sm:text-2xl font-light text-[#4a4a4a] mb-4 max-w-2xl leading-relaxed"
          >
            DepthWizard reconstructs 3D elevation models from satellite imagery,
            drone footage, and sonar data in minutes — not hours.
          </p>

          {/* Supporting detail */}
          <p className="font-mono text-[12px] text-[#383838] mb-12 max-w-lg leading-loose">
            Trusted by geospatial engineers, hydrographic surveyors,
            and autonomous vehicle teams worldwide.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-4 justify-center mb-20">
            <button
              className="font-mono text-[12px] uppercase tracking-[0.2em] font-bold px-8 py-4 cursor-pointer transition-all duration-150 text-black"
              style={{ background: '#e5e5e5', border: '1px solid #e5e5e5' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#ffffff' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#e5e5e5'; e.currentTarget.style.borderColor = '#e5e5e5' }}
              onMouseDown={e => { e.currentTarget.style.background = '#d4d4d4' }}
              onMouseUp={e => { e.currentTarget.style.background = '#e5e5e5' }}
            >
              Start Free Mission
            </button>
            <button
              className="font-mono text-[12px] uppercase tracking-[0.2em] font-medium px-8 py-4 cursor-pointer transition-all duration-150 text-[#a1a1aa]"
              style={{ border: '1px solid #2a2a2a', background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = '#141414'; e.currentTarget.style.borderColor = '#404040' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#2a2a2a' }}
            >
              Watch Demo ↗
            </button>
          </div>

          {/* Stats row */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-px w-full max-w-3xl"
            style={{ border: '1px solid #1c1c1c', background: '#1c1c1c' }}
          >
            {stats.map(({ value, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1 py-5 px-4"
                style={{ background: '#0a0a0a' }}
              >
                <span
                  className="font-sans font-bold text-white"
                  style={{ fontSize: '1.75rem', letterSpacing: '-0.03em' }}
                >
                  {value}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#555555]">
                  {label}
                </span>
              </div>
            ))}
          </div>

        </section>

        {/* ══════════════════════════════════════════
            FEATURES — below the fold
        ══════════════════════════════════════════ */}
        <section className="px-6 pb-32 max-w-6xl mx-auto">

          {/* Section label */}
          <div className="flex items-center gap-4 mb-10">
            <div className="flex-1 h-px" style={{ background: '#1c1c1c' }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#404040]">
              Core Capabilities
            </span>
            <div className="flex-1 h-px" style={{ background: '#1c1c1c' }} />
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ background: '#1a1a1a' }}>
            {features.map(f => <FeatureCard key={f.title} {...f} />)}
          </div>

          {/* Bottom coda */}
          <p className="text-center font-mono text-[11px] text-[#2e2e2e] mt-12 tracking-widest uppercase">
            — Elevation data. Precision guaranteed. —
          </p>

        </section>

      </main>
    </>
  )
}

export default App
