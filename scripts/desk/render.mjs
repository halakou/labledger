import { CHANNEL, SITE, clip, esc, kindLabel, topicLabel } from "./core.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VECTOR_MARKS } from "./marks-vector.mjs";
const here = dirname(fileURLToPath(import.meta.url));

const HAS_VECTOR = new Set(["openai", "anthropic", "google", "mistral", "huggingface", "microsoft", "nvidia", "deepmind", "meta"]);

export function markHtml(b, size, spriteHref) {
  let id = b.labId || b.id || b.lab || "";
  if (!id && b.path) {
    const str = (b.lab + " " + b.path).toLowerCase();
    for (const v of HAS_VECTOR) {
      if (str.includes(v)) { id = v; break; }
    }
  }
  const href = spriteHref || (b.markFile ? markToSprite(b.markFile) : null);
  const isVector = !href && HAS_VECTOR.has(id);
  const cls = "mark" + (size === "sm" ? " sm" : size === "xs" ? " xs" : "") + (href || isVector ? "" : " letter");
  if (href) {
    return (
      '<div class="' +
      cls +
      '"><span class="glyph"><svg class="mark-sprite" aria-hidden="true"><use href="' +
      esc(href) +
      '"/></svg></span></div>'
    );
  }
  if (isVector) {
    return (
      '<div class="' +
      cls +
      '"><span class="glyph"><svg class="mark-sprite" aria-hidden="true"><use href="#mark-' +
      id +
      '"/></svg></span></div>'
    );
  }
  return '<div class="' + cls + '" style="background:' + (b.color || "#1c1914") + '"><span class="glyph">' + esc(b.mark || "") + "</span></div>";
}

export function markToSprite(markFile) {
  if (!markFile) return null;
  const id = String(markFile).replace(/^\/marks\//, "").replace(/\.[^.]+$/, "");
  return spritePath + "#m-" + id;
}

export const CSS = (await readFile(join(here, "house.css"), "utf8") + await readFile(join(here, "design1.css"), "utf8")).replace(/\n/g, "");
