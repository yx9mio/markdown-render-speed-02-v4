import { bullet, thematic, heading, fence, indent, stripIndent, lineAt, expandIndent, couldStartList, closesFence } from './grammar.js';

export function quote(source, start, interrupt) {
  let cursor = start, body = '', blank = false, lazy = true, activeFence = null;
  while (cursor < source.length) {
    const [line, next] = lineAt(source, cursor);
    const match = /^ {0,3}>[ \t]?/.exec(line);
    if (match) {
      const markerEnd = line.indexOf('>') + 1;
      const expanded = expandIndent(line.slice(markerEnd), markerEnd);
      const content = expanded[0] === ' ' ? expanded.slice(1) : expanded;
      body += content + (next > cursor + line.length ? '\n' : '');
      blank = !content.trim();
      const opening = fence.exec(content);
      if (activeFence) { if (closesFence(content, activeFence)) activeFence = null; lazy = false; }
      else if (opening) { activeFence = opening[1]; lazy = false; }
      else if (indent(content)[0] >= 4 || heading.test(content) || thematic.test(content)) lazy = false;
      else if (content.trim() && !/^ {0,3}>/.test(content)) lazy = true;
    } else {
      if (!lazy || blank || !line.trim() || interrupt(line)) break;
      body += (/^ {0,3}(?:=+|-+)[ \t]*$/.test(line) ? '    ' + line.trimStart() : line) + (next > cursor + line.length ? '\n' : '');
    }
    cursor = next;
  }
  return { end: cursor, body: body.endsWith('\n') ? body.slice(0, -1) : body };
}

export function list(source, start, interrupt, first = lineAt(source, start)[0]) {
  if (!couldStartList(first)) return null;
  const initial = bullet.exec(first);
  if (!initial || thematic.test(first)) return null;
  const ordered = initial[2].length > 1;
  const marker = initial[2].slice(-1);
  const items = [];
  let cursor = start, loose = false;
  while (cursor < source.length) {
    const [line, next] = lineAt(source, cursor);
    const match = cursor === start ? initial : bullet.exec(line);
    if (!match || match[2].slice(-1) !== marker || (match[2].length > 1) !== ordered || thematic.test(line)) break;
    const markerEnd = match[1].length + match[2].length;
    const after = line.slice(markerEnd);
    const [padding] = indent(' '.repeat(markerEnd) + after);
    let width = padding - markerEnd;
    if (!match[4] || width > 4 || width === 0) width = 1;
    const contentIndent = markerEnd + width;
    const initialLine = expandIndent(' '.repeat(markerEnd) + line.slice(markerEnd));
    let body = stripIndent(initialLine, contentIndent), end = next, pending = '';
    let activeFence = fence.exec(body)?.[1] || null;
    let lazy = !activeFence && indent(body)[0] < 4 && !heading.test(body) && !thematic.test(body);
    if (next > cursor + line.length) body += '\n';
    while (end < source.length) {
      const [continuation, following] = lineAt(source, end);
      if (!continuation.trim()) { pending += '\n'; end = following; continue; }
      const [depth] = indent(continuation);
      if (!body.trim() && pending) break;
      if (depth < contentIndent && couldStartList(continuation) && bullet.test(continuation) && !thematic.test(continuation)) break;
      if (depth >= contentIndent) {
        if (pending) { body += pending; pending = ''; }
        body += stripIndent(expandIndent(continuation), contentIndent) + (following > end + continuation.length ? '\n' : '');
      } else {
        if (!lazy || pending || interrupt(continuation) || !body.trim()) break;
        body += (depth < 4 || /^[*+-] /.test(continuation.trimStart()) ? continuation : continuation.trimStart()) + (following > end + continuation.length ? '\n' : '');
      }
      const childLine = stripIndent(continuation, contentIndent);
      if (activeFence) { if (closesFence(childLine, activeFence)) activeFence = null; lazy = !fence.test(childLine); }
      else { const opening = fence.exec(childLine); if (opening) { activeFence = opening[1]; lazy = false; } else if (heading.test(childLine) || thematic.test(childLine)) lazy = false; else if (childLine.trim()) lazy = true; }
      end = following;
    }
    items.push({ body: body.endsWith('\n') ? body.slice(0, -1) : body });
    cursor = end;
    if (pending && cursor < source.length) {
      const [upcoming] = lineAt(source, cursor);
      const sibling = bullet.exec(upcoming);
      if (sibling && sibling[2].slice(-1) === marker) loose = true;
    }
  }
  return { end: cursor, items, loose, ordered, start: ordered ? Number(initial[2].slice(0, -1)) : 1 };
}
