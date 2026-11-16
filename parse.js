import { escape, label, unescape, destination, punctuation, whitespace, htmlBlock, tableCells, indent, stripIndent, url } from './grammar.js';
import { listStart, extractList, extractQuote } from './containers.js';

// Blocks retain source text until all definitions in the document are known.
export function parse(markdown) {
  const refs = new Map();
  const source = markdown.replace(/\r\n?/g, '\n');
  return render(blocks(source, refs), refs);
}

function interrupt(line, paragraph = false) {
  if (/^ {0,3}(?:#{1,6}(?:\s|$)|>|`{3,}[^`]*$|~{3,}|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/.test(line)) return true;
  const ls = listStart(line);
  if (ls && (!paragraph || ((!ls.ordered || ls.number === 1) && ls.content.trim()))) return true;
  return !!htmlBlock(line, paragraph);
}

function blocks(source, refs, nested = false) {
  const lines = source.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const out = [];
  let i = 0;
  while (i < lines.length) {
    let line = lines[i], m;
    if (!line.trim()) { if (out.length) out.at(-1).space = true; i++; continue; }
    if ((m = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line)) && !(m[1][0] === '`' && m[2].includes('`'))) {
      const pad = /^ */.exec(line)[0].length, marker = m[1], info = m[2].trim();
      let body = ''; i++;
      const close = new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}[ \\t]*$');
      while (i < lines.length && !close.test(lines[i])) { body += stripIndent(lines[i], pad) + '\n'; i++; }
      if (i < lines.length) i++;
      out.push({ type: 'code', text: body.endsWith('\n\n') ? body.slice(0, -1) : body, lang: info.split(/\s/)[0] }); continue;
    }
    if (/^(?: {4}| {0,3}\t)/.test(line)) {
      let body = '', pending = '';
      while (i < lines.length) {
        if (!lines[i].trim()) { pending += stripIndent(lines[i], 4) + '\n'; i++; }
        else if (/^(?: {4}| {0,3}\t)/.test(lines[i])) { body += pending + stripIndent(lines[i], 4) + '\n'; pending = ''; i++; }
        else break;
      }
      out.push({ type: 'code', text: body, lang: '' }); continue;
    }
    if ((m = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/.exec(line))) {
      let text = (m[2] || '').trim().replace(/(?:\s+|^)#+\s*$/, '');
      out.push({ type: 'heading', depth: m[1].length, text }); i++; continue;
    }
    if (/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) { out.push({ type: 'raw', text: '<hr>\n' }); i++; continue; }
    if (/^ {0,3}>/.test(line)) {
      const q = extractQuote(lines, i, interrupt); i = q.end;
      out.push({ type: 'quote', children: blocks(q.text, refs) }); continue;
    }
    if (listStart(line)) {
      const list = extractList(lines, i, interrupt); i = list.end;
      list.items = list.items.map(item => {
        let text = item.text, task = /^\[([ xX])\](?:[ \t]+|$)/.exec(text);
        if (task) text = text.slice(task[0].length);
        const children = blocks(text, refs, true);
        if (children.some(n => n.space)) list.loose = true;
        return { children, task: task ? task[1] !== ' ' : null };
      });
      out.push({ type: 'list', ...list }); continue;
    }
    const html = htmlBlock(line, false);
    if (html) {
      let text = line + (i < lines.length - 1 || source.endsWith('\n') ? '\n' : ''); i++;
      if (!html.end || !html.end.test(line)) {
        while (i < lines.length && (html.end || lines[i].trim())) { const next = lines[i++]; text += next + (i < lines.length || source.endsWith('\n') ? '\n' : ''); if (html.end?.test(next)) break; }
      }
      if (i < lines.length && (!html.end || lines[i] === '')) text = text.replace(/\n$/, '');
      out.push({ type: 'raw', text }); continue;
    }
    // A definition can span a destination and a title on following lines.
    const def = readDefinition(lines, i);
    if (def) { if (!refs.has(label(def.name))) refs.set(label(def.name), def); i = def.end; continue; }
    if (i + 1 < lines.length && line.includes('|') && /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const heads = tableCells(line), aligns = tableCells(lines[i + 1]);
      if (heads.length === aligns.length) {
        i += 2; const rows = [];
        while (i < lines.length && lines[i] !== '' && !interrupt(lines[i], true)) rows.push(tableCells(lines[i++]));
        out.push({ type: 'table', heads, aligns: aligns.map(x => /^:-+:$/.test(x) ? 'center' : /^:-+$/.test(x) ? 'left' : /^-+:$/.test(x) ? 'right' : ''), rows }); continue;
      }
    }
    let text = line; i++;
    let heading = 0;
    while (i < lines.length && (lines[i].trim() || i === lines.length - 1 && !source.endsWith('\n') && lines[i].length)) {
      if ((m = /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[i]))) { heading = m[1][0] === '=' ? 1 : 2; i++; break; }
      if (interrupt(lines[i], true) || nested && listStart(lines[i])?.content.trim()) break;
      text += '\n' + (nested ? lines[i++].replace(/^ {4}/, '') : lines[i++]);
    }
    out.push(heading ? { type: 'heading', depth: heading, text: text.trim() } : { type: 'paragraph', text });
  }
  return out;
}

function readDefinition(lines, start) {
  let combined = lines[start], headerEnd = start + 1;
  if (/^ {0,3}\[/.test(combined) && !combined.includes(']:')) {
    while (headerEnd < lines.length && lines[headerEnd].trim() && !combined.includes(']:')) combined += '\n' + lines[headerEnd++];
  }
  const m = /^ {0,3}\[((?:\\.|[^\[\]\\])+)\]:[ \t]*(.*)$/.exec(combined);
  if (!m || !m[1].trim()) return null;
  let rest = m[2], end = headerEnd;
  if (!rest && end < lines.length) rest = lines[end++].trim();
  const d = destination(rest, 0, true);
  if (!d) return null;
  let tail = rest.slice(d.end).trim(), title = '';
  if (tail && !/^[ \t]/.test(rest.slice(d.end))) return null;
  let optionalTitle = false;
  if (!tail && end < lines.length && /^\s*["'(]/.test(lines[end])) { tail = lines[end++].trim(); optionalTitle = true; }
  if (tail) {
    const ending = tail[0] === '(' ? ')' : tail[0];
    while (tail.length === 1 || !tail.endsWith(ending)) {
      if (end >= lines.length || !lines[end].trim()) return optionalTitle ? { name: m[1], href: d.href, title: '', end: headerEnd } : null;
      tail += '\n' + lines[end++];
    }
    const t = /^(?:"([\s\S]*)"|'([\s\S]*)'|\(([\s\S]*)\))$/.exec(tail);
    if (!t) return optionalTitle ? { name: m[1], href: d.href, title: '', end: end - 1 } : null;
    title = t[1] ?? t[2] ?? t[3];
  }
  return { name: m[1], href: d.href, title, end };
}

function render(nodes, refs, tight = false) {
  let result = '';
  for (const n of nodes) {
    switch (n.type) {
      case 'raw': result += n.text; break;
      case 'code': result += '<pre><code' + (n.lang ? ' class="language-' + escape(unescape(n.lang)) + '"' : '') + '>' + escape(n.text, true) + '</code></pre>\n'; break;
      case 'heading': result += '<h' + n.depth + '>' + inline(n.text, refs) + '</h' + n.depth + '>\n'; break;
      case 'paragraph': result += tight ? inline(n.text, refs) : '<p>' + inline(n.text, refs) + '</p>\n'; break;
      case 'quote': result += '<blockquote>\n' + render(n.children, refs) + '</blockquote>\n'; break;
      case 'list': {
        const tag = n.ordered ? 'ol' : 'ul';
        result += '<' + tag + (n.ordered && n.number !== 1 ? ' start="' + n.number + '"' : '') + '>\n';
        for (const item of n.items) {
          let content = render(item.children, refs, !n.loose);
          if (item.task !== null) {
            const checkbox = '<input ' + (item.task ? 'checked="" ' : '') + 'disabled="" type="checkbox"> ';
            content = n.loose && content.startsWith('<p>') ? '<p>' + checkbox + content.slice(3) : checkbox + content;
          }
          result += '<li>' + content + '</li>\n';
        }
        result += '</' + tag + '>\n'; break;
      }
      case 'table': {
        const cell = (text, index, tag) => '<' + tag + (n.aligns[index] ? ' align="' + n.aligns[index] + '"' : '') + '>' + inline(text || '', refs) + '</' + tag + '>\n';
        result += '<table>\n<thead>\n<tr>\n' + n.heads.map((s, j) => cell(s, j, 'th')).join('') + '</tr>\n</thead>\n';
        if (n.rows.length) result += '<tbody>' + n.rows.map(row => '<tr>\n' + n.heads.map((_, j) => cell(row[j], j, 'td')).join('') + '</tr>\n').join('') + '</tbody>';
        result += '</table>\n'; break;
      }
    }
  }
  return result;
}

function flanks(s, at, length, char) {
  const before = at ? s[at - 1] : '\n', after = s[at + length] || '\n';
  const bw = whitespace(before), aw = whitespace(after), bp = punctuation(before), ap = punctuation(after);
  const left = !aw && (!ap || bw || bp), right = !bw && (!bp || aw || ap);
  return { open: left && (char !== '_' || !right || bp), close: right && (char !== '_' || !left || ap) };
}

function emphasis(s, at, refs, inLink) {
  const char = s[at]; let count = 1;
  while (s[at + count] === char) count++;
  const first = flanks(s, at, count, char);
  if (!first.open) return null;
  let balance = count;
  for (let j = at + count; j < s.length;) {
    if (s[j] === '\\') { j += 2; continue; }
    if (s[j] === '`') { let k = j + 1; while (s[k] === '`') k++; const stop = s.indexOf(s.slice(j, k), k); j = stop < 0 ? k : stop + k - j; continue; }
    const span = protectedEnd(s, j, refs, inLink);
    if (span > j) { j = span; continue; }
    if ((s[j] === '*' || s[j] === '_') && s[j] !== char) {
      const nested = emphasis(s, j, refs, inLink); if (nested) { j = nested.end; continue; }
    }
    if (s[j] !== char) { j++; continue; }
    let size = 1; while (s[j + size] === char) size++;
    const f = flanks(s, j, size, char);
    const forbidden = (first.close || f.open) && (count + size) % 3 === 0 && (count % 3 !== 0 || size % 3 !== 0);
    if (f.close && f.open && !forbidden) { j += size; continue; }
    if (f.close && !forbidden) {
      balance -= size;
      if (balance <= 0) {
        const available = Math.min(count, size), used = available % 2 ? 1 : 2, end = j + Math.max(0, size + balance) - used;
        const tag = used === 2 ? 'strong' : 'em';
        return { html: '<' + tag + '>' + inline(s.slice(at + used, end), refs, inLink) + '</' + tag + '>', end: end + used };
      }
    } else if (f.open) balance += size;
    j += size;
  }
  return null;
}

function protectedEnd(s, at, refs, inLink) {
  if (s[at] === '<') {
    const m = /^(?:<!--[\s\S]*?-->|<\/?[A-Za-z][^<>]*>|<[^<>\s]+>)/.exec(s.slice(at));
    if (m) return at + m[0].length;
  }
  if (s[at] === '[' || s[at] === '!' && s[at + 1] === '[') return link(s, at, refs, inLink)?.end || at;
  return at;
}

function link(s, at, refs, inLink) {
  const image = s[at] === '!', begin = at + (image ? 2 : 1);
  if (inLink && !image) return null;
  let depth = 1, j = begin;
  let unmatchedDouble = false;
  for (; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '!' && s[j + 1] === '[') { const img = link(s, j, refs, false); if (img) { j = img.end - 1; continue; } }
    if (s[j] === '`') {
      let k = j + 1; while (s[k] === '`') k++;
      const stop = s.indexOf(s.slice(j, k), k);
      if (stop >= 0 && !unmatchedDouble && (k - j === 1 || stop < s.indexOf(']', k))) { j = stop + k - j - 1; continue; }
      if (k - j > 1) unmatchedDouble = true;
      j = k - 1; continue;
    }
    if (s[j] === '<') { const end = protectedEnd(s, j, refs, true); if (end > j) { j = end - 1; continue; } }
    if (s[j] === '[' && s[j - 1] !== '!') { const nested = link(s, j, refs, false); if (nested && !image) return null; }
    if (s[j] === '[') depth++;
    if (s[j] === ']' && --depth === 0) break;
  }
  if (j >= s.length) return null;
  const text = s.slice(begin, j); let end = j + 1, href, title = '';
  if (/``[^\n]*`[^\n]*``.+/.test(text)) return null;
  if (s[end] === '(') {
    let p = end + 1; while (/\s/.test(s[p] || '') && p < s.length) p++;
    const d = destination(s, p, false); if (!d) return null;
    href = d.href; p = d.end;
    const gap = p; while (p < s.length && /\s/.test(s[p])) p++;
    if (p > gap && /["'(]/.test(s[p] || '')) {
      const open = s[p++], quote = open === '(' ? ')' : open, start = p;
      while (p < s.length && s[p] !== quote) { if (s[p] === '\\') p++; p++; }
      if (p === s.length) return null;
      title = s.slice(start, p++); while (p < s.length && /\s/.test(s[p])) p++;
    }
    if (s[p] !== ')') {
      const ref = refs.get(label(text));
      if (!ref) return null;
      href = ref.href; title = ref.title; p = j;
    }
    end = p + 1;
  } else {
    let name = text;
    if (s[end] === '[') { const close = s.indexOf(']', end + 1); if (close < 0) return null; name = s.slice(end + 1, close) || text; end = close + 1; }
    const ref = refs.get(label(name)); if (!ref) return null;
    href = ref.href; title = ref.title;
  }
  const address = escape(url(unescape(href))), attr = title ? ' title="' + escape(unescape(title)) + '"' : '';
  if (image) {
    const alt = inline(text, refs).replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/g, '$1').replace(/<[^>]*>/g, '');
    return { html: '<img src="' + address + '" alt="' + alt + '"' + attr + '>', end };
  }
  return { html: '<a href="' + address + '"' + attr + '>' + inline(text, refs, true) + '</a>', end };
}

function delimiterPairs(s, refs, inLink) {
  const stack = [], pairs = new Map();
  for (let i = 0; i < s.length;) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === '`') {
      let end = i + 1; while (s[end] === '`') end++;
      const stop = s.indexOf(s.slice(i, end), end); i = stop < 0 ? end : stop + end - i; continue;
    }
    const protectedTo = protectedEnd(s, i, refs, inLink);
    if (protectedTo > i) { i = protectedTo; continue; }
    const char = s[i];
    if (char !== '*' && char !== '_') { i++; continue; }
    let end = i + 1; while (s[end] === char) end++;
    const size = end - i, f = flanks(s, i, size, char);
    let remaining = size, consumed = 0;
    if (f.close) {
      while (remaining) {
        let found = -1;
        for (let k = stack.length - 1; k >= 0; k--) {
          const open = stack[k];
          if (open.char !== char) continue;
          if ((open.close || f.open) && (open.original + size) % 3 === 0 && (open.original % 3 || size % 3)) continue;
          found = k; break;
        }
        if (found < 0) break;
        const open = stack[found], use = open.remaining >= 2 && remaining >= 2 ? 2 : 1;
        const begin = open.at + open.remaining - use;
        pairs.set(begin, { begin: begin + use, close: i + consumed, end: i + consumed + use, tag: use === 2 ? 'strong' : 'em' });
        open.remaining -= use; remaining -= use; consumed += use;
        stack.length = found + (open.remaining ? 1 : 0);
      }
    }
    if (f.open && remaining) stack.push({ at: i + consumed, remaining, original: size, char, close: f.close });
    i = end;
  }
  return pairs;
}

function strike(s, at) {
  let size = 1; while (s[at + size] === '~') size++;
  if (size > 2 || whitespace(s[at + size] || '\n') || s[at - 1] === '~') return null;
  let depth = 1;
  for (let i = at + size; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] !== '~') continue;
    let end = i + 1; while (s[end] === '~') end++;
    const count = end - i;
    if (count > 2) return null;
    if (count === size) {
      if (!whitespace(s[i - 1])) { if (--depth === 0) return { text: s.slice(at + size, i), end }; }
      else if (!whitespace(s[end] || '\n')) depth++;
    }
    i = end - 1;
  }
  return null;
}

export function inline(s, refs = new Map(), inLink = false) {
  let out = '', i = 0;
  const pairs = /[*_]/.test(s) ? delimiterPairs(s, refs, inLink) : new Map();
  while (i < s.length) {
    const c = s[i]; let m, token;
    if (c === '\\') {
      if (s[i + 1] === '\n') { out += '<br>'; i += 2; while (s[i] === ' ' || s[i] === '\t') i++; continue; }
      if (s[i + 1] && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(s[i + 1])) { out += escape(s[i + 1]); i += 2; continue; }
    }
    if (c === '`') {
      let j = i + 1; while (s[j] === '`') j++;
      let k = j;
      while ((k = s.indexOf(s.slice(i, j), k)) >= 0) { if (s[k - 1] !== '`' && s[k + j - i] !== '`') break; k++; }
      if (k >= 0) {
        let text = s.slice(j, k).replace(/\n/g, ' ');
        if (text.startsWith(' ') && text.endsWith(' ') && /[^ ]/.test(text)) text = text.slice(1, -1);
        out += '<code>' + escape(text, true) + '</code>'; i = k + j - i; continue;
      }
      out += s.slice(i, j); i = j; continue;
    }
    if ((c === '[' || c === '!' && s[i + 1] === '[') && (token = link(s, i, refs, inLink))) { out += token.html; i = token.end; continue; }
    if ((c === '*' || c === '_') && (token = pairs.get(i))) { out += '<' + token.tag + '>' + inline(s.slice(token.begin, token.close), refs, inLink) + '</' + token.tag + '>'; i = token.end; continue; }
    if (c === '~' && (token = strike(s, i))) { out += '<del>' + inline(token.text, refs, inLink) + '</del>'; i = token.end; continue; }
    if (c === '<') {
      const rest = s.slice(i);
      if ((m = /^<([a-zA-Z][a-zA-Z\d+.-]{1,31}:[^ <>\x00-\x20]*)>/.exec(rest))) { out += '<a href="' + escape(url(m[1])) + '">' + escape(m[1]) + '</a>'; i += m[0].length; continue; }
      if ((m = /^<([a-zA-Z\d.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z\d](?:[a-zA-Z\d-]*[a-zA-Z\d])?(?:\.[a-zA-Z\d](?:[a-zA-Z\d-]*[a-zA-Z\d])?)*)>/.exec(rest))) { out += '<a href="mailto:' + m[1] + '">' + m[1] + '</a>'; i += m[0].length; continue; }
      if ((m = /^(?:<!--(?:>|->|[\s\S]*?-->)|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![A-Z][\s\S]*?>|<\/[A-Za-z][A-Za-z\d-]*\s*>|<[A-Za-z][A-Za-z\d-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>)/.exec(rest))) { out += m[0]; i += m[0].length; continue; }
    }
    if (!inLink && /[\w.+-]/.test(c)) {
      const rest = s.slice(i);
      if ((i === 0 || !/[\w]/.test(s[i - 1])) && (m = /^(?:(?:https?|ftp):\/\/|www\.)[^\s<]+/i.exec(rest)) && (!/^www\./i.test(m[0]) || m[0].startsWith('www.'))) {
        let address = m[0], old;
        do {
          old = address;
          address = address.replace(/[?!.,:*_~]+$/, '').replace(/&[A-Za-z\d]+;$/, '');
          while (address.endsWith(')') && (address.match(/\)/g) || []).length > (address.match(/\(/g) || []).length) address = address.slice(0, -1);
          const nextLink = address.indexOf('(', address.indexOf('://') + 3);
          if (nextLink >= 0 && /^(?:https?|ftp):\/\//i.test(address.slice(nextLink + 1))) address = address.slice(0, nextLink);
          address = address.replace(/;$/, '');
        } while (old !== address);
        out += '<a href="' + escape(url(address.startsWith('www.') ? 'http://' + address : address)) + '">' + escape(address) + '</a>'; i += address.length; continue;
      }
      if ((i === 0 || !/[\w.+-]/.test(s[i - 1])) && (m = /^(?:(?:mailto|xmpp):)?[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?:\/[^\s/]+)?/.exec(rest))) {
        let email = m[0];
        if (!email.startsWith('xmpp:')) email = email.split('/')[0];
        const domain = email.split('@')[1].split('/')[0];
        if (!/[-_]$/.test(domain)) { out += '<a href="' + (email.startsWith('mailto:') || email.startsWith('xmpp:') ? '' : 'mailto:') + email + '">' + email + '</a>'; i += email.length; continue; }
      }
    }
    if (c === ' ' || c === '\t') {
      let j = i; while (s[j] === ' ' || s[j] === '\t') j++;
      if (s[j] === '\n') { const hard = j - i >= 2; out += hard ? '<br>' : s.slice(i, j) + '\n'; i = j + 1; if (hard) while (s[i] === ' ' || s[i] === '\t') i++; continue; }
      out += s.slice(i, j); i = j; continue;
    }
    if (c === '&' && (m = /^&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z\d]*);/.exec(s.slice(i)))) {
      if (m[0][1] === '#') { const hex = /[xX]/.test(m[0][2]), number = parseInt(m[0].slice(hex ? 3 : 2, -1), hex ? 16 : 10); out += escape(String.fromCodePoint(number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? number : 0xfffd), true); }
      else out += m[0];
      i += m[0].length; continue;
    }
    out += escape(c); i++;
  }
  return out;
}
