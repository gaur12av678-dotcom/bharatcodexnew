import { collection, doc, getDocs, addDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase/config'

// Default starter templates — naye project me yeh files automatically banti hain
const WEB_FILES = {
  'index.html': `<!-- BharatCodex Web Project -->
<h1>Hello BharatCodex!</h1>
<p>Code likho, side me preview dekho.</p>
<button id="btn">Click me</button>
`,
  'style.css': `body {
  font-family: system-ui, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  margin: 0;
}

button {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  background: #3b82f6;
  color: white;
  font-size: 15px;
  cursor: pointer;
}

button:hover {
  background: #2563eb;
}
`,
  'script.js': `document.getElementById('btn').addEventListener('click', () => {
  alert('BharatCodex me swagat hai!')
})
`,
}

const REACT_FILES = {
  'App.jsx': `// React 18 (UMD) — import ki zaroorat nahi, React global hai
function App() {
  const [count, setCount] = React.useState(0)

  return (
    <div className="app">
      <h1>BharatCodex React</h1>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>Click me</button>
    </div>
  )
}
`,
  'styles.css': `.app {
  font-family: system-ui, sans-serif;
  text-align: center;
  padding-top: 80px;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
  margin: 0;
}

button {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  background: #22c55e;
  color: white;
  font-size: 15px;
  cursor: pointer;
}
`,
}

const FILE_ORDER = ['index.html', 'style.css', 'script.js', 'App.jsx', 'styles.css']

export async function createProject(user, name, type) {
  const ref = await addDoc(collection(db, 'projects'), {
    name,
    type, // 'web' | 'react'
    ownerId: user.uid,
    ownerName: user.displayName || user.email || 'User',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  const templates = type === 'react' ? REACT_FILES : WEB_FILES
  const batch = writeBatch(db)
  for (const [fname, content] of Object.entries(templates)) {
    batch.set(doc(db, 'projects', ref.id, 'files', fname), {
      name: fname,
      content,
      updatedAt: Date.now(),
    })
  }
  await batch.commit()
  return ref.id
}

export async function getProjectFiles(projectId) {
  const snap = await getDocs(collection(db, 'projects', projectId, 'files'))
  const files = snap.docs.map((d) => ({ name: d.data().name, content: d.data().content }))
  files.sort((a, b) => {
    const ia = FILE_ORDER.indexOf(a.name)
    const ib = FILE_ORDER.indexOf(b.name)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  return files
}

export async function saveFile(projectId, fileName, content) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'projects', projectId, 'files', fileName), {
    name: fileName,
    content,
    updatedAt: Date.now(),
  })
  batch.update(doc(db, 'projects', projectId), { updatedAt: Date.now() })
  await batch.commit()
}

export async function deleteProject(projectId) {
  const filesSnap = await getDocs(collection(db, 'projects', projectId, 'files'))
  const batch = writeBatch(db)
  filesSnap.forEach((d) => batch.delete(d.ref))
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
