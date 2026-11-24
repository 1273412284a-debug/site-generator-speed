// solve.js — from-scratch drop-in for makefun-site 1.0.0.
// Written from the kit's RULES.txt and the vendor README.md spec only.
// No vendor code was read or copied. Pure JS, no dependencies.

// ---------------- text ----------------
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESC_RE = /[&<>"']/g;
const ESC_TEST = /[&<>"']/;
function esc(s) {
  if (!ESC_TEST.test(s)) return s;
  return s.replace(ESC_RE, (c) => ESC_MAP[c]);
}

const slugCache = new Map();
function slugOf(text) {
  let s = slugCache.get(text);
  if (s !== undefined) return s;
  s = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (s.charCodeAt(0) === 45) s = s.slice(1);
  if (s.length > 64) {
    s = s.slice(0, 64);
    if (s.charCodeAt(63) === 45) s = s.slice(0, 63);
  } else if (s.charCodeAt(s.length - 1) === 45) s = s.slice(0, -1);
  if (!s) s = 'untitled';
  slugCache.set(text, s);
  return s;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function dateLong(ds) {
  const y = +ds.slice(0, 4), m = +ds.slice(5, 7), d = +ds.slice(8, 10);
  return d + ' ' + MONTHS[m - 1] + ' ' + y;
}
function isRealDate(ds) {
  if (ds.length !== 10 || ds.charCodeAt(4) !== 45 || ds.charCodeAt(7) !== 45) return false;
  for (let i = 0; i < 10; i++) {
    if (i === 4 || i === 7) continue;
    const c = ds.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  const y = +ds.slice(0, 4), m = +ds.slice(5, 7), d = +ds.slice(8, 10);
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (d > dim) return false;
  return ds >= '1970-01-01' && ds <= '2099-12-31';
}

// ---------------- front matter ----------------
// Returns { meta, bodyLines } or { error }.
const FM_KEYS = { title: 1, summary: 1, date: 1, tags: 1, draft: 1, layout: 1, slug: 1 };
function parseQuoted(value, key) {
  // value starts with '"'. Returns { value } or { error }.
  let out = '', i = 1;
  while (i < value.length) {
    const ch = value[i];
    if (ch === '\\') {
      const n = value[i + 1];
      if (n === '"' || n === '\\') { out += n; i += 2; continue; }
      out += '\\'; i += 1; continue;
    }
    if (ch === '"') {
      if (i !== value.length - 1) return { error: 'key "' + key + '": a quoted string is not closed' };
      return { value: out };
    }
    out += ch; i += 1;
  }
  return { error: 'key "' + key + '": a quoted string is not closed' };
}
function parseStringValue(value, key) {
  if (value === '') return { error: 'key "' + key + '" has no value' };
  if (value.charCodeAt(0) === 34) return parseQuoted(value, key);
  if (value.charCodeAt(0) === 91) return { error: 'key "' + key + '": a bare string opens on [' };
  return { value };
}
function parseKeyValue(key, value) {
  if (key === 'title' || key === 'summary') return parseStringValue(value, key);
  if (key === 'date') {
    if (!isRealDate(value)) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
    return { value };
  }
  if (key === 'tags') {
    if (value.length < 2 || value.charCodeAt(0) !== 91 || value.charCodeAt(value.length - 1) !== 93)
      return { error: 'key "tags": not a list [a, b]' };
    const inner = value.slice(1, -1);
    if (inner.trim() === '') return { value: [] };
    const parts = inner.split(',');
    const tags = [];
    for (let p = 0; p < parts.length; p++) {
      const t = parts[p].replace(/^[ \t]+|[ \t]+$/g, '');
      if (t === '' || t.indexOf('"') !== -1 || t.indexOf('[') !== -1 || t.indexOf(']') !== -1)
        return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      tags.push(t);
    }
    return { value: tags };
  }
  if (key === 'draft') {
    if (value === 'true') return { value: true };
    if (value === 'false') return { value: false };
    return { error: 'key "draft": true or false' };
  }
  if (key === 'layout') {
    if (!/^[a-z0-9-]+$/.test(value)) return { error: 'key "layout": not a layout' };
    return { value };
  }
  // slug
  if (value.length > 64 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value))
    return { error: 'key "slug": not a slug' };
  return { value };
}
function parseFrontMatter(lines) {
  if (lines.length === 0 || lines[0] !== '---') return { error: 'no front matter' };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { close = i; break; }
  }
  if (close === -1) return { error: 'the front matter is not closed' };
  const meta = {};
  for (let i = 1; i < close; i++) {
    const line = lines[i];
    if (/^[ \t]*$/.test(line)) continue;
    if (line.charCodeAt(0) === 35) continue; // comment
    const m = /^([a-z_]+):(.*)$/.exec(line);
    if (!m) return { error: 'line ' + (i + 1) + ' is not "key: value"' };
    const key = m[1];
    if (!FM_KEYS[key]) return { error: 'unknown key "' + key + '"' };
    if (Object.prototype.hasOwnProperty.call(meta, key)) return { error: 'key "' + key + '" is given twice' };
    let value = m[2];
    if (value.charCodeAt(0) === 32) value = value.slice(1);
    value = value.replace(/[ \t]+$/, '');
    const r = parseKeyValue(key, value);
    if (r.error) return { error: r.error };
    meta[key] = r.value;
  }
  if (!Object.prototype.hasOwnProperty.call(meta, 'title')) return { error: 'no title' };
  return { meta, bodyLines: lines.slice(close + 1) };
}

// ---------------- markdown ----------------
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);
const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const FENCE_RE = /^```([A-Za-z0-9_+\-]*)([ \t]*)$/;
const CLOSE_FENCE_RE = /^```[ \t]*$/;
const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;
const BREAK_RE = /^(?:---|\*\*\*)[ \t]*$/;
const LIST_RE = /^(?:[-*] |(\d+)\. )(.*)$/;
const BLANK_RE = /^[ \t]*$/;
function trimST(s) {
  let a = 0, b = s.length;
  while (a < b && (s.charCodeAt(a) === 32 || s.charCodeAt(a) === 9)) a++;
  while (b > a && (s.charCodeAt(b - 1) === 32 || s.charCodeAt(b - 1) === 9)) b--;
  return a === 0 && b === s.length ? s : s.slice(a, b);
}
function trimEndST(s) {
  let b = s.length;
  while (b > 0 && (s.charCodeAt(b - 1) === 32 || s.charCodeAt(b - 1) === 9)) b--;
  return b === s.length ? s : s.slice(0, b);
}
function wordCountLines(lines) {
  let n = 0, inW = false;
  for (let k = 0; k < lines.length; k++) {
    const s = lines[k];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12) inW = false;
      else if (!inW) { inW = true; n++; }
    }
    inW = false;
  }
  return n;
}

function isEscaped(text, pos) {
  let n = 0, j = pos - 1;
  while (j >= 0 && text.charCodeAt(j) === 92) { n++; j--; }
  return (n % 2) === 1;
}
function findStrongCloser(text, from, e) {
  // First unescaped `**` after the opener; empty content rejects the opener.
  let j = text.indexOf('**', from);
  while (j !== -1 && j + 2 <= e) {
    if (!isEscaped(text, j)) return j;
    j = text.indexOf('**', j + 1);
  }
  return -1;
}
function findCodeCloser(text, from, e) {
  // First backtick after the opener, escaped or not; empty content rejects it.
  const j = text.indexOf('`', from);
  return j !== -1 && j < e ? j : -1;
}
function findEmCloser(text, from, e, s) {
  // First `*` after the opener that is a single `*`: the last of an odd-length
  // run of real (unescaped) `*`s. Neighbours and runs are read inside this
  // parse range only.
  let j = text.indexOf('*', from);
  while (j !== -1 && j < e) {
    if (!isEscaped(text, j) && !(j + 1 < e && text[j + 1] === '*')) {
      let k = j, len = 0;
      while (k >= s && text[k] === '*' && !isEscaped(text, k)) { len++; k--; }
      if (len % 2 === 1) return j;
    }
    j = text.indexOf('*', j + 1);
  }
  return -1;
}
function findLinkClose(text, from, e) {
  let j = text.indexOf(']', from);
  while (j !== -1 && j < e) {
    if (!isEscaped(text, j)) return j;
    j = text.indexOf(']', j + 1);
  }
  return -1;
}
function findTargetClose(text, from, e) {
  let j = text.indexOf(')', from);
  while (j !== -1 && j < e) {
    if (!isEscaped(text, j)) return j;
    j = text.indexOf(')', j + 1);
  }
  return -1;
}
function resolveLink(target, L) {
  if (SCHEME_RE.test(target) || target.charCodeAt(0) === 47 || target.charCodeAt(0) === 35) return target;
  let path = target, frag = '';
  const h = target.indexOf('#');
  if (h !== -1) { path = target.slice(0, h); frag = target.slice(h); }
  const parts = L.dir ? L.dir.split('/') : [];
  const segs = path.split('/');
  for (let k = 0; k < segs.length; k++) {
    const sg = segs[k];
    if (sg === '' || sg === '.') continue;
    if (sg === '..') { if (parts.length) parts.pop(); continue; }
    parts.push(sg);
  }
  const resolved = parts.join('/');
  const url = L.pageMap.get(resolved);
  if (url !== undefined) return url + frag;
  if (L.staticSet.has(resolved)) return L.base + '/' + resolved + frag;
  L.broken.add('broken-link ' + L.src + ' -> ' + target);
  return target;
}
function inline(text, s, e, L) {
  const out = [];
  let i = s;
  while (i < e) {
    let j = e, k;
    k = text.indexOf('\\', i); if (k !== -1 && k < j) j = k;
    k = text.indexOf('`', i); if (k !== -1 && k < j) j = k;
    k = text.indexOf('*', i); if (k !== -1 && k < j) j = k;
    k = text.indexOf('[', i); if (k !== -1 && k < j) j = k;
    if (j > i) out.push(esc(text.slice(i, j)));
    if (j >= e) break;
    const ch = text[j];
    if (ch === '\\') {
      const n = text[j + 1];
      if (j + 1 < e && ESCAPABLE.has(n)) { out.push(esc(n)); i = j + 2; }
      else { out.push('\\'); i = j + 1; }
      continue;
    }
    if (ch === '`') {
      const k2 = findCodeCloser(text, j + 1, e);
      if (k2 !== -1 && k2 > j + 1) { out.push('<code>' + esc(text.slice(j + 1, k2)) + '</code>'); i = k2 + 1; }
      else { out.push('`'); i = j + 1; }
      continue;
    }
    if (ch === '*') {
      if (j + 1 < e && text[j + 1] === '*') {
        const k2 = findStrongCloser(text, j + 2, e);
        if (k2 !== -1 && k2 > j + 2) { out.push('<strong>' + inline(text, j + 2, k2, L) + '</strong>'); i = k2 + 2; }
        else { out.push('**'); i = j + 2; }
      } else {
        const k2 = findEmCloser(text, j + 1, e, s);
        if (k2 !== -1) { out.push('<em>' + inline(text, j + 1, k2, L) + '</em>'); i = k2 + 1; }
        else { out.push('*'); i = j + 1; }
      }
      continue;
    }
    const k2 = findLinkClose(text, j + 1, e);
    if (k2 !== -1 && k2 + 1 < e && text[k2 + 1] === '(') {
      const c = findTargetClose(text, k2 + 2, e);
      if (c !== -1) {
        const target = text.slice(k2 + 2, c);
        if (target.length > 0 && target.indexOf(' ') === -1 && target.indexOf('\t') === -1 && target.indexOf('\n') === -1 && target.indexOf('\r') === -1) {
          out.push('<a href="' + esc(resolveLink(target, L)) + '">' + inline(text, j + 1, k2, L) + '</a>');
          i = c + 1; continue;
        }
      }
    }
    out.push('['); i = j + 1;
  }
  return out.join('');
}
function uniqueSlug(s, taken) {
  if (!taken.has(s)) { taken.add(s); return s; }
  let k = 2;
  while (taken.has(s + '-' + k)) k++;
  const r = s + '-' + k;
  taken.add(r);
  return r;
}
function isBlank(line) {
  if (line === '') return true;
  const c = line.charCodeAt(0);
  return (c === 32 || c === 9) && BLANK_RE.test(line);
}
function renderMarkdown(lines, L, st) {
  const out = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const c0 = line.charCodeAt(0);
    if (c0 === 96) {
      const fm = FENCE_RE.exec(line);
      if (fm) {
        const lang = fm[1];
        const body = [];
        i++;
        while (i < n && !(lines[i].charCodeAt(0) === 96 && CLOSE_FENCE_RE.test(lines[i]))) { body.push(lines[i]); i++; }
        if (i < n) i++;
        out.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>');
        if (body.length) out.push(esc(body.join('\n')) + '\n');
        out.push('</code></pre>\n');
        continue;
      }
    }
    if (c0 === 35) {
      const hm = HEADING_RE.exec(line);
      if (hm) {
        const text = trimEndST(hm[2]);
        if (text !== '') {
          const level = hm[1].length;
          const id = uniqueSlug(slugOf(text), st.headingSlugs);
          const inner = inline(text, 0, text.length, L);
          if (level === 2 || level === 3) st.toc.push({ level, id, html: inner });
          out.push('<h' + level + ' id="' + id + '">' + inner + '</h' + level + '>\n');
          i++;
          continue;
        }
      }
    }
    if (c0 === 45 || c0 === 42) {
      if (BREAK_RE.test(line)) { out.push('<hr>\n'); i++; continue; }
    }
    if (c0 === 62) {
      const q = [];
      while (i < n && lines[i].charCodeAt(0) === 62) {
        let t = lines[i].slice(1);
        if (t.charCodeAt(0) === 32) t = t.slice(1);
        t = trimST(t);
        if (t !== '') q.push(t);
        i++;
      }
      if (q.length) {
        const qt = q.join('\n');
        out.push('<blockquote>\n<p>' + inline(qt, 0, qt.length, L) + '</p>\n</blockquote>\n');
      } else out.push('<blockquote>\n</blockquote>\n');
      continue;
    }
    if (c0 === 45 || c0 === 42 || (c0 >= 48 && c0 <= 57)) {
      const lm = LIST_RE.exec(line);
      if (lm) {
        const ordered = lm[1] !== undefined;
        const firstNum = lm[1];
        const items = [];
        while (i < n) {
          const ln = lines[i];
          const m2 = LIST_RE.exec(ln);
          if (m2 && ((ordered && m2[1] !== undefined) || (!ordered && m2[1] === undefined))) {
            items.push(trimEndST(m2[2]));
            i++;
            continue;
          }
          if (items.length && /^ {2,}[^ ]/.test(ln)) {
            items[items.length - 1] += '\n' + trimST(ln);
            i++;
            continue;
          }
          break;
        }
        out.push(ordered ? (firstNum === '1' ? '<ol>\n' : '<ol start="' + firstNum + '">\n') : '<ul>\n');
        for (let b = 0; b < items.length; b++) {
          const it = items[b];
          out.push('<li>' + inline(it, 0, it.length, L) + '</li>\n');
        }
        out.push(ordered ? '</ol>\n' : '</ul>\n');
        continue;
      }
    }
    const pl = [];
    while (i < n) {
      const ln = lines[i];
      if (isBlank(ln)) break;
      const lc0 = ln.charCodeAt(0);
      if (lc0 === 96 && FENCE_RE.test(ln)) break;
      if (lc0 === 35) {
        const hm2 = HEADING_RE.exec(ln);
        if (hm2 && trimEndST(hm2[2]) !== '') break;
      }
      if ((lc0 === 45 || lc0 === 42) && BREAK_RE.test(ln)) break;
      pl.push(trimST(ln));
      i++;
    }
    const pt = pl.join('\n');
    const inner = inline(pt, 0, pt.length, L);
    if (st.firstPara === null) st.firstPara = inner;
    out.push('<p>' + inner + '</p>\n');
  }
  return out.join('');
}

// ---------------- templates ----------------
const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
function parsePath(inner) {
  if (!PATH_RE.test(inner)) return null;
  return inner.split('.');
}
function parseTag(content) {
  const parts = content.split(/\s+/);
  const head = parts[0];
  if (head === 'for') {
    if (parts.length !== 4 || parts[2] !== 'in') return { error: 'unknown tag' };
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parts[1])) return { error: 'unknown tag' };
    const path = parsePath(parts[3]);
    if (!path) return { error: 'unknown tag' };
    return { tag: 'for', v: parts[1], path };
  }
  if (head === 'if') {
    if (parts.length === 2) {
      const path = parsePath(parts[1]);
      if (!path) return { error: 'unknown tag' };
      return { tag: 'if', path, neg: false };
    }
    if (parts.length === 3 && parts[1] === 'not') {
      const path = parsePath(parts[2]);
      if (!path) return { error: 'unknown tag' };
      return { tag: 'if', path, neg: true };
    }
    return { error: 'unknown tag' };
  }
  if (head === 'else') {
    if (parts.length !== 1) return { error: 'unknown tag' };
    return { tag: 'else' };
  }
  if (head === 'endif') {
    if (parts.length !== 1) return { error: 'unknown tag' };
    return { tag: 'endif' };
  }
  if (head === 'endfor') {
    if (parts.length !== 1) return { error: 'unknown tag' };
    return { tag: 'endfor' };
  }
  if (head === 'include') {
    const m = /^include\s+"([^"]*)"$/.exec(content);
    if (!m) return { error: 'unknown tag' };
    return { tag: 'inc', name: m[1] };
  }
  return { error: 'unknown tag' };
}
function parseTemplate(src) {
  const root = [];
  const stack = [{ kind: 'root', body: root }];
  let i = 0, textStart = 0;
  const n = src.length;
  function curBody() {
    const t = stack[stack.length - 1];
    if (t.kind === 'if') return t.node.inElse ? t.node.elseBody : t.node.thenBody;
    return t.body;
  }
  function pushText(end) {
    if (end > textStart) curBody().push({ t: 'text', s: src.slice(textStart, end) });
  }
  while (i < n) {
    const j1 = src.indexOf('{{', i);
    const j2 = src.indexOf('{%', i);
    let j = -1, kind = '';
    if (j1 !== -1 && (j2 === -1 || j1 <= j2)) { j = j1; kind = src[j + 2] === '{' ? 'raw' : 'var'; }
    else if (j2 !== -1) { j = j2; kind = 'tag'; }
    if (j === -1) break;
    if (kind === 'raw') {
      const k = src.indexOf('}}}', j + 3);
      if (k === -1) return { error: 'unclosed {{{' };
      const path = parsePath(src.slice(j + 3, k).trim());
      if (!path) return { error: 'not a path' };
      pushText(j);
      curBody().push({ t: 'raw', path });
      i = k + 3; textStart = i;
    } else if (kind === 'var') {
      const k = src.indexOf('}}', j + 2);
      if (k === -1) return { error: 'unclosed {{' };
      const path = parsePath(src.slice(j + 2, k).trim());
      if (!path) return { error: 'not a path' };
      pushText(j);
      curBody().push({ t: 'var', path });
      i = k + 2; textStart = i;
    } else {
      const k = src.indexOf('%}', j + 2);
      if (k === -1) return { error: 'unclosed {%' };
      const lineStart = src.lastIndexOf('\n', j - 1) + 1;
      const prefix = src.slice(lineStart, j);
      let p2 = k + 2;
      while (p2 < n && (src[p2] === ' ' || src[p2] === '\t')) p2++;
      const standalone = /^[ \t]*$/.test(prefix) && (p2 >= n || src[p2] === '\n');
      const tg = parseTag(src.slice(j + 2, k).trim());
      if (tg.error) return { error: tg.error };
      if (standalone) pushText(lineStart);
      else pushText(j);
      if (tg.tag === 'for') {
        const node = { t: 'for', v: tg.v, path: tg.path, body: [] };
        curBody().push(node);
        stack.push({ kind: 'for', body: node.body });
      } else if (tg.tag === 'if') {
        const node = { t: 'if', path: tg.path, neg: tg.neg, thenBody: [], elseBody: null, inElse: false };
        curBody().push(node);
        stack.push({ kind: 'if', node });
      } else if (tg.tag === 'else') {
        const top = stack[stack.length - 1];
        if (top.kind !== 'if' || top.node.elseBody !== null) return { error: 'closed out of order' };
        top.node.inElse = true;
        top.node.elseBody = [];
      } else if (tg.tag === 'endfor') {
        const top = stack[stack.length - 1];
        if (top.kind !== 'for') return { error: 'closed out of order' };
        stack.pop();
      } else if (tg.tag === 'endif') {
        const top = stack[stack.length - 1];
        if (top.kind !== 'if') return { error: 'closed out of order' };
        stack.pop();
      } else if (tg.tag === 'inc') {
        curBody().push({ t: 'inc', name: tg.name });
      }
      if (standalone) { i = p2 >= n ? n : p2 + 1; }
      else { i = k + 2; }
      textStart = i;
    }
  }
  pushText(n);
  if (stack.length !== 1) {
    const top = stack[stack.length - 1];
    return { error: top.kind === 'for' ? 'for is not closed' : 'if is not closed' };
  }
  return { ast: root };
}
function genBody(body, uid) {
  let s = '';
  for (let b = 0; b < body.length; b++) {
    const node = body[b];
    if (node.t === 'text') s += 'o.push(' + JSON.stringify(node.s) + ');';
    else if (node.t === 'var') s += 'o.push(R.esc(R.val(R.get(C,S,' + JSON.stringify(node.path) + '))));';
    else if (node.t === 'raw') s += 'o.push(R.val(R.get(C,S,' + JSON.stringify(node.path) + ')));';
    else if (node.t === 'inc') s += 'o.push(R.inc(' + JSON.stringify(node.name) + ',C,S,D));';
    else if (node.t === 'for') {
      const a = '_a' + (uid.n++), it = '_i' + (uid.n++), lp = '_l' + (uid.n++), fr = '_f' + (uid.n++);
      s += 'var ' + a + '=R.get(C,S,' + JSON.stringify(node.path) + ');if(Array.isArray(' + a + ')){var ' + lp + '={index:0,first:false,last:false,length:' + a + '.length},' + fr + '={n:' + JSON.stringify(node.v) + ',v:null,l:' + lp + '};for(var ' + it + '=0;' + it + '<' + a + '.length;' + it + '++){' + lp + '.index=' + it + '+1;' + lp + '.first=' + it + '===0;' + lp + '.last=' + it + '===' + a + '.length-1;' + fr + '.v=' + a + '[' + it + '];S.push(' + fr + ');' + genBody(node.body, uid) + 'S.pop();}}';
    } else if (node.t === 'if') {
      s += 'if(' + (node.neg ? '!' : '') + 'R.truthy(R.get(C,S,' + JSON.stringify(node.path) + '))){' + genBody(node.thenBody, uid) + '}';
      if (node.elseBody !== null) s += 'else{' + genBody(node.elseBody, uid) + '}';
    }
  }
  return s;
}
function val(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (Array.isArray(v)) {
    let s = '';
    for (let i = 0; i < v.length; i++) { if (i) s += ', '; s += val(v[i]); }
    return s;
  }
  return '';
}
function truthy(v) {
  return !(v === undefined || v === null || v === false || v === '' || v === 0 || (Array.isArray(v) && v.length === 0));
}
const HOP = Object.prototype.hasOwnProperty;
function get(C, S, segs) {
  const first = segs[0];
  let v, found = false;
  for (let i = S.length - 1; i >= 0; i--) {
    const f = S[i];
    if (first === 'loop') { v = f.l; found = true; break; }
    if (f.n === first) { v = f.v; found = true; break; }
  }
  if (!found) {
    if (HOP.call(C, first)) v = C[first];
    else return undefined;
  }
  for (let k = 1; k < segs.length; k++) {
    if (v === null || v === undefined) return undefined;
    if (!HOP.call(v, segs[k])) return undefined;
    v = v[segs[k]];
  }
  return v;
}
const RT = {
  esc, val, truthy, get, t: null,
  inc(name, C, S, D) {
    if (D + 1 > 8) return '';
    const fn = RT.t[name];
    if (!fn) return '';
    return fn(C, S, D + 1, RT);
  },
};

// ---------------- build ----------------
function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}
export function run(input) {
  const site = input.site;
  const base = site.base_url.replace(/\/+$/, '');
  const siteCtx = { title: site.title, base_url: base };
  const perPage = site.per_page, recentN = site.recent;
  const report = new Set();
  const compiled = {};
  const names = Object.keys(input.templates).sort();
  for (let n = 0; n < names.length; n++) {
    const name = names[n];
    const r = parseTemplate(input.templates[name]);
    if (r.error) { report.add('template "' + name + '": ' + r.error); continue; }
    compiled[name] = new Function('C', 'S', 'D', 'R', 'var o=[];' + genBody(r.ast, { n: 0 }) + 'return o.join("");');
  }
  RT.t = compiled;
  const sorted = input.files.slice().sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const sources = [], statics = [];
  for (const f of sorted) {
    if (f.path.endsWith('.md')) sources.push(f);
    else statics.push(f);
  }
  const pages = [];
  for (const f of sources) {
    let content = f.content;
    if (content.indexOf('\r') !== -1) content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = content.split('\n');
    const fm = parseFrontMatter(lines);
    if (fm.error) { report.add('refused ' + f.path + ': ' + fm.error); continue; }
    const meta = fm.meta;
    const isPost = f.path.startsWith('posts/');
    if (f.path.startsWith('tags/') || f.path.startsWith('page/')) {
      report.add('refused ' + f.path + ': ' + (f.path.startsWith('tags/') ? 'tags' : 'page') + '/ is the generator\'s own');
      continue;
    }
    if (isPost && !Object.prototype.hasOwnProperty.call(meta, 'date')) { report.add('refused ' + f.path + ': a post needs a date'); continue; }
    const layout = meta.layout || (isPost ? 'post' : 'page');
    if (!compiled[layout]) { report.add('refused ' + f.path + ': layout "' + layout + '" is no template that parses'); continue; }
    if (meta.draft === true) { report.add('draft ' + f.path); continue; }
    pages.push({ path: f.path, meta, isPost, bodyLines: fm.bodyLines, layout });
  }
  const dirTaken = new Map();
  const pageMap = new Map();
  for (const pg of pages) {
    const dir = pg.isPost ? 'posts' : dirOf(pg.path);
    let taken = dirTaken.get(dir);
    if (!taken) {
      taken = new Set();
      if (dir === '') { taken.add('posts'); taken.add('tags'); taken.add('page'); }
      dirTaken.set(dir, taken);
    }
    pg.slug = uniqueSlug(pg.meta.slug || slugOf(pg.meta.title), taken);
    pg.dir = dir;
    pg.url = base + '/' + (dir ? dir + '/' : '') + pg.slug + '/';
    pg.outPath = (dir ? dir + '/' : '') + pg.slug + '/index.html';
    pageMap.set(pg.path, pg.url);
  }
  const staticSet = new Set();
  for (const f of statics) staticSet.add(f.path);
  for (const pg of pages) {
    const L = { dir: dirOf(pg.path), pageMap, staticSet, base, src: pg.path, broken: report };
    const st = { toc: [], firstPara: null, headingSlugs: new Set() };
    pg.html = renderMarkdown(pg.bodyLines, L, st);
    pg.toc = st.toc;
    pg.excerpt = st.firstPara === null ? '' : st.firstPara;
    pg.readingMinutes = Math.max(1, Math.ceil(wordCountLines(pg.bodyLines) / 200));
  }
  const posts = [];
  for (const pg of pages) if (pg.isPost) posts.push(pg);
  posts.sort((a, b) => {
    if (a.meta.date !== b.meta.date) return a.meta.date < b.meta.date ? 1 : -1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  for (let i = 0; i < posts.length; i++) posts[i].collIdx = i;
  const tagMap = new Map();
  for (const p of posts) {
    const tags = p.meta.tags || [];
    const seen = new Set();
    for (let k = 0; k < tags.length; k++) {
      const name = tags[k];
      const slug = slugOf(name);
      if (seen.has(slug)) continue;
      seen.add(slug);
      let t = tagMap.get(slug);
      if (!t) { t = { name, slug, pages: [] }; tagMap.set(slug, t); }
      t.pages.push(p);
    }
  }
  const tagsList = [];
  for (const t of tagMap.values()) {
    t.url = base + '/tags/' + t.slug + '/';
    t.count = t.pages.length;
    tagsList.push({ name: t.name, slug: t.slug, url: t.url, count: t.count });
  }
  tagsList.sort((a, b) => b.count - a.count || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const pg of pages) {
    const seen = new Set();
    pg.tagObjs = [];
    for (const name of (pg.meta.tags || [])) {
      const slug = slugOf(name);
      if (seen.has(slug)) continue;
      seen.add(slug);
      const t = tagMap.get(slug);
      // A page's tag takes the tag index's name (first spelling), else its own.
      pg.tagObjs.push({ name: t ? t.name : name, slug, url: t ? t.url : '' });
    }
  }
  function cardOf(pg) {
    return {
      title: pg.meta.title, url: pg.url,
      date: pg.meta.date || '',
      date_long: pg.meta.date ? dateLong(pg.meta.date) : '',
      summary: pg.meta.summary || '', excerpt: pg.excerpt,
      reading_minutes: pg.readingMinutes, tags: pg.tagObjs,
    };
  }
  const recentCards = posts.slice(0, recentN).map(cardOf);
  const out = {};
  for (const pg of pages) {
    const card = cardOf(pg);
    const pageObj = {
      title: card.title, url: card.url, date: card.date, date_long: card.date_long,
      summary: card.summary, excerpt: card.excerpt, reading_minutes: card.reading_minutes,
      tags: card.tags, slug: pg.slug, content: pg.html, toc: pg.toc, newer: null, older: null, is_post: pg.isPost,
    };
    if (pg.isPost) {
      const idx = pg.collIdx;
      const nw = idx > 0 ? posts[idx - 1] : null;
      const od = idx < posts.length - 1 ? posts[idx + 1] : null;
      pageObj.newer = nw ? { title: nw.meta.title, url: nw.url, date: nw.meta.date, date_long: dateLong(nw.meta.date) } : null;
      pageObj.older = od ? { title: od.meta.title, url: od.url, date: od.meta.date, date_long: dateLong(od.meta.date) } : null;
    }
    out[pg.outPath] = compiled[pg.layout]({ site: siteCtx, tags: tagsList, recent: recentCards, page: pageObj }, [], 0, RT);
  }
  const totalPages = Math.max(1, Math.ceil(posts.length / perPage));
  if (compiled['index']) {
    for (let i = 1; i <= totalPages; i++) {
      const slice = posts.slice((i - 1) * perPage, i * perPage).map(cardOf);
      const pager = {
        number: i, total: totalPages,
        url: i === 1 ? base + '/' : base + '/page/' + i + '/',
        newer_url: i > 1 ? (i - 1 === 1 ? base + '/' : base + '/page/' + (i - 1) + '/') : '',
        older_url: i < totalPages ? base + '/page/' + (i + 1) + '/' : '',
      };
      out[i === 1 ? 'index.html' : 'page/' + i + '/index.html'] =
        compiled['index']({ site: siteCtx, tags: tagsList, recent: recentCards, posts: slice, pager }, [], 0, RT);
    }
  }
  if (compiled['tag']) {
    for (const t of tagMap.values()) {
      const tagObj = { name: t.name, slug: t.slug, url: t.url, count: t.count, posts: t.pages.map(cardOf) };
      out['tags/' + t.slug + '/index.html'] =
        compiled['tag']({ site: siteCtx, tags: tagsList, recent: recentCards, tag: tagObj }, [], 0, RT);
    }
  }
  if (compiled['tags']) {
    out['tags/index.html'] = compiled['tags']({ site: siteCtx, tags: tagsList, recent: recentCards }, [], 0, RT);
  }
  const builtPaths = new Set(Object.keys(out));
  let staticWritten = 0;
  for (const f of statics) {
    if (builtPaths.has(f.path)) { report.add('shadowed ' + f.path + ': a built page has its path'); continue; }
    out[f.path] = f.content;
    staticWritten++;
  }
  let pageCount = 0;
  for (const pg of pages) if (!pg.isPost) pageCount++;
  const lines = [...report].sort();
  lines.push('built ' + pageCount + ' pages, ' + posts.length + ' posts, ' + tagsList.length + ' tags and ' + staticWritten + ' static files');
  out['build-report.txt'] = lines.join('\n') + '\n';
  return out;
}
