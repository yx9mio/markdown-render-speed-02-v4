const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const special = /[&<>"']/g;
const escaped = char => entities[char];
export function escape(text, all = false) {
  if (!all) return text.replace(/&(?!#\d+;|#x[\da-fA-F]+;|[A-Za-z][A-Za-z\d]*;)|[<>"']/g, escaped);
  return text.replace(special, escaped);
}
export const label = text => text.trim().replace(/\s+/g, ' ').toLowerCase();
export const unescape = text => text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
export const whitespace = char => /\s/.test(char);
export const punctuation = char => /[\p{P}\p{S}]/u.test(char);

export function indent(text) {
  let column = 0, out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\t') { const size = 4 - column % 4; out += ' '.repeat(size); column += size; }
    else { out += text[i]; column++; }
  }
  return out;
}

export function destination(s, at, definition) {
  if (s[at] === '<') {
    let i = at + 1;
    while (i < s.length && s[i] !== '>') { if (s[i] === '\n' || s[i] === '<') return null; if (s[i] === '\\') i++; i++; }
    return i < s.length ? { href: s.slice(at + 1, i), end: i + 1 } : null;
  }
  let depth = 0, i = at;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { i++; continue; }
    if (/\s/.test(c) || c === ')' && !depth) break;
    if (c === '(') depth++;
    if (c === ')') depth--;
  }
  if (depth || definition && i === at) return null;
  return { href: s.slice(at, i), end: i };
}

const blockTags = /^(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i;
export function htmlBlock(line, paragraph) {
  const s = line.replace(/^ {0,3}/, '');
  let m;
  if ((m = /^<(script|pre|style|textarea)(?:\s|>|$)/i.exec(s))) return { end: new RegExp('</' + m[1] + '>', 'i') };
  if (s.startsWith('<!--')) return { end: /-->/ };
  if (s.startsWith('<?')) return { end: /\?>/ };
  if (s.startsWith('<![CDATA[')) return { end: /\]\]>/ };
  if (/^<![A-Z]/.test(s)) return { end: />/ };
  if (/^<\/?/.test(s) && blockTags.test(s.replace(/^<\/?/, ''))) return {};
  if (!paragraph && /^<\/?[A-Za-z][A-Za-z\d-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>\s*$/.test(s)) return {};
  return null;
}

export function tableCells(line) {
  let text = line.trim();
  if (text[0] === '|') text = text.slice(1);
  if (text.at(-1) === '|' && text.at(-2) !== '\\') text = text.slice(0, -1);
  const cells = []; let current = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === '|') { current += '|'; i++; }
    else if (text[i] === '|') { cells.push(current.trim()); current = ''; }
    else current += text[i];
  }
  cells.push(current.trim()); return cells;
}
