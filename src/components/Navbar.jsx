import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Code2, LogOut, ShieldCheck, Sun, Moon } from 'lucide-react'
import { Code2, LogOut, ShieldCheck, Sun, Moon, Compass } from 'lucide-react'

export default function Navbar() {
  const { profile, isAdmin, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/signin')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const avatarUrl =
    profile?.photoURL ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || 'U')}&background=1e293b&color=94a3b8`

  return (
    <header className="h-14 shrink-0 bg-surface border-b border-edge flex items-center justify-between px-3 sm:px-4">
      <Link to="/" className="flex items-center gap-2 group shrink-0">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
          <Code2 size={18} className="text-white" />
        </div>
        <span className="font-bold text-body tracking-tight">
          Bharat<span className="text-blue-400">Codex</span>
        </span>
      </Link>

      <Link
  to="/explore"
  className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-mute hover:text-body hover:bg-raise transition"
>
  <Compass size={15} />
  <span className="hidden sm:inline">Explore</span>
</Link>

      <div className="flex items-center gap-1 sm:gap-2">
        {isAdmin && (
          <Link
            to="/admin"
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition"
          >
            <ShieldCheck size={15} />
            <span className="hidden sm:inline">Admin Panel</span>
          </Link>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          className="p-2 rounded-lg text-mute hover:text-body hover:bg-raise transition"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div className="flex items-center gap-2 sm:gap-2.5 pl-2 ml-1 border-l border-edge">
          <img
            src={avatarUrl}
            alt={profile?.name || 'User'}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-full border border-edge object-cover"
          />
          <div className="hidden sm:block leading-tight">
            <p className="text-sm text-body font-medium max-w-32 truncate">
              {profile?.name || 'User'}
            </p>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${isAdmin ? 'text-amber-400' : 'text-faint'}`}>
              {isAdmin ? 'Admin' : 'Member'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="ml-1 p-2 rounded-lg text-mute hover:text-body hover:bg-raise transition"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  )
}
