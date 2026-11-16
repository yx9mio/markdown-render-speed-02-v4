import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { parse } = await import(pathToFileURL(resolve(process.env.PARSER ?? './parse.js')));
const cases = JSON.parse(readFileSync('practice/input/cases.json', 'utf8'));
const repetitions = Number(process.env.REPETITIONS ?? 100);
const runs = Number(process.env.RUNS ?? 3);
let consumed = 0;
function workload() {
  for (let repeat = 0; repeat < repetitions; repeat++) {
    for (const item of cases) consumed += parse(item.markdown).length;
  }
}
for (let warmup = 0; warmup < 3; warmup++) {
  for (const item of cases) consumed += parse(item.markdown).length;
}
const samples = [];
for (let run = 1; run <= runs; run++) {
  const start = process.cpuUsage();
  workload();
  const elapsed = process.cpuUsage(start);
  const raw = elapsed.user + elapsed.system;
  samples.push(raw);
  console.log(JSON.stringify({ run, rawCpuUs: raw, perPassCpuUs: raw / repetitions, adjustedCpuUs: null, repetitions }));
}
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ medianRawCpuUs: samples[Math.floor(samples.length / 2)], medianPerPassCpuUs: samples[Math.floor(samples.length / 2)] / repetitions, consumed,
  note: 'Official CPU adjustment is not supplied in the kit; raw CPU is local process.cpuUsage.' }));
