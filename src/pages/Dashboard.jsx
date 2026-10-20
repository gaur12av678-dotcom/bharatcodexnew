```jsx
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  createProject,
  deleteProject,
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
} from 'lucide-react'

export default function Dashboard() {
  const { user, isAdmin } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('web')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      setProjects([])
      setLoading(false)
      return
    }

    setLoading(true)

    const projectsQuery = isAdmin
      ? query(collection(db, 'projects'))
      : query(
          collection(db, 'projects'),
          where('ownerId', '==', user.uid)
        )

    const unsubscribe = onSnapshot(
      projectsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }))

        list.sort(
          (a, b) =>
            (b.updatedAt || 0) - (a.updatedAt || 0)
        )

        setProjects(list)
        setLoading(false)
      },
      (error) => {
        console.error('Projects load failed:', error)
        setLoading(false)
        alert('Projects load nahi ho paaye. Dobara try karo.')
      }
    )

    return unsubscribe
  }, [user, isAdmin])

  const handleCreate = async (event) => {
    event.preventDefault()

    const projectName = name.trim()

    if (!projectName || busy || !user) return

    setBusy(true)

    try {
      const projectId = await createProject(
        user,
        projectName,
        type
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

  const handleDelete = async (project) => {
    const confirmed = window.confirm(
      'Kya "' + project.name + '" project delete karna hai?'
    )

    if (!confirmed) return

    try {
      await deleteProject(project.id)
    } catch (error) {
      console.error('Project deletion failed:', error)
      alert('Project delete nahi hua. Dobara try karo.')
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-base text-body transition-colors duration-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-body">
              {isAdmin ? 'Saare Projects' : 'Mere Projects'}
            </h1>

            <p className="text-mute text-sm mt-1">
              {isAdmin
                ? `Admin view — team ke ${projects.length} projects`
                : `${projects.length} project${
                    projects.length === 1 ? '' : 's'
                  }`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-xl transition"
          >
            <Plus size={18} />
            New Project
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2
              className="animate-spin text-blue-500"
              size={32}
            />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-edge rounded-2xl">
            <FolderGit2
              size={40}
              className="mx-auto text-faint mb-3"
            />

            <p className="text-mute">
              Koi project nahi hai abhi.
            </p>

            <p className="text-faint text-sm mt-1">
              "New Project" se shuru karo!
            </p>

            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="mt-5 inline-flex items-center gap-2 text-blue-500 hover:text-blue-400 text-sm font-medium"
            >
              <Plus size={16} />
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
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

                  <button
                    type="button"
                    onClick={() => handleDelete(project)}
                    title="Delete project"
                    aria-label={`Delete ${project.name}`}
                    className="p-1.5 rounded-lg text-faint hover:text-red-400 hover:bg-red-500/10 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <h3 className="text-body font-semibold truncate">
                  {project.name}
                </h3>

                <p className="text-faint text-xs mt-1 truncate">
                  {project.ownerName || 'Unknown owner'} ·{' '}
                  {timeAgo(project.updatedAt)}
                </p>

                <Link
                  to={`/project/${project.id}`}
                  className="mt-4 block text-center bg-raise hover:bg-blue-600 text-mute hover:text-white text-sm font-medium py-2 rounded-lg transition"
                >
                  Open Editor
                </Link>
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
```
