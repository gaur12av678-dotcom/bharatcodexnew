import { GithubAuthProvider, linkWithPopup, reauthenticateWithPopup } from 'firebase/auth'
import { auth } from '../firebase/config'
import { applyRemoteChanges } from './projectService'

const API = 'https://api.github.com'
const TOKEN_KEY = 'bc_gh_token'
const SCOPE_KEY = 'bc_gh_scope'

const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|\.cache|coverage)(\/|$)/i
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|woff2?|ttf|otf|eot|mp3|mp4|webm|mov|pdf|zip|rar|7z|exe|dll|so|bin|lock)$/i
const LOCKFILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i
const MAX_FILE = 900000
const MAX_FILES = 400

const isEligible = (path, size = 0) =>
  !SKIP.test(path) && !BINARY.test(path) && !LOCKFILES.test(path) && size <= MAX_FILE

// =====================================================================
// TOKEN (sirf is browser tab ke session me; Firestore me save nahi hota)
// =====================================================================
export const getGitHubToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}
export const hasRepoScope = () => {
  try { return sessionStorage.getItem(SCOPE_KEY) === 'repo' } catch { return false }
}
export const rememberGitHubToken = (token, scope = 'basic') => {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(SCOPE_KEY, scope)
  } catch { /* ignore */ }
}
export const clearGitHubToken = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(SCOPE_KEY)
  } catch { /* ignore */ }
}

// Google se sign-in wale user ke account me GitHub "link" hota hai (naya account nahi banta).
// privateRepos = true => 'repo' permission (private repos + push/create ke liye zaroori)
export async function connectGitHub({ privateRepos = false } = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('NOT_SIGNED_IN')

  const provider = new GithubAuthProvider()
  provider.addScope('read:user')
  if (privateRepos) provider.addScope('repo')

  const alreadyLinked = user.providerData.some((p) => p.providerId === 'github.com')
  let result
  try {
    result = alreadyLinked
      ? await reauthenticateWithPopup(user, provider)
      : await linkWithPopup(user, provider)
  } catch (e) {
    if (e?.code === 'auth/provider-already-linked') {
      result = await reauthenticateWithPopup(user, provider)
    } else {
      throw e
    }
  }
  const token = GithubAuthProvider.credentialFromResult(result)?.accessToken
  if (!token) throw new Error('NO_TOKEN')
  rememberGitHubToken(token, privateRepos ? 'repo' : 'basic')
  return token
}

// =====================================================================
// GitHub API helper
// =====================================================================
async function api(path, token, { method = 'GET', body } = {}) {
  // GitHub GET jawab browser me ~60 sec cache karta hai => push ke turant baad purana commit dikhta tha.
  // Isliye cache band + har GET pe naya number laga do.
  const url = method === 'GET'
    ? API + path + (path.includes('?') ? '&' : '?') + '_=' + Date.now()
    : API + path
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 401) { clearGitHubToken(); throw new Error('GH_UNAUTHORIZED') }
  if (res.status === 404) throw new Error('GH_NOT_FOUND')
  if (res.status === 403 || res.status === 429) {
    throw new Error(res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429 ? 'GH_RATE_LIMIT' : 'GH_FORBIDDEN')
  }
  if (res.status === 409) throw new Error('GH_CONFLICT')
  if (res.status === 422) {
    let msg = ''
    try { msg = JSON.stringify(await res.json()) } catch { /* ignore */ }
    throw new Error(/already exists/i.test(msg) ? 'GH_NAME_EXISTS' : 'GH_INVALID')
  }
  if (!res.ok) throw new Error('GH_ERROR_' + res.status)
  return res.status === 204 ? null : res.json()
}

export async function listRepos(token) {
  let all = []
  for (let page = 1; page <= 3; page++) {
    const part = await api(
      '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&page=' + page,
      token
    )
    all = all.concat(part)
    if (part.length < 100) break
  }
  return all.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner.login,
    private: r.private,
    description: r.description || '',
    updatedAt: r.pushed_at || r.updated_at,
  }))
}

// "owner/repo", "github.com/owner/repo", "https://github.com/owner/repo/tree/main" — sab chalega
export function parseRepo(input) {
  const clean = (input || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?github\.com\//i, '')
    .replace(/[?#].*$/, '')
  const [owner, repoRaw] = clean.split('/')
  const repo = (repoRaw || '').replace(/\.git$/i, '')
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null
  return { owner, repo }
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/')

// Branch ka latest commit: { sha, treeSha }
export async function getHead(token, owner, repo, branch) {
  const b = await api(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`, token)
  return { sha: b.commit.sha, treeSha: b.commit.commit.tree.sha }
}

// Stored commit (base) aur GitHub ke abhi ke commit (head) ka rishta:
// 'same' | 'ahead' (GitHub pe naye commits) | 'behind' (GitHub purana dikh raha, abhi sync ho raha) | 'diverged'
async function relation(token, owner, repo, baseSha, headSha) {
  if (!baseSha) return 'ahead'            // sync-point nahi hai => pehle Pull
  if (baseSha === headSha) return 'same'
  try {
    const c = await api(`/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`, token)
    if (c.status === 'identical') return 'same'
    if (c.status === 'ahead') return 'ahead'
    if (c.status === 'behind') return 'behind'
    return 'diverged'
  } catch {
    return 'ahead'
  }
}

// Commit/tree ki saari files: Map(path -> { sha, mode, size })
async function getTreeMap(token, owner, repo, sha) {
  const t = await api(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`, token)
  const map = new Map()
  for (const n of t.tree || []) {
    if (n.type === 'blob') map.set(n.path, { sha: n.sha, mode: n.mode, size: n.size || 0 })
  }
  return { map, truncated: !!t.truncated }
}

async function readBlobText(token, owner, repo, sha) {
  const res = await fetch(`${API}/repos/${owner}/${repo}/git/blobs/${sha}`, {
    headers: {
      Accept: 'application/vnd.github.raw+json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
  })
  if (!res.ok) return null
  const text = await res.text()
  return text.includes('\u0000') ? null : text
}

// Git ka blob SHA-1 (content ka fingerprint) — isse pata chalta hai file badli ya nahi
async function gitBlobSha(content) {
  const enc = new TextEncoder()
  const body = enc.encode(content)
  const head = enc.encode(`blob ${body.length}\0`)
  const buf = new Uint8Array(head.length + body.length)
  buf.set(head, 0)
  buf.set(body, head.length)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const pathOf = (f) => (f.folder ? f.folder + '/' : '') + f.name

// 8 kaam ek saath
async function pool(items, size, fn) {
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++]
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
}

// =====================================================================
// IMPORT — repo ki text/code files padho
// =====================================================================
export async function fetchRepoFiles({ owner, repo, token, onProgress }) {
  const info = await api(`/repos/${owner}/${repo}`, token)
  const branch = info.default_branch
  const head = await getHead(token, owner, repo, branch)
  const { map } = await getTreeMap(token, owner, repo, head.sha)

  const files = [...map.entries()]
    .filter(([path, n]) => isEligible(path, n.size))
    .slice(0, MAX_FILES)
    .map(([path, n]) => ({ path, sha: n.sha }))

  if (files.length === 0) throw new Error('NO_FILES')

  const entries = []
  let done = 0
  const isPrivate = !!info.private

  await pool(files, 8, async (f) => {
    try {
      let text = null
      if (!isPrivate) {
        try {
          const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${head.sha}/${encodePath(f.path)}`)
          if (r.ok) {
            const t = await r.text()
            text = t.includes('\u0000') ? null : t
          }
        } catch { /* blob API se try karenge */ }
      }
      if (text === null) text = await readBlobText(token, owner, repo, f.sha)
      // prefix lagao: importProject single top-folder hata deta hai, isse sirf yahi prefix hatega
      if (text !== null) entries.push({ path: repo + '/' + f.path, content: text })
    } catch { /* ek file fail ho to baaki chalein */ }
    done++
    onProgress?.(done, files.length)
  })

  if (entries.length === 0) throw new Error('NO_FILES')
  return {
    name: info.name,
    entries,
    github: { owner, repo, branch, headSha: head.sha },
  }
}

// =====================================================================
// NAYA REPO BANAO
// =====================================================================
export async function createRepo(token, { name, description = '', isPrivate = true }) {
  const r = await api('/user/repos', token, {
    method: 'POST',
    body: { name, description, private: isPrivate, auto_init: true },
  })
  const owner = r.owner.login
  const repo = r.name
  const branch = r.default_branch || 'main'
  // auto_init ke baad branch banne me thodi der lagti hai
  let head = null
  for (let i = 0; i < 6 && !head; i++) {
    try { head = await getHead(token, owner, repo, branch) } catch {
      await new Promise((res) => setTimeout(res, 900))
    }
  }
  if (!head) throw new Error('GH_ERROR_INIT')
  return { owner, repo, branch, headSha: head.sha, htmlUrl: r.html_url }
}

// Link existing repo: check karo ki repo mila aur push permission hai
export async function linkExistingRepo(token, owner, repo) {
  const info = await api(`/repos/${owner}/${repo}`, token)
  if (info.permissions && !info.permissions.push) throw new Error('GH_FORBIDDEN')
  const head = await getHead(token, owner, repo, info.default_branch)
  return { owner: info.owner.login, repo: info.name, branch: info.default_branch, headSha: head.sha }
}

// =====================================================================
// STATUS / PUSH
// =====================================================================
async function buildPlan({ token, github, files, skipDeletes = false }) {
  const { owner, repo, branch, headSha } = github
  const head = await getHead(token, owner, repo, branch)
  const { map, truncated } = await getTreeMap(token, owner, repo, head.sha)

  const localPaths = new Set()
  const changed = []
  for (const f of files) {
    const path = pathOf(f)
    localPaths.add(path)
    const content = f.content || ''
    const sha = await gitBlobSha(content)
    const remote = map.get(path)
    if (!remote || remote.sha !== sha) {
      changed.push({ path, content, mode: remote?.mode || '100644' })
    }
  }

  // Delete: sirf tab jab repo ki saari eligible files local me aa sakti thi (400 se kam)
  const deleted = []
  if (!skipDeletes && !truncated) {
    const eligibleRemote = [...map.entries()].filter(([p, n]) => isEligible(p, n.size))
    if (eligibleRemote.length <= MAX_FILES) {
      for (const [p] of eligibleRemote) if (!localPaths.has(p)) deleted.push(p)
    }
  }

  const rel = await relation(token, owner, repo, headSha, head.sha)
  return { head, rel, behind: rel === 'ahead' || rel === 'diverged', stale: rel === 'behind', changed, deleted }
}

export async function getStatus({ token, github, files }) {
  const plan = await buildPlan({ token, github, files })
  return { behind: plan.behind, stale: plan.stale, changed: plan.changed.length, deleted: plan.deleted.length }
}

export async function pushFiles({ token, github, files, message, skipDeletes = false, onProgress }) {
  const { owner, repo, branch } = github
  const plan = await buildPlan({ token, github, files, skipDeletes })
  if (plan.stale && !skipDeletes) throw new Error('GH_STALE')
  if (plan.behind && !skipDeletes) throw new Error('GH_BEHIND')
  if (plan.changed.length === 0 && plan.deleted.length === 0) throw new Error('NOTHING_TO_PUSH')

  const enc = new TextEncoder()
  const entries = []
  for (const c of plan.changed) {
    if (c.content === '') {
      // khaali file: blob alag se banao
      const b = await api(`/repos/${owner}/${repo}/git/blobs`, token, {
        method: 'POST', body: { content: '', encoding: 'utf-8' },
      })
      entries.push({ entry: { path: c.path, mode: c.mode, type: 'blob', sha: b.sha }, bytes: 0 })
    } else {
      entries.push({
        entry: { path: c.path, mode: c.mode, type: 'blob', content: c.content },
        bytes: enc.encode(c.content).length,
      })
    }
  }
  for (const p of plan.deleted) {
    entries.push({ entry: { path: p, mode: '100644', type: 'blob', sha: null }, bytes: 0 })
  }

  // Chhote chhote tukdon me tree banao (request bada na ho)
  const chunks = []
  let cur = []
  let bytes = 0
  for (const e of entries) {
    cur.push(e.entry)
    bytes += e.bytes
    if (bytes > 2500000 || cur.length >= 100) { chunks.push(cur); cur = []; bytes = 0 }
  }
  if (cur.length) chunks.push(cur)

  let baseTree = plan.head.treeSha
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length)
    const t = await api(`/repos/${owner}/${repo}/git/trees`, token, {
      method: 'POST', body: { base_tree: baseTree, tree: chunks[i] },
    })
    baseTree = t.sha
  }

  const commit = await api(`/repos/${owner}/${repo}/git/commits`, token, {
    method: 'POST',
    body: { message: message || 'Update from BharatCodex', tree: baseTree, parents: [plan.head.sha] },
  })
  await api(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: 'PATCH', body: { sha: commit.sha },
  })

  return { headSha: commit.sha, changed: plan.changed.length, deleted: plan.deleted.length }
}

// =====================================================================
// PULL — GitHub ke naye changes project me lao
// =====================================================================
export async function pullFromGitHub({ token, github, projectId, files, user, onProgress }) {
  const { owner, repo, branch, headSha } = github
  const head = await getHead(token, owner, repo, branch)
  const rel = await relation(token, owner, repo, headSha, head.sha)
  if (rel === 'same' || rel === 'behind') {
    // 'behind' = GitHub abhi purana commit dikha raha; purana code laakar apna naya code overwrite NAHI karenge
    return { upToDate: true, updated: 0, removed: 0, conflicts: 0, github }
  }

  const remote = (await getTreeMap(token, owner, repo, head.sha)).map
  let base = new Map()
  if (headSha) {
    try { base = (await getTreeMap(token, owner, repo, headSha)).map } catch { /* purana commit nahi mila: sab files naye maano */ }
  }

  const local = new Map(files.map((f) => [pathOf(f), f.content || '']))

  // Remote me jo badli/nayi hain
  const toDownload = [...remote.entries()]
    .filter(([p, n]) => isEligible(p, n.size) && base.get(p)?.sha !== n.sha)
    .slice(0, MAX_FILES)

  const writes = []
  let conflicts = 0
  let done = 0
  await pool(toDownload, 8, async ([path, n]) => {
    try {
      const text = await readBlobText(token, owner, repo, n.sha)
      if (text !== null) {
        if (local.has(path)) {
          const localSha = await gitBlobSha(local.get(path))
          if (localSha !== n.sha && localSha !== base.get(path)?.sha) conflicts++
        }
        writes.push({ path, content: text })
      }
    } catch { /* skip */ }
    done++
    onProgress?.(done, toDownload.length)
  })

  // Remote se hata di gayi files
  const deletes = []
  for (const [p, n] of base.entries()) {
    if (isEligible(p, n.size) && !remote.has(p) && local.has(p)) deletes.push(p)
  }

  const next = { owner, repo, branch, headSha: head.sha }
  await applyRemoteChanges(projectId, writes, deletes, next, user)
  return { upToDate: false, updated: writes.length, removed: deletes.length, conflicts, github: next }
}
