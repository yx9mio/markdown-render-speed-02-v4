import { readFileSync } from 'node:fs';
import { parse } from '../parse.js';

const cases = JSON.parse(readFileSync(new URL('../practice/input/cases.json', import.meta.url)));
const expected = JSON.parse(readFileSync(new URL('../practice/reference/expected.json', import.meta.url))).cases;
let passed = 0;
const failures = [];
for (let i = 0; i < cases.length; i++) {
  const actual = parse(cases[i].markdown), wanted = expected[i].html;
  if (actual === wanted) { passed++; continue; }
  let at = 0; while (at < actual.length && actual[at] === wanted[at]) at++;
  failures.push({ id: cases[i].id, at, markdown: cases[i].markdown.slice(0, 350), actual: actual.slice(Math.max(0, at - 50), at + 160), expected: wanted.slice(Math.max(0, at - 50), at + 160) });
}
console.log(`${passed}/${cases.length} fixture cases passed`);
for (const failure of failures.slice(0, Number(process.env.LIMIT || 30))) console.log(JSON.stringify(failure));
process.exitCode = failures.length ? 1 : 0;
