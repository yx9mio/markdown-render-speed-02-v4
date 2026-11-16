import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDirectory = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const documents = JSON.parse(readFileSync(join(inputDirectory, 'cases.json'), 'utf8'));
// Replace each consumed input object so the driver needs only one array.
for (let index = 0; index < documents.length; index++) {
  documents[index] = parse(documents[index].markdown);
}
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, 'html.json'), JSON.stringify(documents));
