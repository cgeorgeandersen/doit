import { inflateRawSync } from 'node:zlib';

/**
 * Extracts the one file in a single-file zip archive, the way the Census
 * Bureau publishes its gazetteer files. Node can inflate the data but has no
 * zip reader, and one function is lighter than a dependency. Handles stored
 * and deflated entries; not zip64 (the gazetteer is about 1 MB).
 */
export function unzipSingle(zip: Buffer): Buffer {
  // The end-of-central-directory record sits in the last 22 bytes plus up to 64 KB of comment.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Not a zip archive');
  const central = zip.readUInt32LE(end + 16);
  if (zip.readUInt32LE(central) !== 0x02014b50) throw new Error('Damaged zip: no central directory');
  const method = zip.readUInt16LE(central + 10);
  const compressedSize = zip.readUInt32LE(central + 20);
  const local = zip.readUInt32LE(central + 42);
  if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('Damaged zip: no local file header');
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + compressedSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported zip compression method ${method}`);
}
