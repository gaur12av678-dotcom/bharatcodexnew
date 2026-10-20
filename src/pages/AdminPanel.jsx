import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { deleteProject, timeAgo } from '../services/projectService'
import {
  Users,
  FolderGit2,
  Loader2,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Shield,
} from 'lucide-react'

export default function AdminPanel() {
  const { profile } = useAuth()
  const { theme } = useTheme()

  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  // Real-time Firebase monitoring
  useEffect(() => {
    let usersLoaded = false
    let projectsLoaded = false

    const updateLoading = () => {
      if (usersLoaded && projectsLoaded) {
        setLoading(false)
      }
    }

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          uid: item.id,
          ...item.data(),
        }))

        list.sort(
          (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
        )

        setUsers(list)
        usersLoaded = true
        updateLoading()
      },
      (error) => {
        console.error('Users load failed:', error)
        usersLoaded = true
        updateLoading()
        alert('Users load nahi ho paaye.')
      }
    )

    const unsubProjects = onSnapshot(
      collection(db, 'projects'),
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }))

        list.sort(
          (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
        )

        setProjects(list)
        projectsLoaded = true
        updateLoading()
      },
      (error) => {
        console.error('Projects load failed:', error)
        projectsLoaded = true
        updateLoading()
        alert('Projects load nahi ho paaye.')
      }
    )

    return () => {
      unsubUsers()
      unsubProjects()
    }
  }, [])

  const changeRole = async (user, role) => {
    if (!profile?.uid) {
      alert('User profile load nahi hui.')
      return
    }

    if (user.uid === profile.uid && role !== 'admin') {
      alert('Tum khud ko admin se hata nahi sakte!')
      return
    }

    if (!['admin', 'member'].includes(role)) {
      return
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), { role })
    } catch (error) {
      console.error('Role update failed:', error)
      alert('Role update failed. Permissions check karo.')
    }
  }

  const handleDeleteProject = async (project) => {
    const confirmed = window.confirm(
      `"${project.name}" (${project.ownerName || 'Unknown owner'}) delete kar doon?`
    )

    if (!confirmed) return

    try {
      await deleteProject(project.id)
    } catch (error) {
      console.error('Project deletion failed:', error)
      alert('Delete failed. Dobara try karo.')
    }
  }

  const getAvatar = (user) =>
    user.photoURL ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      user.name || 'U'
    )}&background=1e293b&color=94a3b8`

  return (
    <div className="h-full overflow-y-auto bg-base text-body transition-colors duration-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck size={26} className="text-amber-400" />

          <div>
            <h1 className="text-2xl font-bold text-body">
              Admin Panel
            </h1>

            <p className="text-mute text-sm">
              Poori team par nazar — live updates
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'users'
                ? 'bg-blue-600 text-white'
                : 'bg-surface text-mute hover:text-body border border-edge'
            }`}
          >
            <Users size={15} />
            Users ({users.length})
          </button>

          <button
            type="button"
            onClick={() => setTab('projects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'projects'
                ? 'bg-blue-600 text-white'
                : 'bg-surface text-mute hover:text-body border border-edge'
            }`}
          >
            <FolderGit2 size={15} />
            All Projects ({projects.length})
          </button>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2
              className="animate-spin text-blue-500"
              size={32}
            />
          </div>
        ) : tab === 'users' ? (
          /* Users list */
          <div className="bg-surface border border-edge rounded-2xl overflow-hidden">
            {users.length === 0 ? (
              <p className="text-faint text-sm text-center py-10">
                Koi user nahi mila.
              </p>
            ) : (
              users.map((user) => (
                <div
                  key={user.uid}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 border-b border-edge last:border-0 hover:bg-raise/40 transition"
                >
                  <img
                    src={getAvatar(user)}
                    alt={user.name || 'User'}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full border border-edge object-cover shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-body text-sm font-medium truncate">
                      {user.name || 'Unnamed user'}

                      {user.uid === profile?.uid && (
                        <span className="ml-2 text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                          YOU
                        </span>
                      )}
                    </p>

                    <p className="text-faint text-xs truncate">
                      {user.email || 'No email available'}
                    </p>

                    <p className="sm:hidden text-faint text-xs mt-1">
                      {timeAgo(user.createdAt)}
                    </p>
                  </div>

                  <span className="hidden sm:block text-faint text-xs shrink-0">
                    {timeAgo(user.createdAt)}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      changeRole(
                        user,
                        user.role === 'admin' ? 'member' : 'admin'
                      )
                    }
                    disabled={
                      user.uid === profile?.uid &&
                      user.role === 'admin'
                    }
                    title={
                      user.uid === profile?.uid &&
                      user.role === 'admin'
                        ? 'Apna admin role yahan se remove nahi kar sakte'
                        : user.role === 'admin'
                          ? 'Change to Member'
                          : 'Make Admin'
                    }
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition shrink-0 disabled:opacity-70 ${
                      user.role === 'admin'
                        ? 'text-amber-300 bg-amber-500/10 hover:bg-amber-500/20'
                        : 'text-mute bg-raise hover:bg-edge'
                    }`}
                  >
                    {user.role === 'admin' ? (
                      <ShieldCheck size={13} />
                    ) : (
                      <Shield size={13} />
                    )}

                    {user.role === 'admin' ? 'Admin' : 'Make Admin'}
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Projects list */
          <div className="bg-surface border border-edge rounded-2xl overflow-hidden">
            {projects.length === 0 ? (
              <p className="text-faint text-sm text-center py-10">
                Koi project nahi hai.
              </p>
            ) : (
              projects.map((project) => (
                <div
                  key={project.id}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 border-b border-edge last:border-0 hover:bg-raise/40 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-body text-sm font-medium truncate">
                      {project.name}
                    </p>

                    <p className="text-faint text-xs mt-1">
                      {project.ownerName || 'Unknown owner'} ·{' '}
                      {project.type || 'web'} ·{' '}
                      {timeAgo(project.updatedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      to={`/project/${project.id}`}
                      className="flex items-center gap-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition"
                    >
                      <ExternalLink size={13} />
                      Open
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleDeleteProject(project)}
                      className="p-1.5 rounded-lg text-faint hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Delete project"
                      aria-label={`Delete ${project.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

