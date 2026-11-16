import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

if (process.argv.includes('--series')) {
  const runs = Number(process.env.RUNS || 3), values = [];
  for (let i = 0; i < runs; i++) {
    const run = spawnSync(process.execPath, [new URL(import.meta.url).pathname], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(run.stderr || 'Benchmark failed');
    const result = JSON.parse(run.stdout);
    console.log(JSON.stringify({ run: i + 1, ...result }));
    values.push(result.perPassCpuUs);
  }
  values.sort((a, b) => a - b);
  console.log(JSON.stringify({ medianPerPassCpuUs: values[Math.floor(values.length / 2)] }));
  process.exit(0);
}

const { parse } = await import(pathToFileURL(resolve(process.env.PARSER || 'parse.js')));
const cases = JSON.parse(readFileSync(new URL('../practice/input/cases.json', import.meta.url)));
const repetitions = Number(process.env.REPETITIONS || 100);
let length = 0;
function pass() { for (const item of cases) length += parse(item.markdown).length; }
for (let i = 0; i < 3; i++) pass();
const start = process.cpuUsage();
for (let i = 0; i < repetitions; i++) pass();
const cpu = process.cpuUsage(start), total = cpu.user + cpu.system;
console.log(JSON.stringify({ repetitions, totalCpuUs: total, perPassCpuUs: total / repetitions, length }));
