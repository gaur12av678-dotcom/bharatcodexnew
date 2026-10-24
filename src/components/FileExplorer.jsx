import { useMemo, useState } from 'react'
import {
  ChevronRight, ChevronDown, FileCode2, FilePlus2, Folder,
  FolderPlus, Pencil, Trash2,
} from 'lucide-react'

export default function FileExplorer({
  files, folders, active, readOnly,
  onSelect, onCreateFile, onCreateFolder,
  onRenameFile, onDeleteFile, onRenameFolder, onDeleteFolder,
}) {
  const [open, setOpen] = useState(() => new Set(['']))
  const [creating, setCreating] = useState(null) // { kind, folder }
  const [renaming, setRenaming] = useState(null) // { kind, file?, oldPath?, folder }
  const [value, setValue] = useState('')

  const toggleOpen = (path) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const tree = useMemo(() => {
    const root = { children: {} }
    const ensure = (path) => {
      if (!path) return root
      let node = root
      let cur = ''
      for (const part of path.split('/')) {
        cur = cur ? cur + '/' + part : part
        node.children[part] = node.children[part] || { type: 'folder', path: cur, children: {} }
        node = node.children[part]
      }
      return node
    }
    ;[...folders].sort().forEach(ensure)
    for (const f of files) {
      const parent = ensure(f.folder || '')
      parent.children[f.name] = { type: 'file', file: f }
    }
    return root
  }, [files, folders])

  const startCreate = (kind, folder = '') => {
    setCreating({ kind, folder })
    setRenaming(null)
    setValue('')
    if (folder) setOpen((p) => new Set(p).add(folder))
  }
  const startRename = (kind, data) => {
    setRenaming({ kind, ...data })
    setCreating(null)
    setValue(kind === 'file' ? data.file.name : data.oldPath.split('/').pop())
  }

  const submit = () => {
    const v = value.trim().replace(/^\/+|\/+$/g, '')
    if (v && !v.includes('/')) {
      if (renaming) {
        if (renaming.kind === 'file') onRenameFile(renaming.file, v)
        else {
          const parent = renaming.oldPath.split('/').slice(0, -1).join('/')
          onRenameFolder(renaming.oldPath, parent ? parent + '/' + v : v)
        }
      } else if (creating) {
        if (creating.kind === 'file') onCreateFile(v, creating.folder || '')
        else onCreateFolder(creating.folder ? creating.folder + '/' + v : v)
      }
    }
    setCreating(null)
    setRenaming(null)
    setValue('')
  }

  const inputRow = (depth) => (
    <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: 8 + depth * 14 }}>
      {creating?.kind === 'folder' || renaming?.kind === 'folder' ? <Folder size={14} className="text-faint shrink-0" /> : <FileCode2 size={14} className="text-faint shrink-0" />}
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') { setCreating(null); setRenaming(null); setValue('') }
        }}
        onBlur={submit}
        className="w-full bg-raise border border-blue-500 rounded px-1.5 py-0.5 text-xs text-body focus:outline-none"
      />
    </div>
  )

  const renderNode = (node, depth, parentPath) => {
    const entries = Object.entries(node.children).sort((a, b) => {
      const fa = a[1].type === 'folder' ? 0 : 1
      const fb = b[1].type === 'folder' ? 0 : 1
      return fa - fb || a[0].localeCompare(b[0])
    })

    return entries.map(([name, child]) => {
      if (child.type === 'folder') {
        const isOpen = open.has(child.path)
        return (
          <div key={child.path}>
            <div
              className="group flex items-center gap-1 pr-1 rounded-md hover:bg-raise cursor-pointer"
              style={{ paddingLeft: 4 + depth * 14 }}
              onClick={() => toggleOpen(child.path)}
            >
              {isOpen ? <ChevronDown size={13} className="text-faint shrink-0" /> : <ChevronRight size={13} className="text-faint shrink-0" />}
              <Folder size={14} className="text-amber-400 shrink-0" />
              <span className="text-xs text-body truncate flex-1">{name}</span>
              {!readOnly && (
                <span className="hidden group-hover:flex items-center shrink-0">
                  <button type="button" title="New file here" className="p-1 rounded text-faint hover:text-body" onClick={(e) => { e.stopPropagation(); startCreate('file', child.path) }}><FilePlus2 size={11} /></button>
                  <button type="button" title="New folder here" className="p-1 rounded text-faint hover:text-body" onClick={(e) => { e.stopPropagation(); startCreate('folder', child.path) }}><FolderPlus size={11} /></button>
                  <button type="button" title="Rename folder" className="p-1 rounded text-faint hover:text-body" onClick={(e) => { e.stopPropagation(); startRename('folder', { oldPath: child.path }) }}><Pencil size={11} /></button>
                  <button type="button" title="Delete folder" className="p-1 rounded text-faint hover:text-red-400" onClick={(e) => { e.stopPropagation(); onDeleteFolder(child.path) }}><Trash2 size={11} /></button>
                </span>
              )}
            </div>
            {isOpen && (
              <div>
                {creating?.kind === 'folder' && creating.folder === child.path && inputRow(depth + 1)}
                {creating?.kind === 'file' && creating.folder === child.path && inputRow(depth + 1)}
                {renderNode(child, depth + 1, child.path)}
              </div>
            )}
          </div>
        )
      }

      const f = child.file
      const key = f.folder ? f.folder + '/' + f.name : f.name
      const isRenaming = renaming?.kind === 'file' && renaming.file === f
      return (
        <div key={key}>
          <div
            className={`group flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer ${
              active === key ? 'bg-blue-600/15 text-body' : 'text-mute hover:bg-raise'
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => onSelect(key)}
          >
            <FileCode2 size={14} className="shrink-0 text-faint" />
            {isRenaming ? null : <span className="text-xs truncate flex-1">{name}</span>}
            {!readOnly && !isRenaming && (
              <span className="hidden group-hover:flex items-center shrink-0">
                <button type="button" title="Rename" className="p-1 rounded text-faint hover:text-body" onClick={(e) => { e.stopPropagation(); startRename('file', { file: f }) }}><Pencil size={11} /></button>
                <button type="button" title="Delete" className="p-1 rounded text-faint hover:text-red-400" onClick={(e) => { e.stopPropagation(); onDeleteFile(f) }}><Trash2 size={11} /></button>
              </span>
            )}
          </div>
          {isRenaming && inputRow(depth)}
        </div>
      )
    })
  }

  return (
    <div className="h-full flex flex-col bg-surface border-r border-edge min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-edge shrink-0">
        <span className="text-[11px] font-bold text-faint uppercase tracking-widest">Files</span>
        {!readOnly && (
          <span className="flex items-center gap-1">
            <button type="button" title="New file" onClick={() => startCreate('file')} className="p-1 rounded text-faint hover:text-body hover:bg-raise"><FilePlus2 size={14} /></button>
            <button type="button" title="New folder" onClick={() => startCreate('folder')} className="p-1 rounded text-faint hover:text-body hover:bg-raise"><FolderPlus size={14} /></button>
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 min-h-0">
        {creating?.kind === 'file' && creating.folder === '' && inputRow(0)}
        {creating?.kind === 'folder' && creating.folder === '' && inputRow(0)}
        {renderNode(tree, 0, '')}
      </div>
    </div>
  )
}
