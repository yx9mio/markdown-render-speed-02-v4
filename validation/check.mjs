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
process.exitCode = passed === inputs.length ? 0 : 1;
