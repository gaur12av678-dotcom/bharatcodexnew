import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Code2, Loader2 } from 'lucide-react'

export default function SignIn() {
  const { user, profile, loading, signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="animate-spin text-blue-500" size={36} />
      </div>
    )
  }

  if (user && profile) return <Navigate to="/" replace />

  const handleSignIn = async () => {
    setBusy(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch (e) {
      console.error(e)
      setError('Sign in failed. Dobara try karo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-600/30">
              <Code2 size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              Bharat<span className="text-blue-400">Codex</span>
            </h1>
            <p className="text-slate-400 text-sm mt-2">
              Team ke saath code karo, live preview ke saath.
            </p>
          </div>

          <button
            onClick={handleSignIn}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 bg-white text-slate-800 font-semibold py-3 px-4 rounded-xl hover:bg-slate-100 transition disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1a7.16 7.16 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            )}
            {busy ? 'Signing in...' : 'Continue with Google'}
          </button>

          {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}

          <p className="text-slate-500 text-xs text-center mt-6">
            Pehla jo sign in karega, wahi <span className="text-amber-400 font-semibold">Admin</span> banega.
          </p>
        </div>
      </div>
    </div>
  )
}
