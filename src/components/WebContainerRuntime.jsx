import { useCallback, useEffect, useRef, useState } from 'react'
import { WebContainer } from '@webcontainer/api'
import { X, Play, Square, Terminal as TerminalIcon, Download, RefreshCw, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'

let bootPromise = null
async function getRuntime() {
  if (!window.isSecureContext) throw new Error('Runtime ke liye HTTPS zaroori hai. Local development me localhost use kar sakte ho.')
  if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new Error('Browser page cross-origin isolated nahi hai. Hosting par COOP/COEP headers enable hone chahiye; page reload karke dobara try karo.')
  }
  if (!bootPromise) {
    bootPromise = WebContainer.boot({ coep: 'credentialless', workdirName: 'bharatcodex' }).catch((error) => {
      bootPromise = null
      throw error
    })
  }
  return bootPromise
}

async function writeProjectFiles(runtime, files) {
  const sourceFiles = files || {}
  for (const [rawPath, rawContent] of Object.entries(sourceFiles)) {
    const path = rawPath.replace(/^\/+/, '').split('/').filter((part) => part && part !== '.' && part !== '..').join('/')
    if (!path) continue
    const parts = path.split('/')
    if (parts.length > 1) {
      await runtime.fs.mkdir(parts.slice(0, -1).join('/'), { recursive: true })
    }
    await runtime.fs.writeFile(path, String(rawContent ?? ''))
  }
  if (!sourceFiles['package.json']) {
    await runtime.fs.writeFile('package.json', JSON.stringify({
      name: 'bharatcodex-web-project',
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build', preview: 'vite preview --host 0.0.0.0' },
      devDependencies: { vite: '^6.3.5' }
    }, null, 2))
  }
}

function downloadBytes(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function WebContainerRuntime({ files, projectName, onClose }) {
  const [runtime, setRuntime] = useState(null)
  const [status, setStatus] = useState('stopped')
  const [busy, setBusy] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [command, setCommand] = useState('')
  const [lines, setLines] = useState(['Bharat Codex Runtime ready. Start Runtime dabao.'])
  const [error, setError] = useState('')
  const [built, setBuilt] = useState(false)
  const shellRef = useRef(null)
  const devRef = useRef(null)
  const outputRef = useRef(null)
  const filesRef = useRef(files)
  filesRef.current = files

  const log = useCallback((value) => {
    const next = String(value).replace(/\r/g, '')
    if (!next) return
    setLines((old) => [...old, ...next.split('\n')].slice(-600))
  }, [])

  useEffect(() => {
    if (!runtime) return
    writeProjectFiles(runtime, filesRef.current).then(() => log('Editor files synced to runtime.')).catch((e) => log('File sync error: ' + e.message))
  }, [runtime, files, log])

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [lines])

  const startRuntime = async () => {
    if (busy) return
    setBusy('boot')
    setError('')
    try {
      const instance = await getRuntime()
      setRuntime(instance)
      if (!shellRef.current) {
        const shell = await instance.spawn('jsh', [], { terminal: { cols: 100, rows: 24 } })
        shellRef.current = shell
        ;(async () => {
          const reader = shell.output.getReader()
          try {
            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              log(value)
            }
          } catch (e) { log('Terminal stream closed: ' + e.message) }
        })()
      }
      await writeProjectFiles(instance, filesRef.current)
      setStatus('ready')
      log('Runtime booted. Node.js environment is ready.')
    } catch (e) {
      setError(e?.message || String(e))
      setStatus('error')
      log('Runtime error: ' + (e?.message || String(e)))
    } finally {
      setBusy('')
    }
  }

  const runCommand = async (value) => {
    const text = value.trim()
    if (!text || !shellRef.current) return
    setCommand('')
    log('$ ' + text)
    try {
      const writer = shellRef.current.input.getWriter()
      await writer.write(text + '\n')
      writer.releaseLock()
    } catch (e) { log('Command error: ' + e.message) }
  }

  const installDependencies = async () => {
    if (!runtime || busy) return
    setBusy('install')
    setError('')
    try {
      await writeProjectFiles(runtime, filesRef.current)
      const process = await runtime.spawn('npm', ['install'])
      const reader = process.output.getReader()
      const readOutput = (async () => {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          log(value)
        }
      })()
      const code = await process.exit
      await readOutput
      if (code !== 0) throw new Error('npm install failed (exit code ' + code + ')')
      log('Dependencies installed successfully.')
    } catch (e) { setError(e.message); log('Install failed: ' + e.message) }
    finally { setBusy('') }
  }

  const startDevServer = async () => {
    if (!runtime || busy) return
    setBusy('start')
    setError('')
    setPreviewUrl('')
    try {
      await writeProjectFiles(runtime, filesRef.current)
      if (devRef.current) { try { devRef.current.kill() } catch {} }
      const stopListening = runtime.on('server-ready', (port, url) => {
        setPreviewUrl(url)
        setStatus('running')
        log('Dev server ready on port ' + port + ': ' + url)
      })
      const process = await runtime.spawn('npm', ['run', 'dev', '--', '--host', '0.0.0.0'])
      devRef.current = process
      ;(async () => {
        const reader = process.output.getReader()
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            log(value)
          }
        } catch (e) { log('Dev server output closed: ' + e.message) }
      })()
      process.exit.then((code) => {
        stopListening()
        if (devRef.current === process) {
          devRef.current = null
          setStatus('ready')
          log('Dev server stopped (exit ' + code + ').')
        }
      })
      setStatus('starting')
      log('$ npm run dev -- --host 0.0.0.0')
    } catch (e) { setError(e.message); setStatus('error'); log('Dev server error: ' + e.message) }
    finally { setBusy('') }
  }

  const stopDevServer = () => {
    if (devRef.current) {
      try { devRef.current.kill() } catch {}
      devRef.current = null
    }
    setPreviewUrl('')
    setStatus(runtime ? 'ready' : 'stopped')
    log('Dev server stopped.')
  }

  const buildProject = async () => {
    if (!runtime || busy) return
    setBusy('build')
    setBuilt(false)
    setError('')
    try {
      await writeProjectFiles(runtime, filesRef.current)
      let packageInfo = {}
      try { packageInfo = JSON.parse(filesRef.current['package.json'] || '{}') } catch {}
      let exportPath = '.'
      if (packageInfo.scripts?.build) {
        const process = await runtime.spawn('npm', ['run', 'build'])
        const reader = process.output.getReader()
        const readOutput = (async () => {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            log(value)
          }
        })()
        const code = await process.exit
        await readOutput
        if (code !== 0) throw new Error('Build failed (exit code ' + code + ')')
        exportPath = 'dist'
      } else {
        log('No build script found. Exporting the project source instead.')
      }
      const zip = await runtime.export(exportPath, { format: 'zip', excludes: ['node_modules', '.git'] })
      downloadBytes(zip, (projectName || 'bharatcodex-project').replace(/[^a-z0-9-_]/gi, '-') + (exportPath === 'dist' ? '-dist.zip' : '-source.zip'))
      setBuilt(true)
      log(exportPath === 'dist' ? 'Production build exported as ZIP.' : 'Project source exported as ZIP.')
    } catch (e) { setError(e.message); log('Build/export failed: ' + e.message) }
    finally { setBusy('') }
  }

  const close = () => {
    stopDevServer()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/75 flex items-center justify-center p-2 sm:p-5" onClick={(e) => { if (e.target === e.currentTarget && !busy) close() }}>
      <section className="w-full max-w-6xl h-[min(92vh,850px)] bg-surface border border-edge rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <header className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-edge">
          <TerminalIcon size={18} className="text-blue-400" />
          <div className="min-w-0">
            <h2 className="font-bold text-body text-sm">Bharat Codex Development Runtime</h2>
            <p className="text-[11px] text-faint truncate">{projectName} · Node.js in browser</p>
          </div>
          <span className={'ml-auto text-[10px] font-semibold px-2 py-1 rounded-full ' + (status === 'running' ? 'bg-emerald-500/10 text-emerald-400' : status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-raise text-mute')}>{status}</span>
          <button type="button" onClick={close} disabled={!!busy} className="p-1.5 rounded-lg text-mute hover:text-body hover:bg-raise disabled:opacity-40" aria-label="Close runtime"><X size={18} /></button>
        </header>

        <div className="shrink-0 flex flex-wrap items-center gap-2 p-3 border-b border-edge">
          {!runtime ? (
            <button type="button" onClick={startRuntime} disabled={!!busy} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50">
              {busy === 'boot' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start Runtime
            </button>
          ) : (
            <>
              <button type="button" onClick={installDependencies} disabled={!!busy} className="px-3 py-2 rounded-lg bg-raise border border-edge text-body text-xs font-semibold disabled:opacity-50">
                {busy === 'install' ? 'Installing…' : 'npm install'}
              </button>
              <button type="button" onClick={startDevServer} disabled={!!busy} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50">
                {busy === 'start' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run Dev Server
              </button>
              <button type="button" onClick={stopDevServer} disabled={!devRef.current} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-raise border border-edge text-body text-xs font-semibold disabled:opacity-40"><Square size={13} /> Stop</button>
              <button type="button" onClick={buildProject} disabled={!!busy} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50">
                {busy === 'build' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Build + Export
              </button>
              <button type="button" onClick={() => { if (previewUrl) setPreviewUrl(previewUrl + (previewUrl.includes('?') ? '&' : '?') + 'refresh=' + Date.now()) }} disabled={!previewUrl} className="p-2 rounded-lg text-mute hover:text-body hover:bg-raise disabled:opacity-40" title="Refresh preview"><RefreshCw size={14} /></button>
            </>
          )}
        </div>

        {error && <div role="alert" className="shrink-0 flex items-start gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-red-300 text-xs"><AlertTriangle size={15} className="shrink-0 mt-0.5" /><span>{error}</span></div>}
        {built && <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-emerald-500/10 text-emerald-300 text-xs"><CheckCircle2 size={14} /> Production build complete. ZIP export ho gaya.</div>}

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
          <div className="min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-edge">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-faint border-b border-edge">Terminal</div>
            <pre ref={outputRef} className="flex-1 min-h-0 overflow-auto p-3 bg-[#080d18] text-slate-200 font-mono text-[11px] leading-5 whitespace-pre-wrap break-words">{lines.join('\n')}</pre>
            <form onSubmit={(e) => { e.preventDefault(); runCommand(command) }} className="flex gap-2 p-2 border-t border-edge">
              <span className="text-emerald-400 font-mono text-xs self-center">$</span>
              <input value={command} onChange={(e) => setCommand(e.target.value)} disabled={!shellRef.current} placeholder={shellRef.current ? 'npm run build' : 'Start Runtime first'} className="min-w-0 flex-1 bg-raise border border-edge rounded-lg px-3 py-2 text-body text-xs font-mono outline-none focus:border-blue-500 disabled:opacity-50" />
              <button type="submit" disabled={!shellRef.current || !command.trim()} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40">Run</button>
            </form>
          </div>
          <div className="min-h-0 flex flex-col bg-white">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 flex items-center gap-2">
              Live Preview
              {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="ml-auto text-blue-600 normal-case">Open tab ↗</a>}
            </div>
            {previewUrl ? <iframe title="WebContainer development preview" src={previewUrl} className="flex-1 w-full border-0 bg-white" allow="cross-origin-isolated" /> : <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center"><TerminalIcon size={28} className="mb-2 opacity-40" /><p className="text-sm font-semibold">Preview yahan dikhega</p><p className="text-xs mt-1">Runtime start karke dependencies install karo, phir dev server chalao.</p></div>}
          </div>
        </div>
      </section>
    </div>
  )
}
