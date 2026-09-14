// ─────────────────────────────────────────────────────────────────────────────
// ThreeViewport.jsx — Production 3D Geospatial Viewport
//
// Pipeline:
//   1. Fetch GeoTIFF raster → parse with geotiff.js → Float32 elevation band
//   2. Create PlaneGeometry(128×128) → displace vertex Y from elevation data
//   3. Load JPEG preview → drape as orthomosaic texture over displaced terrain
//   4. computeVertexNormals() → natural shading with directional lighting
//   5. Flood simulation plane at adjustable Y level
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState, useMemo, useEffect, Component } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { fromArrayBuffer } from 'geotiff'

// ── Shared GeoTIFF ArrayBuffer cache ────────────────────────────────────────
// Prevents re-downloading when the 2D DSM view already fetched the same file.
const _tiffCache = new Map()
async function fetchTiffCached(url, headers) {
  if (_tiffCache.has(url)) return _tiffCache.get(url)
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const buf = await res.arrayBuffer()
  _tiffCache.set(url, buf)
  // Evict after 5 min to free memory
  setTimeout(() => _tiffCache.delete(url), 5 * 60 * 1000)
  return buf
}

// ── Turbo colormap (fallback when no texture available) ─────────────────────
const TURBO = [
  [0.18995,0.07176,0.23217],[0.24984,0.10760,0.33891],[0.31264,0.14676,0.44556],[0.37684,0.18985,0.55277],
  [0.43040,0.23572,0.64625],[0.46818,0.28104,0.72007],[0.49073,0.32607,0.77957],[0.50311,0.37101,0.82248],
  [0.50587,0.41578,0.85082],[0.49995,0.46051,0.86354],[0.48440,0.50520,0.85978],[0.45636,0.55027,0.83827],
  [0.41317,0.59514,0.79905],[0.35788,0.63961,0.74485],[0.29477,0.68337,0.67575],[0.22826,0.72628,0.59575],
  [0.16818,0.76813,0.50903],[0.12074,0.80870,0.43415],[0.09076,0.84780,0.36610],[0.09181,0.88603,0.29810],
  [0.14325,0.91987,0.23925],[0.24309,0.94855,0.19142],[0.38209,0.97261,0.15502],[0.53667,0.99127,0.12970],
  [0.68828,0.99910,0.12311],[0.81421,0.98867,0.15469],[0.90563,0.96013,0.21735],[0.96199,0.91332,0.29969],
  [0.99055,0.84899,0.40266],[0.99810,0.77217,0.52007],[0.98877,0.68534,0.64311],[0.96351,0.59019,0.76688],
]
function turboRGB(t) {
  const n = TURBO.length - 1
  const i = Math.min(Math.floor(t * n), n - 1)
  const f = t * n - i
  const a = TURBO[i], b = TURBO[Math.min(i + 1, n)]
  return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])]
}

// ─────────────────────────────────────────────────────────────────────────────
// GeoTIFF-Displaced Terrain
//
// Creates a 128×128 PlaneGeometry and populates vertex Y values from the
// parsed GeoTIFF Float32 elevation band. Falls back to multi-octave
// procedural noise if the raster fetch fails.
// ─────────────────────────────────────────────────────────────────────────────
const TERRAIN_SIZE = 60       // world units (horizontal extent)
const TERRAIN_SEGS = 128      // 128×128 vertex grid

// ── Bilinear interpolation for smooth raster sampling ───────────────────────
function sampleBilinear(values, width, height, u, v) {
  // u, v in [0,1]
  const fx = u * (width - 1)
  const fy = v * (height - 1)
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1)
  const dx = fx - x0, dy = fy - y0

  const v00 = values[y0 * width + x0]
  const v10 = values[y0 * width + x1]
  const v01 = values[y1 * width + x0]
  const v11 = values[y1 * width + x1]

  // If any neighbor is nodata, fall back to nearest valid
  const isValid = (v) => isFinite(v) && v > -9000
  if (!isValid(v00) || !isValid(v10) || !isValid(v01) || !isValid(v11)) {
    // Nearest-neighbor fallback for nodata regions
    const nx = Math.round(fx), ny = Math.round(fy)
    const nv = values[ny * width + nx]
    return isValid(nv) ? nv : null
  }

  const top = v00 + dx * (v10 - v00)
  const bot = v01 + dx * (v11 - v01)
  return top + dy * (bot - top)
}

// ── 3×3 Gaussian smooth pass on a grid ──────────────────────────────────────
function smoothGrid(grid, cols, rows, passes) {
  const kernel = [
    1/16, 2/16, 1/16,
    2/16, 4/16, 2/16,
    1/16, 2/16, 1/16,
  ]
  let src = new Float32Array(grid)
  const dst = new Float32Array(grid.length)
  for (let p = 0; p < passes; p++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0, wt = 0
        for (let kr = -1; kr <= 1; kr++) {
          for (let kc = -1; kc <= 1; kc++) {
            const nr = r + kr, nc = c + kc
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              const w = kernel[(kr + 1) * 3 + (kc + 1)]
              sum += src[nr * cols + nc] * w
              wt += w
            }
          }
        }
        dst[r * cols + c] = sum / wt
      }
    }
    src = new Float32Array(dst)
  }
  return src
}

function DisplacedTerrain({ elevationData, textureUrl, minElev, maxElev }) {
  const meshRef = useRef()

  // Vertical exaggeration — enough height for immersive 3D exploration
  // 0.25 × 60 = 15 world units of vertical range on a 60-unit wide plane
  const TERRAIN_HEIGHT = TERRAIN_SIZE * 0.25

  const { geometry, elevMin, elevMax } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGS, TERRAIN_SEGS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const vertsPerSide = TERRAIN_SEGS + 1; // 129

    // Default elevation bounds from props
    const eMin = minElev;
    const eMax = maxElev;

    if (elevationData) {
      // ── GeoTIFF-driven displacement ──
      // Data arrives pre-sampled at 129×129 (matching our vertex grid) from readRasters()
      const { values, width, height } = elevationData;

      // Step 1: Copy values and handle nodata
      const sampled = new Float32Array(vertsPerSide * vertsPerSide);
      let validMin = Infinity, validMax = -Infinity;
      const count = Math.min(values.length, sampled.length);
      for (let i = 0; i < count; i++) {
        const v = values[i];
        if (isFinite(v) && v > -9000) {
          sampled[i] = v;
          if (v < validMin) validMin = v;
          if (v > validMax) validMax = v;
        } else {
          sampled[i] = NaN;
        }
      }

      // Fill NaN holes
      if (!isFinite(validMin)) { validMin = eMin; validMax = eMax; }
      for (let i = 0; i < sampled.length; i++) {
        if (!isFinite(sampled[i])) sampled[i] = validMin;
      }

      // Step 2: Clamp outliers to the 2nd–98th percentiles
      const sorted = Float32Array.from(sampled).sort();
      const p2 = sorted[Math.floor(sorted.length * 0.02)];
      const p98 = sorted[Math.floor(sorted.length * 0.98)];
      for (let i = 0; i < sampled.length; i++) {
        sampled[i] = Math.max(p2, Math.min(p98, sampled[i]));
      }
      const rasterRange = p98 - p2 || 1;

      // Step 3: Normalize to 0→1
      const normalized = new Float32Array(sampled.length);
      for (let i = 0; i < sampled.length; i++) {
        normalized[i] = (sampled[i] - p2) / rasterRange;
      }

      // Step 4: Gaussian smooth (1 pass — data is already bilinear-resampled)
      const smoothed = smoothGrid(normalized, vertsPerSide, vertsPerSide, 1);

      // Step 5: Displace vertices
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, smoothed[i] * TERRAIN_HEIGHT);
      }
    } else {
      // ── Procedural fallback (simple sine‑wave hills) ──
      for (let i = 0; i < pos.count; i++) {
        const phase = (i / pos.count) * Math.PI * 4;
        const height = (Math.sin(phase) + 1) * 0.5 * TERRAIN_HEIGHT * 0.2; // modest hills
        pos.setY(i, height);
      }
    }

    // Recompute vertex normals for proper lighting on the displaced mesh
    geo.computeVertexNormals();

    // Apply natural terrain vertex colors (ocean → green → brown → grey, no white caps)
    // Use actual vertex Y range (0 → TERRAIN_HEIGHT) for color mapping
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, pos.getY(i) / TERRAIN_HEIGHT));
      let r, g, b;
      if (t < 0.10) {
        // Ocean / water: vivid bright blue
        r = 0.30; g = 0.60; b = 0.95;
      } else if (t < 0.25) {
        // Coastal: transition blue → bright green
        const f = (t - 0.10) / 0.15;
        r = 0.30 + f * 0.10; g = 0.60 + f * 0.10; b = 0.95 - f * 0.65;
      } else if (t < 0.45) {
        // Lowland: bright forest green
        const f = (t - 0.25) / 0.20;
        r = 0.40 + f * 0.08; g = 0.70 - f * 0.02; b = 0.30 - f * 0.04;
      } else if (t < 0.65) {
        // Mid: vivid green
        const f = (t - 0.45) / 0.20;
        r = 0.48 + f * 0.07; g = 0.68 - f * 0.05; b = 0.26 + f * 0.02;
      } else if (t < 0.85) {
        // Upper: olive
        const f = (t - 0.65) / 0.20;
        r = 0.55 - f * 0.03; g = 0.63 - f * 0.06; b = 0.28 - f * 0.02;
      } else {
        // Peaks: dark olive-green — NO white ever
        r = 0.50; g = 0.55; b = 0.24;
      }
      cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    return { geometry: geo, elevMin: eMin, elevMax: eMax }
  }, [elevationData, minElev, maxElev])

  // Load JPEG orthomosaic texture if URL provided
  const texture = useMemo(() => {
    if (!textureUrl) return null
    const tex = new THREE.TextureLoader().load(textureUrl)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.anisotropy = 8
    return tex
  }, [textureUrl])

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      {/* Always use vertexColors — Three.js multiplies map × vertexColor,
          so white clouds in the photo get tinted by terrain color */}
      <meshStandardMaterial
        vertexColors
        map={texture || undefined}
        roughness={0.65}
        metalness={0.03}
        side={THREE.DoubleSide}
        shadowSide={THREE.DoubleSide}
      />
    </mesh>
  )
}

// ── Flood Simulation Plane ──────────────────────────────────────────────────
function FloodPlane({ waterLevel, terrainSize, minElev, maxElev }) {
  const ref = useRef()
  // Normalize waterLevel from real meters to terrain-space Y
  const range = (maxElev - minElev) || 1
  const terrainH = (terrainSize || TERRAIN_SIZE) * 0.35
  const normalizedY = ((waterLevel - minElev) / range) * terrainH
  const targetY = useRef(normalizedY)
  useEffect(() => { targetY.current = normalizedY }, [normalizedY])
  useFrame(() => {
    if (ref.current) ref.current.position.y += (targetY.current - ref.current.position.y) * 0.12
  })
  const w = (terrainSize || TERRAIN_SIZE) * 1.25
  return (
    <mesh ref={ref} position={[0, normalizedY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, w, 1, 1]} />
      <meshPhysicalMaterial
        color="#1166bb"
        transparent
        opacity={0.38}
        roughness={0.02}
        metalness={0.4}
        clearcoat={0.8}
        clearcoatRoughness={0.1}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// ── GCP Pin Markers ─────────────────────────────────────────────────────────
function GCPPin({ position, label, measuredElev, referenceElev, errorM }) {
  const [hovered, setHovered] = useState(false)
  const ref = useRef()
  const absErr = Math.abs(errorM || 0)
  const color = absErr < 0.3 ? '#4aaa5a' : absErr < 0.6 ? '#aaaa4a' : '#cc5544'
  useFrame(() => {
    if (ref.current) ref.current.position.y = position[1] + 0.8 + Math.sin(Date.now() * 0.003) * 0.12
  })
  return (
    <group>
      <mesh position={[position[0], position[1] + 0.3, position[2]]}>
        <cylinderGeometry args={[0.04, 0.04, 1.4, 6]} />
        <meshStandardMaterial color="#555" />
      </mesh>
      <mesh ref={ref} position={position}
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 0.7 : 0.25} roughness={0.25} />
      </mesh>
      {hovered && (
        <Html position={[position[0], position[1] + 2, position[2]]} center distanceFactor={22} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(6,6,6,0.94)', backdropFilter: 'blur(14px)',
            border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 14px',
            fontFamily: 'monospace', fontSize: 9, color: '#888', whiteSpace: 'nowrap', minWidth: 160,
          }}>
            <div style={{ color: '#e0e0e0', fontWeight: 700, marginBottom: 5, fontSize: 10, letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: '#505050' }}>Measured</span><span style={{ color: '#9a9a9a' }}>{measuredElev?.toFixed(2) ?? '—'}m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: '#505050' }}>Reference</span><span style={{ color: '#9a9a9a' }}>{referenceElev?.toFixed(2) ?? '—'}m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4, paddingTop: 4, borderTop: '1px solid #1e1e1e' }}>
              <span style={{ color: '#505050' }}>Error</span>
              <span style={{ color, fontWeight: 700 }}>{errorM != null ? ((errorM > 0 ? '+' : '') + errorM.toFixed(3) + 'm') : '—'}</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}

function GCPMarkers({ gcps, residuals }) {
  const residualMap = useMemo(() => {
    const m = {}; residuals?.forEach((r) => { m[r.gcpLabel] = r }); return m
  }, [residuals])
  if (!gcps?.length) return null
  const half = TERRAIN_SIZE / 2
  return (
    <group>
      {gcps.map((gcp, i) => {
        const label = gcp.label || `GCP-${i + 1}`
        const r = residualMap[label] || {}
        const x = ((gcp.pixelX || 0) / 1024) * TERRAIN_SIZE - half
        const z = ((gcp.pixelY || 0) / 1024) * TERRAIN_SIZE - half
        return (
          <GCPPin key={gcp._id || i} position={[x, gcp.elevation || 20, z]}
            label={label} measuredElev={r.measuredElevation} referenceElev={r.referenceElevation} errorM={r.errorMeters} />
        )
      })}
    </group>
  )
}

// ── Camera setup ────────────────────────────────────────────────────────────
function CameraSetup({ center }) {
  const { camera } = useThree()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    // Position the camera to view the centered terrain from a higher angle
    const cy = center || 0 // center at terrain origin
    camera.position.set(0, 60, 80)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

// ── Error boundary ──────────────────────────────────────────────────────────
class R3FErrorBoundary extends Component {
  state = { hasError: false, msg: '' }
  static getDerivedStateFromError(e) { return { hasError: true, msg: e?.message || 'Unknown' } }
  render() {
    if (this.state.hasError) return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6a2a2a' }}>⚠ 3D Error: {this.state.msg}</span>
      </div>
    )
    return this.props.children
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ThreeViewport export
// ─────────────────────────────────────────────────────────────────────────────
export default function ThreeViewport({
  rasterUrl,        // GeoTIFF path (e.g. /uploads/dsm_xxx.tif)
  textureUrl,       // JPEG preview path for orthomosaic draping
  serverRoot,       // server origin (e.g. http://localhost:5000)
  getToken,
  waterLevel = 0,
  showFlood = false,
  gcps = [],
  residuals = [],
  showGcps = true,
  minElevation = 2,
  maxElevation = 49,
}) {
  const [elevationData, setElevationData] = useState(null)
  const [rasterStats, setRasterStats] = useState(null) // { min, max } from actual GeoTIFF
  const [loadState, setLoadState] = useState('idle') // idle | loading | ready | error

  // ── Fetch + parse GeoTIFF on mount ──
  const rasterUrlRef = useRef(rasterUrl)
  const getTokenRef = useRef(getToken)
  rasterUrlRef.current = rasterUrl
  getTokenRef.current = getToken

  useEffect(() => {
    const url = rasterUrlRef.current
    if (!url) {
      setLoadState('ready') // no raster → procedural fallback
      return
    }
    let cancelled = false
    setLoadState('loading')

    const TARGET_RES = TERRAIN_SEGS + 1 // 129 — matches our vertex grid exactly

    ;(async () => {
      try {
        // Build full URL
        const fullUrl = url.startsWith('http') ? url : (serverRoot || '') + url
        let token = null
        try { token = await getTokenRef.current?.() } catch {}
        const headers = {}
        if (token) headers['Authorization'] = 'Bearer ' + token

        // Use shared cache so the 2D DSM view doesn't trigger a second download
        const buf = await fetchTiffCached(fullUrl, headers)

        // Parse GeoTIFF
        const tiff = await fromArrayBuffer(buf)
        const image = await tiff.getImage()

        // ⚡ KEY OPTIMIZATION: read at 129×129 instead of full resolution
        // For a 4000×4000 raster this reduces pixels processed from 16M to 16K
        const rasters = await image.readRasters({
          width: TARGET_RES,
          height: TARGET_RES,
          resampleMethod: 'bilinear',
        })
        const band = rasters[0] // First band = elevation

        if (cancelled) return

        // Convert to Float32Array and compute real min/max
        const values = new Float32Array(band.length)
        let rMin = Infinity, rMax = -Infinity
        for (let i = 0; i < band.length; i++) {
          values[i] = band[i]
          if (isFinite(band[i]) && band[i] > -9000) {
            if (band[i] < rMin) rMin = band[i]
            if (band[i] > rMax) rMax = band[i]
          }
        }
        if (isFinite(rMin)) setRasterStats({ min: rMin, max: rMax })

        // Data is already at 129×129 — matches vertex grid, no resampling needed
        setElevationData({ values, width: TARGET_RES, height: TARGET_RES })
        setLoadState('ready')
      } catch (e) {
        console.warn('GeoTIFF fetch failed, using procedural terrain:', e.message)
        if (!cancelled) setLoadState('ready') // fall back to procedural
      }
    })()

    return () => { cancelled = true }
  }, [serverRoot]) // stable deps only — rasterUrl/getToken stored in refs

  // Build full texture URL
  const fullTextureUrl = useMemo(() => {
    if (!textureUrl) return null
    if (textureUrl.startsWith('http')) return textureUrl
    return (serverRoot || '') + textureUrl
  }, [textureUrl, serverRoot])

  // Terrain center height for camera targeting
  const terrainH = TERRAIN_SIZE * 0.25
  const elevCenter = terrainH / 2

  // Use actual GeoTIFF raster stats for display, fallback to props
  const displayMinElev = rasterStats?.min ?? minElevation
  const displayMaxElev = rasterStats?.max ?? maxElevation

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, borderRadius: 20, overflow: 'hidden' }}>
      <R3FErrorBoundary>
        <Canvas
          shadows
          camera={{ position: [0, elevCenter + 40, 55], fov: 45, near: 0.1, far: 2000 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.6 }}
          style={{ width: '100%', height: '100%', display: 'block', background: '#080808' }}
        >
          {/* === Lighting rig — bright, natural sunlight === */}
          <ambientLight intensity={0.5} color="#e0e0e0" />
          {/* Key light — sun from upper-left, casts shadows across ridges */}
          <directionalLight
            position={[30, 50, 20]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={200}
            shadow-camera-left={-50}
            shadow-camera-right={50}
            shadow-camera-top={50}
            shadow-camera-bottom={-50}
            shadow-bias={-0.0005}
            color="#fff8e8"
          />
          {/* Fill light — cool tone from opposite side */}
          <directionalLight position={[-20, 30, -25]} intensity={0.35} color="#aaaacc" />
          {/* Sky/ground hemisphere */}
          <hemisphereLight args={['#c0d8f0', '#2a2a0a', 0.45]} />

          {/* Camera + controls */}
          <CameraSetup center={elevCenter} />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.05}
            minDistance={5}
            maxDistance={300}
            maxPolarAngle={Math.PI * 0.85}
            target={[0, elevCenter * 0.5, 0]}
          />

          {/* === THE TERRAIN === */}
          <DisplacedTerrain
            elevationData={elevationData}
            textureUrl={fullTextureUrl}
            minElev={minElevation}
            maxElev={maxElevation}
          />

          {/* Flood simulation */}
          {showFlood && <FloodPlane waterLevel={waterLevel} terrainSize={TERRAIN_SIZE} minElev={minElevation} maxElev={maxElevation} />}

          {/* GCP markers */}
          {showGcps && <GCPMarkers gcps={gcps} residuals={residuals} />}

          {/* Ground shadow receiver */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <shadowMaterial opacity={0.3} />
          </mesh>

          {/* Subtle grid */}
          <gridHelper args={[80, 40, '#1a1a1a', '#111111']} position={[0, -1.1, 0]} />
        </Canvas>
      </R3FErrorBoundary>

      {/* ── Loading overlay ── */}
      {loadState === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 22, pointerEvents: 'none',
        }}>
          <div style={{
            width: 32, height: 32, border: '2px solid #1a1a1a', borderTopColor: '#4a8a6a',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ fontFamily: 'monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#383838' }}>
            Parsing GeoTIFF elevation data…
          </span>
        </div>
      )}

      {/* ── HUD: Status badge ── */}
      <div style={{
        position: 'absolute', top: 14, right: 14, zIndex: 21, pointerEvents: 'none',
        border: '1px solid #1e3a2a', borderRadius: 7, padding: '5px 10px',
        background: 'rgba(8,20,14,0.75)', backdropFilter: 'blur(8px)',
        fontFamily: 'monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em',
        color: elevationData ? '#4a8a5a' : '#8a8a4a',
      }}>
        {elevationData ? '● GeoTIFF Terrain' : '◌ Procedural Preview'}
        {fullTextureUrl && ' + Ortho'}
      </div>

      {/* ── HUD: Elevation legend ── */}
      <div style={{
        position: 'absolute', bottom: 14, left: 14, zIndex: 21, pointerEvents: 'none',
        background: 'rgba(8,8,8,0.75)', backdropFilter: 'blur(8px)',
        border: '1px solid #1a1a1a', borderRadius: 8, padding: '8px 12px', fontFamily: 'monospace',
      }}>
        <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 6, color: '#383838' }}>
          Elevation Range
        </div>
        <div style={{
          width: 130, height: 8, borderRadius: 4,
          background: 'linear-gradient(to right, #0f3060, #1a3d1a, #2d5a27, #4a6a30, #3a5a28, #2e3c1a)',
          }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 8, color: '#505050' }}>{displayMinElev.toFixed(1)}m</span>
          <span style={{ fontSize: 8, color: '#505050' }}>{displayMaxElev.toFixed(1)}m</span>
        </div>
      </div>

      {/* ── HUD: Flood level ── */}
      {showFlood && (
        <div style={{
          position: 'absolute', bottom: 14, right: 14, zIndex: 21, pointerEvents: 'none',
          background: 'rgba(8,14,24,0.8)', backdropFilter: 'blur(8px)',
          border: '1px solid #1a2a3a', borderRadius: 8, padding: '6px 10px',
          fontFamily: 'monospace', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#2a5a8a',
        }}>
          🌊 Water Level: {waterLevel.toFixed(1)}m
        </div>
      )}

      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}
