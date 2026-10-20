import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, arrayUnion, arrayRemove,
} from 'firebase/firestore'
import { db } from '../firebase/config'

const WEB_FILES = {
  'index.html': `<!-- BharatCodex Web Project -->\n<h1>Hello BharatCodex!</h1>\n<p>Code likho, side me preview dekho.</p>\n<button id="btn">Click me</button>\n`,
  'style.css': `body {\n  font-family: system-ui, sans-serif;\n  background: #0f172a;\n  color: #e2e8f0;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  min-height: 100vh;\n  margin: 0;\n}\nbutton {\n  padding: 10px 24px;\n  border: none;\n  border-radius: 8px;\n  background: #3b82f6;\n  color: white;\n  font-size: 15px;\n  cursor: pointer;\n}\n`,
  'script.js': `document.getElementById('btn').addEventListener('click', () => {\n  alert('BharatCodex me swagat hai!')\n})\n`,
}

const REACT_FILES = {
  'App.jsx': `// React 18 (UMD) — React global hai\nfunction App() {\n  const [count, setCount] = React.useState(0)\n  return (\n    <div className="app">\n      <h1>BharatCodex React</h1>\n      <p>You clicked {count} times</p>\n      <button onClick={() => setCount(count + 1)}>Click me</button>\n    </div>\n  )\n}\n`,
  'styles.css': `.app {\n  font-family: system-ui, sans-serif;\n  text-align: center;\n  padding-top: 80px;\n  background: #0f172a;\n  color: #e2e8f0;\n  min-height: 100vh;\n  margin: 0;\n}\nbutton {\n  padding: 10px 24px;\n  border: none;\n  border-radius: 8px;\n  background: #22c55e;\n  color: white;\n  cursor: pointer;\n}\n`,
}

// Firestore doc IDs me '/' allowed nahi, isliye encode karte hain
const fileId = (file) => encodeURIComponent((file.folder ? file.folder + '/' : '') + file.name)
const pathOf = (file) => (file.folder ? file.folder + '/' : '') + file.name

export async function createProject(user, name, type) {
  const ref = await addDoc(collection(db, 'projects'), {
    name, type,
    ownerId: user.uid,
    ownerName: user.displayName || user.email || 'User',
    public: false,
    folders: [],
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

export async function saveFile(projectId, file, content) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'projects', projectId, 'files', fileId(file)), {
    name: file.name, folder: file.folder || '', content, updatedAt: Date.now(),
  })
  batch.update(doc(db, 'projects', projectId), { updatedAt: Date.now() })
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

export async function deleteProject(projectId) {
  const filesSnap = await getDocs(collection(db, 'projects', projectId, 'files'))
  const likesSnap = await getDocs(collection(db, 'projects', projectId, 'likes'))
  const batch = writeBatch(db)
  filesSnap.forEach((d) => batch.delete(d.ref))
  likesSnap.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(db, 'projects', projectId))
  await batch.commit()
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
