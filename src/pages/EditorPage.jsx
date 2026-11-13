import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  getProjectFiles, saveFile, createFile, deleteFile, renameFile,
  createFolder, deleteFolder, renameFolder, createVersion, restoreVersion, logEdit,
} from '../services/projectService'
import Preview from '../components/Preview'
import FileExplorer from '../components/FileExplorer'
import VersionHistory from '../components/VersionHistory'
import GitHubPanel from '../components/GitHubPanel'
import SearchPanel from '../components/SearchPanel'
import PasteBox from '../components/PasteBox'
import WebContainerRuntime from '../components/WebContainerRuntime'
import JSZip from 'jszip'
import {
  ArrowLeft, Check, FileCode2, Loader2, AlertCircle, CircleDashed,
  Wand2, WrapText, Minus, Plus, Download, PanelLeft, Globe, Lock, Eye, Share2, History, Search, Undo2, Files, Github, ClipboardPaste, ClipboardCheck, Copy, Terminal,
} from 'lucide-react'

const EXT_LANG = {
  html: 'html', htm: 'html', css: 'css', js: 'javascript', jsx: 'javascript',
  mjs: 'javascript', json: 'json', md: 'markdown', ts: 'typescript',
  py: 'python', xml: 'xml', svg: 'xml', yml: 'yaml', yaml: 'yaml',
}
const langOf = (name) => EXT_LANG[name.split('.').pop()?.toLowerCase()] || 'plaintext'

const MOBILE_QUERY = '(max-width: 767px)'
const pathOf = (f) => (f.folder ? f.folder + '/' + f.name : f.name)

export default function EditorPage() {
  const { id } = useParams()
  const { user, isAdmin, isTeam } = useAuth()
  const { theme } = useTheme()

  const [project, setProject] = useState(null)
  const [fileList, setFileList] = useState([])
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [saveState, setSaveState] = useState('saved')
  const [fontSize, setFontSize] = useState(14)
  const [wordWrap, setWordWrap] = useState(true)
  const [minimap, setMinimap] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)
  const [showExplorer, setShowExplorer] = useState(() => typeof window === 'undefined' || !window.matchMedia(MOBILE_QUERY).matches)
  const [mobilePreview, setMobilePreview] = useState(false) // mobile par preview alag full-screen page
  const [pasteMode, setPasteMode] = useState(null)          // null | 'insert' | 'replace'
  const [copied, setCopied] = useState(false)
  const [fileCopied, setFileCopied] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showGithub, setShowGithub] = useState(false)
  const [showRuntime, setShowRuntime] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [sideTab, setSideTab] = useState('files') // 'files' ya 'search'
  const [undoStack, setUndoStack] = useState([])   // [{ id, label }] — destructive kaam se pehle ke backups
  const [undoBusy, setUndoBusy] = useState(false)
  const [view, setView] = useState('split') // 'code' | 'split' | 'preview'

  const timerRef = useRef(null)
  const pendingRef = useRef(null)
  const editorRef = useRef(null)
  const snapDoneRef = useRef(false) // is session ka auto-backup ban chuka hai?
  const fileListRef = useRef([])
  const projectRef = useRef(null)
  const revealRef = useRef(null)    // search result se file khulne ke baad kis line par jaana hai

  fileListRef.current = fileList
  projectRef.current = project

  // Screen size badalne par mobile/desktop layout badlo
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const on = () => setIsMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // Mobile preview page: phone ka Back button isse band kare, poori app se bahar na jaye
  useEffect(() => {
    if (!mobilePreview) return
    window.history.pushState({ ...(window.history.state || {}), bcPreview: 1 }, '')
    const onPop = () => setMobilePreview(false)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [mobilePreview])
  useEffect(() => { if (!isMobile) setMobilePreview(false) }, [isMobile])

  const closeMobilePreview = () => {
    if (window.history.state?.bcPreview) window.history.back()
    else setMobilePreview(false)
  }

  useEffect(() => {
    let cancelled = false
    snapDoneRef.current = false
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', id))
        if (!snap.exists()) { if (!cancelled) setDenied(true); return }
        const data = { id: snap.id, ...snap.data() }
        if (data.trashed) { if (!cancelled) setDenied(true); return }  // trashed project edit nahi hoga
        if (cancelled) return
        const files = await getProjectFiles(id)
        if (cancelled) return
        setProject(data)
        setFileList(files)
        // Edit: admin, project ka owner, ya Team role (admin ke projects par). Baaki sirf dekh sakte hain.
        const canEdit = isAdmin || (!!user && data.ownerId === user.uid) || (isTeam && data.ownerIsAdmin === true)
        setReadOnly(!canEdit)
        setActive(files[0] ? (files[0].folder ? files[0].folder + '/' + files[0].name : files[0].name) : null)
      } catch (error) {
        console.error('Project load failed:', error)
        if (!cancelled) setDenied(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timerRef.current) }
  }, [id, isAdmin, isTeam, user])

  // Public/Private badalna sirf owner ya admin kar sakta hai
  const canManage = !!project && (isAdmin || (!!user && project.ownerId === user.uid))

  const flushSave = async () => {
    clearTimeout(timerRef.current)
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    try {
      await saveFile(id, pending.file, pending.content, user?.displayName || user?.email)
      if (!pendingRef.current) setSaveState('saved')
      // Har edit ke baad history: "file-naam · time" (fail ho to bhi save safe rehta hai)
      const key = pathOf(pending.file)
      const snapshot = fileListRef.current.map((f) => (pathOf(f) === key ? { ...f, content: pending.content } : f))
      logEdit(id, user, snapshot, projectRef.current?.folders || [], pending.file)
    } catch (error) {
      console.error('File save failed:', error)
      pendingRef.current = pending
      setSaveState('error')
    }
  }

  const scheduleSave = (file, content) => {
    if (readOnly) return
    pendingRef.current = { file, content }
    setSaveState('saving')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flushSave, 1200)
  }

  // Ctrl/Cmd + S → turant save
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        flushSave()
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setShowExplorer(true)
        setSideTab('search')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // Is session me pehli badlaav se PEHLE ka code auto-backup ho jaata hai (version history me dikhega)
  const ensureSnapshot = (files) => {
    if (snapDoneRef.current || readOnly || !project || !files || files.length === 0) return
    snapDoneRef.current = true
    createVersion(id, user, files, project.folders || [], 'Auto: edit se pehle ka code', true)
      .catch((e) => console.error('Auto backup failed:', e))
  }

  // Badi tabdili (delete / rename / auto-fix) se PEHLE backup lo, taaki "Undo" se wapis aa sako
  const snapshotForUndo = async (label) => {
    if (readOnly || !project) return
    try {
      const vid = await createVersion(id, user, fileList, project.folders || [], 'Auto: ' + label + ' se pehle', true)
      setUndoStack((prev) => [...prev.slice(-9), { id: vid, label }])
    } catch (e) {
      console.error('Undo backup failed:', e)
    }
  }

  const undoLast = async () => {
    const last = undoStack[undoStack.length - 1]
    if (!last || undoBusy) return
    setUndoBusy(true)
    try {
      await flushSave()
      const res = await restoreVersion(id, last.id, user)
      setUndoStack((prev) => prev.slice(0, -1))
      handleRestored(res)
    } catch (e) {
      console.error('Undo failed:', e)
      alert(e?.message === 'VERSION_NOT_FOUND' ? 'Ye backup ab nahi mila. History se purana version chuno.' : 'Undo nahi hua. History se try karo.')
      setUndoStack((prev) => prev.slice(0, -1))
    } finally {
      setUndoBusy(false)
    }
  }

  // Preview ke "Fix" buttons yahan se file badalte hain. Pehle backup, phir save, phir preview khud dobara chalta hai.
  const applyEdits = async ({ edits = [], creates = [] }, label = 'Fix') => {
    if (readOnly) return
    await flushSave()
    await snapshotForUndo(label)
    for (const c of creates) {
      const cut = c.path.lastIndexOf('/')
      const folder = cut === -1 ? '' : c.path.slice(0, cut)
      const name = cut === -1 ? c.path : c.path.slice(cut + 1)
      if (folder) {
        const parts = folder.split('/')
        for (let i = 1; i <= parts.length; i++) {
          const sub = parts.slice(0, i).join('/')
          if (!(project.folders || []).includes(sub)) await createFolder(id, sub)
        }
      }
      await saveFile(id, { name, folder }, c.content, user?.displayName || user?.email)
    }
    for (const e of edits) {
      const file = fileList.find((f) => pathOf(f) === e.path)
      if (!file) continue
      await saveFile(id, file, e.content, user?.displayName || user?.email)
    }
    const [files, snap] = await Promise.all([getProjectFiles(id), getDoc(doc(db, 'projects', id))])
    setFileList(files)
    setProject((p) => ({ ...p, folders: snap.data()?.folders || [] }))
    pendingRef.current = null
    setEditorKey((k) => k + 1) // editor ko naya code dikhao
  }

  // Search result / problem se file kholo aur us line par jao
  const openAt = async (path, line = 1) => {
    if (!fileList.some((f) => pathOf(f) === path)) return
    revealRef.current = { line }
    if (path === active) {
      editorRef.current?.revealLineInCenter(line)
      editorRef.current?.setPosition({ lineNumber: line, column: 1 })
      editorRef.current?.focus()
      revealRef.current = null
      return
    }
    await switchFile(path)
  }

  const onChange = (value) => {
    if (readOnly) return
    ensureSnapshot(fileList)
    const content = value ?? ''
    setFileList((prev) => prev.map((f) => (pathOf(f) === active ? { ...f, content } : f)))
    const file = fileList.find((f) => pathOf(f) === active)
    if (file) scheduleSave(file, content)
  }

  const switchFile = async (key) => {
    if (key === active) return
    await flushSave()
    setActive(key)
  }

  // ---- Explorer actions ----
  const handleCreateFile = async (name, folder) => {
    if (fileList.some((f) => f.name === name && (f.folder || '') === folder)) {
      alert('Is naam ki file already hai.')
      return
    }
    ensureSnapshot(fileList)
    await flushSave()
    await createFile(id, name, folder)
    const files = await getProjectFiles(id)
    setFileList(files)
    setActive(folder ? folder + '/' + name : name)
  }

  const handleCreateFolder = async (path) => {
    await createFolder(id, path)
    const snap = await getDoc(doc(db, 'projects', id))
    setProject((p) => ({ ...p, folders: snap.data()?.folders || [] }))
  }

  const handleRenameFile = async (file, newName) => {
    await flushSave()
    await snapshotForUndo('rename ' + pathOf(file))
    await renameFile(id, file, newName)
    const files = await getProjectFiles(id)
    setFileList(files)
    const newPath = file.folder ? file.folder + '/' + newName : newName
    setActive(newPath)
  }

  const handleDeleteFile = async (file) => {
    if (!window.confirm(`"${pathOf(file)}" delete karna hai?`)) return
    await flushSave()
    await snapshotForUndo('delete ' + pathOf(file))
    await deleteFile(id, file)
    const files = await getProjectFiles(id)
    setFileList(files)
    if (active === pathOf(file)) {
      const first = files[0]
      setActive(first ? pathOf(first) : null)
    }
  }

  const handleRenameFolder = async (oldPath, newPath) => {
    await flushSave()
    await snapshotForUndo('folder rename ' + oldPath)
    await renameFolder(id, oldPath, newPath)
    const [files, snap] = await Promise.all([getProjectFiles(id), getDoc(doc(db, 'projects', id))])
    setFileList(files)
    setProject((p) => ({ ...p, folders: snap.data()?.folders || [] }))
    if (active?.startsWith(oldPath + '/')) setActive(newPath + active.slice(oldPath.length))
  }

  const handleDeleteFolder = async (path) => {
    if (!window.confirm(`Folder "${path}" aur uski saari files delete karni hain?`)) return
    await flushSave()
    await snapshotForUndo('folder delete ' + path)
    await deleteFolder(id, path)
    const [files, snap] = await Promise.all([getProjectFiles(id), getDoc(doc(db, 'projects', id))])
    setFileList(files)
    setProject((p) => ({ ...p, folders: snap.data()?.folders || [] }))
    if (active?.startsWith(path + '/')) {
      const first = files[0]
      setActive(first ? pathOf(first) : null)
    }
  }

  // Version restore hone ke baad editor ko naye data se bharo
  const handleRestored = ({ files, folders }) => {
    clearTimeout(timerRef.current)
    pendingRef.current = null
    snapDoneRef.current = true // restore ne khud backup bana diya
    setFileList(files)
    setProject((p) => ({ ...p, folders }))
    setActive(files[0] ? pathOf(files[0]) : null)
    setSaveState('saved')
    setEditorKey((k) => k + 1)
  }

  // GitHub panel se: link badla (project.github) ya pull ke baad files reload karni hain
  const handleGitHubChanged = async ({ github, reload }) => {
    if (!reload) {
      setProject((p) => ({ ...p, github: github || undefined }))
      return
    }
    clearTimeout(timerRef.current)
    pendingRef.current = null
    const [files, snap] = await Promise.all([getProjectFiles(id), getDoc(doc(db, 'projects', id))])
    setFileList(files)
    setProject((p) => ({ ...p, folders: snap.data()?.folders || [], github: github || undefined }))
    setActive((cur) => (cur && files.some((f) => pathOf(f) === cur)) ? cur : (files[0] ? pathOf(files[0]) : null))
    setSaveState('saved')
    setEditorKey((k) => k + 1)
  }

  const togglePublic = async () => {
    try {
      await updateDoc(doc(db, 'projects', id), { public: !project.public })
      setProject((p) => ({ ...p, public: !p.public }))
    } catch (e) { console.error(e); alert('Update failed') }
  }

  // Share: project ka link copy karo (signed-in member khol sakta hai)
  const shareProject = async () => {
    const link = window.location.origin + '/project/' + id
    try {
      await navigator.clipboard.writeText(link)
    } catch (e) {
      window.prompt('Ye link copy karo:', link)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ---- Paste / Copy (mobile par Monaco ka long-press paste bharosemand nahi) ----
  const insertText = (text) => {
    const ed = editorRef.current
    if (!ed || readOnly) return
    ed.focus()
    ed.executeEdits('bc-paste', [{ range: ed.getSelection(), text, forceMoveMarkers: true }])
  }
  const replaceAllText = (text) => {
    const ed = editorRef.current
    const model = ed?.getModel()
    if (!ed || !model || readOnly) return
    ed.executeEdits('bc-replace', [{ range: model.getFullModelRange(), text, forceMoveMarkers: true }])
    ed.setPosition({ lineNumber: 1, column: 1 })
  }
  const smartPaste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { insertText(t); return }
    } catch { /* permission nahi mili — neeche box khulega */ }
    setPasteMode('insert')
  }
  const copyFile = async () => {
    const text = editorRef.current?.getValue() ?? activeFile?.content ?? ''
    try { await navigator.clipboard.writeText(text) } catch { window.prompt('Copy karo:', text.slice(0, 2000)) }
    setFileCopied(true)
    setTimeout(() => setFileCopied(false), 1500)
  }
  const applyPaste = (text, mode) => {
    if (mode === 'replace') replaceAllText(text)
    else insertText(text)
    setPasteMode(null)
  }

  const formatCode = () => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run()
  }

  const downloadZip = async () => {
    await flushSave()
    const zip = new JSZip()
    for (const f of fileList) zip.file(pathOf(f), f.content || '')
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (project.name || 'project').replace(/\s+/g, '-') + '.zip'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const filesObj = useMemo(() => {
    const obj = {}
    for (const f of fileList) obj[pathOf(f)] = f.content
    return obj
  }, [fileList])

  const activeFile = fileList.find((f) => pathOf(f) === active)

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-base">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    )
  }

  if (denied || !project) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-base">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-body font-medium text-center px-4">Project nahi mila ya access nahi hai.</p>
        <Link to="/" className="text-blue-400 hover:underline text-sm">Dashboard pe wapas jao</Link>
      </div>
    )
  }

  const toolBtn = 'p-1.5 rounded-lg text-mute hover:text-body hover:bg-raise transition'

  const effView = isMobile ? 'code' : view
  const closeDrawer = () => { if (isMobile) setShowExplorer(false) }

  const previewEl = (
    <Preview type={project.type} files={filesObj} readOnly={readOnly} onApplyEdits={applyEdits} onOpenFile={openAt} />
  )

  return (
    <div className="h-full flex flex-col bg-base text-body">
      {/* Top bar — mobile par tools neeche ki doosri line me scroll hote hain, kuch bahar nahi nikalta */}
      <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1 min-h-11 bg-surface border-b border-edge">
        <button type="button" onClick={() => setShowExplorer((s) => !s)} title="Files" className={`${toolBtn} shrink-0`}>
          <PanelLeft size={17} />
        </button>
        <Link to="/" className={`${toolBtn} shrink-0`} aria-label="Back"><ArrowLeft size={17} /></Link>
        <h2 className="text-body font-semibold truncate min-w-0 max-w-[40vw] sm:max-w-xs">{project.name}</h2>
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${project.type === 'react' ? 'text-cyan-300 bg-cyan-500/10' : 'text-emerald-300 bg-emerald-500/10'}`}>
          {project.type}
        </span>

        {readOnly && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-raise text-faint">
            <Eye size={11} /> Read only
          </span>
        )}

        <div className="flex-1" />

        {/* Code / Split / Preview — sirf bade screen par */}
        <div className="hidden md:flex shrink-0 items-center bg-raise border border-edge rounded-lg p-0.5 text-[11px] font-semibold">
          {[['code', 'Code'], ['split', 'Split'], ['preview', 'Preview']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              className={`px-2.5 py-1 rounded-md transition ${view === k ? 'bg-blue-600 text-white' : 'text-mute hover:text-body'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Mobile: Preview alag page me khulta hai */}
        <button type="button" onClick={() => setMobilePreview(true)}
          className="md:hidden shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">
          <Eye size={14} /> Preview
        </button>

        {!readOnly && (
          <span className="shrink-0 flex items-center gap-1.5 text-xs text-faint sm:w-20 justify-end">
            {saveState === 'saving' && (<><CircleDashed size={13} className="animate-spin text-yellow-400" /><span className="hidden sm:inline">Saving</span></>)}
            {saveState === 'saved' && (<><Check size={13} className="text-emerald-400" /><span className="hidden sm:inline">Saved</span></>)}
            {saveState === 'error' && (<span className="text-red-400 flex items-center gap-1"><AlertCircle size={13} />Failed</span>)}
          </span>
        )}

        {/* Tools: mobile par poori-chaudai ki alag line (scroll), desktop par isi line me */}
        <div className="order-last basis-full md:order-none md:basis-auto flex items-center gap-0.5 overflow-x-auto md:overflow-visible pb-0.5 md:pb-0">
          {!readOnly && (
            <>
              <button type="button" onClick={smartPaste} title="Paste (clipboard se)" className={`${toolBtn} shrink-0`}><ClipboardPaste size={15} /></button>
              <button type="button" onClick={() => setPasteMode('replace')} title="Poori file replace (paste box)" className={`${toolBtn} shrink-0`}><ClipboardCheck size={15} /></button>
              <button type="button" onClick={copyFile} title="Poori file copy" className={`${toolBtn} shrink-0 ${fileCopied ? 'text-emerald-400' : ''}`}><Copy size={15} /></button>
              <button type="button" onClick={formatCode} title="Format code" className={`${toolBtn} shrink-0`}><Wand2 size={15} /></button>
              <button type="button" onClick={() => setFontSize((s) => Math.max(10, s - 1))} title="Font chhota" className={`${toolBtn} shrink-0`}><Minus size={15} /></button>
              <button type="button" onClick={() => setFontSize((s) => Math.min(24, s + 1))} title="Font bada" className={`${toolBtn} shrink-0`}><Plus size={15} /></button>
              <button type="button" onClick={() => setWordWrap((w) => !w)} title="Word wrap" className={`${toolBtn} shrink-0 ${wordWrap ? 'text-blue-400' : ''}`}><WrapText size={15} /></button>
              <button type="button" onClick={() => setMinimap((m) => !m)} title="Minimap" className={`${toolBtn} shrink-0 hidden md:block ${minimap ? 'text-blue-400' : ''}`}><PanelLeft size={15} className="scale-x-[-1]" /></button>
              <button type="button" onClick={downloadZip} title="Download ZIP" className={`${toolBtn} shrink-0`}><Download size={15} /></button>
              <button type="button" onClick={undoLast} disabled={undoStack.length === 0 || undoBusy}
                title={undoStack.length ? 'Undo: ' + undoStack[undoStack.length - 1].label : 'Undo (abhi kuch nahi)'}
                className={`${toolBtn} shrink-0 flex items-center gap-1 text-xs disabled:opacity-40`}>
                <Undo2 size={15} />
                <span className="hidden sm:inline">Undo{undoStack.length ? ` (${undoStack.length})` : ''}</span>
              </button>
              <button type="button" onClick={() => setShowRuntime(true)} title="Node.js Runtime, Terminal aur Vite Dev Server" className={`${toolBtn} shrink-0 flex items-center gap-1 text-xs`}>
                <Terminal size={15} className="text-blue-400" />
                <span className="hidden sm:inline">Runtime</span>
              </button>
              <button type="button" onClick={() => setShowGithub(true)} title={project.github ? 'GitHub: ' + project.github.owner + '/' + project.github.repo : 'GitHub — naya repo, push, pull'} className={`${toolBtn} shrink-0 flex items-center gap-1 text-xs`}>
                <Github size={15} className={project.github ? 'text-emerald-400' : ''} />
                <span className="hidden sm:inline">GitHub</span>
              </button>
              <button type="button" onClick={() => setShowHistory(true)} title="Version history — purana code wapis lao" className={`${toolBtn} shrink-0 flex items-center gap-1 text-xs`}>
                <History size={15} />
                <span className="hidden sm:inline">History</span>
              </button>
            </>
          )}

          <button type="button" onClick={shareProject} title="Share link copy karo" className={`${toolBtn} shrink-0 flex items-center gap-1 text-xs`}>
            <Share2 size={15} className={copied ? 'text-emerald-400' : ''} />
            {copied && <span className="text-emerald-400">Copied!</span>}
          </button>

          {canManage && (
            <button type="button" onClick={togglePublic} title={project.public ? 'Public — Explore me dikhta hai' : 'Private'} className={`${toolBtn} shrink-0 flex items-center gap-1 text-xs`}>
              {project.public ? <Globe size={15} className="text-emerald-400" /> : <Lock size={15} />}
              <span className="hidden sm:inline">{project.public ? 'Public' : 'Private'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {/* File explorer / Search — desktop par side panel, mobile par drawer */}
        {showExplorer && (
          <>
            {isMobile && <div className="fixed inset-0 z-30 bg-black/50" onClick={closeDrawer} />}
            <div className={isMobile ? 'fixed left-0 top-0 bottom-0 z-40 w-64 max-w-[85vw] flex flex-col min-h-0 bg-surface shadow-2xl' : 'w-56 shrink-0 flex flex-col min-h-0'}>
              <div className="flex shrink-0 bg-surface border-b border-r border-edge">
                <button type="button" onClick={() => setSideTab('files')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold uppercase tracking-wider border-b-2 ${sideTab === 'files' ? 'border-blue-500 text-body' : 'border-transparent text-faint hover:text-mute'}`}>
                  <Files size={13} /> Files
                </button>
                <button type="button" onClick={() => setSideTab('search')} title="Ctrl+Shift+F"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold uppercase tracking-wider border-b-2 ${sideTab === 'search' ? 'border-blue-500 text-body' : 'border-transparent text-faint hover:text-mute'}`}>
                  <Search size={13} /> Search
                </button>
              </div>
              <div className="flex-1 min-h-0">
                {sideTab === 'search' ? (
                  <SearchPanel files={fileList} onOpen={(path, line) => { closeDrawer(); openAt(path, line) }} />
                ) : (
                  <FileExplorer
                    files={fileList}
                    folders={project.folders || []}
                    active={active}
                    readOnly={readOnly}
                    onSelect={(key) => { closeDrawer(); return switchFile(key) }}
                    onCreateFile={handleCreateFile}
                    onCreateFolder={handleCreateFolder}
                    onRenameFile={handleRenameFile}
                    onDeleteFile={handleDeleteFile}
                    onRenameFolder={handleRenameFolder}
                    onDeleteFolder={handleDeleteFolder}
                  />
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Tabs */}
          <div className="flex gap-1 px-3 pt-2 bg-base shrink-0 overflow-x-auto">
            {fileList.map((file) => {
              const key = pathOf(file)
              return (
                <button key={key} type="button" onClick={() => switchFile(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition whitespace-nowrap ${active === key ? 'bg-raise text-body border border-b-0 border-edge' : 'text-faint hover:text-mute'}`}>
                  <FileCode2 size={13} />
                  {key}
                </button>
              )
            })}
          </div>

          {/* Editor + Preview */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
            <div className={`${effView === 'preview' ? 'hidden' : effView === 'code' ? 'flex-1' : 'h-[45%] lg:h-auto lg:w-[45%]'} flex flex-col border-b lg:border-b-0 lg:border-r border-edge min-h-0 min-w-0`}>
              {activeFile ? (
                <Editor
                  key={active + ':' + editorKey}
                  path={active}
                  language={langOf(activeFile.name)}
                  theme={theme === 'light' ? 'light' : 'vs-dark'}
                  value={activeFile.content ?? ''}
                  onChange={onChange}
                  onMount={(editor) => {
                    editorRef.current = editor
                    if (revealRef.current) {
                      const { line } = revealRef.current
                      revealRef.current = null
                      setTimeout(() => {
                        editor.revealLineInCenter(line)
                        editor.setPosition({ lineNumber: line, column: 1 })
                        editor.focus()
                      }, 50)
                    }
                  }}
                  options={{
                    minimap: { enabled: minimap && !isMobile },
                    fontSize,
                    wordWrap: wordWrap ? 'on' : 'off',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    tabSize: 2,
                    padding: { top: 12 },
                    readOnly,
                    contextmenu: true,
                    dragAndDrop: false,
                    quickSuggestions: !isMobile,
                    suggestOnTriggerCharacters: !isMobile,
                    acceptSuggestionOnEnter: isMobile ? 'off' : 'on',
                    folding: !isMobile,
                    lineNumbersMinChars: isMobile ? 3 : 5,
                  }}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-faint">
                  <FileCode2 size={28} />
                  <p className="text-sm">Is project mein koi file nahi hai.</p>
                </div>
              )}
            </div>
            {/* Desktop preview (mobile par ye mount hi nahi hota — alag page me khulta hai) */}
            {!isMobile && (
              <div className={`${effView === 'code' ? 'hidden' : effView === 'preview' ? 'flex-1' : 'h-[55%] lg:h-auto lg:w-[55%]'} min-h-0 min-w-0`}>
                {previewEl}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile preview — alag full-screen page */}
      {isMobile && mobilePreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-base" style={{ height: '100dvh' }}>
          <div className="h-11 shrink-0 flex items-center gap-2 px-3 bg-surface border-b border-edge">
            <button type="button" onClick={closeMobilePreview} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-body text-sm font-semibold hover:bg-raise">
              <ArrowLeft size={17} /> Editor
            </button>
            <span className="text-sm text-mute truncate">{project.name}</span>
          </div>
          <div className="flex-1 min-h-0">{previewEl}</div>
        </div>
      )}

      {pasteMode && (
        <PasteBox
          fileName={active || ''}
          initialMode={pasteMode}
          onApply={applyPaste}
          onClose={() => setPasteMode(null)}
        />
      )}

      {showRuntime && (
        <WebContainerRuntime
          files={filesObj}
          projectName={project.name}
          onClose={() => setShowRuntime(false)}
        />
      )}

      {showGithub && (
        <GitHubPanel
          project={project}
          projectId={id}
          user={user}
          onBeforeAction={flushSave}
          onChanged={handleGitHubChanged}
          onClose={() => setShowGithub(false)}
        />
      )}

      {showHistory && (
        <VersionHistory
          projectId={id}
          user={user}
          files={fileList}
          folders={project.folders || []}
          onBeforeAction={flushSave}
          onRestored={handleRestored}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}
