import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { getProjectFiles, saveFile } from '../services/projectService'
import Preview from '../components/Preview'
import { ArrowLeft, Check, FileCode2, Loader2, AlertCircle, CircleDashed } from 'lucide-react'

const LANG = {
  'index.html': 'html',
  'style.css': 'css',
  'script.js': 'javascript',
  'App.jsx': 'javascript',
  'styles.css': 'css',
}

export default function EditorPage() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const [project, setProject] = useState(null)
  const [fileList, setFileList] = useState([])
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [saveState, setSaveState] = useState('saved') // saved | saving | error

  const timerRef = useRef(null)
  const pendingRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', id))
        if (!snap.exists()) {
          setDenied(true)
          return
        }
        const data = { id: snap.id, ...snap.data() }
        // Sirf owner ya admin khol sakta hai
        if (!isAdmin && data.ownerId !== user.uid) {
          setDenied(true)
          return
        }
        const files = await getProjectFiles(id)
        if (cancelled) return
        setProject(data)
        setFileList(files)
        setActive(files[0]?.name || null)
      } catch (e) {
        console.error(e)
        setDenied(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const flushSave = async () => {
    clearTimeout(timerRef.current)
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    try {
      await saveFile(id, p.fileName, p.content)
      setSaveState('saved')
    } catch (e) {
      console.error(e)
      setSaveState('error')
      pendingRef.current = p
    }
  }

  const scheduleSave = (fileName, content) => {
    pendingRef.current = { fileName, content }
    setSaveState('saving')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flushSave, 1200) // 1.2 sec debounce autosave
  }

  const onChange = (value) => {
    const v = value ?? ''
    setFileList((prev) => prev.map((f) => (f.name === active ? { ...f, content: v } : f)))
    scheduleSave(active, v)
  }

  const switchFile = async (name) => {
    if (name === active) return
    await flushSave() // tab switch se pehle pending save complete karo
    setActive(name)
  }

  const filesObj = useMemo(
    () => Object.fromEntries(fileList.map((f) => [f.name, f.content])),
    [fileList]
  )

  const activeFile = fileList.find((f) => f.name === active)

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    )
  }

  if (denied || !project) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-white font-medium">Project nahi mila ya access nahi hai.</p>
        <Link to="/" className="text-blue-400 hover:underline text-sm">
          Dashboard pe wapas jao
        </Link>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Top bar */}
      <div className="h-11 shrink-0 flex items-center gap-3 px-3 bg-slate-900 border-b border-slate-800">
        <Link
          to="/"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <ArrowLeft size={17} />
        </Link>
        <h2 className="text-white font-semibold truncate">{project.name}</h2>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
            project.type === 'react'
              ? 'text-cyan-300 bg-cyan-500/10'
              : 'text-emerald-300 bg-emerald-500/10'
          }`}
        >
          {project.type}
        </span>
        <div className="flex-1" />
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          {saveState === 'saving' && (
            <>
              <CircleDashed size={13} className="animate-spin text-yellow-400" /> Saving...
            </>
          )}
          {saveState === 'saved' && (
            <>
              <Check size={13} className="text-emerald-400" /> Saved
            </>
          )}
          {saveState === 'error' && (
            <span className="text-red-400 flex items-center gap-1">
              <AlertCircle size={13} /> Save failed
            </span>
          )}
        </span>
      </div>

      {/* File tabs */}
      <div className="flex gap-1 px-3 pt-2 bg-slate-950 shrink-0">
        {fileList.map((f) => (
          <button
            key={f.name}
            onClick={() => switchFile(f.name)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition ${
              active === f.name
                ? 'bg-slate-800 text-white border border-b-0 border-slate-700'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <FileCode2 size={13} />
            {f.name}
          </button>
        ))}
      </div>

      {/* Editor + Preview — mobile pe vertical stack, desktop pe side by side */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="h-1/2 lg:h-auto lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 min-h-0">
          <Editor
            path={active}
            language={LANG[active] || 'plaintext'}
            theme="vs-dark"
            value={activeFile?.content || ''}
            onChange={onChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
              padding: { top: 12 },
            }}
          />
        </div>
        <div className="h-1/2 lg:h-auto lg:w-1/2 min-h-0">
          <Preview type={project.type} files={filesObj} />
        </div>
      </div>
    </div>
  )
}
