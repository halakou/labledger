import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const dir = dirname(fileURLToPath(import.meta.url));
const packed = (await readFile(join(dir, "pages.pack.b64"), "utf8")).replace(/\s+/g, "");
const out = join(dir, ".pages.unpacked.mjs");
await writeFile(out, gunzipSync(Buffer.from(packed, "base64")));
const mod = await import(pathToFileURL(out).href);
export const publishSite = mod.publishSite;
