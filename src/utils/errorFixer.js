// =====================================================================
// Error fixer — error ko simple Hinglish me samjhata hai aur one-click fix banata hai.
// Fix = "edits" (purani file badlo) + "creates" (nayi file banao). Parent unko Firestore me save karta hai.
// =====================================================================
import { baseOf, dirOf, findComponentFile, relPath, packageNameOf, KNOWN_VERSIONS, REACT_NAMES, resolveImport } from './projectAnalyzer.js'

const IMPORT_LINE = /^[ \t]*import\b[\s\S]*?['"][^'"]+['"];?[ \t]*$/gm

// File me sabse neeche wali import line ke baad text jodo (ya sabse upar)
function insertAfterImports(code, line) {
  let last = null
  let m
  IMPORT_LINE.lastIndex = 0
  while ((m = IMPORT_LINE.exec(code))) last = m
  if (!last) return line + '\n' + code
  const at = last.index + last[0].length
  return code.slice(0, at) + '\n' + line + code.slice(at)
}

function addReactNames(code, names) {
  const re = /import\s+([^'";]*?)\s+from\s+(['"])react\2;?/
  const m = re.exec(code)
  if (!m) return insertAfterImports(code, `import { ${names.join(', ')} } from 'react'`).replace(/^(import \{[^}]*\} from 'react')\n\n/, '$1\n')
  const clause = m[1].trim()
  if (/^\*\s+as\s/.test(clause)) return insertAfterImports(code, `import { ${names.join(', ')} } from 'react'`)
  const brace = /\{([^}]*)\}/.exec(clause)
  let next
  if (brace) {
    const have = brace[1].split(',').map((x) => x.trim()).filter(Boolean)
    const all = [...new Set([...have, ...names])]
    next = clause.replace(/\{[^}]*\}/, `{ ${all.join(', ')} }`)
  } else {
    next = `${clause}, { ${names.join(', ')} }`
  }
  return code.slice(0, m.index) + `import ${next} from 'react'` + code.slice(m.index + m[0].length)
}

function addReactDefault(code) {
  const re = /import\s+\{([^}]*)\}\s+from\s+(['"])react\2/
  const m = re.exec(code)
  if (m) return code.slice(0, m.index) + `import React, {${m[1]}} from 'react'` + code.slice(m.index + m[0].length)
  return insertAfterImports(code, "import React from 'react'")
}

const stubFor = (path) => {
  const name = baseOf(path).replace(/\.[^.]+$/, '')
  if (/\.css$/i.test(path)) return `/* ${name} */\n`
  if (/\.(jsx|tsx)$/i.test(path) && /^[A-Z]/.test(name)) {
    return `export default function ${name.replace(/[^\w$]/g, '')}() {\n  return <div>${name}</div>\n}\n`
  }
  return `export {}\n`
}

// Ek fix ko working copy (map path -> content) par lagao
function applyOne(issue, work, created) {
  const f = issue.fix
  if (!f) return
  const path = issue.path
  if (f.kind === 'add-react-import') {
    work[path] = addReactNames(work[path], [f.name])
  } else if (f.kind === 'add-react-default') {
    work[path] = addReactDefault(work[path])
  } else if (f.kind === 'add-component-import') {
    const spec = relPath(path, f.from)
    const line = f.isDefault ? `import ${f.name} from '${spec}'` : `import { ${f.name} } from '${spec}'`
    work[path] = insertAfterImports(work[path], line)
  } else if (f.kind === 'add-dep') {
    let pkg
    try { pkg = JSON.parse(work['package.json']) } catch { pkg = { name: 'app', private: true, version: '0.0.0', type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: {}, devDependencies: {} } }
    pkg.dependencies = pkg.dependencies || {}
    pkg.dependencies[f.pkg] = f.version || KNOWN_VERSIONS[f.pkg] || 'latest'
    pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)))
    if (work['package.json'] === undefined) created.add('package.json')
    work['package.json'] = JSON.stringify(pkg, null, 2) + '\n'
  } else if (f.kind === 'create-file') {
    if (work[f.path] === undefined) { work[f.path] = stubFor(f.path); created.add(f.path) }
  } else if (f.kind === 'fix-case') {
    const code = work[path]
    const target = f.actual
    const newSpec = f.spec.startsWith('.') ? relPath(path, target) : '/' + target
    const esc = f.spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    work[path] = code.replace(new RegExp(`(['"])${esc}\\1`, 'g'), `$1${newSpec.replace(/\.(jsx?|tsx?)$/i, (x) => (f.spec.endsWith(x) ? x : ''))}$1`)
  }
}

// Issues ki list ke fix lagao. Return: { edits: [{path, content}], creates: [{path, content}] }
export function applyFixes(issues, files) {
  const work = { ...files }
  const created = new Set()
  const touched = new Set()
  for (const issue of issues) {
    if (!issue.fix) continue
    const before = issue.fix.kind === 'create-file' ? null : work[issue.path]
    applyOne(issue, work, created)
    touched.add(issue.fix.kind === 'create-file' ? issue.fix.path : issue.fix.kind === 'add-dep' ? 'package.json' : issue.path)
    void before
  }
  const edits = []
  const creates = []
  for (const p of touched) {
    if (work[p] === files[p]) continue
    if (created.has(p) || files[p] === undefined) creates.push({ path: p, content: work[p] })
    else edits.push({ path: p, content: work[p] })
  }
  return { edits, creates }
}

// Package ko package.json me jodna (Packages tab ke liye)
export function addDependencyEdits(files, pkgName, version) {
  const name = packageNameOf(pkgName.trim())
  if (!name) return { edits: [], creates: [] }
  return applyFixes([{ path: 'package.json', fix: { kind: 'add-dep', pkg: name, version: (version || '').trim() || KNOWN_VERSIONS[name] || 'latest' } }], files)
}

export function removeDependencyEdits(files, pkgName) {
  let pkg
  try { pkg = JSON.parse(files['package.json']) } catch { return { edits: [], creates: [] } }
  delete (pkg.dependencies || {})[pkgName]
  delete (pkg.devDependencies || {})[pkgName]
  return { edits: [{ path: 'package.json', content: JSON.stringify(pkg, null, 2) + '\n' }], creates: [] }
}

// ---------------------------------------------------------------------
// Runtime / build error (preview se aaya) ko samjhao
// err = { message, title?, path?, line? }
// Return: { title, why, path, line, fix } — fix wahi format jo scanProject deta hai (issue jaisa)
// ---------------------------------------------------------------------
export function explainRuntimeError(err, files) {
  const msg = String(err?.message || err?.title || '').trim()
  const path = err?.path ? String(err.path).replace(/^\//, '') : null
  const line = err?.line || null
  const base = { path, line, message: msg }

  let m = /([\w$]+) is not defined/.exec(msg)
  if (m) {
    const name = m[1]
    const target = path && files[path] !== undefined ? path : Object.keys(files).find((p) => new RegExp('(^|[^\\w$.])' + name + '\\b').test(files[p] || '') && /\.(jsx?|tsx?)$/i.test(p))
    if (REACT_NAMES.includes(name) && target) {
      return { ...base, path: target, title: `${name} define nahi hai`, why: `Aapne "${name}" use kiya hai par React se import nahi kiya. Jaise bina saman ke khana banana — pehle import karna padta hai.`, fix: { kind: 'add-react-import', name, label: `import { ${name} } from 'react' jodo` } }
    }
    if (name === 'React' && target) {
      return { ...base, path: target, title: 'React define nahi hai', why: 'Code me React use hua hai par import nahi hai.', fix: { kind: 'add-react-default', label: "import React from 'react' jodo" } }
    }
    const found = target ? findComponentFile(name, files, target) : null
    if (found && target) {
      return { ...base, path: target, title: `${name} define nahi hai`, why: `"${name}" "${found.path}" me hai, par is file me import nahi hua.`, fix: { kind: 'add-component-import', name, from: found.path, isDefault: found.isDefault, label: `${name} ko import karo` } }
    }
    return { ...base, title: `${name} define nahi hai`, why: `"${name}" naam ka variable/component kahin banaya ya import nahi kiya. Spelling check karo, ya import jodo.`, fix: null }
  }

  m = /Failed to resolve import ["']([^"']+)["'](?: from ["']([^"']+)["'])?/i.exec(msg) ||
      /Cannot find module ["']([^"']+)["']/i.exec(msg) ||
      /Could not resolve ["']([^"']+)["']/i.exec(msg) ||
      /Module not found.*?["']([^"']+)["']/i.exec(msg)
  if (m) {
    const spec = m[1]
    const from = (m[2] ? m[2].replace(/^\//, '') : path) || ''
    if (spec.startsWith('.')) {
      const finalPath = from ? relPathTarget(from, spec) : spec
      return { ...base, path: from || path, title: `File nahi mili: ${spec}`, why: `Import "${spec}" ki file project me nahi hai. File banao ya path sahi karo.`, fix: from ? { kind: 'create-file', path: finalPath, label: `${finalPath} file banao` } : null }
    }
    const pkg = packageNameOf(spec)
    return { ...base, path: 'package.json', title: `Package missing: ${pkg}`, why: `"${pkg}" package.json me nahi hai. Jodne par preview khud install kar lega.`, fix: { kind: 'add-dep', pkg, version: KNOWN_VERSIONS[pkg] || 'latest', label: `${pkg} jodo` } }
  }

  if (/Element type is invalid|Objects are not valid as a React child/i.test(msg)) {
    return { ...base, title: 'Component galat import/export hua', why: 'Aksar "export default" aur "{ naam }" import ka mismatch hota hai. Check karo: default export ho to bina { } ke import karo, named export ho to { } ke saath.', fix: null }
  }
  if (/Invalid hook call/i.test(msg)) {
    return { ...base, title: 'Hook galat jagah use hua', why: 'useState/useEffect jaise hooks sirf component function ke andar (sabse upar) chalte hain — if, loop ya normal function ke andar nahi.', fix: null }
  }
  if (/Cannot read propert(?:y|ies) of (undefined|null)/i.test(msg)) {
    return { ...base, title: 'Khaali (undefined) cheez ko khola', why: 'Kisi variable me abhi data nahi hai aur code uske andar ki cheez padh raha hai. Pehle check lagao, jaise user?.name ya data && data.name.', fix: null }
  }
  if (/Unexpected token|Unterminated|Unexpected end|Expected|Parse error|SyntaxError|Adjacent JSX/i.test(msg)) {
    return { ...base, title: 'Code likhne me galti (syntax)', why: 'Koi bracket ), } ya quote band nahi hua, ya JSX me do tag ek saath bina <>...</> ke hain. Bataye gaye line ke aas-paas dekho.', fix: null }
  }
  if (/is not a function/i.test(msg)) {
    return { ...base, title: 'Function nahi mila', why: 'Jis naam ko function ki tarah chalaya, wo function nahi hai (galat import ya spelling).', fix: null }
  }
  return { ...base, title: msg ? msg.slice(0, 120) : 'Unknown error', why: 'Is error ka auto-fix nahi hai. "Copy" karke Claude ko bhej do.', fix: null }
}

function relPathTarget(from, spec) {
  const parts = (dirOf(from) ? dirOf(from).split('/') : []).concat(spec.split('/'))
  const out = []
  for (const p of parts) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p) }
  const joined = out.join('/')
  return /\.[a-z0-9]+$/i.test(baseOf(joined)) ? joined : joined + '.jsx'
}

export { resolveImport }
