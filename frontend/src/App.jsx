import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import Navbar from './components/Navbar'
import HeroBackground from './components/HeroBackground'
import LandingPage from './pages/LandingPage'
import ProjectsHubPage from './pages/ProjectsHubPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import './App.css'

// ── Route guard: redirects unauthenticated users to / ─
function ProtectedRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth()
  if (!isLoaded) return null // wait for Clerk to initialise
  if (!isSignedIn) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <>
      <HeroBackground />
      <Navbar />

      <Routes>
        {/* Public landing */}
        <Route path="/" element={<LandingPage />} />

        {/* Authenticated: projects hub */}
        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <ProjectsHubPage />
            </ProtectedRoute>
          }
        />

        {/* Authenticated: project detail */}
        <Route
          path="/projects/:projectId"
          element={
            <ProtectedRoute>
              <ProjectDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Catch-all → landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
