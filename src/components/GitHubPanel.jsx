import { useCallback, useEffect, useState } from 'react'
import { Github, X, Loader2, ArrowUpFromLine, ArrowDownToLine, RefreshCw, ExternalLink, Unlink, Lock, Globe } from 'lucide-react'
import { createVersion, getProjectFiles, setProjectGitHub } from '../services/projectService'
import {
  connectGitHub, getGitHubToken, hasRepoScope, createRepo, linkExistingRepo,
  parseRepo, getStatus, pushFiles, pullFromGitHub, listRepos,
} from '../services/githubService'

const errorText = (e) => {
  switch (e?.code || e?.message) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return ''
    case 'auth/operation-not-allowed':
      return 'Firebase me GitHub sign-in enable nahi hai (Authentication → Sign-in method → GitHub).'
    case 'auth/credential-already-in-use':
      return 'Yeh GitHub account pehle se kisi aur BharatCodex account se juda hai.'
    case 'auth/popup-blocked':
      return 'Browser ne popup block kar diya. Popup allow karke dobara try karo.'
    case 'GH_UNAUTHORIZED':
      return 'GitHub ka session khatam ho gaya. Dobara Connect GitHub dabao.'
    case 'GH_NOT_FOUND':
      return 'Repo ya branch nahi mila, ya is GitHub account ko uska access nahi hai.'
    case 'GH_FORBIDDEN':
      return 'GitHub ne permission nahi di. Connect GitHub dobara karke repo permission do (org ka repo ho to org ki approval bhi chahiye).'
    case 'GH_RATE_LIMIT':
      return 'GitHub ki limit lag gayi. Thodi der baad try karo.'
    case 'GH_NAME_EXISTS':
      return 'Is naam ka repo tumhare account me pehle se hai. Dusra naam chuno.'
    case 'GH_INVALID':
      return 'GitHub ne request reject ki. Repo ka naam check karo.'
    case 'GH_BEHIND':
      return 'GitHub pe naye changes hain. Pehle Pull karo, phir Push.'
    case 'GH_CONFLICT':
      return 'GitHub repo khaali ya busy hai. Thodi der baad dobara try karo.'
    case 'NOTHING_TO_PUSH':
      return 'Push karne ke liye koi naya badlav nahi hai.'
    case 'NOT_SIGNED_IN':
      return 'Pehle sign in karo.'
    default:
      return 'Kuch gadbad hui. Dobara try karo.'
  }
}

const slug = (s) => (s || 'project').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'project'

export default function GitHubPanel({ project, projectId, user, onBeforeAction, onChanged, onClose }) {
  const gh = project.github || null
  const [token, setToken] = useState(getGitHubToken())
  const [ready, setReady] = useState(!!getGitHubToken() && hasRepoScope())
  const [busy, setBusy] = useState('')      // 'connect' | 'create' | 'push' | 'pull' | 'status' | 'link'
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState(null) // { behind, changed, deleted }

  const [repoName, setRepoName] = useState(slug(project.name))
  const [desc, setDesc] = useState('')
  const [isPrivate, setIsPrivate] = useState(true)
  const [linkInput, setLinkInput] = useState('')
  const [message, setMessage] = useState('')
  const [suggestions, setSuggestions] = useState([])

  const fail = (e) => { console.error('GitHub error:', e); setError(errorText(e)); if (e?.message === 'GH_UNAUTHORIZED') { setReady(false); setToken('') } }

  const freshFiles = async () => {
    await onBeforeAction?.()
    return getProjectFiles(projectId)
  }

  const refreshStatus = useCallback(async () => {
    if (!gh || !ready) return
    setBusy('status'); setError('')
    try {
      await onBeforeAction?.()
      const files = await getProjectFiles(projectId)
      setStatus(await getStatus({ token: getGitHubToken(), github: gh, files }))
    } catch (e) { fail(e) } finally { setBusy('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gh?.owner, gh?.repo, gh?.branch, gh?.headSha, ready, projectId])

  useEffect(() => { refreshStatus() }, [refreshStatus])

  // Link nahi hai to project ke naam se milte-julte repos suggest karo
  useEffect(() => {
    if (gh || !ready) { setSuggestions([]); return }
    let alive = true
    const norm = (x) => (x || '').toLowerCase().replace(/[-_ ]?(main|master)$/, '').replace(/[^a-z0-9]/g, '')
    const want = norm(project.name)
    listRepos(getGitHubToken())
      .then((list) => {
        if (!alive || !want) return
        setSuggestions(list.filter((r) => norm(r.name) === want || (want.length > 4 && norm(r.name).startsWith(want))).slice(0, 3))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [gh, ready, project.name])

  const handleConnect = async () => {
    if (busy) return
    setBusy('connect'); setError('')
    try {
      const t = await connectGitHub({ privateRepos: true })
      setToken(t); setReady(true)
    } catch (e) { fail(e) } finally { setBusy('') }
  }

  // ---------- NAYA REPO ----------
  const handleCreate = async (ev) => {
    ev.preventDefault()
    if (busy) return
    setBusy('create'); setError(''); setNotice('')
    try {
      setProgress('Repo ban raha hai...')
      const files = await freshFiles()
      const created = await createRepo(token, { name: slug(repoName), description: desc.trim(), isPrivate })
      const link = { owner: created.owner, repo: created.repo, branch: created.branch, headSha: created.headSha }
      await setProjectGitHub(projectId, link) // push fail ho to bhi link bana rahe
      onChanged({ github: link })
      setProgress('Files push ho rahi hain...')
      const res = await pushFiles({
        token, github: link, files, skipDeletes: true,
        message: 'Initial commit from BharatCodex',
      })
      const next = { ...link, headSha: res.headSha }
      await setProjectGitHub(projectId, next)
      onChanged({ github: next })
      setNotice(`Repo ban gaya: ${created.owner}/${created.repo} — ${res.changed} files push hui.`)
    } catch (e) { if (e?.message === 'NOTHING_TO_PUSH') setNotice('Repo ban gaya.'); else fail(e) }
    finally { setBusy(''); setProgress('') }
  }

  // ---------- MOUJUDA REPO LINK ----------
  // mode 'pull' = GitHub ka latest code project me lao (backup ke saath)
  // mode 'push' = mera project hi sahi hai, ab ise GitHub pe bhejna hai
  const doLink = async (owner, repo, mode) => {
    if (busy) return
    setBusy('link'); setError(''); setNotice('')
    try {
      const link = await linkExistingRepo(token, owner, repo)
      if (mode === 'pull') {
        if (!window.confirm(`${link.owner}/${link.repo} ka latest code is project me aayega. Jo files dono jagah alag hongi wo GitHub wali se replace hongi.\n\nPehle backup ban jayega (History me). Aage badho?`)) return
        const files = await freshFiles()
        try {
          await createVersion(projectId, user, files, project.folders || [], 'Auto: GitHub link/pull se pehle', true)
        } catch (e) {
          if (!window.confirm('Backup nahi ban paya (project bahut bada hai). Phir bhi aage badho?')) return
        }
        const synced = { ...link, headSha: '' }
        await setProjectGitHub(projectId, synced)
        onChanged({ github: synced })
        setProgress('GitHub se code aa raha hai...')
        const res = await pullFromGitHub({
          token, github: synced, projectId, files, user,
          onProgress: (d, t) => setProgress(`Pull ho raha hai ${d}/${t}`),
        })
        onChanged({ github: res.github, reload: true })
        setNotice(`Jud gaya: ${link.owner}/${link.repo} — ${res.updated} file(s) sync hui. Ab Push/Pull chalega.`)
      } else {
        await setProjectGitHub(projectId, link)
        onChanged({ github: link })
      }
      setLinkInput('')
    } catch (e) { fail(e) } finally { setBusy(''); setProgress('') }
  }

  const handleLink = (ev, mode) => {
    ev.preventDefault()
    const parsed = parseRepo(linkInput)
    if (!parsed) { setError('Sahi format daalo: owner/repo'); return }
    doLink(parsed.owner, parsed.repo, mode)
  }

  const handleUnlink = async () => {
    if (busy) return
    if (!window.confirm('Is project ka GitHub link hata dun? Repo ya code ko kuch nahi hoga.')) return
    try {
      await setProjectGitHub(projectId, null)
      onChanged({ github: null })
      setStatus(null); setNotice('')
    } catch (e) { fail(e) }
  }

  // ---------- PUSH ----------
  const handlePush = async () => {
    if (busy || !gh) return
    if (status?.deleted > 0 && !window.confirm(`${status.deleted} file(s) GitHub se DELETE hongi (jo project me nahi hain). Aage badho?`)) return
    setBusy('push'); setError(''); setNotice(''); setProgress('Push ho raha hai...')
    try {
      const files = await freshFiles()
      const res = await pushFiles({
        token, github: gh, files, message: message.trim() || 'Update from BharatCodex',
        onProgress: (d, t) => setProgress(`Push ho raha hai ${d}/${t}`),
      })
      const next = { ...gh, headSha: res.headSha }
      await setProjectGitHub(projectId, next)
      onChanged({ github: next })
      setMessage('')
      setNotice(`Push ho gaya: ${res.changed} file(s) update${res.deleted ? `, ${res.deleted} delete` : ''}.`)
    } catch (e) { fail(e); if (e?.message === 'GH_BEHIND') refreshStatus() }
    finally { setBusy(''); setProgress('') }
  }

  // ---------- PULL ----------
  const handlePull = async () => {
    if (busy || !gh) return
    if (!window.confirm('GitHub ke naye changes project me aayenge. Jo files dono jagah badli hain wo GitHub wale se replace hongi.\n\nPehle ek backup ban jayega (History me), to koi kaam nahi khoyega. Aage badho?')) return
    setBusy('pull'); setError(''); setNotice(''); setProgress('Pull ho raha hai...')
    try {
      const files = await freshFiles()
      try {
        await createVersion(projectId, user, files, project.folders || [], 'Auto: GitHub pull se pehle', true)
      } catch (e) {
        if (!window.confirm('Backup nahi ban paya (project bahut bada hai). Phir bhi pull karna hai?')) return
      }
      const res = await pullFromGitHub({
        token, github: gh, projectId, files, user,
        onProgress: (d, t) => setProgress(`Pull ho raha hai ${d}/${t}`),
      })
      onChanged({ github: res.github, reload: true })
      setNotice(res.upToDate
        ? 'Sab kuch up-to-date hai.'
        : `Pull ho gaya: ${res.updated} file(s) update${res.removed ? `, ${res.removed} hatayi` : ''}${res.conflicts ? ` (${res.conflicts} file me tumhare changes replace hue — History me backup hai)` : ''}.`)
    } catch (e) { fail(e) } finally { setBusy(''); setProgress('') }
  }

  const repoUrl = gh ? `https://github.com/${gh.owner}/${gh.repo}` : ''

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 py-6"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="bg-surface border border-edge rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl max-h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-body flex items-center gap-2"><Github size={20} /> GitHub</h2>
          <button type="button" onClick={onClose} disabled={!!busy} aria-label="Close"
            className="p-1.5 rounded-lg text-mute hover:text-body hover:bg-raise transition disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        {gh && !ready && (
          <div className="bg-raise border border-edge rounded-xl p-3.5 mb-4">
            <div className="flex items-center gap-2">
              <Github size={16} className="text-mute shrink-0" />
              <a href={repoUrl} target="_blank" rel="noreferrer"
                className="text-body text-sm font-semibold truncate hover:text-blue-400 flex items-center gap-1">
                {gh.owner}/{gh.repo} <ExternalLink size={12} />
              </a>
              <span className="ml-auto text-[11px] text-faint shrink-0">{gh.branch}</span>
            </div>
            <p className="text-faint text-xs mt-1.5">Yeh project is repo se juda hua hai.</p>
          </div>
        )}

        {!ready ? (
          <div className="text-center">
            <p className="text-mute text-sm mb-4">
              {gh ? 'Push / Pull karne ke liye ek baar GitHub connect karo (is session ke liye).' : 'Push / Pull / naya repo ke liye GitHub connect karo aur repo permission do.'}
            </p>
            <button type="button" onClick={handleConnect} disabled={!!busy}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60">
              {busy === 'connect' ? <Loader2 size={18} className="animate-spin" /> : <Github size={18} />}
              Connect GitHub
            </button>
          </div>
        ) : gh ? (
          <>
            {/* Linked repo */}
            <div className="bg-raise border border-edge rounded-xl p-3.5 mb-4">
              <div className="flex items-center gap-2">
                <Github size={16} className="text-mute shrink-0" />
                <a href={repoUrl} target="_blank" rel="noreferrer"
                  className="text-body text-sm font-semibold truncate hover:text-blue-400 flex items-center gap-1">
                  {gh.owner}/{gh.repo} <ExternalLink size={12} />
                </a>
                <span className="ml-auto text-[11px] text-faint shrink-0">{gh.branch}</span>
              </div>
              <div className="mt-2 text-xs flex items-center gap-2 min-h-[18px]">
                {busy === 'status' ? (
                  <span className="text-faint flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Check ho raha hai...</span>
                ) : status ? (
                  <>
                    {status.behind && <span className="text-amber-300">GitHub pe naye changes hain → Pull karo</span>}
                    {!status.behind && status.changed === 0 && status.deleted === 0 && <span className="text-emerald-400">Sab sync me hai ✓</span>}
                    {(status.changed > 0 || status.deleted > 0) && (
                      <span className="text-blue-300">{status.changed} file badli{status.deleted ? `, ${status.deleted} delete` : ''} (push baaki)</span>
                    )}
                  </>
                ) : null}
                <button type="button" onClick={refreshStatus} disabled={!!busy} title="Status dobara check karo"
                  className="ml-auto p-1 rounded text-faint hover:text-body disabled:opacity-50"><RefreshCw size={13} /></button>
              </div>
            </div>

            <label htmlFor="gh-msg" className="block text-sm text-mute mb-1.5">Commit message</label>
            <input id="gh-msg" value={message} onChange={(e) => setMessage(e.target.value)} disabled={!!busy}
              placeholder="Update from BharatCodex"
              className="w-full bg-raise border border-edge rounded-lg px-3.5 py-2.5 text-body placeholder-faint focus:outline-none focus:border-blue-500 mb-3" />

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={handlePull} disabled={!!busy}
                className="flex items-center justify-center gap-2 bg-raise border border-edge hover:border-blue-500/50 text-body font-semibold py-2.5 rounded-xl transition disabled:opacity-60">
                {busy === 'pull' ? <Loader2 size={16} className="animate-spin" /> : <ArrowDownToLine size={16} />} Pull
              </button>
              <button type="button" onClick={handlePush} disabled={!!busy}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-60">
                {busy === 'push' ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpFromLine size={16} />} Push
              </button>
            </div>

            <button type="button" onClick={handleUnlink} disabled={!!busy}
              className="mt-4 flex items-center gap-1.5 text-xs text-faint hover:text-red-400 disabled:opacity-60">
              <Unlink size={13} /> Is project se GitHub link hatao
            </button>
          </>
        ) : (
          <>
            {/* Naya repo */}
            <form onSubmit={handleCreate} className="mb-5">
              <p className="text-body text-sm font-semibold mb-2">Naya repository banao</p>
              <input value={repoName} onChange={(e) => setRepoName(e.target.value)} disabled={!!busy} required maxLength={90}
                placeholder="repo-name"
                className="w-full bg-raise border border-edge rounded-lg px-3.5 py-2.5 text-body placeholder-faint focus:outline-none focus:border-blue-500 mb-2" />
              <input value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!!busy} maxLength={200}
                placeholder="Description (optional)"
                className="w-full bg-raise border border-edge rounded-lg px-3.5 py-2.5 text-body placeholder-faint focus:outline-none focus:border-blue-500 mb-2" />
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button type="button" onClick={() => setIsPrivate(true)} aria-pressed={isPrivate}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition ${isPrivate ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-edge text-mute'}`}>
                  <Lock size={14} /> Private
                </button>
                <button type="button" onClick={() => setIsPrivate(false)} aria-pressed={!isPrivate}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition ${!isPrivate ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-edge text-mute'}`}>
                  <Globe size={14} /> Public
                </button>
              </div>
              <button type="submit" disabled={!!busy || !repoName.trim()}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition">
                {busy === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Github size={16} />}
                Repo banao aur code push karo
              </button>
            </form>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-edge" />
              <span className="text-faint text-xs">ya moujuda repo se jodo (purana import wala project)</span>
              <div className="h-px flex-1 bg-edge" />
            </div>

            {suggestions.length > 0 && (
              <div className="mb-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
                <p className="text-xs text-blue-300 mb-2">Kya yeh is project ka repo hai?</p>
                {suggestions.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 py-1">
                    <span className="text-body text-sm truncate">{r.fullName}</span>
                    <button type="button" disabled={!!busy} onClick={() => doLink(r.owner, r.name, 'pull')}
                      className="ml-auto shrink-0 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-60">
                      Isse jodo
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={(e) => handleLink(e, 'pull')}>
              <input value={linkInput} onChange={(e) => setLinkInput(e.target.value)} disabled={!!busy}
                placeholder="owner/repo"
                className="w-full bg-raise border border-edge rounded-lg px-3.5 py-2.5 text-body placeholder-faint focus:outline-none focus:border-blue-500 mb-2" />
              <div className="grid grid-cols-2 gap-2">
                <button type="submit" disabled={!!busy || !linkInput.trim()}
                  className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition">
                  {busy === 'link' ? <Loader2 size={15} className="animate-spin" /> : <ArrowDownToLine size={15} />} Jodo + Pull
                </button>
                <button type="button" disabled={!!busy || !linkInput.trim()} onClick={(e) => handleLink(e, 'push')}
                  className="flex items-center justify-center gap-1.5 bg-raise border border-edge hover:border-blue-500/50 disabled:opacity-50 text-body text-sm font-semibold py-2.5 rounded-lg transition">
                  <ArrowUpFromLine size={15} /> Jodo + Push
                </button>
              </div>
              <p className="text-faint text-xs mt-2">
                <b>Jodo + Pull:</b> repo ka latest code project me aayega (backup ke saath). <b>Jodo + Push:</b> tumhara project hi sahi maana jayega, aur Push par alag files GitHub pe replace hongi.
              </p>
            </form>
          </>
        )}

        {progress && (
          <p className="mt-4 text-sm text-blue-300 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> {progress}</p>
        )}
        {notice && <p className="mt-4 text-sm text-emerald-400">{notice}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  )
}
