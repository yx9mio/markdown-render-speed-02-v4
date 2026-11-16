import * as g from './grammar.js';
import { list, quote } from './containers.js';

function interrupts(line, paragraph = false) {
  if (g.heading.test(line) || g.thematic.test(line) || g.fence.test(line) || /^ {0,3}>/.test(line)) return true;
  const marker = g.bullet.exec(line);
  if (marker && (!paragraph || marker[4] && (marker[2].length === 1 || Number(marker[2].slice(0, -1)) === 1))) return true;
  return htmlKind(line, paragraph) !== null;
}
function htmlKind(line, paragraph) {
  const text = line.replace(/^ {0,3}/, '');
  if (/^<(script|pre|style|textarea)(?:\s|>|$)/i.test(text)) return new RegExp('</' + /^<(\w+)/.exec(text)[1] + '>', 'i');
  if (text.startsWith('<!--')) return /-->/;
  if (text.startsWith('<?')) return /\?>/;
  if (text.startsWith('<![CDATA[')) return /\]\]>/;
  if (/^<![A-Z]/.test(text)) return />/;
  if (/^<\/?/.test(text) && g.blockTags.test(text.replace(/^<\/?/, ''))) return false;
  if (!paragraph && /^<\/?[A-Za-z]/.test(text)) {
    const match = g.tag.exec(text);
    if (match && !text.slice(match[0].length).trim()) return false;
  }
  return null;
}
function tableCells(line) {
  const cells = []; let start = 0;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '\\') { index++; continue; }
    if (line[index] === '|') { cells.push(line.slice(start, index).trim().replace(/\\\|/g, '|')); start = index + 1; }
  }
  cells.push(line.slice(start).trim().replace(/\\\|/g, '|'));
  if (/^\s*\|/.test(line)) cells.shift();
  if (/\|\s*$/.test(line) && !/\\\|\s*$/.test(line)) cells.pop();
  return cells;
}
function reference(source, position, refs) {
  const prefix = /^ {0,3}\[((?:\\.|[^\[\]\\])+)\]:[ \t]*(?:\n[ \t]*)?/.exec(source.slice(position));
  if (!prefix || !prefix[1].trim() || /\n[ \t]*\n/.test(prefix[1])) return 0;
  let cursor = position + prefix[0].length, href, title = '';
  if (source[cursor] === '<') {
    const begin = ++cursor;
    while (cursor < source.length && source[cursor] !== '>') { if (source[cursor] === '\n' || source[cursor] === '<') return 0; if (source[cursor] === '\\') cursor++; cursor++; }
    if (cursor === source.length) return 0;
    href = source.slice(begin, cursor++);
  } else {
    const begin = cursor;
    while (cursor < source.length && !/[ \t\n]/.test(source[cursor])) cursor++;
    href = source.slice(begin, cursor); if (!href) return 0;
  }
  const destinationEnd = cursor;
  while (source[cursor] === ' ' || source[cursor] === '\t') cursor++;
  let lineEnd = cursor;
  if (source[cursor] === '\n') { cursor++; while (source[cursor] === ' ' || source[cursor] === '\t') cursor++; }
  const delimiter = source[cursor];
  if (cursor > destinationEnd && (delimiter === '"' || delimiter === "'" || delimiter === '(')) {
    const close = delimiter === '(' ? ')' : delimiter, begin = ++cursor;
    while (cursor < source.length && source[cursor] !== close) { if (source[cursor] === '\\') cursor++; cursor++; }
    if (cursor < source.length) {
      title = source.slice(begin, cursor++);
      if (/\n[ \t]*\n/.test(title)) return 0;
      while (source[cursor] === ' ' || source[cursor] === '\t') cursor++;
      if (source[cursor] && source[cursor] !== '\n') { if (source[lineEnd] !== '\n') return 0; cursor = lineEnd; title = ''; }
    } else { if (source[lineEnd] !== '\n') return 0; cursor = lineEnd; }
  } else {
    if (source[lineEnd] && source[lineEnd] !== '\n') return 0;
    cursor = lineEnd;
  }
  const key = g.label(prefix[1]);
  if (!refs.has(key)) refs.set(key, { href, title });
  return cursor + (source[cursor] === '\n' ? 1 : 0) - position;
}
function blocks(source, refs, tight = false) {
  const output = []; const mode = { tight }; output.mode = mode; let cursor = 0, previousStart = 0;
  while (cursor < source.length) {
    let [line, next] = g.lineAt(source, cursor);
    if (!line.trim()) { cursor = next; continue; }
    if (output.length && /\n[ \t]*\n[ \t\n]*$/.test(source.slice(previousStart, cursor))) output.loose = true;
    previousStart = cursor;
    let match;
    if ((match = g.fence.exec(line)) && !(match[1][0] === '`' && match[2].includes('`'))) {
      let end = next, body = ''; const close = new RegExp('^ {0,3}' + match[1][0] + '{' + match[1].length + ',}[ \\t]*$');
      const amount = match[1][0] === '`' ? /^ */.exec(line)[0].length : 0;
      while (end < source.length) { const [part, following] = g.lineAt(source, end); if (close.test(part)) { end = following; break; } body += (amount ? part.replace(new RegExp('^[ \t]{0,' + amount + '}'), '') : part) + (following > end + part.length ? '\n' : ''); end = following; }
      if (body.endsWith('\n')) body = body.slice(0, -1);
      if (body && !body.endsWith('\n')) body += '\n';
      const language = g.unescape(match[2].trim().split(/\s+/)[0]);
      output.push('<pre><code' + (language ? ' class="language-' + g.escapeHtml(language) + '"' : '') + '>' + g.escapeHtml(body, true) + '</code></pre>\n'); cursor = end; continue;
    }
    if ((match = g.heading.exec(line))) {
      let text = match[2].trim(); text = text.replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim();
      const level = match[1].length;
      output.push(() => `<h${level}>${inline(text, refs)}</h${level}>\n`);
      cursor = next; continue;
    }
    if (g.thematic.test(line)) { output.push('<hr>\n'); cursor = next; continue; }
    if (/^ {0,3}>/.test(line)) {
      const container = quote(source, cursor, line => interrupts(line, true));
      const body = blocks(container.body, refs); output.push(() => '<blockquote>\n' + finish(body) + '</blockquote>\n'); cursor = container.end; continue;
    }
    const container = list(source, cursor, line => interrupts(line, true));
    if (container) {
      const rendered = container.items.map(item => {
        let body = item.body, task = /^\[([ xX])\][ \t]+/.exec(body), check = '';
        if (task) { body = body.slice(task[0].length); check = '<input ' + (task[1] !== ' ' ? 'checked="" ' : '') + 'disabled="" type="checkbox"> '; }
        const content = blocks(body, refs, true);
        if (content.loose) container.loose = true;
        return () => { content.mode.tight = !container.loose; let html = finish(content); if (check) html = container.loose && html.startsWith('<p>') ? '<p>' + check + html.slice(3) : check + html; return '<li>' + html + '</li>\n'; };
      });
      const name = container.ordered ? 'ol' : 'ul';
      output.push(() => '<' + name + (container.ordered && container.start !== 1 ? ' start="' + container.start + '"' : '') + '>\n' + rendered.map(fn => fn()).join('') + '</' + name + '>\n'); cursor = container.end; continue;
    }
    if (g.indent(line)[0] >= 4) {
      let body = '', end = cursor, pending = '';
      while (end < source.length) { const [part, following] = g.lineAt(source, end); if (!part.trim()) pending += g.stripIndent(part, 4) + '\n'; else if (g.indent(part)[0] >= 4) { body += pending + g.stripIndent(part, 4) + '\n'; pending = ''; } else break; end = following; }
      output.push('<pre><code>' + g.escapeHtml(body, true) + '</code></pre>\n'); cursor = end; continue;
    }
    const kind = htmlKind(line, false);
    if (kind !== null) {
      let end = next, body = line + (next > cursor + line.length ? '\n' : '');
      if (kind === false || !kind.test(line)) while (end < source.length) { const [part, following] = g.lineAt(source, end); if (kind === false && !part.trim()) break; body += part + (following > end + part.length ? '\n' : ''); end = following; if (kind && kind.test(part)) break; }
      if (end < source.length && (kind === false ? !g.lineAt(source, end)[0].trim() : g.lineAt(source, end)[0] === '')) body = body.replace(/\n$/, '');
      output.push(body); cursor = end; continue;
    }
    const definition = reference(source, cursor, refs);
    if (definition) { cursor += definition; continue; }
    if (next < source.length && line.includes('|')) {
      const [separator, after] = g.lineAt(source, next); const columns = tableCells(separator);
      if (columns.length && columns.every(cell => /^:?-+:?$/.test(cell))) {
        const headers = tableCells(line);
        if (headers.length === columns.length) {
          const rows = []; let end = after;
          while (end < source.length) { const [row, following] = g.lineAt(source, end); if (/^ *$/.test(row) || interrupts(row, true)) break; rows.push(tableCells(row)); end = following; }
          output.push(() => {
            const cell = (value, index, name) => '<' + name + (columns[index].startsWith(':') && columns[index].endsWith(':') ? ' align="center"' : columns[index].endsWith(':') ? ' align="right"' : columns[index].startsWith(':') ? ' align="left"' : '') + '>' + inline(value || '', refs) + '</' + name + '>\n';
            return '<table>\n<thead>\n<tr>\n' + headers.map((value, index) => cell(value, index, 'th')).join('') + '</tr>\n</thead>\n' + (rows.length ? '<tbody>' + rows.map(row => '<tr>\n' + headers.map((_, index) => cell(row[index], index, 'td')).join('') + '</tr>\n').join('') + '</tbody>' : '') + '</table>\n';
          }); cursor = end; continue;
        }
      }
    }
    let text = line, end = next, level = 0;
    while (end < source.length) {
      const [part, following] = g.lineAt(source, end);
      if ((match = g.setext.exec(part))) { level = match[1][0] === '=' ? 1 : 2; end = following; break; }
      if ((!part.trim() && part !== ' ') || interrupts(part, !tight)) break;
      text += '\n' + part; end = following;
    }
    text = text.replace(/\n {4,}(?=[*+-][ \t])/g, '\n');
    if (level) output.push(() => `<h${level}>${inline(text.trim(), refs)}</h${level}>\n`);
    else output.push(() => mode.tight ? inline(text, refs) : '<p>' + inline(text, refs) + '</p>\n');
    cursor = end;
  }
  return output;
}
function finish(parts) { let html = ''; for (const part of parts) html += typeof part === 'string' ? part : part(); return html; }

function nestedLink(text, refs) {
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\\') { index++; continue; }
    const protectedTo = protectedEnd(text, index); if (protectedTo > index) { index = protectedTo - 1; continue; }
    if (text[index] !== '[') continue;
    if (text[index - 1] === '!') { const close = bracketEnd(text, index + 1); if (close >= 0) { index = close; if (text[index + 1] === '[') { const finish = text.indexOf(']', index + 2); if (finish >= 0) index = finish; } else if (text[index + 1] === '(') { const target = linkTarget(text, index + 2); if (target) index = target.end - 1; } } continue; }
    const end = bracketEnd(text, index + 1); if (end < 0) continue;
    if (text[end + 1] === '(' && linkTarget(text, end + 2)) return true;
    let key = text.slice(index + 1, end);
    if (text[end + 1] === '[') { const close = text.indexOf(']', end + 2); if (close >= 0) key = text.slice(end + 2, close) || key; }
    if (refs.has(g.label(key))) return true;
  }
  return false;
}
function protectedEnd(text, index) {
  if (text[index] === '`') {
    let length = 1; while (text[index + length] === '`') length++;
    let end = index + length;
    while ((end = text.indexOf('`', end)) >= 0) { let count = 1; while (text[end + count] === '`') count++; if (count === length) return end + count; end += count; }
    return index + length;
  }
  if (text[index] === '<') {
    const match = /^(?:<[A-Za-z][A-Za-z\d+.-]{1,31}:[^\s<>]*>|<[^\s<>]+@[^\s<>]+>)/.exec(text.slice(index)) || g.tag.exec(text.slice(index));
    if (match) return index + match[0].length;
  }
  return index;
}
function bracketEnd(text, start) {
  let depth = 1, sawDouble = false;
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') { index++; continue; }
    if (text[index] === '`' && text[index + 1] === '`') sawDouble = true;
    const skip = protectedEnd(text, index);
    if (skip > index && !(sawDouble && text.slice(index, skip).includes(']'))) { index = skip - 1; continue; }
    if (text[index] === '[') depth++;
    if (text[index] === ']' && --depth === 0) return index;
  }
  return -1;
}
function linkTarget(text, start) {
  let cursor = start; while (/[ \t\n]/.test(text[cursor] || '') && cursor < text.length) cursor++;
  let href = '', title = '';
  if (text[cursor] === '<') {
    const end = text.indexOf('>', cursor + 1); if (end < 0 || text[end - 1] === '\\' || /[\n<]/.test(text.slice(cursor + 1, end))) return null;
    href = text.slice(cursor + 1, end); cursor = end + 1;
  } else {
    const begin = cursor; let depth = 0;
    while (cursor < text.length) {
      const character = text[cursor];
      if (character === '\\') { cursor += 2; continue; }
      if (/[ \t\n]/.test(character)) break;
      if (character === '(') depth++;
      if (character === ')') { if (!depth) break; depth--; }
      cursor++;
    }
    if (depth) return null; href = text.slice(begin, cursor);
  }
  const before = cursor; while (cursor < text.length && /[ \t\n]/.test(text[cursor])) cursor++;
  if (cursor > before && /["'(]/.test(text[cursor] || 'x')) {
    const delimiter = text[cursor] === '(' ? ')' : text[cursor]; const begin = ++cursor;
    while (cursor < text.length && text[cursor] !== delimiter) { if (text[cursor] === '\\') cursor++; cursor++; }
    if (cursor === text.length) return null;
    title = text.slice(begin, cursor++); while (cursor < text.length && /[ \t\n]/.test(text[cursor])) cursor++;
  }
  return text[cursor] === ')' ? { href, title, end: cursor + 1 } : null;
}
function trimUrlParentheses(value) {
  // Parenthesized URL fragments stop at the next close; they do not nest.
  let position = 0;
  while ((position = value.indexOf('(', position)) >= 0) {
    const end = value.indexOf(')', position + 1);
    if (end < 0) return value.slice(0, position);
    position = end + 1;
  }
  while (value.endsWith(')')) {
    const open = value.lastIndexOf('(');
    if (open >= 0 && value.indexOf(')', open) === value.length - 1) break;
    value = value.slice(0, -1);
  }
  return value;
}
function emphasisMask(text) {
  const spans = [];
  if (text.indexOf('`') < 0 || text.indexOf('*') < 0 && text.indexOf('_') < 0) return spans;
  for (let position = 0; position < text.length; position++) {
    if (text[position] === '\\') { position++; continue; }
    if (text[position] === '`') {
      const end = protectedEnd(text, position);
      if (end > position) { spans.push(position, end); position = end - 1; }
    }
  }
  // A prospective link is masked before its destination is validated.
  for (let position = text.indexOf('['); position >= 0; position = text.indexOf('[', position + 1)) {
    const end = bracketEnd(text, position + 1);
    if (end < 0 || text[end + 1] !== '(') continue;
    const caption = text.slice(position + 1, end);
    const ticks = caption.match(/`/g);
    if (ticks && ticks.length % 2 && /``[^`]*`[^`]*``.+/.test(caption)) spans.push(position, end + 1);
  }
  return spans;
}
function maskedAt(spans, position) {
  for (let index = 0; index < spans.length; index += 2) if (position >= spans[index] && position < spans[index + 1]) return spans[index + 1];
  return 0;
}
function inline(text, refs, inLink = refs.inLink || false, raw = refs.raw || false) {
  const masked = emphasisMask(text);
  let html = '', cursor = 0;
  while (cursor < text.length) {
    const character = text[cursor]; let match;
    if (character === '\\') {
      const following = text[cursor + 1];
      if (following === '\n') { html += '<br>'; cursor += 2; while (text[cursor] === ' ' || text[cursor] === '\t') cursor++; continue; }
      if (following && g.escapable.test(following)) { html += g.escapeHtml(following, true); cursor += 2; continue; }
    }
    if (character === '`') {
      let length = 1; while (text[cursor + length] === '`') length++;
      let end = cursor + length, found = -1;
      while ((end = text.indexOf('`', end)) >= 0) { let count = 1; while (text[end + count] === '`') count++; if (count === length) { found = end; break; } end += count; }
      if (found >= 0) { let body = text.slice(cursor + length, found).replace(/\n/g, ' '); if (body.startsWith(' ') && body.endsWith(' ') && /[^ ]/.test(body)) body = body.slice(1, -1); html += '<code>' + g.escapeHtml(body, true) + '</code>'; cursor = found + length; continue; }
      html += '`'.repeat(length); cursor += length; continue;
    }
    if (character === '<') {
      const rest = text.slice(cursor);
      if ((match = /^<([A-Za-z][A-Za-z\d+.-]{1,31}:[^\s<>]*)>/.exec(rest))) { const href = g.destination(match[1], false); html += '<a href="' + g.escapeHtml(href || match[1]) + '">' + g.escapeHtml(match[1]) + '</a>'; cursor += match[0].length; continue; }
      if ((match = /^<([A-Za-z\d.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?(?:\.[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?)*)>/.exec(rest))) { html += '<a href="mailto:' + g.escapeHtml(match[1]) + '">' + g.escapeHtml(match[1]) + '</a>'; cursor += match[0].length; continue; }
      if ((match = g.tag.exec(rest))) { html += match[0]; if (/^<a\s/i.test(match[0])) inLink = true; if (/^<\/a\s*>/i.test(match[0])) inLink = false; if (/^<(?:pre|code|kbd|script)(?:\s|>)/i.test(match[0])) raw = true; if (/^<\/(?:pre|code|kbd|script)\s*>/i.test(match[0])) raw = false; refs.inLink = inLink; refs.raw = raw; cursor += match[0].length; continue; }
    }
    if (character === '[' || character === '!' && text[cursor + 1] === '[') {
      const image = character === '!', open = cursor + (image ? 2 : 1), end = bracketEnd(text, open);
      if (end >= 0) {
        const caption = text.slice(open, end); let target = null;
        const ticks = caption.match(/`/g);
        const labelValid = !(ticks && ticks.length % 2 && /``[^`]*`[^`]*``.+/.test(caption));
        if (text[end + 1] === '(') target = linkTarget(text, end + 2);
        if (!target) {
          let label = caption, after = end + 1;
          if (text[after] === '[') { const close = text.indexOf(']', after + 1); if (close >= 0) { label = text.slice(after + 1, close) || caption; after = close + 1; } }
          const definition = refs.get(g.label(label)); if (definition) target = { ...definition, end: after };
        }
        if (!labelValid) target = null;
        if (target && !image && nestedLink(caption, refs)) target = null;
        if (target) {
          const href = g.destination(target.href), title = target.title ? ' title="' + g.escapeHtml(g.unescape(target.title)) + '"' : '';
          if (!image && href !== null) refs.inLink = true;
          if (href !== null) { html += image ? '<img src="' + g.escapeHtml(href) + '" alt="' + inline(caption, refs, false).replace(/<img [^>]*alt="([^"]*)"[^>]*>/g, '$1').replace(/<[^>]*>/g, '') + '"' + title + '>' : '<a href="' + g.escapeHtml(href) + '"' + title + '>' + inline(caption, refs, true) + '</a>'; if (!image) refs.inLink = inLink; cursor = target.end; continue; }
        }
      }
    }
    if (character === '*' || character === '_') {
      if (maskedAt(masked, cursor)) { html += character; cursor++; continue; }
      let count = 1; while (text[cursor + count] === character) count++;
      const previous = cursor ? text[cursor - 1] : '\n', following = text[cursor + count] || '\n';
      const left = !g.whitespace.test(following) && (!g.punctuation.test(following) || g.whitespace.test(previous) || g.punctuation.test(previous));
      const right = !g.whitespace.test(previous) && (!g.punctuation.test(previous) || g.whitespace.test(following) || g.punctuation.test(following));
      if (left && (character === '*' || !right || g.punctuation.test(previous))) {
        let balance = count, middle = 0, position = cursor + count, found = -1, consumed = 0;
        while (position < text.length) {
          const maskedEnd = maskedAt(masked, position);
          if (maskedEnd) { position = maskedEnd; continue; }
          if (text[position] === '\\') { position += 2; continue; }
          let skip = protectedEnd(text, position);
          if (skip > position) { position = skip; continue; }
          if (text[position] === '[' || text[position] === '!' && text[position + 1] === '[') {
            const open = position + (text[position] === '!' ? 2 : 1), close = bracketEnd(text, open);
            if (close >= 0) {
              let finish = 0;
              if (text[close + 1] === '(') finish = linkTarget(text, close + 2)?.end || 0;
              else { let key = text.slice(open, close), end = close + 1; if (text[end] === '[') { const bracket = text.indexOf(']', end + 1); if (bracket >= 0) { key = text.slice(end + 1, bracket) || key; end = bracket + 1; } } if (refs.has(g.label(key))) finish = end; }
              if (finish) { position = finish; continue; }
            }
          }
          if ((text[position] === '*' || text[position] === '_') && text[position] !== character && !g.whitespace.test(text[position + 1] || '\n')) {
            const other = text[position]; let run = 1; while (text[position + run] === other) run++;
            let closing = position + run;
            while ((closing = text.indexOf(other.repeat(run), closing)) >= 0) { if (!g.whitespace.test(text[closing - 1])) break; closing += run; }
            if (closing >= 0 && !text.slice(position + run, closing).includes('`')) { let crosses = false; for (let at = position + run; at < closing; at++) if (text[at] === character && !g.whitespace.test(text[at - 1])) { crosses = true; break; } if (!crosses) { position = closing + run; continue; } }
          }
          if (text[position] !== character) { position++; continue; }
          let length = 1; while (text[position + length] === character) length++;
          const before = text[position - 1], after = text[position + length] || '\n';
          const canClose = !g.whitespace.test(before) && (!g.punctuation.test(before) || g.whitespace.test(after) || g.punctuation.test(after));
          const canOpen = !g.whitespace.test(after) && (!g.punctuation.test(after) || g.whitespace.test(before) || g.punctuation.test(before));
          if (canOpen && !canClose) balance += length;
          else if (canClose && (character === '*' || !canOpen || g.punctuation.test(after))) {
            if (!((right || canOpen) && (count + length) % 3 === 0 && (count % 3 || length % 3))) {
              balance -= length;
              if (balance <= 0) { found = position; consumed = Math.min(length, length + balance + middle); break; }
            } else middle += length;
          }
          position += length;
        }
        if (found >= 0) {
          const used = Math.min(count, consumed) % 2 ? 1 : 2, name = used === 1 ? 'em' : 'strong';
          html += '<' + name + '>' + inline(text.slice(cursor + used, found + consumed - used), refs, inLink, raw) + '</' + name + '>';
          inLink = refs.inLink || false; raw = refs.raw || false;
          cursor = found + consumed; continue;
        }
      }
      if (left && (character === '*' || !right || g.punctuation.test(previous))) { html += character; cursor++; }
      else { html += character.repeat(count); cursor += count; }
      continue;
    }
    if (character === '~') {
      let count = 1; while (text[cursor + count] === '~') count++;
      if (count <= 2 && !g.whitespace.test(text[cursor + count] || '\n')) {
        let end = cursor + count, depth = 1;
        while ((end = text.indexOf('~', end)) >= 0) {
          if (text[end - 1] === '\\') { end++; continue; }
          let closing = 1; while (text[end + closing] === '~') closing++;
          if (closing === count) { if (!g.whitespace.test(text[end - 1])) { if (--depth === 0) break; } else if (!g.whitespace.test(text[end + closing] || '\n')) depth++; }
          end += closing;
        }
        if (end >= 0) { html += '<del>' + inline(text.slice(cursor + count, end), refs, inLink, raw) + '</del>'; inLink = refs.inLink || false; raw = refs.raw || false; cursor = end + count; continue; }
      }
      html += '~'.repeat(count); cursor += count; continue;
    }
    if (!inLink && (character === 'h' || character === 'f' || character === 'w' || /[\w.!#$%&'*+/=?^`{|}~-]/.test(character))) {
      const rest = text.slice(cursor);
      match = /^(?:(?:[Hh][Tt][Tt][Pp][Ss]?|[Ff][Tt][Pp]):\/\/|www\.)(?:[^\s<>]+)/.exec(rest);
      let email = false;
      if (!match) match = /^(?:mailto:|xmpp:)[A-Za-z\d._+-]+@(?:[A-Za-z\d-]+\.)+[A-Za-z\d-]+(?:\/[A-Za-z\d@._+-]+)?/.exec(rest);
      if (!match) { match = /^[A-Za-z\d._+-]+@(?:[A-Za-z\d-]+\.)+[A-Za-z\d]+(?=[^A-Za-z\d-]|$)/.exec(rest); email = true; }
      if (match && (email || /^(?:mailto:|xmpp:)/.test(match[0])) && (match[0].endsWith('-') || text[cursor + match[0].length] === '_')) { html += g.escapeHtml(match[0]); cursor += match[0].length; continue; }
      if (match) {
        let value = match[0];
        let last; do { last = value; value = value.replace(/&[a-zA-Z0-9]+;$/, '').replace(/[?!.,:;*_~]+$/, '');
        value = trimUrlParentheses(value);
        } while (last !== value);
        value = value.replace(/&[\w]+;$/, '');
        html += '<a href="' + g.escapeHtml(g.destination((email ? 'mailto:' : value.startsWith('www.') ? 'http://' : '') + value, false) || value) + '">' + g.escapeHtml(value) + '</a>'; cursor += value.length; continue;
      }
    }
    if (character === ' ' || character === '\n') {
      let end = cursor; while (text[end] === ' ') end++;
      if (text[end] === '\n') { const hard = end - cursor >= 2; html += hard ? '<br>' : text.slice(cursor, end) + '\n'; cursor = end + 1; if (hard) while (text[cursor] === ' ' || text[cursor] === '\t') cursor++; continue; }
    }
    if (character === '&' && !raw && text[cursor + 1] === '#') {
      const numeric = /^&#(x[\da-f]{1,6}|[0-9]{1,7});/i.exec(text.slice(cursor));
      if (numeric) { const number = numeric[1][0].toLowerCase() === 'x' ? parseInt(numeric[1].slice(1), 16) : Number(numeric[1]); html += g.escapeHtml(number === 0 || number > 0x10ffff || number >= 0xd800 && number <= 0xdfff ? '\ufffd' : String.fromCodePoint(number), true); cursor += numeric[0].length; continue; }
    }
    html += raw ? character : g.escapeHtml(character, character !== '&');
    if (character === '&' && !raw) { const entity = /^&(?:#\d{1,7}|#x[\da-f]{1,6}|[a-z]\w*);/i.exec(text.slice(cursor)); if (entity) { html = html.slice(0, -5) + entity[0]; cursor += entity[0].length; continue; } }
    cursor++;
  }
  return html;
}
export function parse(markdown) {
  const source = String(markdown).replace(/\r\n?|\u2424/g, '\n');
  const refs = new Map();
  return finish(blocks(source, refs));
}
