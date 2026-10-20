import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { deleteProject, timeAgo } from '../services/projectService'
import { Users, FolderGit2, Loader2, Trash2, ExternalLink, ShieldCheck, Shield } from 'lucide-react'

export default function AdminPanel() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  // Live monitoring — bina refresh ke sab dikhta hai
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (s) => {
      const list = s.docs.map((d) => ({ uid: d.id, ...d.data() }))
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      setUsers(list)
      setLoading(false)
    })
    const unsubProjects = onSnapshot(collection(db, 'projects'), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      setProjects(list)
    })
    return () => {
      unsubUsers()
      unsubProjects()
    }
  }, [])

  const changeRole = async (u, role) => {
    if (u.uid === profile.uid && role === 'member') {
      alert('Tum khud ko admin se hata nahi sakte!')
      return
    }
    try {
      await updateDoc(doc(db, 'users', u.uid), { role })
    } catch (e) {
      console.error(e)
      alert('Role update failed.')
    }
  }

  const handleDeleteProject = async (p) => {
    if (!confirm(`"${p.name}" (${p.ownerName}) delete kar doon?`)) return
    try {
      await deleteProject(p.id)
    } catch (e) {
      console.error(e)
      alert('Delete failed.')
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck size={26} className="text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
            <p className="text-slate-400 text-sm">Poori team par nazar — live updates</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'users'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Users size={15} />
            Users ({users.length})
          </button>
          <button
            onClick={() => setTab('projects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'projects'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <FolderGit2 size={15} />
            All Projects ({projects.length})
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : tab === 'users' ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {users.map((u) => (
              <div
                key={u.uid}
                className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-800 last:border-0 hover:bg-slate-800/40"
              >
                <img
                  src={u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'U')}&background=1e293b&color=94a3b8`}
                  alt={u.name}
                  className="w-9 h-9 rounded-full border border-slate-700"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {u.name}
                    {u.uid === profile.uid && (
                      <span className="ml-2 text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                        YOU
                      </span>
                    )}
                  </p>
                  <p className="text-slate-500 text-xs truncate">{u.email}</p>
                </div>
                <span className="hidden sm:block text-slate-600 text-xs">
                  {timeAgo(u.createdAt)}
                </span>
                <button
                  onClick={() => changeRole(u, u.role === 'admin' ? 'member' : 'admin')}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition ${
                    u.role === 'admin'
                      ? 'text-amber-300 bg-amber-500/10 hover:bg-amber-500/20'
                      : 'text-slate-400 bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  {u.role === 'admin' ? <ShieldCheck size={13} /> : <Shield size={13} />}
                  {u.role === 'admin' ? 'Admin' : 'Make Admin'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {projects.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-10">Koi project nahi hai.</p>
            )}
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-800 last:border-0 hover:bg-slate-800/40"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{p.name}</p>
                  <p className="text-slate-500 text-xs">
                    {p.ownerName} • {p.type} • {timeAgo(p.updatedAt)}
                  </p>
                </div>
                <Link
                  to={`/project/${p.id}`}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition"
                >
                  <ExternalLink size={13} />
                  Open
                </Link>
                <button
                  onClick={() => handleDeleteProject(p)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition"
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
