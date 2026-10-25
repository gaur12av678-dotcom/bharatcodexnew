import { useState } from 'react'
import { Wrench, FileCode2, CheckCircle2, AlertTriangle, XCircle, Trash2, Plus, Package } from 'lucide-react'

const LEVEL_STYLE = {
  error: { icon: XCircle, cls: 'text-red-400' },
  warn: { icon: AlertTriangle, cls: 'text-yellow-400' },
  ok: { icon: CheckCircle2, cls: 'text-emerald-400' },
}

const copy = async (text) => {
  try { await navigator.clipboard.writeText(text) } catch { window.prompt('Ye text copy karo:', text) }
}

// ---------------- Problems ----------------
export function ProblemsTab({ issues, readOnly, fixing, banner, onFix, onOpen }) {
  const fixable = issues.filter((i) => i.fix)
  const report = issues
    .map((i) => `[${i.level}] ${i.path || ''}${i.line ? ':' + i.line : ''}\n${i.title}\n${i.why || ''}`)
    .join('\n\n')

  return (
    <div className="p-2 space-y-2 text-[11px] leading-relaxed">
      {banner}
      {issues.length === 0 ? (
        <p className="text-emerald-400 px-1 py-2">✓ Koi error nahi mila.</p>
      ) : (
        <div className="flex items-center gap-2 px-1">
          <span className="text-faint">{issues.length} problem</span>
          <div className="flex-1" />
          <button type="button" onClick={() => copy('BharatCodex problems\n\n' + report)} className="px-2 py-0.5 rounded text-faint hover:text-body hover:bg-raise font-semibold">
            Copy
          </button>
          {!readOnly && fixable.length > 0 && (
            <button
              type="button"
              disabled={fixing}
              onClick={() => onFix(fixable)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold"
            >
              <Wrench size={12} /> {fixing ? 'Fix ho raha hai...' : `Sab fix karo (${fixable.length})`}
            </button>
          )}
        </div>
      )}
      {issues.map((i) => {
        const S = LEVEL_STYLE[i.level] || LEVEL_STYLE.error
        const Icon = S.icon
        return (
          <div key={i.id} className="bg-raise border border-edge rounded-lg p-2">
            <div className="flex items-start gap-2">
              <Icon size={14} className={`${S.cls} mt-0.5 shrink-0`} />
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold">{i.title}</p>
                {i.path && (
                  <button type="button" onClick={() => onOpen(i.path, i.line)} className="flex items-center gap-1 text-blue-400 hover:underline font-mono">
                    <FileCode2 size={11} /> {i.path}{i.line ? ':' + i.line : ''}
                  </button>
                )}
                {i.why && <p className="text-mute mt-1">{i.why}</p>}
              </div>
              {!readOnly && i.fix && (
                <button
                  type="button"
                  disabled={fixing}
                  onClick={() => onFix([i])}
                  title={i.fix.label}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold"
                >
                  <Wrench size={11} /> Fix
                </button>
              )}
            </div>
            {i.fix && <p className="text-faint mt-1 pl-6">Fix kya karega: {i.fix.label}</p>}
          </div>
        )
      })}
    </div>
  )
}

// ---------------- Build check ----------------
export function BuildTab({ items, log, onOpen }) {
  const errors = items.filter((x) => x.level === 'error').length
  return (
    <div className="p-2 space-y-2 text-[11px] leading-relaxed">
      <p className={`px-1 font-semibold ${errors ? 'text-red-400' : 'text-emerald-400'}`}>
        {errors ? `Production build me ${errors} jagah fail ho sakta hai` : '✓ Production build ke liye sab theek dikh raha hai'}
      </p>
      <p className="px-1 text-faint">Ye "pre-build check" hai: files, imports, packages aur entry ko jaanchta hai. Asli `npm run build` aapke computer ya hosting par chalta hai.</p>
      {items.map((x, idx) => {
        const S = LEVEL_STYLE[x.level] || LEVEL_STYLE.ok
        const Icon = S.icon
        return (
          <div key={idx} className="flex items-start gap-2 px-1">
            <Icon size={13} className={`${S.cls} mt-0.5 shrink-0`} />
            <span className="text-body">
              {x.text}
              {x.path && (
                <button type="button" onClick={() => onOpen(x.path, x.line)} className="ml-1.5 text-blue-400 hover:underline font-mono">
                  {x.path}{x.line ? ':' + x.line : ''}
                </button>
              )}
            </span>
          </div>
        )
      })}
      {log.length > 0 && (
        <div className="pt-2 mt-2 border-t border-edge">
          <p className="px-1 text-faint font-bold uppercase tracking-widest text-[10px] mb-1">Preview build log</p>
          {log.map((l, idx) => (
            <div key={idx} className="px-1 font-mono text-mute">{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- Packages ----------------
export function PackagesTab({ analysis, issues, readOnly, busy, onAdd, onRemove, onAddAllMissing, onCreatePackage, notes }) {
  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const pkg = analysis.pkg
  const deps = pkg?.dependencies || {}
  const dev = pkg?.devDependencies || {}
  const missing = issues.filter((i) => i.kind === 'missing-dep')

  const row = (n, v, isDev) => (
    <div key={(isDev ? 'd:' : 'p:') + n} className="flex items-center gap-2 px-2 py-1 bg-raise border border-edge rounded-md">
      <Package size={12} className="text-faint shrink-0" />
      <span className="text-body font-mono truncate">{n}</span>
      <span className="text-faint font-mono">{String(v)}</span>
      {isDev && <span className="text-[9px] uppercase text-faint">dev</span>}
      <div className="flex-1" />
      {!readOnly && (
        <button type="button" disabled={busy} onClick={() => onRemove(n)} title="Hatao" className="text-faint hover:text-red-400">
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )

  return (
    <div className="p-2 space-y-2 text-[11px] leading-relaxed">
      {!analysis.hasPackage && (
        <div className="bg-raise border border-edge rounded-lg p-2">
          <p className="text-body font-semibold">package.json nahi hai</p>
          <p className="text-mute">Bina package.json ke packages manage nahi ho sakte aur production build nahi banega.</p>
          {!readOnly && (
            <button type="button" disabled={busy} onClick={onCreatePackage} className="mt-1.5 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold">
              package.json banao
            </button>
          )}
        </div>
      )}

      {missing.length > 0 && (
        <div className="bg-raise border border-red-500/40 rounded-lg p-2">
          <div className="flex items-center gap-2">
            <p className="text-red-400 font-semibold">Code me use ho rahe par jude nahi ({missing.length})</p>
            <div className="flex-1" />
            {!readOnly && (
              <button type="button" disabled={busy} onClick={onAddAllMissing} className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold">
                Sab jodo
              </button>
            )}
          </div>
          {missing.map((m) => (
            <div key={m.id} className="flex items-center gap-2 mt-1">
              <span className="font-mono text-body">{m.name}</span>
              <span className="text-faint">({m.path})</span>
              <div className="flex-1" />
              {!readOnly && (
                <button type="button" disabled={busy} onClick={() => onAdd(m.name, m.fix?.version)} className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                  Jodo
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {Object.entries(deps).map(([n, v]) => row(n, v, false))}
        {Object.entries(dev).map(([n, v]) => row(n, v, true))}
        {analysis.hasPackage && Object.keys(deps).length + Object.keys(dev).length === 0 && <p className="text-faint px-1">Abhi koi package nahi hai.</p>}
      </div>

      {!readOnly && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            onAdd(name.trim(), version.trim())
            setName(''); setVersion('')
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="package naam (jaise axios)" className="flex-1 min-w-0 bg-raise border border-edge rounded-md px-2 py-1 text-body outline-none" />
          <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="version (khaali = auto)" className="w-32 bg-raise border border-edge rounded-md px-2 py-1 text-body outline-none" />
          <button type="submit" disabled={busy} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold">
            <Plus size={12} /> Jodo
          </button>
        </form>
      )}

      <p className="px-1 text-faint">
        npm install khud hota hai: package.json badalte hi preview packages dobara install karke chalta hai. Pehli baar 20–40 second lag sakte hain.
      </p>
      {notes && notes.length > 0 && (
        <div className="px-1 text-faint">
          {notes.map((n, i) => <div key={i}>• Preview: {n}</div>)}
        </div>
      )}
    </div>
  )
}
