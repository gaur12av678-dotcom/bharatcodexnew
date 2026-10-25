import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import JSZip from 'jszip'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  createProject,
  importProject,
  trashProject,
  restoreProject,
  pinProject,
  unpinProject,
  markAdminProjects,
  timeAgo,
} from '../services/projectService'
import {
  Plus,
  Trash2,
  FolderGit2,
  Loader2,
  X,
  Globe,
  Atom,
  Upload,
  RotateCcw,
  Pin,
  PinOff,
} from 'lucide-react'

export default function Dashboard() {
  const { user, isAdmin, isTeam } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('web')
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState('active') // 'active' | 'trash'
  const [importing, setImporting] = useState(false)
  const [pins, setPins] = useState([])
  const [loadError, setLoadError] = useState('')
  const markedRef = useRef(new Set())
  const fileInputRef = useRef(null)

  // Pinned projects sabse upar (baaki updatedAt ke order me)
  const visible = projects
    .filter((p) => (view === 'trash' ? p.trashed : !p.trashed))
    .sort((a, b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id)))
  // Trash/delete sirf project ka owner ya admin kar sakta hai
  const canManage = (p) => isAdmin || p.ownerId === user?.uid
  const activeCount = projects.filter((p) => !p.trashed).length
  const trashCount = projects.length - activeCount
  // Kaun kya dekhega:
  //  Admin  -> saare projects
  //  Team   -> apne + admin ke projects
  //  Member -> sirf apne projects
  useEffect(() => {
    if (!user) { setProjects([]); setLoading(false); return }
    setLoading(true)
    setLoadError('')
    const parts = {}
    const merge = () => {
      const map = new Map()
      Object.values(parts).forEach((list) => list.forEach((p) => map.set(p.id, p)))
      const list = [...map.values()]
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      setProjects(list)
      setLoading(false)
    }
    const listen = (key, q) => onSnapshot(q, (snapshot) => {
      parts[key] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      merge()
    }, (error) => {
      console.error('Projects load failed (' + key + '):', error)
      setLoadError((error.code ? '[' + error.code + '] ' : '') + (error.message || 'Unknown error'))
      setLoading(false)
    })

    const unsubs = []
    if (isAdmin) {
      unsubs.push(listen('all', query(collection(db, 'projects'))))
    } else {
      unsubs.push(listen('own', query(collection(db, 'projects'), where('ownerId', '==', user.uid))))
      if (isTeam) unsubs.push(listen('admin', query(collection(db, 'projects'), where('ownerIsAdmin', '==', true))))
    }
    return () => unsubs.forEach((u) => u())
  }, [user, isAdmin, isTeam])

  // Admin ke purane projects ko ek baar "team ko dikhao" mark karo (automatic)
  useEffect(() => {
    if (!isAdmin || !user) return
    const todo = projects
      .filter((p) => p.ownerId === user.uid && p.ownerIsAdmin !== true && !markedRef.current.has(p.id))
      .map((p) => p.id)
    if (todo.length === 0) return
    todo.forEach((pid) => markedRef.current.add(pid))
    markAdminProjects(todo).catch((e) => console.error('Admin projects mark failed:', e))
  }, [projects, isAdmin, user])

  // Pinned projects (sirf is user ke liye)
  useEffect(() => {
    if (!user) { setPins([]); return }
    return onSnapshot(doc(db, 'userPins', user.uid), (snap) => {
      setPins(snap.exists() ? (snap.data().ids || []) : [])
    }, (e) => console.error('Pins load failed:', e))
  }, [user])

  const togglePin = async (project) => {
    if (!user) return
    try {
      if (pins.includes(project.id)) await unpinProject(user.uid, project.id)
      else await pinProject(user.uid, project.id)
    } catch (e) {
      console.error('Pin failed:', e)
    }
  }

  const handleCreate = async (event) => {
    event.preventDefault()

    const projectName = name.trim()

    if (!projectName || busy || !user) return

    setBusy(true)

    try {
      const projectId = await createProject(
        user,
        projectName,
        type,
        isAdmin
      )

      setShowModal(false)
      setName('')
      setType('web')

      navigate('/project/' + projectId)
    } catch (error) {
      console.error('Project creation failed:', error)
      alert('Project banane mein error aaya. Dobara try karo.')
    } finally {
      setBusy(false)
    }
  }

  // ZIP ya files import karke naya project banao
  const handleImportFiles = async (event) => {
    const picked = Array.from(event.target.files || [])
    event.target.value = ''
    if (picked.length === 0 || importing || !user) return
    setImporting(true)
    try {
      const entries = []
      let projectName = 'Imported Project'
      const zipFile = picked.find((f) => /\.zip$/i.test(f.name))
      if (zipFile) {
        projectName = zipFile.name.replace(/\.zip$/i, '')
        const zip = await JSZip.loadAsync(zipFile)
        const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
        for (const n of names) {
          try {
            entries.push({ path: n, content: await zip.files[n].async('string') })
          } catch (e) { /* binary file skip */ }
        }
      } else {
        for (const f of picked) {
          entries.push({ path: f.webkitRelativePath || f.name, content: await f.text() })
        }
        if (picked.length === 1) projectName = picked[0].name.replace(/\.[^.]+$/, '')
      }
      const projectId = await importProject(user, projectName.slice(0, 100), entries, isAdmin)
      navigate('/project/' + projectId)
    } catch (error) {
      console.error('Import failed:', error)
      alert(error.message === 'NO_FILES'
        ? 'Is ZIP mein import karne layak text/code files nahi mili.'
        : 'Import nahi hua. Dobara try karo.')
    } finally {
      setImporting(false)
    }
  }

const handleDelete = async (project) => {
  const confirmed = window.confirm(
    `"${project.name}" trash mein jayega. Permanent delete NAHI hoga — baad mein restore kar sakte ho.`
  )
  if (!confirmed) return
  try {
    await trashProject(project.id, user)
  } catch (error) {
    console.error('Trash failed:', error)
    alert('Trash nahi hua. Dobara try karo.')
  }
}

const handleRestore = async (project) => {
  try {
    await restoreProject(project.id)
  } catch (error) {
    console.error('Restore failed:', error)
    alert('Restore nahi hua. Dobara try karo.')
  }
}
  return (
    <div className="h-full overflow-y-auto bg-base text-body transition-colors duration-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-body">
              {isAdmin ? 'Saare Projects' : isTeam ? 'Team Projects' : 'Mere Projects'}
            </h1>

            <p className="text-mute text-sm mt-1">
{isAdmin
  ? 'Admin view - team ke ' + activeCount + ' projects'
  : isTeam
    ? 'Tumhare + admin ke ' + activeCount + ' projects'
    : activeCount + ' project' + (activeCount === 1 ? '' : 's')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.html,.css,.js,.jsx,.json,.md,.txt"
              multiple
              onChange={handleImportFiles}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center justify-center gap-2 bg-surface border border-edge hover:border-blue-500/50 text-body font-semibold px-4 py-2.5 rounded-xl transition disabled:opacity-60"
            >
              {importing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {importing ? 'Importing...' : 'Import Project'}
            </button>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-xl transition"
            >
              <Plus size={18} />
              New Project
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
            <p className="font-semibold text-red-400 mb-1">Projects load nahi ho paaye</p>
            <p className="text-red-300 break-words font-mono text-xs">{loadError}</p>
            {loadError.includes('permission') && (
              <p className="mt-2 text-amber-300">
                Firebase Console &gt; Firestore &gt; Rules me naya <b>firestore.rules</b> paste karke <b>Publish</b> karo.
              </p>
            )}
          </div>
        )}

        {/* Projects / Trash tabs */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setView('active')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${view === 'active' ? 'bg-blue-600 text-white' : 'bg-surface text-mute hover:text-body border border-edge'}`}
          >
            Projects ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setView('trash')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${view === 'trash' ? 'bg-blue-600 text-white' : 'bg-surface text-mute hover:text-body border border-edge'}`}
          >
            <Trash2 size={14} />
            Trash ({trashCount})
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2
              className="animate-spin text-blue-500"
              size={32}
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-edge rounded-2xl">
            <FolderGit2
              size={40}
              className="mx-auto text-faint mb-3"
            />

            <p className="text-mute">
              {view === 'trash' ? 'Trash khaali hai.' : 'Koi project nahi hai abhi.'}
            </p>

            {view === 'active' && (
              <>
                <p className="text-faint text-sm mt-1">
                  "New Project" se shuru karo ya "Import Project" se ZIP upload karo!
                </p>

                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="mt-5 inline-flex items-center gap-2 text-blue-500 hover:text-blue-400 text-sm font-medium"
                >
                  <Plus size={16} />
                  Create your first project
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((project) => (
              <div
                key={project.id}
                className="group bg-surface border border-edge rounded-xl p-5 hover:border-blue-500/50 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <span
                    className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                      project.type === 'react'
                        ? 'text-cyan-300 bg-cyan-500/10'
                        : 'text-emerald-300 bg-emerald-500/10'
                    }`}
                  >
                    {project.type === 'react' ? (
                      <Atom size={12} />
                    ) : (
                      <Globe size={12} />
                    )}

                    {project.type === 'react' ? 'React' : 'Web'}
                  </span>

                  <div className="flex items-center gap-1">
                    {!project.trashed && (
                      <button
                        type="button"
                        onClick={() => togglePin(project)}
                        title={pins.includes(project.id) ? 'Unpin karo' : 'Pin karo (sabse upar rahega)'}
                        aria-label={pins.includes(project.id) ? 'Unpin' : 'Pin'}
                        className={`p-1.5 rounded-lg transition ${
                          pins.includes(project.id)
                            ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                            : 'text-faint hover:text-amber-400 hover:bg-amber-500/10 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'
                        }`}
                      >
                        {pins.includes(project.id) ? <Pin size={15} className="fill-current" /> : <PinOff size={15} />}
                      </button>
                    )}
                    {canManage(project) && (
                      <>
                      {project.trashed ? (
                        <button
                          type="button"
                          onClick={() => handleRestore(project)}
                          title="Restore project"
                          aria-label={`Restore ${project.name}`}
                          className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
                        >
                          <RotateCcw size={13} />
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDelete(project)}
                          title="Trash me bhejo"
                          aria-label={`Delete ${project.name}`}
                          className="p-1.5 rounded-lg text-faint hover:text-red-400 hover:bg-red-500/10 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                      </>
                    )}
                  </div>
                </div>

                <h3 className="text-body font-semibold truncate">
                  {project.name}
                </h3>

                <p className="text-faint text-xs mt-1 truncate">
                  {project.ownerName || 'Unknown owner'} ·{' '}
                  {timeAgo(project.updatedAt)}
                </p>

                {project.trashed ? (
                  <p className="mt-4 text-center text-faint text-xs py-2">Trash mein hai</p>
                ) : (
                  <Link
                    to={`/project/${project.id}`}
                    className="mt-4 block text-center bg-raise hover:bg-blue-600 text-mute hover:text-white text-sm font-medium py-2 rounded-lg transition"
                  >
                    Open Editor
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 py-6"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setShowModal(false)
            }
          }}
        >
          <form
            onSubmit={handleCreate}
            className="bg-surface border border-edge rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl max-h-full overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-body">
                New Project
              </h2>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={busy}
                aria-label="Close dialog"
                className="p-1.5 rounded-lg text-mute hover:text-body hover:bg-raise transition disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <label
              htmlFor="project-name"
              className="block text-sm text-mute mb-1.5"
            >
              Project ka naam
            </label>

            <input
              id="project-name"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Portfolio Website"
              className="w-full bg-raise border border-edge rounded-lg px-3.5 py-2.5 text-body placeholder-faint focus:outline-none focus:border-blue-500 mb-4"
            />

            <label className="block text-sm text-mute mb-1.5">
              Project type
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setType('web')}
                aria-pressed={type === 'web'}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-medium transition ${
                  type === 'web'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-edge text-mute hover:border-faint'
                }`}
              >
                <Globe size={16} />
                HTML / CSS / JS
              </button>

              <button
                type="button"
                onClick={() => setType('react')}
                aria-pressed={type === 'react'}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-medium transition ${
                  type === 'react'
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                    : 'border-edge text-mute hover:border-faint'
                }`}
              >
                <Atom size={16} />
                React
              </button>
            </div>

            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              {busy && (
                <Loader2
                  size={16}
                  className="animate-spin"
                />
              )}

              {busy ? 'Creating Project...' : 'Create Project'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
