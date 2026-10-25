import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, arrayUnion, arrayRemove, deleteField,
  query, orderBy, limit,
} from 'firebase/firestore'
import { db } from '../firebase/config'

const WEB_FILES = {
  'index.html': `<!-- BharatCodex Web Project -->\n<h1>Hello BharatCodex!</h1>\n<p>Code likho, side me preview dekho.</p>\n<button id="btn">Click me</button>\n`,
  'style.css': `body {\n  font-family: system-ui, sans-serif;\n  background: #0f172a;\n  color: #e2e8f0;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  min-height: 100vh;\n  margin: 0;\n}\nbutton {\n  padding: 10px 24px;\n  border: none;\n  border-radius: 8px;\n  background: #3b82f6;\n  color: white;\n  font-size: 15px;\n  cursor: pointer;\n}\n`,
  'script.js': `document.getElementById('btn').addEventListener('click', () => {\n  alert('BharatCodex me swagat hai!')\n})\n`,
}

const REACT_FILES = {
  'package.json': `{
  "name": "bharatcodex-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.0"
  }
}
`,
  'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BharatCodex App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
  'src/main.jsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
`,
  'src/App.jsx': `import Navbar from './components/Navbar.jsx'

export default function App() {
  return (
    <div>
      <Navbar />
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Hello BharatCodex! 🚀</h1>
        <p>src/components me naye components banao, sab yahan live dikhenge.</p>
      </main>
    </div>
  )
}
`,
  'src/components/Navbar.jsx': `export default function Navbar() {
  return (
    <nav style={{
      display: 'flex', gap: '1rem', padding: '1rem 2rem',
      background: '#1e293b', color: '#e2e8f0', alignItems: 'center'
    }}>
      <strong>⚡ BharatCodex</strong>
      <a href="#" style={{ color: '#93c5fd' }}>Home</a>
      <a href="#" style={{ color: '#93c5fd' }}>About</a>
    </nav>
  )
}
`,
  'src/index.css': `* { margin: 0; box-sizing: border-box; }
body {
  font-family: system-ui, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
}
`,
}
// Firestore doc IDs me '/' allowed nahi, isliye encode karte hain
const fileId = (file) => encodeURIComponent((file.folder ? file.folder + '/' : '') + file.name)
const pathOf = (file) => (file.folder ? file.folder + '/' : '') + file.name

export async function createProject(user, name, type, isAdmin = false) {
  const ref = await addDoc(collection(db, 'projects'), {
    name, type,
    ownerId: user.uid,
    ownerName: user.displayName || user.email || 'User',
    createdBy: user.displayName || user.email || 'User',
    ownerIsAdmin: !!isAdmin, // true => Team role wale members ko ye project dikhega
    public: false,
    trashed: false,
    folders: type === 'react' ? ['src', 'src/components'] : [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  const templates = type === 'react' ? REACT_FILES : WEB_FILES
  const batch = writeBatch(db)
  for (const [fpath, content] of Object.entries(templates)) {
    const cut = fpath.lastIndexOf('/')
    const folder = cut === -1 ? '' : fpath.slice(0, cut)
    const fname = cut === -1 ? fpath : fpath.slice(cut + 1)
    batch.set(doc(db, 'projects', ref.id, 'files', encodeURIComponent(fpath)), {
      name: fname, folder, content, updatedAt: Date.now(),
    })
  }
  await batch.commit()
  return ref.id
}

// ZIP / files se naya project banao (Import feature)
const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|\.cache)(\/|$)/i
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|svg|woff2?|ttf|otf|eot|mp3|mp4|webm|mov|pdf|zip|rar|7z|exe|dll|so|bin|lock)$/i
const MAX_FILE = 900000 // Firestore doc limit ~1MB

export async function importProject(user, name, entries, isAdmin = false) {
  // entries: [{ path, content }]
  let list = entries.filter((e) => e.path && !SKIP.test(e.path) && !BINARY.test(e.path) && typeof e.content === 'string' && e.content.length <= MAX_FILE)
  if (list.length === 0) throw new Error('NO_FILES')
  // zip ke andar ek hi top folder ho (jaise repo-main/) to usse hata do
  const tops = new Set(list.map((e) => e.path.split('/')[0]))
  if (tops.size === 1 && list.every((e) => e.path.includes('/'))) {
    list = list.map((e) => ({ ...e, path: e.path.split('/').slice(1).join('/') }))
  }
  if (list.length > 400) list = list.slice(0, 400)
  const isReact = list.some((e) => /\.jsx$/i.test(e.path)) ||
    list.some((e) => e.path === 'package.json' && /"react"/.test(e.content))
  const folderSet = new Set()
  for (const e of list) {
    const parts = e.path.split('/').slice(0, -1)
    let cur = ''
    for (const part of parts) { cur = cur ? cur + '/' + part : part; folderSet.add(cur) }
  }
  const who = user.displayName || user.email || 'User'
  const ref = await addDoc(collection(db, 'projects'), {
    name, type: isReact ? 'react' : 'web',
    ownerId: user.uid, ownerName: who, createdBy: who,
    ownerIsAdmin: !!isAdmin,
    public: false, trashed: false,
    folders: [...folderSet].sort(),
    createdAt: Date.now(), updatedAt: Date.now(),
  })
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db)
    for (const e of list.slice(i, i + 400)) {
      const cut = e.path.lastIndexOf('/')
      batch.set(doc(db, 'projects', ref.id, 'files', encodeURIComponent(e.path)), {
        name: cut === -1 ? e.path : e.path.slice(cut + 1),
        folder: cut === -1 ? '' : e.path.slice(0, cut),
        content: e.content, updatedAt: Date.now(),
      })
    }
    await batch.commit()
  }
  return ref.id
}

export async function getProjectFiles(projectId) {
  const snap = await getDocs(collection(db, 'projects', projectId, 'files'))
  const files = snap.docs.map((d) => ({
    name: d.data().name,
    folder: d.data().folder || '',
    content: d.data().content,
  }))
  files.sort((a, b) => pathOf(a).localeCompare(pathOf(b)))
  return files
}

export async function saveFile(projectId, file, content, editorName) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'projects', projectId, 'files', fileId(file)), {
    name: file.name, folder: file.folder || '', content, updatedAt: Date.now(),
  })
  batch.update(doc(db, 'projects', projectId), {
    updatedAt: Date.now(),
    ...(editorName ? { lastEditedBy: editorName } : {}),
  })
  await batch.commit()
}

export async function createFile(projectId, name, folder = '') {
  const templates = {
    html: '<!-- New file -->\n', css: '/* New file */\n', js: '// New file\n',
    jsx: '// New file\n', json: '{}\n', md: '# New file\n',
  }
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const content = templates[ext] ?? ''
  await saveFile(projectId, { name, folder }, content)
}

export async function renameFile(projectId, file, newName) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'projects', projectId, 'files', fileId({ ...file, name: newName })), {
    name: newName, folder: file.folder || '', content: file.content, updatedAt: Date.now(),
  })
  batch.delete(doc(db, 'projects', projectId, 'files', fileId(file)))
  batch.update(doc(db, 'projects', projectId), { updatedAt: Date.now() })
  await batch.commit()
}

export async function deleteFile(projectId, file) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'projects', projectId, 'files', fileId(file)))
  batch.update(doc(db, 'projects', projectId), { updatedAt: Date.now() })
  await batch.commit()
}

export async function createFolder(projectId, path) {
  await updateDoc(doc(db, 'projects', projectId), { folders: arrayUnion(path), updatedAt: Date.now() })
}

export async function renameFolder(projectId, oldPath, newPath) {
  const snap = await getDocs(collection(db, 'projects', projectId, 'files'))
  const batch = writeBatch(db)
  snap.docs.forEach((d) => {
    const f = d.data()
    const folder = f.folder || ''
    if (folder === oldPath) {
      batch.update(d.ref, { folder: newPath, updatedAt: Date.now() })
    } else if (folder.startsWith(oldPath + '/')) {
      batch.update(d.ref, { folder: newPath + folder.slice(oldPath.length), updatedAt: Date.now() })
    }
  })
  const projRef = doc(db, 'projects', projectId)
  batch.update(projRef, { updatedAt: Date.now() })
  await batch.commit()
  // folders array update
  const p = await getDoc(projRef)
  const folders = p.data()?.folders || []
  const removed = folders.filter((f) => f === oldPath || f.startsWith(oldPath + '/'))
  const added = removed.map((f) => newPath + f.slice(oldPath.length))
  await updateDoc(projRef, {
    folders: folders.filter((f) => !removed.includes(f)).concat(added),
  })
}

export async function deleteFolder(projectId, path) {
  const snap = await getDocs(collection(db, 'projects', projectId, 'files'))
  const batch = writeBatch(db)
  snap.docs.forEach((d) => {
    const folder = d.data().folder || ''
    if (folder === path || folder.startsWith(path + '/')) batch.delete(d.ref)
  })
  const projRef = doc(db, 'projects', projectId)
  batch.update(projRef, { updatedAt: Date.now() })
  await batch.commit()
  const p = await getDoc(projRef)
  const folders = (p.data()?.folders || []).filter((f) => f !== path && !f.startsWith(path + '/'))
  await updateDoc(projRef, { folders })
}

// Permanent delete (Admin panel) — files subcollection pehle, phir project doc
export async function deleteProject(projectId) {
  // files + version history dono saaf karo, phir project doc
  const refs = []
  for (const sub of ['files', 'versions', 'versionFiles']) {
    const snap = await getDocs(collection(db, 'projects', projectId, sub))
    snap.docs.forEach((d) => refs.push(d.ref))
  }
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db)
    refs.slice(i, i + 400).forEach((r) => batch.delete(r))
    await batch.commit()
  }
  await deleteDoc(doc(db, 'projects', projectId))
}

// =====================================================================
// PIN — har user apne pinned projects alag rakhta hai (userPins/{uid})
// =====================================================================
export async function pinProject(uid, projectId) {
  await setDoc(doc(db, 'userPins', uid), { ids: arrayUnion(projectId) }, { merge: true })
}

export async function unpinProject(uid, projectId) {
  await setDoc(doc(db, 'userPins', uid), { ids: arrayRemove(projectId) }, { merge: true })
}

// Admin ke purane projects ko "Team role ko dikhao" mark karo (ek baar, automatic)
export async function markAdminProjects(projectIds) {
  for (let i = 0; i < projectIds.length; i += 400) {
    const batch = writeBatch(db)
    projectIds.slice(i, i + 400).forEach((pid) => batch.update(doc(db, 'projects', pid), { ownerIsAdmin: true }))
    await batch.commit()
  }
}


// =====================================================================
// VERSION HISTORY — project ka purana version wapis laane ke liye
//   projects/{id}/versions/{vid}      -> chhota info (naam, time, kisne)
//   projects/{id}/versionFiles/{vid}  -> files ka poora snapshot
// =====================================================================
const MAX_SNAPSHOT_BYTES = 900000 // Firestore doc limit ~1MB
const MAX_AUTO_VERSIONS = 15

const byteSize = (str) => new TextEncoder().encode(str).length
const cleanFiles = (files) => files.map((f) => ({ name: f.name, folder: f.folder || '', content: f.content || '' }))

export async function createVersion(projectId, user, files, folders, label = '', auto = false) {
  const data = cleanFiles(files)
  if (byteSize(JSON.stringify(data)) > MAX_SNAPSHOT_BYTES) throw new Error('VERSION_TOO_BIG')
  const vref = doc(collection(db, 'projects', projectId, 'versions'))
  const batch = writeBatch(db)
  batch.set(vref, {
    label: label || '',
    auto,
    createdAt: Date.now(),
    createdBy: user?.displayName || user?.email || 'User',
    fileCount: data.length,
  })
  batch.set(doc(db, 'projects', projectId, 'versionFiles', vref.id), {
    files: data,
    folders: folders || [],
  })
  await batch.commit()
  if (auto) await pruneAutoVersions(projectId).catch((e) => console.error('Prune failed:', e))
  return vref.id
}

export async function listVersions(projectId) {
  const q = query(collection(db, 'projects', projectId, 'versions'), orderBy('createdAt', 'desc'), limit(60))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function deleteVersion(projectId, versionId) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'projects', projectId, 'versions', versionId))
  batch.delete(doc(db, 'projects', projectId, 'versionFiles', versionId))
  await batch.commit()
}

// Auto versions 15 se zyada ho jaayein to sabse purane hata do (manual versions safe rehte hain)
async function pruneAutoVersions(projectId) {
  const all = await listVersions(projectId)
  const autos = all.filter((v) => v.auto)
  for (const v of autos.slice(MAX_AUTO_VERSIONS)) await deleteVersion(projectId, v.id)
}

// Version wapis lao: pehle abhi ka backup, phir files replace
export async function restoreVersion(projectId, versionId, user) {
  const snap = await getDoc(doc(db, 'projects', projectId, 'versionFiles', versionId))
  if (!snap.exists()) throw new Error('VERSION_NOT_FOUND')
  const target = snap.data()

  const currentFiles = await getProjectFiles(projectId)
  const projSnap = await getDoc(doc(db, 'projects', projectId))
  const currentFolders = projSnap.data()?.folders || []
  if (currentFiles.length > 0) {
    await createVersion(projectId, user, currentFiles, currentFolders, 'Restore se pehle ka backup', true)
  }

  // purani files hata do, version ki files likh do (400-400 ke batch me)
  const ops = []
  const existing = await getDocs(collection(db, 'projects', projectId, 'files'))
  existing.docs.forEach((d) => ops.push({ type: 'delete', ref: d.ref }))
  for (const f of target.files || []) {
    const path = (f.folder ? f.folder + '/' : '') + f.name
    ops.push({
      type: 'set',
      ref: doc(db, 'projects', projectId, 'files', encodeURIComponent(path)),
      data: { name: f.name, folder: f.folder || '', content: f.content || '', updatedAt: Date.now() },
    })
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + 400)) {
      if (op.type === 'delete') batch.delete(op.ref)
      else batch.set(op.ref, op.data)
    }
    await batch.commit()
  }
  await updateDoc(doc(db, 'projects', projectId), {
    folders: target.folders || [],
    updatedAt: Date.now(),
    lastEditedBy: user?.displayName || user?.email || 'User',
  })
  return { files: await getProjectFiles(projectId), folders: target.folders || [] }
}

// Project trash mein jaata hai — permanent delete NAHI hota
export async function trashProject(projectId, user) {
  await updateDoc(doc(db, 'projects', projectId), {
    trashed: true,
    trashedAt: Date.now(),
    trashedBy: user?.displayName || user?.email || 'User',
  })
}

// Trash se wapas laao
export async function restoreProject(projectId) {
  await updateDoc(doc(db, 'projects', projectId), {
    trashed: false,
    trashedAt: deleteField(),
    trashedBy: deleteField(),
  })
}

export const timeAgo = (ts) => {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'abhi abhi'
  if (m < 60) return `${m} min pehle`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr pehle`
  return `${Math.floor(h / 24)} din pehle`
}
