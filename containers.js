import { indent } from './grammar.js';

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
  let i = start, loose = false;
  while (i < lines.length) {
    const head = listStart(lines[i]);
    if (!head || head.ordered !== first.ordered || head.marker !== first.marker) break;
    const body = [head.content]; i++;
    let blank = false, itemLoose = false;
    while (i < lines.length) {
      const raw = lines[i], expanded = indent(raw), next = listStart(raw);
      if (!raw.trim()) { body.push(''); blank = true; i++; continue; }
      const leading = /^ */.exec(expanded)[0].length;
      if (leading >= head.offset) {
        if (blank) itemLoose = true;
        body.push(expanded.slice(head.offset)); blank = false; i++; continue;
      }
      if (next || blank || interrupt(raw, true)) break;
      body.push(raw); i++;
    }
    if (itemLoose) loose = true;
    const next = i < lines.length ? listStart(lines[i]) : null;
    if (blank && next && next.ordered === first.ordered && next.marker === first.marker) loose = true;
    while (body.at(-1) === '') body.pop();
    items.push({ text: body.join('\n') });
  }
  return { ordered: first.ordered, number: first.number, items, loose, end: i };
}

export function extractQuote(lines, start, interrupt) {
  let i = start, text = '', previousBlank = false;
  while (i < lines.length) {
    const m = /^ {0,3}>[ \t]?(.*)$/.exec(lines[i]);
    if (m) { text += m[1] + '\n'; previousBlank = !m[1].trim(); i++; continue; }
    if (!lines[i].trim() || previousBlank || interrupt(lines[i], true)) break;
    text += lines[i++] + '\n';
  }
  return { text, end: i };
}
