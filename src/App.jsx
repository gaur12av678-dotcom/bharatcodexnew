import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import SignIn from './pages/SignIn'
import Dashboard from './pages/Dashboard'
import EditorPage from './pages/EditorPage'
import AdminPanel from './pages/AdminPanel'
import Navbar from './components/Navbar'
import { Loader2 } from 'lucide-react'

const FullScreenLoader = () => (
  <div className="h-screen flex items-center justify-center bg-slate-950">
    <Loader2 className="animate-spin text-blue-500" size={36} />
  </div>
)

const Protected = ({ children, adminOnly = false }) => {
  const { user, profile, loading, isAdmin } = useAuth()

  if (loading || (user && !profile)) return <FullScreenLoader />
  if (!user) return <Navigate to="/signin" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />

  return (
    <div className="h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/project/:id" element={<Protected><EditorPage /></Protected>} />
        <Route path="/admin" element={<Protected adminOnly><AdminPanel /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
