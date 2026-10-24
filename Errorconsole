import { Component, useState, useSyncExternalStore } from 'react'

// =====================================================================
// Error capture — app ke saare errors yahan jama hote hain,
// taaki browser console kholne ki zaroorat na pade.
// =====================================================================
let entries = []
let snapshot = []
const listeners = new Set()
let started = false

const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const getSnapshot = () => snapshot

const fmt = (a) => {
  if (a instanceof Error) {
    const code = a.code ? `[${a.code}] ` : ''
    const stack = a.stack ? '\n' + a.stack.split('\n').slice(1, 4).join('\n') : ''
    return code + a.message + stack
  }
  if (a && typeof a === 'object') {
    try { return JSON.stringify(a) } catch { return String(a) }
  }
  return String(a)
}

export const pushError = (source, text) => {
  const last = entries[entries.length - 1]
  if (last && last.text === text) { last.count += 1 } else {
    entries.push({ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), source, text, count: 1 })
    if (entries.length > 50) entries.shift()
  }
  snapshot = entries.map((e) => ({ ...e }))
  listeners.forEach((l) => l())
}

export const startErrorCapture = () => {
  if (started) return
  started = true

  window.addEventListener('error', (e) => {
    const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno}:${e.colno})` : ''
    pushError('window', (e.message || 'Unknown error') + where)
  })
  window.addEventListener('unhandledrejection', (e) => {
    pushError('promise', fmt(e.reason))
  })

  const orig = console.error
  console.error = (...args) => {
    orig.apply(console, args)
    try { pushError('console', args.map(fmt).join(' ')) } catch { /* ignore */ }
  }
}

// Error dekh ke seedha batao kya karna hai
const hintFor = (text) => {
  const t = text.toLowerCase()
  if (t.includes('permission-denied') || t.includes('missing or insufficient permissions')) {
    return 'Firebase Rules ka masla: Firebase Console > Firestore > Rules me firestore.rules ka naya text paste karke Publish karo.'
  }
  if (t.includes('unauthenticated')) return 'Login expire ho gaya — Sign out karke dobara Google se sign in karo.'
  if (t.includes('failed-precondition') && t.includes('index')) return 'Firestore index chahiye — error me diye link ko khol ke "Create index" dabao.'
  if (t.includes('unavailable') || t.includes('network')) return 'Internet / Firebase connection ka masla lagta hai.'
  if (t.includes('quota') || t.includes('resource-exhausted')) return 'Firebase free quota khatam ho gayi hai (aaj ke liye).'
  if (t.includes('version_too_big')) return 'Project itna bada hai ki version save nahi ho sakta.'
  return ''
}

const buildReport = (list) =>
  [
    'BharatCodex error report',
    'Page: ' + window.location.href,
    'Time: ' + new Date().toLocaleString(),
    '',
    ...list.map((e) => `[${e.time}] (${e.source})${e.count > 1 ? ' x' + e.count : ''}\n${e.text}`),
  ].join('\n\n')

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    window.prompt('Ye text copy karo:', text)
    return false
  }
}

// =====================================================================
// Neeche-daayein kone me floating error button + panel
// =====================================================================
export default function ErrorConsole() {
  const list = useSyncExternalStore(subscribe, getSnapshot)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (list.length === 0) return null

  const copyAll = async () => {
    await copyText(buildReport(list))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const clear = () => {
    entries = []
    snapshot = []
    listeners.forEach((l) => l())
    setOpen(false)
  }

  return (
    <div className="fixed bottom-3 right-3 z-[9999] font-sans">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-full shadow-2xl"
        >
          ⚠ {list.length} error{list.length > 1 ? 's' : ''} — dekho
        </button>
      ) : (
        <div className="w-[92vw] sm:w-[480px] max-h-[70vh] flex flex-col bg-slate-900 text-slate-100 border border-red-500/60 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-red-600 text-white text-sm font-bold">
            <span>⚠ Errors ({list.length})</span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={copyAll} className="bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md text-xs">
                {copied ? 'Copied ✓' : 'Copy all'}
              </button>
              <button type="button" onClick={clear} className="bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md text-xs">Clear</button>
              <button type="button" onClick={() => setOpen(false)} className="bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md text-xs">Close</button>
            </div>
          </div>
          <div className="overflow-y-auto p-2 space-y-2 text-[11px] leading-relaxed">
            {[...list].reverse().map((e) => {
              const hint = hintFor(e.text)
              return (
                <div key={e.id} className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-400 mb-1">
                    {e.time} · {e.source}{e.count > 1 ? ` · x${e.count}` : ''}
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-mono text-red-300">{e.text}</pre>
                  {hint && <p className="mt-1.5 text-amber-300 font-medium">👉 {hint}</p>}
                </div>
              )
            })}
          </div>
          <p className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-700">
            "Copy all" dabake ye text Claude ko bhej do — wo seedha fix bata dega.
          </p>
        </div>
      )}
    </div>
  )
}

// =====================================================================
// White screen ki jagah error screen dikhao
// =====================================================================
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, copied: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    pushError('screen crash', fmt(error) + (info?.componentStack ? '\n' + info.componentStack.split('\n').slice(0, 4).join('\n') : ''))
  }

  render() {
    const { error, copied } = this.state
    if (!error) return this.props.children

    const text = fmt(error)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="max-w-xl w-full bg-slate-900 border border-red-500/50 rounded-2xl p-5">
          <h1 className="text-lg font-bold text-red-400 mb-1">Screen crash ho gayi</h1>
          <p className="text-sm text-slate-400 mb-3">Neeche ka error copy karke Claude ko bhejo, wo fix bata dega.</p>
          <pre className="bg-slate-950 rounded-lg p-3 text-[11px] text-red-300 whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono">{text}</pre>
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={async () => {
                await copyText(buildReport([{ time: new Date().toLocaleTimeString(), source: 'screen crash', text, count: 1 }]))
                this.setState({ copied: true })
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              {copied ? 'Copied ✓' : 'Error copy karo'}
            </button>
            <button type="button" onClick={() => window.location.reload()} className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              Reload
            </button>
            <button type="button" onClick={() => { window.location.href = '/' }} className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              Home
            </button>
          </div>
        </div>
      </div>
    )
  }
}
