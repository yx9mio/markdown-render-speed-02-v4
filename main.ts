import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const input = process.env.MAKEFUN_INPUT_DIR || '/input';
const output = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const cases = JSON.parse(readFileSync(join(input, 'cases.json'), 'utf8'));
// Reuse the input array once each Markdown source has been consumed.
for (let i = 0; i < cases.length; i++) cases[i] = parse(cases[i].markdown);
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'html.json'), JSON.stringify(cases));
