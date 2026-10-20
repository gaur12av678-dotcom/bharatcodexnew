import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { createProject, deleteProject, timeAgo } from '../services/projectService'
import { Plus, Trash2, FolderGit2, Loader2, X, Globe, Atom } from 'lucide-react'

export default function Dashboard() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('web')
  const [busy, setBusy] = useState(false)

  // Live data — koi project bane/delete ho, yahan turant dikhega (admin ki nazar!)
  useEffect(() => {
    if (!user) return
    const q = isAdmin
      ? query(collection(db, 'projects'))
      : query(collection(db, 'projects'), where('ownerId', '==', user.uid))

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      setProjects(list)
      setLoading(false)
    })
    return unsub
  }, [user, isAdmin])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const id = await createProject(user, name.trim(), type)
      setShowModal(false)
      setName('')
      navigate(`/project/${id}`)
    } catch (err) {
      console.error(err)
      alert('Project banane me error aaya. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (p) => {
    if (!confirm(`"${p.name}" permanently delete kar doon?`)) return
    try {
      await deleteProject(p.id)
    } catch (err) {
      console.error(err)
      alert('Delete failed.')
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {isAdmin ? 'Saare Projects' : 'Mere Projects'}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {isAdmin
                ? `Admin view — team ke ${projects.length} projects`
                : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-xl transition"
          >
            <Plus size={18} />
            New Project
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl">
            <FolderGit2 size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400">Koi project nahi hai abhi.</p>
            <p className="text-slate-600 text-sm mt-1">"New Project" se shuru karo!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-blue-500/50 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <span
                    className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                      p.type === 'react'
                        ? 'text-cyan-300 bg-cyan-500/10'
                        : 'text-emerald-300 bg-emerald-500/10'
                    }`}
                  >
                    {p.type === 'react' ? <Atom size={12} /> : <Globe size={12} />}
                    {p.type === 'react' ? 'React' : 'Web'}
                  </span>
                  <button
                    onClick={() => handleDelete(p)}
                    title="Delete project"
                    className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <h3 className="text-white font-semibold truncate">{p.name}</h3>
                <p className="text-slate-500 text-xs mt-1">
                  {p.ownerName} • {timeAgo(p.updatedAt)}
                </p>
                <Link
                  to={`/project/${p.id}`}
                  className="mt-4 block text-center bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white text-sm font-medium py-2 rounded-lg transition"
                >
                  Open Editor
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <form
            onSubmit={handleCreate}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">New Project</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <label className="block text-sm text-slate-400 mb-1.5">Project ka naam</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Portfolio Website"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-4"
            />

            <label className="block text-sm text-slate-400 mb-1.5">Project type</label>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setType('web')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-medium transition ${
                  type === 'web'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Globe size={16} /> HTML / CSS / JS
              </button>
              <button
                type="button"
                onClick={() => setType('react')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-medium transition ${
                  type === 'react'
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Atom size={16} /> React
              </button>
            </div>

            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Create Project
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
