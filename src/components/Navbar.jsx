import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Code2, LogOut, ShieldCheck } from 'lucide-react'

export default function Navbar() {
  const { profile, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/signin')
  }

  return (
    <header className="h-14 shrink-0 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
      <Link to="/" className="flex items-center gap-2 group">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
          <Code2 size={18} className="text-white" />
        </div>
        <span className="font-bold text-white tracking-tight">
          Bharat<span className="text-blue-400">Codex</span>
        </span>
      </Link>

      <div className="flex items-center gap-2">
        {isAdmin && (
          <Link
            to="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition"
          >
            <ShieldCheck size={15} />
            Admin Panel
          </Link>
        )}

        <div className="flex items-center gap-2.5 pl-2 ml-1 border-l border-slate-700">
          <img
            src={profile?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || 'U')}&background=1e293b&color=94a3b8`}
            alt={profile?.name}
            className="w-8 h-8 rounded-full border border-slate-700"
          />
          <div className="hidden sm:block leading-tight">
            <p className="text-sm text-white font-medium">{profile?.name}</p>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isAdmin ? 'text-amber-400' : 'text-slate-500'}`}>
              {isAdmin ? 'Admin' : 'Member'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="ml-1 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  )
}
