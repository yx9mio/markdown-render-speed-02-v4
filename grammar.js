// Original scanner rules. Stateful parsing belongs to parse.js and containers.js.
export const punctuation = /[\p{P}\p{S}]/u;
export const whitespace = /\s/u;
export const escapable = /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]$/;
export const heading = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/;
export const thematic = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const fenceExpression = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/;
export const fence = {
  exec(value) { const result = fenceExpression.exec(value); return result && !(result[1][0] === '`' && result[2].includes('`')) ? result : null; },
  test(value) { return this.exec(value) !== null; }
};
export const bullet = /^( {0,3})([*+-]|\d{1,9}[.)])([ \t]+|$)(.*)$/;
export const setext = /^ {0,3}(=+|-+)[ \t]*$/;
export const inlineUrl = /^(?:(?:[Hh][Tt][Tt][Pp][Ss]?|[Ff][Tt][Pp]):\/\/|www\.)(?:[^\s<>]+)/;
export const protocolEmail = /^(?:mailto:|xmpp:)[A-Za-z\d._+-]+@(?:[A-Za-z\d-]+\.)+[A-Za-z\d-]+(?:\/[A-Za-z\d@._+-]+)?/;
export const bareEmail = /^[A-Za-z\d._+-]+@(?:[A-Za-z\d-]+\.)+[A-Za-z\d]+(?=[^A-Za-z\d-]|$)/;
const htmlCharacters = /[&<>"']/;
const encodeCharacters = /[&<>"']/g;
const preserveEntities = /&(?!#\d+;|#x[\da-f]+;|\w+;)|[<>"']/gi;
function encodeCharacter(character) {
  switch (character) {
    case '&': return '&amp;';
    case '<': return '&lt;';
    case '>': return '&gt;';
    case '"': return '&quot;';
    default: return '&#39;';
  }
}
export const tag = /^(?:<!--(?:>|->|[\s\S]*?-->)|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![A-Z][\s\S]*?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>|<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'"=<>`]+))?)*\s*\/?>)/;
export const blockTags = /^(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i;
export function escapeHtml(value, all = false) {
  if (value.length === 0 || !htmlCharacters.test(value)) return value;
  return value.replace(all ? encodeCharacters : preserveEntities, encodeCharacter);
}
export function unescape(value) {
  if (value.indexOf('\\') < 0) return value;
  return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
}
export function label(value) { return value.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase(); }
export function destination(value, escapes = true) {
  try { return encodeURI(escapes ? unescape(value) : value).replace(/%25/g, '%'); } catch { return null; }
}
export function lineAt(source, start) {
  const end = source.indexOf('\n', start);
  return end < 0 ? [source.slice(start), source.length] : [source.slice(start, end), end + 1];
}
export function indent(value) {
  let columns = 0, index = 0;
  while (index < value.length) {
    if (value.charCodeAt(index) === 32) columns++;
    else if (value.charCodeAt(index) === 9) columns += 4 - columns % 4;
    else break;
    index++;
  }
  return [columns, index];
}
export function stripIndent(value, count) {
  let column = 0, index = 0;
  while (index < value.length && column < count) {
    if (value[index] === ' ') column++;
    else if (value[index] === '\t') column += 4 - column % 4;
    else break;
    index++;
  }
  return (column > count ? ' '.repeat(column - count) : '') + value.slice(index);
}
export function expandIndent(value, offset = 0) {
  let column = offset, index = 0, tabs = false;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code === 32) column++;
    else if (code === 9) { column += 4 - column % 4; tabs = true; }
    else break;
    index++;
  }
  return tabs ? ' '.repeat(column - offset) + value.slice(index) : value;
}
