import { GithubAuthProvider, linkWithPopup, reauthenticateWithPopup } from 'firebase/auth'
import { auth } from '../firebase/config'

const API = 'https://api.github.com'
const TOKEN_KEY = 'bc_gh_token'

const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|\.cache|coverage)(\/|$)/i
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|woff2?|ttf|otf|eot|mp3|mp4|webm|mov|pdf|zip|rar|7z|exe|dll|so|bin|lock)$/i
const LOCKFILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i
const MAX_FILE = 900000
const MAX_FILES = 400

// ---------- token (sirf is browser tab ke session me, Firestore me save nahi hota) ----------
export const getGitHubToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}
const saveToken = (t) => { try { sessionStorage.setItem(TOKEN_KEY, t) } catch { /* ignore */ } }
export const clearGitHubToken = () => { try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } }

// ---------- GitHub connect ----------
// Google se sign-in wale user ke account me GitHub "link" hota hai (naya account nahi banta).
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
  saveToken(token)
  return token
}

// ---------- GitHub API ----------
async function gh(path, token) {
  const res = await fetch(API + path, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
  })
  if (res.status === 401) { clearGitHubToken(); throw new Error('GH_UNAUTHORIZED') }
  if (res.status === 404) throw new Error('GH_NOT_FOUND')
  if (res.status === 403 || res.status === 429) throw new Error('GH_RATE_LIMIT')
  if (!res.ok) throw new Error('GH_ERROR_' + res.status)
  return res.json()
}

export async function listRepos(token) {
  let all = []
  for (let page = 1; page <= 3; page++) {
    const part = await gh(
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

// Repo ki saari text/code files padho. Return: { name, entries: [{path, content}] }
export async function fetchRepoFiles({ owner, repo, token, onProgress }) {
  const info = await gh(`/repos/${owner}/${repo}`, token)
  const branch = info.default_branch
  const tree = await gh(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token)

  const files = (tree.tree || [])
    .filter((n) => n.type === 'blob'
      && !SKIP.test(n.path) && !BINARY.test(n.path) && !LOCKFILES.test(n.path)
      && (n.size || 0) <= MAX_FILE)
    .slice(0, MAX_FILES)

  if (files.length === 0) throw new Error('NO_FILES')

  const entries = []
  let done = 0
  const isPrivate = !!info.private

  const readOne = async (f) => {
    let res
    if (!isPrivate) {
      // public repo: raw.githubusercontent (API rate limit use nahi hota)
      try {
        res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodePath(f.path)}`)
      } catch { res = null }
    }
    if (!res || !res.ok) {
      res = await fetch(`${API}/repos/${owner}/${repo}/git/blobs/${f.sha}`, {
        headers: {
          Accept: 'application/vnd.github.raw+json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      })
    }
    if (!res.ok) return
    const text = await res.text()
    if (text.includes('\u0000')) return // binary nikli
    // prefix lagao: importProject single top-folder hata deta hai, isse sirf yahi prefix hatega
    entries.push({ path: repo + '/' + f.path, content: text })
  }

  // 8 files ek saath
  let idx = 0
  const worker = async () => {
    while (idx < files.length) {
      const f = files[idx++]
      try { await readOne(f) } catch { /* ek file fail ho to baaki chalein */ }
      done++
      onProgress?.(done, files.length)
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))

  if (entries.length === 0) throw new Error('NO_FILES')
  return { name: info.name, entries }
}
