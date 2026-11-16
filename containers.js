import { indent, indentLeading, htmlBlock } from './grammar.js';

export function listStart(line) {
  const m = /^( {0,3})([*+-]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/.exec(line);
  if (!m) return null;
  const ordered = m[2].length > 1;
  let spaces = (m[3] || ' '), content = m[4] || '';
  const prefix = m[1].length + m[2].length;
  spaces = indent(' '.repeat(prefix) + spaces).slice(prefix);
  let padding = spaces.length;
  if (padding > 4) { content = spaces.slice(1) + content; padding = 1; }
  if (!content.trim()) padding = 1;
  return { ordered, number: ordered ? parseInt(m[2]) : 0, marker: ordered ? m[2].at(-1) : m[2], offset: prefix + padding, leading: m[1].length, content };
}

export function extractList(lines, start, interrupt) {
  const first = listStart(lines[start]), items = [];
  let i = start, loose = false, space = false;
  while (i < lines.length) {
    const head = listStart(lines[i]);
    if (!head || head.ordered !== first.ordered || head.marker !== first.marker) break;
    if (/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(lines[i])) break;
    const body = [head.content], lazy = new Set(); i++;
    let blank = false, itemLoose = false, fence = /^ {0,3}(`{3,}|~{3,})/.exec(head.content)?.[1] || null;
    while (i < lines.length) {
      const raw = lines[i], expanded = indentLeading(raw), next = listStart(raw);
      if (!raw.trim()) { body.push(''); blank = true; i++; if (!head.content.trim()) break; continue; }
      const leading = /^ */.exec(expanded)[0].length;
      if (leading >= head.offset) {
        if (blank) itemLoose = true;
        const content = expanded.slice(head.offset), fm = /^ {0,3}(`{3,}|~{3,})/.exec(content);
        if (fm && (!fm[1].startsWith('`') || !content.slice(fm[0].length).includes('`'))) fence = fence && fm[1][0] === fence[0] && fm[1].length >= fence.length ? null : fence || fm[1];
        body.push(content); blank = false; i++; continue;
      }
      if (next || blank || fence && /^ {0,3}(?:`{3,}|~{3,})/.test(body.at(-1)) || interrupt(raw, true)) break;
      lazy.add(body.length); body.push(raw); i++;
    }
    const next = i < lines.length ? listStart(lines[i]) : null;
    if (blank && next && next.ordered === first.ordered && next.marker === first.marker) loose = true;
    space = blank;
    while (body.at(-1) === '') body.pop();
    items.push({ text: body.join('\n'), lazy });
  }
  return { ordered: first.ordered, number: first.number, items, loose, space, end: i };
}

export function extractQuote(lines, start, interrupt) {
  let i = start, text = '', previousBlank = false, nonParagraph = false, fence = null, lineNumber = 0;
  const lazy = new Set();
  while (i < lines.length) {
    const raw = indentLeading(lines[i]);
    const quote = /^ {0,3}>(.*)$/.exec(raw);
    let m = null;
    if (quote) {
      const prefix = /^[ \t]*/.exec(quote[1])[0];
      let spaces = '', col = 1;
      for (const c of prefix) { const count = c === '\t' ? 4 - col % 4 : 1; spaces += ' '.repeat(count); col += count; }
      m = [quote[0], (spaces + quote[1].slice(prefix.length)).replace(/^ /, '')];
    }
    if (m) {
      const fm = /^ {0,3}(`{3,}|~{3,})/.exec(m[1]);
      const opening = !fence && fm && (!fm[1].startsWith('`') || !m[1].slice(fm[0].length).includes('`'));
      text += m[1] + '\n'; previousBlank = !m[1].trim();
      if (fm && (!fm[1].startsWith('`') || !m[1].slice(fm[0].length).includes('`'))) fence = fence && fm[1][0] === fence[0] && fm[1].length >= fence.length ? null : fence || fm[1];
      nonParagraph = !!fence || /^ {4}/.test(m[1]) || !!htmlBlock(m[1], true); i++; lineNumber++; continue;
    }
    if (!lines[i].trim() || previousBlank || nonParagraph || interrupt(lines[i], true)) break;
    lazy.add(lineNumber++);
    text += (/^ {0,3}(?:=+|-+)\s*$/.test(lines[i]) ? '    ' : '') + lines[i++] + '\n';
  }
  return { text: text.replace(/\n$/, ''), end: i, lazy };
}
