import { escape, label, unescape, destination, punctuation, whitespace, htmlBlock, tableCells, indent } from './grammar.js';
import { listStart, extractList, extractQuote } from './containers.js';

// Blocks retain source text until all definitions in the document are known.
export function parse(markdown) {
  const refs = new Map();
  const source = markdown.replace(/\r\n?/g, '\n');
  return render(blocks(source, refs), refs);
}

function interrupt(line, paragraph = false) {
  if (/^ {0,3}(?:#{1,6}(?:\s|$)|>|`{3,}|~{3,}|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/.test(line)) return true;
  const ls = listStart(line);
  if (ls && (!paragraph || ((!ls.ordered || ls.number === 1) && ls.content.trim()))) return true;
  return !!htmlBlock(line, paragraph);
}

function blocks(source, refs) {
  const lines = source.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const out = [];
  let i = 0;
  while (i < lines.length) {
    let line = lines[i], m;
    if (!line.trim()) { i++; continue; }
    if ((m = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line)) && !(m[1][0] === '`' && m[2].includes('`'))) {
      const pad = /^ */.exec(line)[0].length, marker = m[1], info = m[2].trim();
      let body = ''; i++;
      const close = new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}[ \\t]*$');
      while (i < lines.length && !close.test(lines[i])) { body += lines[i].replace(new RegExp('^ {0,' + pad + '}'), '') + '\n'; i++; }
      if (i < lines.length) i++;
      out.push({ type: 'code', text: body, lang: info.split(/\s/)[0] }); continue;
    }
    if (/^(?: {4}|\t)/.test(line)) {
      let body = '', pending = '';
      while (i < lines.length) {
        if (!lines[i].trim()) { pending += '\n'; i++; }
        else if (/^(?: {4}|\t)/.test(lines[i])) { body += pending + indent(lines[i]).slice(4) + '\n'; pending = ''; i++; }
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
        return { children: blocks(text, refs), task: task ? task[1] !== ' ' : null };
      });
      out.push({ type: 'list', ...list }); continue;
    }
    const html = htmlBlock(line, false);
    if (html) {
      let text = line + '\n'; i++;
      if (!html.end || !html.end.test(line)) {
        while (i < lines.length && (html.end || lines[i].trim())) { const next = lines[i++]; text += next + '\n'; if (html.end?.test(next)) break; }
      }
      out.push({ type: 'raw', text }); continue;
    }
    // A definition can span a destination and a title on following lines.
    const def = readDefinition(lines, i);
    if (def) { if (!refs.has(label(def.name))) refs.set(label(def.name), def); i = def.end; continue; }
    if (i + 1 < lines.length && line.includes('|') && /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const heads = tableCells(line), aligns = tableCells(lines[i + 1]);
      if (heads.length === aligns.length) {
        i += 2; const rows = [];
        while (i < lines.length && lines[i].trim() && !interrupt(lines[i], true)) rows.push(tableCells(lines[i++]));
        out.push({ type: 'table', heads, aligns: aligns.map(x => /^:-+:$/.test(x) ? 'center' : /^:-+$/.test(x) ? 'left' : /^-+:$/.test(x) ? 'right' : ''), rows }); continue;
      }
    }
    let text = line; i++;
    let heading = 0;
    while (i < lines.length && lines[i].trim()) {
      if ((m = /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[i]))) { heading = m[1][0] === '=' ? 1 : 2; i++; break; }
      if (interrupt(lines[i], true)) break;
      text += '\n' + lines[i++];
    }
    out.push(heading ? { type: 'heading', depth: heading, text } : { type: 'paragraph', text });
  }
  return out;
}

function readDefinition(lines, start) {
  const m = /^ {0,3}\[((?:\\.|[^\]\\])+)\]:[ \t]*(.*)$/.exec(lines[start]);
  if (!m) return null;
  let rest = m[2], end = start + 1;
  if (!rest && end < lines.length) rest = lines[end++].trim();
  const d = destination(rest, 0, true);
  if (!d) return null;
  let tail = rest.slice(d.end).trim(), title = '';
  if (!tail && end < lines.length && /^\s+["'(]/.test(lines[end])) tail = lines[end++].trim();
  if (tail) {
    const t = /^(?:"([\s\S]*)"|'([\s\S]*)'|\(([\s\S]*)\))$/.exec(tail);
    if (!t) return null;
    title = t[1] ?? t[2] ?? t[3];
  }
  return { name: m[1], href: d.href, title, end };
}

function render(nodes, refs, tight = false) {
  let result = '';
  for (const n of nodes) {
    switch (n.type) {
      case 'raw': result += n.text; break;
      case 'code': result += '<pre><code' + (n.lang ? ' class="language-' + escape(unescape(n.lang), true) + '"' : '') + '>' + escape(n.text, true) + '</code></pre>\n'; break;
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
          result += '<li>' + (n.loose ? '\n' : '') + content + '</li>\n';
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
    if (s[j] !== char) { j++; continue; }
    let size = 1; while (s[j + size] === char) size++;
    const f = flanks(s, j, size, char);
    const forbidden = (first.close || f.open) && (count + size) % 3 === 0 && (count % 3 !== 0 || size % 3 !== 0);
    if (f.close && !forbidden) {
      balance -= size;
      if (balance <= 0) {
        const used = Math.min(count, size, 2), end = j + Math.max(0, size + balance) - used;
        const tag = used === 2 ? 'strong' : 'em';
        return { html: '<' + tag + '>' + inline(s.slice(at + used, end), refs, inLink) + '</' + tag + '>', end: end + used };
      }
    } else if (f.open) balance += size;
    j += size;
  }
  return null;
}

function link(s, at, refs, inLink) {
  const image = s[at] === '!', begin = at + (image ? 2 : 1);
  if (inLink && !image) return null;
  let depth = 1, j = begin;
  for (; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '[') depth++;
    if (s[j] === ']' && --depth === 0) break;
    if (s[j] !== ']') { /* only closing brackets reduce the nesting depth */ }
  }
  if (j >= s.length) return null;
  const text = s.slice(begin, j); let end = j + 1, href, title = '';
  if (s[end] === '(') {
    let p = end + 1; while (/\s/.test(s[p] || '') && p < s.length) p++;
    const d = destination(s, p, false); if (!d) return null;
    href = d.href; p = d.end;
    const gap = p; while (p < s.length && /\s/.test(s[p])) p++;
    if (p > gap && /["']/.test(s[p] || '')) {
      const quote = s[p++], start = p;
      while (p < s.length && s[p] !== quote) { if (s[p] === '\\') p++; p++; }
      if (p === s.length) return null;
      title = s.slice(start, p++); while (p < s.length && /\s/.test(s[p])) p++;
    }
    if (s[p] !== ')') return null;
    end = p + 1;
  } else {
    let name = text;
    if (s[end] === '[') { const close = s.indexOf(']', end + 1); if (close < 0) return null; name = s.slice(end + 1, close) || text; end = close + 1; }
    const ref = refs.get(label(name)); if (!ref) return null;
    href = ref.href; title = ref.title;
  }
  const url = escape(unescape(href), true), attr = title ? ' title="' + escape(unescape(title), true) + '"' : '';
  if (image) return { html: '<img src="' + url + '" alt="' + escape(unescape(text), true) + '"' + attr + '>', end };
  return { html: '<a href="' + url + '"' + attr + '>' + inline(text, refs, true) + '</a>', end };
}

export function inline(s, refs = new Map(), inLink = false) {
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i]; let m, token;
    if (c === '\\') {
      if (s[i + 1] === '\n') { out += '<br>'; i += 2; continue; }
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
    if ((c === '*' || c === '_') && (token = emphasis(s, i, refs, inLink))) { out += token.html; i = token.end; continue; }
    if (c === '~' && (m = /^(~{1,2})(?=\S)([\s\S]*?\S)\1(?!~)/.exec(s.slice(i)))) { out += '<del>' + inline(m[2], refs, inLink) + '</del>'; i += m[0].length; continue; }
    if (c === '<') {
      const rest = s.slice(i);
      if ((m = /^<([a-zA-Z][a-zA-Z\d+.-]{1,31}:[^ <>\x00-\x20]*)>/.exec(rest))) { out += '<a href="' + escape(m[1], true) + '">' + escape(m[1]) + '</a>'; i += m[0].length; continue; }
      if ((m = /^<([a-zA-Z\d.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z\d](?:[a-zA-Z\d-]*[a-zA-Z\d])?(?:\.[a-zA-Z\d](?:[a-zA-Z\d-]*[a-zA-Z\d])?)*)>/.exec(rest))) { out += '<a href="mailto:' + m[1] + '">' + m[1] + '</a>'; i += m[0].length; continue; }
      if ((m = /^(?:<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![A-Z][\s\S]*?>|<\/?[A-Za-z][A-Za-z\d-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>)/.exec(rest))) { out += m[0]; i += m[0].length; continue; }
    }
    if (!inLink && (c === 'h' || c === 'f' || c === 'w' || /[\w.+-]/.test(c))) {
      const rest = s.slice(i);
      if ((i === 0 || !/[\w]/.test(s[i - 1])) && (m = /^(?:(?:https?|ftp):\/\/|www\.)[^\s<]+/.exec(rest))) {
        let url = m[0].replace(/[?!.,:*_~]+$/, '');
        while (url.endsWith(')') && (url.match(/\)/g) || []).length > (url.match(/\(/g) || []).length) url = url.slice(0, -1);
        url = url.replace(/&[A-Za-z\d]+;$/, '');
        out += '<a href="' + escape(url.startsWith('www.') ? 'http://' + url : url, true) + '">' + escape(url) + '</a>'; i += url.length; continue;
      }
      if ((i === 0 || !/[\w.+-]/.test(s[i - 1])) && (m = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(rest))) { const email = m[0]; out += '<a href="mailto:' + email + '">' + email + '</a>'; i += email.length; continue; }
    }
    if (c === ' ' || c === '\t') {
      let j = i; while (s[j] === ' ' || s[j] === '\t') j++;
      if (s[j] === '\n') { out += j - i >= 2 ? '<br>\n' : '\n'; i = j + 1; continue; }
      if (j === s.length) break;
      out += s.slice(i, j); i = j; continue;
    }
    if (c === '&' && (m = /^&(?:#\d{1,7}|#x[\da-fA-F]{1,6}|[A-Za-z][A-Za-z\d]*);/.exec(s.slice(i)))) { out += m[0]; i += m[0].length; continue; }
    out += escape(c); i++;
  }
  return out;
}
