import { Link, useParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { getProjectFiles, saveFile } from '../services/projectService'
import Preview from '../components/Preview'
import {
  ArrowLeft,
  Check,
  FileCode2,
  Loader2,
  AlertCircle,
  CircleDashed,
} from 'lucide-react'

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
  const { theme } = useTheme()

  const [project, setProject] = useState(null)
  const [fileList, setFileList] = useState([])
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [saveState, setSaveState] = useState('saved')

  const timerRef = useRef(null)
  const pendingRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', id))

        if (!snap.exists()) {
          if (!cancelled) setDenied(true)
          return
        }

        const data = { id: snap.id, ...snap.data() }

        // Sirf project owner ya admin ko access hai.
        if (!isAdmin && (!user || data.ownerId !== user.uid)) {
          if (!cancelled) setDenied(true)
          return
        }

        const files = await getProjectFiles(id)

        if (cancelled) return

        setProject(data)
        setFileList(files)
        setActive(files[0]?.name || null)
      } catch (error) {
        console.error('Project load failed:', error)

        if (!cancelled) setDenied(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
      clearTimeout(timerRef.current)
    }
  }, [id, isAdmin, user])

  const flushSave = async () => {
    clearTimeout(timerRef.current)

    const pending = pendingRef.current

    if (!pending) return

    pendingRef.current = null

    try {
      await saveFile(id, pending.fileName, pending.content)

      // Agar is beech naya edit hua hai, uska status overwrite mat karo.
      if (!pendingRef.current) {
        setSaveState('saved')
      }
    } catch (error) {
      console.error('File save failed:', error)
      pendingRef.current = pending
      setSaveState('error')
    }
  }

  const scheduleSave = (fileName, content) => {
    pendingRef.current = { fileName, content }
    setSaveState('saving')

    clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      flushSave()
    }, 1200)
  }

  const onChange = (value) => {
    const content = value ?? ''

    setFileList((previous) =>
      previous.map((file) =>
        file.name === active
          ? { ...file, content }
          : file
      )
    )

    if (active) {
      scheduleSave(active, content)
    }
  }

  const switchFile = async (name) => {
    if (name === active) return

    await flushSave()
    setActive(name)
  }

  const filesObj = useMemo(
    () =>
      Object.fromEntries(
        fileList.map((file) => [file.name, file.content])
      ),
    [fileList]
  )

  const activeFile = fileList.find(
    (file) => file.name === active
  )

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-base">
        <Loader2
          className="animate-spin text-blue-500"
          size={32}
        />
      </div>
    )
  }

  if (denied || !project) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-base">
        <AlertCircle size={40} className="text-red-400" />

        <p className="text-body font-medium text-center px-4">
          Project nahi mila ya access nahi hai.
        </p>

        <Link
          to="/"
          className="text-blue-400 hover:underline text-sm"
        >
          Dashboard pe wapas jao
        </Link>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-base text-body">
      {/* Top bar */}
      <div className="h-11 shrink-0 flex items-center gap-3 px-3 bg-surface border-b border-edge">
        <Link
          to="/"
          className="p-1.5 rounded-lg text-mute hover:text-body hover:bg-raise transition"
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={17} />
        </Link>

        <h2 className="text-body font-semibold truncate">
          {project.name}
        </h2>

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

        <span className="flex items-center gap-1.5 text-xs text-faint">
          {saveState === 'saving' && (
            <>
              <CircleDashed
                size={13}
                className="animate-spin text-yellow-400"
              />
              Saving...
            </>
          )}

          {saveState === 'saved' && (
            <>
              <Check
                size={13}
                className="text-emerald-400"
              />
              Saved
            </>
          )}

          {saveState === 'error' && (
            <span className="text-red-400 flex items-center gap-1">
              <AlertCircle size={13} />
              Save failed
            </span>
          )}
        </span>
      </div>

      {/* File tabs */}
      <div className="flex gap-1 px-3 pt-2 bg-base shrink-0 overflow-x-auto">
        {fileList.map((file) => (
          <button
            key={file.name}
            type="button"
            onClick={() => switchFile(file.name)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition whitespace-nowrap ${
              active === file.name
                ? 'bg-raise text-body border border-b-0 border-edge'
                : 'text-faint hover:text-mute'
            }`}
          >
            <FileCode2 size={13} />
            {file.name}
          </button>
        ))}
      </div>

      {/* Editor + Preview */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Code editor */}
        <div className="h-1/2 lg:h-auto lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-edge min-h-0">
          {active ? (
            <Editor
              key={active}
              path={active}
              language={LANG[active] || 'plaintext'}
              theme={theme === 'light' ? 'light' : 'vs-dark'}
              value={activeFile?.content ?? ''}
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
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-faint">
              <FileCode2 size={28} />
              <p className="text-sm">Is project mein koi file nahi hai.</p>
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="h-1/2 lg:h-auto lg:w-1/2 min-h-0">
          <Preview
            type={project.type}
            files={filesObj}
          />
        </div>
      </div>
    </div>
  )
}

