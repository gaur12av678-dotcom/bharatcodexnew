import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, arrayUnion, arrayRemove, deleteField,
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

export async function createProject(user, name, type) {
  const ref = await addDoc(collection(db, 'projects'), {
    name, type,
    ownerId: user.uid,
    ownerName: user.displayName || user.email || 'User',
    createdBy: user.displayName || user.email || 'User',
    public: false,
    trashed: false,
    folders: type === 'react' ? ['src', 'src/components'] : [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  const templates = type === 'react' ? REACT_FILES : WEB_FILES
  const batch = writeBatch(db)
  for (const [fname, content] of Object.entries(templates)) {
    batch.set(doc(db, 'projects', ref.id, 'files', encodeURIComponent(fname)), {
      name: fname, folder: '', content, updatedAt: Date.now(),
    })
  }
  await batch.commit()
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
  const projSnap = await getDocs(collection(db, 'projects')) // folders array ke liye direct doc
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
  const { getDoc } = await import('firebase/firestore')
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
  const { getDoc } = await import('firebase/firestore')
  const p = await getDoc(projRef)
  const folders = (p.data()?.folders || []).filter((f) => f !== path && !f.startsWith(path + '/'))
  await updateDoc(projRef, { folders })
}

// Permanent delete (Admin panel) — files subcollection pehle, phir project doc
export async function deleteProject(projectId) {
  const snap = await getDocs(collection(db, 'projects', projectId, 'files'))
  const batch = writeBatch(db)
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  await deleteDoc(doc(db, 'projects', projectId))
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
