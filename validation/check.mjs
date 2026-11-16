import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.env.PARSER ?? './parse.js';
const { parse } = await import(pathToFileURL(resolve(target)));
const inputs = JSON.parse(readFileSync('practice/input/cases.json', 'utf8'));
const reference = JSON.parse(readFileSync('practice/reference/expected.json', 'utf8'));
const expected = new Map(reference.cases.map(item => [item.id, item.html]));
let passed = 0;
let shown = 0;
for (const item of inputs) {
  const actual = parse(item.markdown);
  if (actual === expected.get(item.id)) passed++;
  else if (shown++ < 12) {
    const wanted = expected.get(item.id);
    let offset = 0;
    while (offset < actual.length && actual[offset] === wanted[offset]) offset++;
    console.error(item.id, 'first difference at', offset);
    console.error('input:', JSON.stringify(item.markdown.slice(0, 180)));
    console.error('expected:', JSON.stringify(wanted.slice(Math.max(0, offset - 80), offset + 160)));
    console.error('actual:  ', JSON.stringify(actual.slice(Math.max(0, offset - 80), offset + 160)));
  }
}
console.log(`${passed}/${inputs.length}`);
let failed = passed !== inputs.length;
if (process.argv.includes('--differential')) {
  const { parse: referenceParse } = await import('../baselines/parse.js');
  const seed = 0x34004634;
  let state = seed;
  function pick(values) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return values[state % values.length];
  }
  const fragments = [
    'plain text', '*emphasis* and **strong**', '_outer __inner___',
    '~~deleted~~ and ~also~', '`a < b && c`', '`` a ` b ``',
    '[label](https://example.com/a_(b) "Title")', '![alt](image.png)',
    '<span title="a">HTML</span>', '&amp; &copy; &#169; &#x1F600;',
    'https://example.com/a(b).', 'a@example.com', 'Unicode Ελληνικά 中文',
    'escaped \\*literal\\*', '[reference][key]', 'two  spaces'
  ];
  const formats = [
    text => text + '\n', text => '# ' + text + '\n',
    text => '- ' + text + '\n- second item\n',
    text => '1. ' + text + '\n2. second item\n',
    text => '> ' + text + '\n>\n> second paragraph\n',
    text => '- [x] ' + text + '\n  - nested\n',
    text => '```txt\n' + text + '\n```\n',
    text => '    ' + text + '\n\nparagraph\n',
    text => text + '\n\n---\n\n' + text + '\n'
  ];
  const documents = inputs.map(item => item.markdown);
  for (let index = 0; index < 384; index++) {
    const first = pick(fragments), second = pick(fragments), format = pick(formats);
    documents.push(format(first + ' / ' + second) + pick(['\n', '  \n', '\t\n']) + '[key]: /target "Reference"\n');
  }
  documents.push(('# Long document\n\n- **first**\n  - nested `code`\n\n> quote &amp; text\n\n').repeat(400));
  let matches = 0, reported = 0;
  for (let index = 0; index < documents.length; index++) {
    const text = documents[index], wanted = referenceParse(text), actual = parse(text);
    if (actual === wanted) matches++;
    else if (reported++ < 8) console.error('differential mismatch', index, JSON.stringify(text.slice(0, 240)), JSON.stringify(wanted.slice(0, 300)), JSON.stringify(actual.slice(0, 300)));
  }
  console.log(`Differential: ${matches}/${documents.length}; seed=${seed}`);
  failed ||= matches !== documents.length;
}
process.exitCode = failed ? 1 : 0;
