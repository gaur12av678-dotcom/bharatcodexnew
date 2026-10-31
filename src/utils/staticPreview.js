// Simple HTML/CSS/JS projects ke liye multi-page preview.
// Problem: preview ek srcDoc iframe hai (blob/about:srcdoc). Usme dusra page kholne ya search karne par
// browser "about:srcdoc" ke relative URL par chala jata tha -> white screen.
// Fix: links, forms, location.href, window.open sab ko parent ko bhejte hain, parent project ki
// dusri HTML file se naya srcDoc banata hai (virtual router).

const BASE = 'https://preview.local/'

const escapeScript = (code = '') => code.replace(/<\/script/gi, '<\\/script')

// Console capture — user code ke logs parent ko bhejta hai
export const CONSOLE_HOOK = `<script>
(function () {
  var send = function (level, args) {
    var text = args.map(function (a) {
      if (typeof a === 'object' && a !== null) { try { return JSON.stringify(a) } catch (e) { return String(a) } }
      return String(a)
    }).join(' ')
    try { parent.postMessage({ __bc: true, level: level, text: text }, '*') } catch (e) {}
  }
  ;['log', 'info', 'warn', 'error'].forEach(function (level) {
    var orig = console[level]
    console[level] = function () { send(level, Array.prototype.slice.call(arguments)); orig.apply(console, arguments) }
  })
  window.onerror = function (msg, src, line) { send('error', [msg + ' (line ' + line + ')']) }
  window.addEventListener('unhandledrejection', function (e) { send('error', ['Promise error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)]) })
})()
<\/script>`

const pick = (files, regex) => Object.keys(files).filter((k) => regex.test(k)).sort()

export const htmlKeys = (files) => Object.keys(files).filter((k) => /\.html?$/i.test(k))

// Pehla page: sabse upar wali index.html, nahi to koi bhi .html
export function pickEntry(files) {
  const depth = (k) => k.split('/').length
  const byDepth = (a, b) => depth(a) - depth(b) || a.localeCompare(b)
  const idx = pick(files, /(^|\/)index\.html?$/i).sort(byDepth)[0]
  return idx || htmlKeys(files).sort(byDepth)[0] || null
}

// NOTE: resolveTarget bilkul self-contained rakhna — ise new-tab wrapper me toString() karke daalte hain.
export function resolveTarget(href, from, keys) {
  var u
  try { u = new URL(href, 'https://preview.local/' + from) } catch (e) { return { type: 'missing', file: null, missing: String(href), search: '', hash: '' } }
  if (u.origin !== 'https://preview.local') return { type: 'external', url: u.href }
  var p
  try { p = decodeURIComponent(u.pathname.replace(/^\/+/, '')) } catch (e) { p = u.pathname.replace(/^\/+/, '') }
  var lower = {}
  keys.forEach(function (k) { lower[k.toLowerCase()] = k })
  var cands = []
  if (!p || /\/$/.test(p)) cands = [p + 'index.html', p + 'index.htm']
  else cands = [p, p + '.html', p + '.htm', p + '/index.html']
  for (var i = 0; i < cands.length; i++) {
    var hit = lower[cands[i].toLowerCase()]
    if (hit) return { type: 'page', file: hit, search: u.search, hash: u.hash }
  }
  // /about.html likha ho par file src/about.html me ho
  for (var j = 0; j < cands.length; j++) {
    for (var k = 0; k < keys.length; k++) {
      if (keys[k].toLowerCase().slice(-(cands[j].length + 1)) === '/' + cands[j].toLowerCase()) return { type: 'page', file: keys[k], search: u.search, hash: u.hash }
    }
  }
  return { type: 'missing', file: null, missing: p, search: u.search, hash: u.hash }
}

const isExternal = (h) => /^(https?:)?\/\//i.test(h) || /^(data|blob):/i.test(h)

function findKey(keys, path) {
  const lower = path.toLowerCase()
  const exact = keys.find((k) => k.toLowerCase() === lower)
  if (exact) return exact
  return keys.find((k) => k.toLowerCase().endsWith('/' + lower))
}

function localPath(href, fromFile) {
  try {
    const u = new URL(href, BASE + fromFile)
    return decodeURIComponent(u.pathname.replace(/^\/+/, ''))
  } catch (e) {
    return href
  }
}

// JS me location ka istemal preview ke virtual router se jodta hai
export function rewriteJs(code = '') {
  const PRE = '(?<![\\w$.])(?:(?:window|document|self|top|parent)\\.)?'
  return code
    // location.href = X / window.location = X / document.location = X
    .replace(new RegExp(PRE + 'location\\.href\\s*=(?!=)\\s*([^;\\n}]+)', 'g'), '__bcGo($1)')
    .replace(/(?<![\w$.])(?:window|document|self|top|parent)\.location\s*=(?!=)\s*([^;\n}]+)/g, '__bcGo($1)')
    // location.assign(X) / location.replace(X)
    .replace(new RegExp(PRE + 'location\\.(?:assign|replace)\\(', 'g'), '__bcGo(')
    // location.search / hash / pathname / href padhna
    .replace(new RegExp(PRE + 'location\\.(search|hash|pathname|href|origin|host|hostname|protocol)\\b(?!\\s*=(?!=))', 'g'), '__bcLoc.$1')
}

const shimScript = (routeJson) => `<script>
(function () {
  var R = ${routeJson};
  var BASE = 'https://preview.local/';
  function post(m) { try { parent.postMessage(m, '*') } catch (e) {} }
  var loc = {
    search: R.search || '', hash: R.hash || '', pathname: '/' + (R.path || ''),
    origin: 'https://preview.local', host: 'preview.local', hostname: 'preview.local', protocol: 'https:', port: '',
    href: BASE + (R.path || '') + (R.search || '') + (R.hash || ''),
    toString: function () { return this.href }
  };
  window.__bcLoc = loc;
  window.__bcGo = function (u) { post({ __bcnav: 'go', href: String(u) }) };
  function soft(u) {
    try { var x = new URL(String(u), loc.href); loc.search = x.search; loc.hash = x.hash; loc.pathname = x.pathname; loc.href = x.href } catch (e) {}
  }
  try {
    history.pushState = function (s, t, u) { if (u != null) soft(u) };
    history.replaceState = function (s, t, u) { if (u != null) soft(u) };
    history.back = function () { post({ __bcnav: 'back' }) };
    history.forward = function () { post({ __bcnav: 'forward' }) };
    history.go = function (n) { if (n < 0) post({ __bcnav: 'back' }); else if (n > 0) post({ __bcnav: 'forward' }) };
  } catch (e) {}
  window.open = function (u) { if (u) post({ __bcnav: 'go', href: String(u) }); return null };
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (!h || h.charAt(0) === '#' || /^(javascript|mailto|tel|data|blob):/i.test(h) || a.hasAttribute('download')) return;
    e.preventDefault();
    post({ __bcnav: 'go', href: h });
  });
  document.addEventListener('submit', function (e) {
    if (e.defaultPrevented) return;
    var f = e.target;
    var action = (f.getAttribute && f.getAttribute('action')) || '';
    if (/^javascript:/i.test(action)) return;
    e.preventDefault();
    try {
      var u = new URL(action || '', loc.href);
      var qs = new URLSearchParams(new FormData(f)).toString();
      u.search = qs ? '?' + qs : '';
      u.hash = '';
      post({ __bcnav: 'go', href: u.href });
    } catch (err) {}
  });
  document.addEventListener('DOMContentLoaded', function () {
    if (!R.hash || R.hash.length < 2) return;
    setTimeout(function () {
      var el = document.getElementById(decodeURIComponent(R.hash.slice(1)));
      if (el && el.scrollIntoView) el.scrollIntoView();
    }, 0);
  });
})();
<\/script>`

const safeJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c')

// Ek HTML page ko poori tarah self-contained srcDoc banata hai.
// route = { path, search, hash } ya null (null = placeholder, new-tab wrapper runtime par bharta hai)
export function buildPage(files, file, route) {
  const keys = Object.keys(files)
  let html = file && files[file] != null ? files[file] : '<!-- index.html nahi mila -->'
  let referenced = false

  // <link rel="stylesheet" href="style.css"> -> <style> (sirf is page ki)
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const isCss = /rel\s*=\s*["']?stylesheet/i.test(tag) || /href\s*=\s*["'][^"']+\.css/i.test(tag)
    if (!isCss) return tag
    const m = /href\s*=\s*["']([^"']+)["']/i.exec(tag)
    if (!m || isExternal(m[1])) return tag
    referenced = true
    const k = findKey(keys, localPath(m[1], file || ''))
    return k ? `<style data-src="${k}">${files[k]}</style>` : ''
  })

  // <script src="app.js"></script> -> inline script (sirf is page ki)
  html = html.replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (full, a, src, b) => {
    if (isExternal(src)) return full
    referenced = true
    const k = findKey(keys, localPath(src, file || ''))
    if (!k) return ''
    const attrs = `${a} ${b}`.replace(/\s+/g, ' ').trimEnd()
    return `<script data-src="${k}"${attrs ? ' ' + attrs.trim() : ''}>\n${escapeScript(files[k])}\n<\/script>`
  })

  // inline <script> aur onclick="..." jaise attributes me location ko virtual router se jodo
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, code) => {
    if (/type\s*=\s*["']?(application\/(ld\+)?json|importmap|text\/template)/i.test(attrs)) return full
    return `<script${attrs}>${rewriteJs(code)}<\/script>`
  })
  html = html.replace(/(\son[a-z]+\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (full, pre, dq, sq) => {
    if (dq !== undefined) return `${pre}"${rewriteJs(dq)}"`
    return `${pre}'${rewriteJs(sq)}'`
  })

  // Purana behaviour: sirf ek page ho aur links na ho to saari CSS/JS jod do
  let legacyCss = ''
  let legacyJs = ''
  if (!referenced && htmlKeys(files).length <= 1) {
    legacyCss = pick(files, /\.css$/i).map((k) => files[k]).join('\n')
    legacyJs = pick(files, /\.m?js$/i).map((k) => rewriteJs(escapeScript(files[k]))).join('\n;\n')
  }

  const routeJson = route ? safeJson({ path: route.path || '', search: route.search || '', hash: route.hash || '' }) : '__BCR_JSON__'
  const head = `<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n${shimScript(routeJson)}\n${CONSOLE_HOOK}${legacyCss ? `\n<style>${legacyCss}</style>` : ''}`
  const tail = legacyJs ? `<script>\n${legacyJs}\n<\/script>` : ''

  if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, () => head + '\n</head>')
  else if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + '\n' + head)
  else html = `<!DOCTYPE html><html><head>${head}</head><body>` + html

  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, () => tail + '\n</body>')
  return html + tail + (/<body/i.test(html) ? '' : '</body></html>')
}

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Jo page project me nahi hai uske liye white screen ki jagah saaf message
export function buildNotFound(path) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;text-align:center}
.b{max-width:420px;padding:24px}h1{font-size:20px;margin:0 0 8px}p{margin:6px 0;color:#475569;font-size:14px}code{background:#e2e8f0;padding:2px 6px;border-radius:4px}
button{margin-top:14px;padding:8px 16px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer}</style></head>
<body><div class="b"><h1>Page nahi mila</h1><p>Project me <code>${esc(path) || '(khali)'}</code> naam ki file nahi hai.</p><p>File banao ya link ka naam check karo.</p>
<button onclick="parent.postMessage({__bcnav:'back'},'*')">&larr; Wapas jao</button></div></body></html>`
}

export function srcDocFor(files, route) {
  if (!route || !route.file) return buildNotFound(route && route.missing)
  return buildPage(files, route.file, { path: route.file, search: route.search, hash: route.hash })
}

// Naye tab ke liye: saare pages ek hi HTML me + chhota router
export function buildStandalone(files, entry) {
  const pages = {}
  htmlKeys(files).forEach((k) => { pages[k] = buildPage(files, k, null) })
  const data = safeJson({ pages, entry, nf: buildNotFound('__NF__') })
  return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>BharatCodex Preview</title>
<style>html,body{margin:0;height:100%;background:#fff}iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff}</style></head>
<body><iframe id="f" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe>
<script>
var D = ${data};
var resolveTarget = (${resolveTarget.toString()});
var keys = Object.keys(D.pages), stack = [], idx = -1, f = document.getElementById('f');
function load(r) {
  var html = r.file ? D.pages[r.file] : D.nf.split('__NF__').join(String(r.missing || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  var rj = JSON.stringify({ path: r.file || '', search: r.search || '', hash: r.hash || '' }).replace(/</g, '\\\\u003c');
  f.srcdoc = html.replace('__BCR_JSON__', function () { return rj });
}
function push(r) { stack = stack.slice(0, idx + 1); stack.push(r); idx = stack.length - 1; load(r) }
window.addEventListener('message', function (e) {
  var d = e.data;
  if (!d || !d.__bcnav || e.source !== f.contentWindow) return;
  if (d.__bcnav === 'back') { if (idx > 0) { idx--; load(stack[idx]) } return }
  if (d.__bcnav === 'forward') { if (idx < stack.length - 1) { idx++; load(stack[idx]) } return }
  if (d.__bcnav === 'go') {
    var cur = stack[idx] || {};
    var r = resolveTarget(d.href, cur.file || D.entry || '', keys);
    if (r.type === 'external') { window.open(r.url, '_blank', 'noopener'); return }
    push(r);
  }
});
push({ file: D.entry, search: '', hash: '' });
<\/script></body></html>`
}
