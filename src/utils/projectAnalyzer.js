// =====================================================================
// Project analyzer — project ko samajhta hai:
// type (React/Vite ya simple Web), entry file, packages, aur kya kya missing hai.
// Ye sab browser me hi chalta hai (koi server nahi chahiye).
// =====================================================================

export const CODE_EXT = /\.(jsx?|tsx?|mjs|cjs)$/i
const RESOLVE_TRY = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.json', '.css', '/index.js', '/index.jsx', '/index.ts', '/index.tsx']

// Common packages ke safe versions (baaki ke liye "latest")
export const KNOWN_VERSIONS = {
  react: '^18.3.1',
  'react-dom': '^18.3.1',
  'react-router-dom': '^6.27.0',
  'lucide-react': '^0.453.0',
  firebase: '^10.14.1',
  jszip: '^3.10.1',
  axios: '^1.7.7',
  clsx: '^2.1.1',
  'date-fns': '^3.6.0',
  'react-icons': '^5.3.0',
  '@monaco-editor/react': '^4.6.0',
  vite: '^5.4.0',
  '@vitejs/plugin-react': '^4.3.1',
}

export const REACT_NAMES = [
  'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer',
  'useLayoutEffect', 'useId', 'useTransition', 'useDeferredValue', 'useImperativeHandle',
  'createContext', 'forwardRef', 'memo', 'lazy', 'Suspense', 'Fragment', 'StrictMode',
]

// ---------- chhote helpers ----------
export const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
export const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1)

const joinPath = (dir, rel) => {
  const parts = (dir ? dir.split('/') : []).concat(rel.split('/'))
  const out = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

export const relPath = (from, to) => {
  const a = dirOf(from) ? dirOf(from).split('/') : []
  const b = to.split('/')
  let i = 0
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
  const up = a.slice(i).map(() => '..')
  const rest = b.slice(i)
  const r = up.concat(rest).join('/')
  return r.startsWith('.') ? r : './' + r
}

// Comments (aur optional strings) ko spaces se bhar do, line numbers wahi rehte hain
export function blank(code = '', keepStrings = false) {
  let out = ''
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    const d = code[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && code[i] !== '\n') { out += ' '; i++ }
      continue
    }
    if (c === '/' && d === '*') {
      out += '  '; i += 2
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { out += code[i] === '\n' ? '\n' : ' '; i++ }
      if (i < n) { out += '  '; i += 2 }
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      out += q; i++
      while (i < n && code[i] !== q) {
        if (code[i] === '\\') { out += keepStrings ? code[i] + (code[i + 1] || '') : '  '; i += 2; continue }
        if (q !== '`' && code[i] === '\n') break
        out += keepStrings ? code[i] : (code[i] === '\n' ? '\n' : ' ')
        i++
      }
      if (i < n && code[i] === q) { out += q; i++ }
      continue
    }
    out += c; i++
  }
  return out
}

export const lineAt = (text, index) => {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

export function readPackage(files) {
  const raw = files['package.json']
  if (typeof raw !== 'string') return { pkg: null, error: null }
  try { return { pkg: JSON.parse(raw), error: null } } catch (e) { return { pkg: null, error: e.message } }
}

export const allDeps = (pkg) => ({ ...(pkg?.devDependencies || {}), ...(pkg?.dependencies || {}) })

export const packageNameOf = (spec) => {
  const p = spec.split('/')
  return spec.startsWith('@') ? p.slice(0, 2).join('/') : p[0]
}

const isBare = (spec) =>
  !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('@/') && !spec.startsWith('~') &&
  !spec.startsWith('#') && !spec.startsWith('node:') && !spec.startsWith('virtual:') && !/^https?:/.test(spec)

// Import ka asli file path dhoondo. caseMismatch = Linux/production me fail hoga
export function resolveImport(fromPath, spec, files) {
  const clean = spec.split('?')[0].split('#')[0]
  const base = clean.startsWith('/') ? joinPath('', clean) : joinPath(dirOf(fromPath), clean)
  for (const ext of RESOLVE_TRY) if (typeof files[base + ext] === 'string') return { path: base + ext }
  const lowerMap = {}
  for (const k of Object.keys(files)) lowerMap[k.toLowerCase()] = k
  for (const ext of RESOLVE_TRY) {
    const hit = lowerMap[(base + ext).toLowerCase()]
    if (hit) return { path: hit, caseMismatch: true }
  }
  return null
}

// Code se saare imports nikalo (strings/comments ke andar likhe imports ignore hote hain)
export function parseImports(code) {
  const shape = blank(code, false) // strings khaali, positions wahi
  const kept = blank(code, true)   // strings ke saath
  const specAt = (end, len) => kept.slice(end - 1 - len, end - 1)
  const list = []
  const re = /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+([\w$]+))?\s*from\s*['"]([^'"\n]*)['"]/g
  let m
  while ((m = re.exec(shape))) {
    const end = m.index + m[0].length
    const spec = specAt(end, m[4].length)
    const names = []
    if (m[1]) names.push(m[1])
    if (m[2]) m[2].split(',').forEach((x) => { const t = x.trim().replace(/^type\s+/, ''); if (t) names.push(t.split(/\s+as\s+/).pop().trim()) })
    if (m[3]) names.push(m[3])
    list.push({ spec, names, line: lineAt(shape, m.index), start: m.index, end })
  }
  const side = /(^|\n)[ \t]*import\s*['"]([^'"\n]*)['"]/g
  while ((m = side.exec(shape))) {
    const end = m.index + m[0].length
    list.push({ spec: specAt(end, m[2].length), names: [], line: lineAt(shape, m.index + m[1].length), start: m.index, end })
  }
  const dyn = /(?:\bimport|\brequire)\s*\(\s*['"]([^'"\n]*)['"]/g
  while ((m = dyn.exec(shape))) {
    const end = m.index + m[0].length
    list.push({ spec: specAt(end, m[1].length), names: [], line: lineAt(shape, m.index), start: m.index, end, dynamic: true })
  }
  return list
}

// File me kaun kaun se naam defined / imported hain (thoda zyada, taaki galat alarm na aaye)
export function declaredNames(code) {
  const src = blank(code, false)
  const set = new Set()
  parseImports(code).forEach((i) => i.names.forEach((n) => set.add(n)))
  let m
  const decl = /\b(?:const|let|var|function\*?|class)\s+([\w$]+)/g
  while ((m = decl.exec(src))) set.add(m[1])
  const destr = /\b(?:const|let|var)\s*[{[]([^=;]*?)[}\]]\s*=/g
  while ((m = destr.exec(src))) (m[1].match(/[\w$]+/g) || []).forEach((n) => set.add(n))
  const params = /(?:function\s*[\w$]*\s*|\b)\(([^()]*)\)\s*(?:=>|\{)/g
  while ((m = params.exec(src))) (m[1].match(/[\w$]+/g) || []).forEach((n) => set.add(n))
  const single = /([\w$]+)\s*=>/g
  while ((m = single.exec(src))) set.add(m[1])
  const catchP = /catch\s*\(\s*([\w$]+)/g
  while ((m = catchP.exec(src))) set.add(m[1])
  return set
}

// Kaun si file kaun sa component export karti hai
export function findComponentFile(name, files, fromPath) {
  const entries = Object.keys(files).filter((p) => CODE_EXT.test(p) && p !== fromPath)
  const byName = entries.find((p) => baseOf(p).replace(/\.[^.]+$/, '') === name)
  const hasDefault = (code) => /export\s+default\b/.test(code)
  const hasNamed = (code) => new RegExp('export\\s+(?:const|function|class)\\s+' + name + '\\b').test(code) ||
    new RegExp('export\\s*\\{[^}]*\\b' + name + '\\b[^}]*\\}').test(code)
  if (byName) {
    const code = files[byName]
    if (hasNamed(code) && !hasDefault(code)) return { path: byName, isDefault: false }
    return { path: byName, isDefault: true }
  }
  for (const p of entries) {
    const code = files[p]
    if (new RegExp('export\\s+default\\s+(?:function|class)\\s+' + name + '\\b').test(code)) return { path: p, isDefault: true }
    if (hasNamed(code)) return { path: p, isDefault: false }
  }
  return null
}

// ---------- Project analysis ----------
export function analyzeProject(files) {
  const paths = Object.keys(files)
  const { pkg, error: pkgError } = readPackage(files)
  const deps = allDeps(pkg)
  const hasJsx = paths.some((p) => /\.(jsx|tsx)$/i.test(p))
  const usesReact = !!deps.react || hasJsx
  const usesVite = !!deps.vite || paths.some((p) => /(^|\/)vite\.config\.(js|ts|mjs)$/i.test(p))
  const usesTailwind = !!deps.tailwindcss
  const usesTypescript = paths.some((p) => /\.tsx?$/i.test(p))
  const htmlKey = files['index.html'] !== undefined ? 'index.html' : paths.find((p) => /\.html?$/i.test(p)) || null
  const html = htmlKey ? files[htmlKey] : ''
  const moduleScript = /<script[^>]+type=["']module["'][^>]*src=["']([^"']+)["']/i.exec(html) ||
    /<script[^>]+src=["']([^"']+)["'][^>]*type=["']module["']/i.exec(html)

  let entry = null
  if (moduleScript) {
    const hit = resolveImport(htmlKey || 'index.html', moduleScript[1], files)
    entry = hit ? hit.path : null
  }
  if (!entry) {
    entry = ['src/main.jsx', 'src/main.tsx', 'src/index.jsx', 'src/index.tsx', 'src/main.js', 'src/index.js', 'main.jsx', 'index.jsx'].find((p) => files[p] !== undefined) || null
  }

  // Preview kaise chalega
  const needsBundler = usesReact || usesVite || !!moduleScript || (!!pkg && !!deps.react)
  const runtime = needsBundler ? 'sandpack' : 'static'
  const kind = usesReact && usesVite ? 'React + Vite' : usesReact ? 'React' : usesVite ? 'Vite' : moduleScript ? 'JS modules' : 'HTML / CSS / JS'

  return {
    runtime, kind,
    type: needsBundler ? 'react' : 'web',
    entry, htmlKey, hasPackage: !!pkg, pkg, pkgError, deps,
    usesReact, usesVite, usesTailwind, usesTypescript,
    fileCount: paths.length,
  }
}

// ---------- Code scan: errors jo build/preview me aayenge ----------
// Har issue: { id, path, line, level, kind, title, why, fix }
export function scanProject(files, analysis = analyzeProject(files)) {
  const issues = []
  const deps = analysis.deps
  const hasPkg = analysis.hasPackage
  let n = 0
  const add = (o) => issues.push({ id: 'i' + n++, level: 'error', fix: null, ...o })

  for (const path of Object.keys(files)) {
    if (!CODE_EXT.test(path)) continue
    const code = files[path] || ''
    const src = blank(code, false)
    const declared = declaredNames(code)
    const imports = parseImports(code)

    // 1) React hooks / helpers import nahi kiye
    const reactSeen = new Set()
    for (const name of REACT_NAMES) {
      if (declared.has(name)) continue
      const isTag = name === 'Suspense' || name === 'Fragment' || name === 'StrictMode'
      const re = isTag
        ? new RegExp('<' + name + '[\\s>/]', 'g')
        : new RegExp('(^|[^\\w$.])' + name + '\\s*(?:<[^>()]*>)?\\(', 'g')
      const m = re.exec(src)
      if (m && !reactSeen.has(name)) {
        reactSeen.add(name)
        add({
          path, line: lineAt(src, m.index + (isTag ? 0 : m[1].length)), kind: 'missing-react-import', name,
          title: name + ' define nahi hai',
          why: `Is file me "${name}" use hua hai, par React se import nahi kiya. Fix: file ke upar import line jodna.`,
          fix: { kind: 'add-react-import', name, label: `import { ${name} } from 'react' jodo` },
        })
      }
    }
    if (!declared.has('React') && /(^|[^\w$.])React\./.test(src)) {
      const m = /(^|[^\w$.])React\./.exec(src)
      add({
        path, line: lineAt(src, m.index + m[1].length), kind: 'missing-react-default', name: 'React',
        title: 'React define nahi hai',
        why: 'Code me "React." use hua hai par React import nahi hai.',
        fix: { kind: 'add-react-default', label: "import React from 'react' jodo" },
      })
    }

    // 2) Component (JSX tag) import nahi kiya
    if (/\.(jsx|tsx|js)$/i.test(path)) {
      const tagRe = /<([A-Z][\w$]*)[\s/>.]/g
      const seenTag = new Set()
      let t
      while ((t = tagRe.exec(src))) {
        const name = t[1]
        if (seenTag.has(name) || declared.has(name) || REACT_NAMES.includes(name)) continue
        seenTag.add(name)
        const found = findComponentFile(name, files, path)
        add({
          path, line: lineAt(src, t.index), kind: 'undefined-component', name,
          title: '<' + name + '> define nahi hai',
          why: found
            ? `Component "${name}" project me "${found.path}" file me mil gaya, bas is file me import karna baaki hai.`
            : `Component "${name}" na import hua hai na project me kahin mila. File banao ya sahi naam likho.`,
          fix: found
            ? { kind: 'add-component-import', name, from: found.path, isDefault: found.isDefault, label: `${name} ko import karo` }
            : null,
        })
      }
    }

    // 3) Imports: file / package missing
    for (const imp of imports) {
      const spec = imp.spec
      if (!isBare(spec)) {
        if (spec.startsWith('@/') || spec.startsWith('~') || spec.startsWith('#') || spec.startsWith('node:') || spec.startsWith('virtual:') || /^https?:/.test(spec)) continue
        const hit = resolveImport(path, spec, files)
        if (!hit) {
          const target = joinPath(dirOf(path), spec.split('?')[0])
          const makeable = /\.(jsx?|tsx?|css)$/i.test(target) || !/\.[a-z0-9]+$/i.test(baseOf(target))
          const finalPath = /\.[a-z0-9]+$/i.test(baseOf(target)) ? target : target + (analysis.usesTypescript ? '.tsx' : '.jsx')
          add({
            path, line: imp.line, kind: 'missing-file', name: spec,
            title: `File nahi mili: ${spec}`,
            why: `Import "${spec}" ke liye "${finalPath}" project me nahi hai. File banao, ya import ka naam/path sahi karo.`,
            fix: makeable && !spec.startsWith('/') ? { kind: 'create-file', path: finalPath, label: `${finalPath} file banao` } : null,
          })
        } else if (hit.caseMismatch) {
          add({
            path, line: imp.line, kind: 'case-mismatch', level: 'warn', name: spec,
            title: `Capital/small letter mismatch: ${spec}`,
            why: `Import "${spec}" aur asli file "${hit.path}" ke case alag hain. Windows/preview me chal jayega par Linux hosting (production build) me fail hoga.`,
            fix: { kind: 'fix-case', spec, actual: hit.path, label: 'Import ka naam sahi karo' },
          })
        }
      } else if (hasPkg || analysis.runtime === 'sandpack') {
        const pkgName = packageNameOf(spec)
        if (!deps[pkgName]) {
          const dupe = issues.find((x) => x.kind === 'missing-dep' && x.name === pkgName)
          if (!dupe) {
            add({
              path, line: imp.line, kind: 'missing-dep', name: pkgName,
              title: `Package missing: ${pkgName}`,
              why: `Code "${pkgName}" use karta hai par package.json me nahi hai. Add karne par preview apne aap install kar lega.`,
              fix: { kind: 'add-dep', pkg: pkgName, version: KNOWN_VERSIONS[pkgName] || 'latest', label: `${pkgName} package.json me jodo` },
            })
          }
        }
      }
    }
  }
  return issues
}

// ---------- Production build pre-check ----------
export function buildCheck(files, analysis = analyzeProject(files), issues = scanProject(files, analysis)) {
  const out = []
  const ok = (text) => out.push({ level: 'ok', text })
  const err = (text, extra = {}) => out.push({ level: 'error', text, ...extra })
  const warn = (text, extra = {}) => out.push({ level: 'warn', text, ...extra })

  if (analysis.runtime === 'static') {
    ok('Simple HTML/CSS/JS project — build ki zaroorat nahi.')
    if (!analysis.htmlKey) err('index.html file nahi mili.')
    else ok(analysis.htmlKey + ' mil gayi.')
    issues.filter((i) => i.kind === 'missing-file').forEach((i) => err(i.title, { path: i.path, line: i.line }))
    return out
  }

  if (analysis.pkgError) err('package.json me JSON galti hai: ' + analysis.pkgError, { path: 'package.json' })
  else if (!analysis.hasPackage) err('package.json nahi hai. Production build ke liye zaroori hai (Packages tab se bana sakte ho).', { path: 'package.json' })
  else {
    ok('package.json theek hai.')
    if (!analysis.pkg.scripts?.build) warn('package.json me "build" script nahi hai (npm run build nahi chalega).', { path: 'package.json' })
    else ok('build script mila: ' + analysis.pkg.scripts.build)
    if (analysis.usesReact && !analysis.deps.react) err('react package.json me nahi hai.', { path: 'package.json' })
    if (analysis.usesReact && !analysis.deps['react-dom']) err('react-dom package.json me nahi hai.', { path: 'package.json' })
    if (analysis.usesTypescript && !analysis.deps.typescript) warn('TypeScript files hain par typescript package nahi hai.', { path: 'package.json' })
    const v = String(analysis.deps.vite || '')
    const major = parseInt(v.replace(/[^\d]/g, '').slice(0, 2), 10)
    if (major >= 6) warn('Aapka vite ' + v + ' hai. Preview me vite 5 chalta hai, production build aapke version se hoga — dono me thoda farq ho sakta hai.')
  }

  if (!files['index.html']) err('Root me index.html nahi hai (Vite ko chahiye).', { path: 'index.html' })
  else ok('index.html mili.')
  if (!analysis.entry) err('Entry file (jaise src/main.jsx) nahi mili. index.html me <script type="module" src="..."> check karo.')
  else ok('Entry file: ' + analysis.entry)
  if (analysis.usesVite && !Object.keys(files).some((p) => /^vite\.config\.(js|ts|mjs)$/.test(p))) warn('vite.config file nahi hai — preview me default config use hoga.')

  const blockers = issues.filter((i) => i.level === 'error')
  if (blockers.length === 0) ok('Saare imports aur packages resolve ho rahe hain.')
  blockers.forEach((i) => err(i.title, { path: i.path, line: i.line }))
  issues.filter((i) => i.level === 'warn').forEach((i) => warn(i.title, { path: i.path, line: i.line }))
  return out
}

// ---------- Preview ke liye files taiyaar karo ----------
// Missing zaroori files bana deta hai aur vite version ko preview-safe karta hai (aapki asli files nahi badalti)
export function makePreviewFiles(files, analysis = analyzeProject(files)) {
  const out = { ...files }
  const notes = []
  let pkg = analysis.pkg ? JSON.parse(JSON.stringify(analysis.pkg)) : null
  if (!pkg) {
    pkg = { name: 'preview-app', private: true, version: '0.0.0', type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: {}, devDependencies: {} }
    notes.push('package.json nahi mila, preview ke liye temporary bana diya.')
  }
  pkg.type = pkg.type || 'module'
  pkg.scripts = { ...(pkg.scripts || {}), dev: 'vite' }
  pkg.dependencies = pkg.dependencies || {}
  pkg.devDependencies = pkg.devDependencies || {}
  const need = (name, ver, bucket) => {
    if (!pkg.dependencies[name] && !pkg.devDependencies[name]) { pkg[bucket][name] = ver; notes.push(name + ' temporary add kiya (preview ke liye).') }
  }
  if (analysis.usesReact) { need('react', KNOWN_VERSIONS.react, 'dependencies'); need('react-dom', KNOWN_VERSIONS['react-dom'], 'dependencies') }
  need('vite', KNOWN_VERSIONS.vite, 'devDependencies')
  if (analysis.usesReact) need('@vitejs/plugin-react', KNOWN_VERSIONS['@vitejs/plugin-react'], 'devDependencies')
  // Preview runtime vite 5 tak stable hai
  for (const bucket of ['dependencies', 'devDependencies']) {
    const v = pkg[bucket].vite
    if (v && parseInt(String(v).replace(/[^\d]/g, '').slice(0, 2), 10) >= 6) { pkg[bucket].vite = KNOWN_VERSIONS.vite }
    const pr = pkg[bucket]['@vitejs/plugin-react']
    if (pr && parseInt(String(pr).replace(/[^\d]/g, '').slice(0, 1), 10) >= 5) { pkg[bucket]['@vitejs/plugin-react'] = KNOWN_VERSIONS['@vitejs/plugin-react'] }
  }
  out['package.json'] = JSON.stringify(pkg, null, 2)

  const hasConfig = Object.keys(out).some((p) => /^vite\.config\.(js|ts|mjs)$/.test(p))
  if (!hasConfig) {
    out['vite.config.js'] = analysis.usesReact
      ? "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })\n"
      : "import { defineConfig } from 'vite'\nexport default defineConfig({})\n"
    notes.push('vite.config nahi mila, preview ke liye default bana diya.')
  }
  if (!out['index.html'] && analysis.entry) {
    out['index.html'] = `<!DOCTYPE html>\n<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><div id="root"></div><script type="module" src="/${analysis.entry}"></script></body></html>\n`
    notes.push('index.html nahi mili, preview ke liye bana di.')
  }
  return { files: out, notes, depsKey: JSON.stringify([pkg.dependencies, pkg.devDependencies]) }
}
