import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Monitor, Smartphone, Tablet, RefreshCw, Terminal, Trash2, ExternalLink, Loader2, CheckCircle2, ArrowLeft, ArrowRight, Home } from 'lucide-react'
import { analyzeProject, scanProject, buildCheck, buildDefaultPackage } from '../utils/projectAnalyzer.js'
import { applyFixes, explainRuntimeError, addDependencyEdits, removeDependencyEdits } from '../utils/errorFixer.js'
import { ProblemsTab, BuildTab, PackagesTab } from './DevPanels'
import { pickEntry, resolveTarget, srcDocFor, buildStandalone } from '../utils/staticPreview.js'
import BharatPreviewEngine from './BharatPreviewEngine.jsx'

const VIEWPORTS = {
  mobile: { width: 375, icon: Smartphone },
  tablet: { width: 768, icon: Tablet },
  desktop: { width: '100%', icon: Monitor },
}

const LOG_COLORS = { log: 'text-mute', info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400' }

const STATUS_TEXT = {
  initial: 'Start ho raha hai...',
  running: 'Build ho raha hai...',
  idle: 'Ready',
  done: 'Ready',
  timeout: 'Connect nahi hua',
}

const nowStr = () => new Date().toLocaleTimeString('en-IN', { hour12: false })

export default function Preview({ type, files, readOnly = false, onApplyEdits, onOpenFile }) {
  const [vp, setVp] = useState('desktop')
  const [reloadKey, setReloadKey] = useState(0)
  const [logs, setLogs] = useState([])
  const [showPanel, setShowPanel] = useState(false)
  const [tab, setTab] = useState('console')
  const [engineStatus, setEngineStatus] = useState('initial')
  const [runtimeError, setRuntimeError] = useState(null)
  const [buildLog, setBuildLog] = useState([])
  const [fixing, setFixing] = useState(false)
  const [fixedAt, setFixedAt] = useState(0)
  const [nav, setNav] = useState({ stack: [], idx: -1 }) // static preview ka virtual browser history
  const [blockedUrl, setBlockedUrl] = useState(null)
  const iframeRef = useRef(null)

  // Bhaari scanning typing ke saath-saath nahi, thodi der baad
  const deferred = useDeferredValue(files)
  const analysis = useMemo(() => analyzeProject(deferred), [deferred])
  const issues = useMemo(() => scanProject(deferred, analysis), [deferred, analysis])
  const build = useMemo(() => buildCheck(deferred, analysis, issues), [deferred, analysis, issues])

  // React project ko kabhi simple HTML preview me nahi chalana
  const runtime = type === 'react' || analysis.runtime === 'bharat' ? 'bharat' : 'static'
  const preview = null

  // ---- Static (HTML/CSS/JS) multi-page router ----
  const entry = useMemo(() => pickEntry(deferred), [deferred])
  const cur = useMemo(() => {
    const r = nav.stack[nav.idx]
    if (r && (!r.file || deferred[r.file] != null)) return r
    return { file: entry, search: '', hash: '' }
  }, [nav, deferred, entry])
  const srcDoc = useMemo(() => (runtime === 'static' ? srcDocFor(deferred, cur) : ''), [runtime, deferred, cur])

  const liveRef = useRef({})
  liveRef.current = { files: deferred, cur, entry, nav }

  const pushRoute = useCallback((r) => {
    setNav((n) => {
      const { entry: e } = liveRef.current
      const base = n.stack.length ? n.stack.slice(0, n.idx + 1) : [{ file: e, search: '', hash: '' }]
      return { stack: [...base, r], idx: base.length }
    })
  }, [])
  const goBack = useCallback(() => setNav((n) => (n.idx > 0 ? { ...n, idx: n.idx - 1 } : n)), [])
  const goForward = useCallback(() => setNav((n) => (n.idx < n.stack.length - 1 ? { ...n, idx: n.idx + 1 } : n)), [])
  const goHome = () => { setNav({ stack: [], idx: -1 }); setBlockedUrl(null) }
  const canBack = nav.idx > 0
  const canForward = nav.idx >= 0 && nav.idx < nav.stack.length - 1
  const pathLabel = cur.file ? '/' + cur.file + (cur.search || '') + (cur.hash || '') : '/' + (cur.missing || '')

  const addBuildLog = useCallback((text) => {
    setBuildLog((prev) => [...prev.slice(-39), nowStr() + '  ' + text])
  }, [])

  // iframe (simple HTML) se aaye logs suno
  useEffect(() => {
    const handler = (event) => {
      const data = event.data
      if (data && data.__bcnav) {
        if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return
        if (data.__bcnav === 'back') return goBack()
        if (data.__bcnav === 'forward') return goForward()
        if (data.__bcnav === 'go') {
          const { files: f, cur: c, entry: e } = liveRef.current
          const r = resolveTarget(String(data.href || ''), c.file || e || '', Object.keys(f))
          if (r.type === 'external') {
            const w = window.open(r.url, '_blank', 'noopener')
            if (!w) setBlockedUrl(r.url)
            return
          }
          setBlockedUrl(null)
          pushRoute(r)
        }
        return
      }
      if (!data || !data.__bc) return
      setLogs((prev) => [...prev.slice(-199), { level: data.level, text: data.text }])
      if (data.level === 'error') {
        const m = /\(line (\d+)\)\s*$/.exec(data.text)
        setRuntimeError({ message: data.text.replace(/\s*\(line \d+\)\s*$/, ''), line: m ? Number(m[1]) : null })
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [goBack, goForward, pushRoute])

  useEffect(() => { setRuntimeError(null); setLogs([]) }, [runtime, reloadKey])

  // Preview se aaya error ko simple bhasha me badlo
  const runtimeIssue = useMemo(() => {
    if (!runtimeError) return null
    const ex = explainRuntimeError(runtimeError, files)
    const dup = issues.some((i) => i.fix && ex.fix && i.fix.kind === ex.fix.kind && i.fix.name === ex.fix.name && i.path === ex.path)
    if (dup) return null
    return { id: 'rt', level: 'error', path: ex.path, line: ex.line, title: ex.title, why: ex.why, fix: ex.fix }
  }, [runtimeError, issues, files])

  const problems = useMemo(() => (runtimeIssue ? [runtimeIssue, ...issues] : issues), [runtimeIssue, issues])
  const errorCount = problems.filter((p) => p.level === 'error').length
  const buildErrors = build.filter((b) => b.level === 'error').length

  const openFile = (path, line) => { if (onOpenFile && path) onOpenFile(path, line || 1) }

  const runEdits = async (changes, label) => {
    if (!onApplyEdits || readOnly) return
    if (!changes.edits.length && !changes.creates.length) return
    setFixing(true)
    try {
      await onApplyEdits(changes, label)
      setRuntimeError(null)
      setFixedAt(Date.now())
      addBuildLog('fix laga: ' + label)
    } catch (e) {
      console.error('Fix failed:', e)
      alert('Fix save nahi hua. Dobara try karo.')
    } finally {
      setFixing(false)
    }
  }

  const doFix = (list) => runEdits(applyFixes(list, files), list.length > 1 ? `${list.length} problems fix` : list[0].title)
  const addPackage = (name, version) => runEdits(addDependencyEdits(files, name, version), name + ' package jodna')
  const removePackage = (name) => runEdits(removeDependencyEdits(files, name), name + ' package hatana')
  const addAllMissing = () => doFix(issues.filter((i) => i.kind === 'missing-dep'))
  const createPackage = () => runEdits({ edits: [], creates: [{ path: 'package.json', content: buildDefaultPackage(files, analysis) }] }, 'package.json banana')

  const spReady = runtime !== 'bharat' || engineStatus === 'done' || engineStatus === 'idle'
  const clean = errorCount === 0
  const banner = fixedAt ? (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold ${clean && spReady ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10'}`}>
      {clean && spReady ? <CheckCircle2 size={13} /> : <Loader2 size={13} className="animate-spin" />}
      {clean && spReady ? 'Fix ke baad preview dobara test hua — koi error nahi.' : 'Fix lag gaya, preview dobara test ho raha hai...'}
      <div className="flex-1" />
      <button type="button" onClick={() => setFixedAt(0)} className="text-faint hover:text-body">✕</button>
    </div>
  ) : null

  const active = VIEWPORTS[vp]
  const shortRuntime = runtime === 'bharat' ? analysis.kind + ' · Bharat Preview Engine' : 'HTML / CSS / JS'
  const statusLine = runtime === 'bharat' ? (engineStatus === 'done' ? 'Ready' : engineStatus === 'error' ? 'Build error' : STATUS_TEXT[engineStatus] || engineStatus) : 'Ready'

  // Preview ko naye tab me kholo (sirf simple HTML projects ke liye). React ke liye "Reload" use karo.
  const openInNewTab = () => {
    if (runtime !== 'static') { alert('React preview is running inside Bharat Codex.'); return }
    if (!entry) { alert('Project me koi .html file nahi hai.'); return }
    const url = URL.createObjectURL(new Blob([buildStandalone(deferred, cur.file || entry)], { type: 'text/html' }))
    const w = window.open(url, '_blank')
    if (!w) alert('Popup block ho gaya. Browser me popups allow karo.')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  const tabBtn = (key, label, badge, badgeCls = 'bg-red-500') => (
    <button
      key={key}
      type="button"
      onClick={() => { if (showPanel && tab === key) setShowPanel(false); else { setTab(key); setShowPanel(true) } }}
      className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border-b-2 transition ${showPanel && tab === key ? 'border-blue-500 text-body' : 'border-transparent text-faint hover:text-mute'}`}
    >
      {label}
      {badge > 0 && <span className={`ml-1.5 inline-block min-w-[16px] px-1 rounded-full text-[10px] text-white text-center ${badgeCls}`}>{badge}</span>}
    </button>
  )

  const staticConsole = (
    <div className="h-full overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-relaxed">
      {logs.length === 0 ? (
        <p className="text-faint">console.log() yahan dikhega...</p>
      ) : (
        logs.map((log, i) => (
          <div key={i} className={`${LOG_COLORS[log.level] || 'text-mute'} whitespace-pre-wrap break-all`}>
            {log.level === 'warn' && '⚠ '}{log.level === 'error' && '✖ '}{log.text}
          </div>
        ))
      )}
    </div>
  )

  const body = (
    <div className="h-full min-h-0 flex flex-col bg-base text-body transition-colors duration-200">
      {/* Toolbar */}
      <div className="h-9 shrink-0 flex items-center gap-2 px-2 border-b border-edge bg-surface overflow-x-auto">
        <span className="text-[11px] font-bold text-faint uppercase tracking-widest shrink-0">Preview</span>
        <span className={`flex items-center gap-1 text-[10px] truncate ${spReady ? 'text-emerald-400' : engineStatus === 'timeout' ? 'text-red-400' : 'text-yellow-400'}`} title={shortRuntime}>
          {!spReady && engineStatus !== 'timeout' && <Loader2 size={11} className="animate-spin" />}{statusLine}
        </span>
        {runtime === 'static' && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" onClick={goBack} disabled={!canBack} title="Peeche" className="p-1 rounded text-mute hover:text-body hover:bg-raise disabled:opacity-30"><ArrowLeft size={14} /></button>
            <button type="button" onClick={goForward} disabled={!canForward} title="Aage" className="p-1 rounded text-mute hover:text-body hover:bg-raise disabled:opacity-30"><ArrowRight size={14} /></button>
            <button type="button" onClick={goHome} title="Pehla page" className="p-1 rounded text-mute hover:text-body hover:bg-raise"><Home size={14} /></button>
            <span className="hidden md:block max-w-[180px] truncate text-[10px] font-mono text-faint px-1" title={pathLabel}>{pathLabel}</span>
          </div>
        )}
        <div className="flex-1" />
        <div className="hidden sm:flex items-center bg-raise rounded-md p-0.5 border border-edge shrink-0">
          {Object.entries(VIEWPORTS).map(([key, viewport]) => {
            const Icon = viewport.icon
            return (
              <button key={key} type="button" onClick={() => setVp(key)} title={key + (viewport.width === '100%' ? '' : ' ' + viewport.width + 'px')}
                className={`p-1 rounded transition ${vp === key ? 'bg-blue-600 text-white' : 'text-mute hover:text-body'}`}>
                <Icon size={14} />
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => { setReloadKey((k) => k + 1); setLogs([]); setEngineStatus('initial') }} title="Reload" className="p-1.5 rounded-md text-mute hover:text-body hover:bg-raise transition">
          <RefreshCw size={14} />
        </button>
        {runtime === 'bharat' ? (
          <span className="text-[10px] text-faint px-1">Local engine</span>
        ) : (
          <button type="button" onClick={openInNewTab} title="New tab me kholo" className="p-1.5 rounded-md text-mute hover:text-body hover:bg-raise transition">
            <ExternalLink size={14} />
          </button>
        )}
      </div>

      {runtime === 'static' && blockedUrl && (
        <div className="shrink-0 flex items-center gap-2 px-2.5 py-1 text-[11px] border-b border-edge bg-yellow-500/10 text-yellow-400">
          <span className="truncate">Bahar ka link: {blockedUrl}</span>
          <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline shrink-0">Naye tab me kholo</a>
          <div className="flex-1" />
          <button type="button" onClick={() => setBlockedUrl(null)} className="text-faint hover:text-body">✕</button>
        </div>
      )}

      {/* Canvas */}
      <div className={`flex-1 min-h-0 flex justify-center bg-base ${vp === 'desktop' ? '' : 'p-2 overflow-auto'}`}>
        <div className={`relative bg-white overflow-hidden transition-[width] duration-300 ${vp === 'desktop' ? 'rounded-none' : 'rounded-xl shadow-2xl ring-1 ring-edge shrink-0'}`}
          style={{ width: active.width === '100%' ? '100%' : `${active.width}px`, maxWidth: '100%', height: '100%' }}>
          {runtime === 'bharat' ? <BharatPreviewEngine files={deferred} analysis={analysis} reloadKey={reloadKey} onStatus={setEngineStatus} onError={setRuntimeError} onLog={addBuildLog} /> : (
            <iframe ref={iframeRef} key={reloadKey} title="Project live preview" sandbox="allow-scripts allow-forms allow-modals allow-popups" srcDoc={srcDoc} className="block w-full h-full bg-white border-0" />
          )}
        </div>
      </div>

      {/* Bottom panel: patli bar, tab dabane par khulta hai */}
      <div className={`shrink-0 flex flex-col border-t border-edge bg-surface min-h-0 ${showPanel ? 'h-52 max-h-[45%]' : ''}`}>
        <div className="h-8 shrink-0 flex items-center gap-0.5 px-2 overflow-x-auto whitespace-nowrap">
          {tabBtn('console', 'Console', 0)}
          {tabBtn('problems', 'Problems', problems.length, errorCount ? 'bg-red-500' : 'bg-yellow-500')}
          {tabBtn('build', 'Build', buildErrors)}
          {tabBtn('packages', 'Packages', 0)}
          <div className="flex-1" />
          {showPanel && tab === 'console' && (
            <>
              <button type="button" onClick={() => navigator.clipboard?.writeText(logs.map((l) => '[' + l.level + '] ' + l.text).join('\n'))} className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-faint hover:text-body hover:bg-raise">Copy</button>
              <button type="button" onClick={() => setLogs([])} title="Clear console" className="p-1 rounded text-faint hover:text-body"><Trash2 size={13} /></button>
            </>
          )}
          {showPanel && <button type="button" onClick={() => setShowPanel(false)} className="px-1.5 text-faint hover:text-body text-xs" title="Band karo">✕</button>}
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto border-t border-edge ${showPanel ? '' : 'hidden'}`}>
          {/* Console hamesha mount rehta hai taaki logs na khoyein */}
          <div className={tab === 'console' ? 'h-full' : 'hidden'}>
            {staticConsole}
          </div>
          {tab === 'problems' && (
            <ProblemsTab issues={problems} readOnly={readOnly || !onApplyEdits} fixing={fixing} banner={banner} onFix={doFix} onOpen={openFile} />
          )}
          {tab === 'build' && <BuildTab items={build} log={buildLog} onOpen={openFile} />}
          {tab === 'packages' && (
            <PackagesTab
              analysis={analysis}
              issues={issues}
              readOnly={readOnly || !onApplyEdits}
              busy={fixing}
              notes={preview?.notes}
              onAdd={addPackage}
              onRemove={removePackage}
              onAddAllMissing={addAllMissing}
              onCreatePackage={createPackage}
            />
          )}
        </div>
      </div>
    </div>
  )

  return body
}
