import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NgramModel } from '../src/engine/ngram';

let cached: NgramModel | null = null;

/** The same model the page trains, built once per test run from the committed corpus. */
export function libraryModel(): NgramModel {
  if (cached) return cached;
  const dir = resolve(import.meta.dirname, '../src/corpus');
  const model = new NgramModel();
  for (const book of ['alice', 'pride', 'holmes']) model.addText(readFileSync(resolve(dir, `${book}.txt`), 'utf8'));
  cached = model.finalize();
  return cached;
}

export function sum(values: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) total += values[i]!;
  return total;
}
