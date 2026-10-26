import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Github, Loader2, X, Lock, Globe, Search } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { importProject, timeAgo } from '../services/projectService'
import {
  connectGitHub,
  getGitHubToken,
  listRepos,
  parseRepo,
  fetchRepoFiles,
} from '../services/githubService'

const errorText = (e) => {
  switch (e?.code || e?.message) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return ''
    case 'auth/operation-not-allowed':
      return 'Firebase me GitHub sign-in abhi enable nahi hai (Authentication → Sign-in method → GitHub).'
    case 'auth/credential-already-in-use':
      return 'Yeh GitHub account pehle se kisi aur BharatCodex account se juda hai. Dusra GitHub account use karo.'
    case 'auth/popup-blocked':
      return 'Browser ne popup block kar diya. Popup allow karke dobara try karo.'
    case 'GH_NOT_FOUND':
      return 'Repo nahi mila. Naam check karo, ya private repo ho to pehle GitHub connect karo.'
    case 'GH_RATE_LIMIT':
      return 'GitHub ki limit lag gayi. Thodi der baad try karo, ya GitHub connect karke try karo.'
    case 'GH_UNAUTHORIZED':
      return 'GitHub ka session khatam ho gaya. Dobara Connect GitHub dabao.'
    case 'NO_FILES':
      return 'Is repo me import karne layak text/code files nahi mili.'
    default:
      return 'Kuch gadbad hui. Dobara try karo.'
  }
}

export default function GitHubImportModal({ onClose }) {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [token, setToken] = useState(getGitHubToken())
  const [repos, setRepos] = useState([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [wantPrivate, setWantPrivate] = useState(true)
  const [url, setUrl] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState('') // '' | 'connect' | 'import'
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setRepos([]); return }
    let alive = true
    setLoadingRepos(true)
    listRepos(token)
      .then((list) => { if (alive) setRepos(list) })
      .catch((e) => {
        if (!alive) return
        console.error('Repos load failed:', e)
        if (e?.message === 'GH_UNAUTHORIZED') setToken('')
        setError(errorText(e))
      })
      .finally(() => { if (alive) setLoadingRepos(false) })
    return () => { alive = false }
  }, [token])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? repos.filter((r) => r.fullName.toLowerCase().includes(q)) : repos
  }, [repos, filter])

  const handleConnect = async () => {
    if (busy) return
    setBusy('connect'); setError('')
    try {
      const t = await connectGitHub({ privateRepos: wantPrivate })
      setToken(t)
    } catch (e) {
      console.error('GitHub connect failed:', e)
      setError(errorText(e))
    } finally {
      setBusy('')
    }
  }

  const doImport = async (owner, repo) => {
    if (busy || !user) return
    setBusy('import'); setError(''); setProgress('Repo padh raha hoon...')
    try {
      const { name, entries, github } = await fetchRepoFiles({
        owner, repo, token,
        onProgress: (d, t) => setProgress(`Files download ho rahi hain ${d}/${t}`),
      })
      setProgress('Project ban raha hai...')
      const id = await importProject(user, name.slice(0, 100), entries, isAdmin, github)
      onClose()
      navigate('/project/' + id)
    } catch (e) {
      console.error('GitHub import failed:', e)
      setError(errorText(e))
    } finally {
      setBusy(''); setProgress('')
    }
  }

  const handleUrlImport = (e) => {
    e.preventDefault()
    const parsed = parseRepo(url)
    if (!parsed) { setError('Sahi format daalo: owner/repo ya https://github.com/owner/repo'); return }
    doImport(parsed.owner, parsed.repo)
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 py-6"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="bg-surface border border-edge rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-2xl max-h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-body flex items-center gap-2">
            <Github size={20} /> GitHub se Import
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-mute hover:text-body hover:bg-raise transition disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Repo URL se (public repo ke liye connect zaroori nahi) */}
        <form onSubmit={handleUrlImport} className="mb-5">
          <label htmlFor="gh-url" className="block text-sm text-mute mb-1.5">
            Repo ka link ya naam
          </label>
          <div className="flex gap-2">
            <input
              id="gh-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="owner/repo ya https://github.com/owner/repo"
              disabled={!!busy}
              className="flex-1 min-w-0 bg-raise border border-edge rounded-lg px-3.5 py-2.5 text-body placeholder-faint focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!!busy || !url.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 rounded-lg transition"
            >
              Import
            </button>
          </div>
        </form>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-edge" />
          <span className="text-faint text-xs">ya apne repos me se chuno</span>
          <div className="h-px flex-1 bg-edge" />
        </div>

        {!token ? (
          <div className="text-center">
            <button
              type="button"
              onClick={handleConnect}
              disabled={!!busy}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60"
            >
              {busy === 'connect' ? <Loader2 size={18} className="animate-spin" /> : <Github size={18} />}
              Connect GitHub
            </button>
            <label className="flex items-center justify-center gap-2 text-xs text-mute mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wantPrivate}
                onChange={(e) => setWantPrivate(e.target.checked)}
              />
              Push/Pull aur private repos ke liye permission (recommended)
            </label>
          </div>
        ) : (
          <>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Repo dhundho..."
                className="w-full bg-raise border border-edge rounded-lg pl-9 pr-3 py-2 text-sm text-body placeholder-faint focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-edge divide-y divide-edge">
              {loadingRepos ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-blue-500" size={22} />
                </div>
              ) : shown.length === 0 ? (
                <p className="text-faint text-sm text-center py-8">Koi repo nahi mila.</p>
              ) : (
                shown.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!!busy}
                    onClick={() => doImport(r.owner, r.name)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-raise transition disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2">
                      {r.private ? <Lock size={13} className="text-amber-400 shrink-0" /> : <Globe size={13} className="text-emerald-400 shrink-0" />}
                      <span className="text-body text-sm font-medium truncate">{r.fullName}</span>
                      <span className="text-faint text-[11px] ml-auto shrink-0">{timeAgo(new Date(r.updatedAt).getTime())}</span>
                    </div>
                    {r.description && <p className="text-faint text-xs mt-0.5 truncate">{r.description}</p>}
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => { setWantPrivate(true); handleConnect() }}
              disabled={!!busy}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-60"
            >
              Private repos nahi dikh rahe? Unki permission do
            </button>
          </>
        )}

        {progress && (
          <p className="mt-4 text-sm text-blue-300 flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" /> {progress}
          </p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  )
}
