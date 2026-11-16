import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
