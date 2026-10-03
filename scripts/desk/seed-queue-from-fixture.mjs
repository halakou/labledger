import { readFileSync, writeFileSync } from "node:fs";
const path = process.argv[2];
if (!path) { console.error("usage: seed-queue-from-fixture.mjs <fixture.json>"); process.exit(1); }
const p = JSON.parse(readFileSync(path, "utf8"));
if (!p.guid || !p.headline || !p.path) process.exit(2);
writeFileSync(".desk-queue.json", JSON.stringify({ briefs: [p] }));
console.log("seeded queue from fixture", p.guid);
