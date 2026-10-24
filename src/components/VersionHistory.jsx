import { useCallback, useEffect, useState } from 'react'
import { History, X, RotateCcw, Trash2, Save, Loader2 } from 'lucide-react'
import { createVersion, listVersions, restoreVersion, deleteVersion } from '../services/projectService'

const fmtTime = (ts) => {
  try {
    return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const errText = (e) => {
  if (e?.message === 'VERSION_TOO_BIG') return 'Project bahut bada hai, version save nahi ho sakta.'
  if (e?.message === 'VERSION_NOT_FOUND') return 'Ye version ab mojood nahi hai.'
  return (e?.code ? '[' + e.code + '] ' : '') + (e?.message || 'Unknown error')
}

export default function VersionHistory({ projectId, user, files, folders, onBeforeAction, onRestored, onClose }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('') // 'save' ya version id
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setVersions(await listVersions(projectId))
      setError('')
    } catch (e) {
      console.error('Versions load failed:', e)
      setError(errText(e))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const saveVersion = async () => {
    if (busyId) return
    setBusyId('save')
    setError('')
    try {
      await onBeforeAction?.()
      await createVersion(projectId, user, files, folders, label.trim(), false)
      setLabel('')
      await load()
    } catch (e) {
      console.error('Version save failed:', e)
      setError(errText(e))
    } finally {
      setBusyId('')
    }
  }

  const restore = async (v) => {
    if (busyId) return
    const ok = window.confirm(
      `"${v.label || fmtTime(v.createdAt)}" wala version wapis laana hai?\n\nAbhi ka code pehle backup ho jaayega, to koi kaam nahi khoyega.`
    )
    if (!ok) return
    setBusyId(v.id)
    setError('')
    try {
      await onBeforeAction?.()
      const result = await restoreVersion(projectId, v.id, user)
      onRestored?.(result)
      onClose?.()
    } catch (e) {
      console.error('Restore failed:', e)
      setError(errText(e))
      setBusyId('')
    }
  }

  const remove = async (v) => {
    if (busyId) return
    if (!window.confirm('Ye version hamesha ke liye delete karna hai?')) return
    setBusyId(v.id)
    try {
      await deleteVersion(projectId, v.id)
      await load()
    } catch (e) {
      console.error('Version delete failed:', e)
      setError(errText(e))
    } finally {
      setBusyId('')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4 py-6"
      onClick={(e) => { if (e.target === e.currentTarget && !busyId) onClose?.() }}
    >
      <div className="w-full max-w-lg max-h-full flex flex-col bg-surface border border-edge rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge">
          <h2 className="flex items-center gap-2 text-base font-bold text-body">
            <History size={18} className="text-blue-400" /> Version History
          </h2>
          <button type="button" onClick={onClose} disabled={!!busyId} aria-label="Close" className="p-1.5 rounded-lg text-mute hover:text-body hover:bg-raise transition disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        {/* Naya version save */}
        <div className="px-5 py-3 border-b border-edge">
          <p className="text-xs text-mute mb-2">Abhi ke code ka snapshot save karo (baad me wapis la sakte ho):</p>
          <div className="flex gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder="Naam (optional) — jaise: Navbar ban gaya"
              className="flex-1 min-w-0 bg-raise border border-edge rounded-lg px-3 py-2 text-sm text-body placeholder-faint focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={saveVersion}
              disabled={!!busyId}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition shrink-0"
            >
              {busyId === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 break-words">
            {error}
            {error.includes('permission') && (
              <p className="mt-1 text-amber-300">Firebase Rules me naya <b>firestore.rules</b> paste karke Publish karo.</p>
            )}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" size={26} /></div>
          ) : versions.length === 0 ? (
            <p className="text-center text-faint text-sm py-10 px-4">
              Abhi koi version nahi hai. Upar "Save" dabao, ya editor me kuch badlo — pehla edit karte hi auto-backup ban jaayega.
            </p>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-raise/60 transition">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-body truncate">
                    {v.label || (v.auto ? 'Auto backup' : 'Version')}
                    {v.auto && <span className="ml-2 text-[10px] font-bold uppercase text-faint bg-raise px-1.5 py-0.5 rounded">auto</span>}
                  </p>
                  <p className="text-xs text-faint truncate">
                    {fmtTime(v.createdAt)} · {v.createdBy || 'User'} · {v.fileCount ?? '?'} files
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restore(v)}
                  disabled={!!busyId}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 transition shrink-0"
                >
                  {busyId === v.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => remove(v)}
                  disabled={!!busyId}
                  title="Version delete"
                  className="p-1.5 rounded-lg text-faint hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
