#!/usr/bin/env bun
// A build tree's digest: sha256 over every file's path and content hash (sorted), for before/after comparisons of a
// web build (docs/isolation.md). `--list` prints each file's hash so two trees can be diffed file by file.
//   bun tools/isolation/digest.ts <dir> [--list] [--skip .gen]
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const dir = resolve(process.argv[2]);
const skipAt = process.argv.indexOf('--skip');
const skip = skipAt < 0 ? [] : process.argv[skipAt + 1].split(',');
const files: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (skip.includes(relative(dir, p))) continue;
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
};
walk(dir);
files.sort();
const all = createHash('sha256');
let bytes = 0;
for (const f of files) {
  const b = readFileSync(f), h = createHash('sha256').update(b).digest('hex');
  bytes += b.length;
  all.update(`${relative(dir, f)}\0${h}\n`);
  if (process.argv.includes('--list')) console.log(`${h}  ${relative(dir, f)}`);
}
if (!process.argv.includes('--list')) console.log(JSON.stringify({ sha256: all.digest('hex'), files: files.length, bytes }));
