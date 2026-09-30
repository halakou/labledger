import { CHANNEL, SITE, clip, esc, kindLabel, topicLabel } from "./core.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VECTOR_MARKS } from "./marks-vector.mjs";
const here = dirname(fileURLToPath(import.meta.url));

const HAS_VECTOR = new Set([
  "openai", "anthropic", "google", "mistral", "huggingface", "microsoft", "nvidia", "deepmind", "meta",
  "aws", "apple", "gresearch", "bair", "mit", "mittr", "wired", "techcrunch", "msftai", "theverge",
  "pytorch", "vllm", "sglang", "ollama", "transformers", "comfyui", "deepspeed", "langchain", "jax",
]);

export function markHtml(b, size, spriteHref) {
  let id = b.labId || b.id || "";
  if (!id && b.path) {
    const str = (b.lab + " " + b.path).toLowerCase();
    for (const v of HAS_VECTOR) {
      if (str.includes(v)) { id = v; break; }
    }
  }
  const isVector = HAS_VECTOR.has(id);
  const href = !isVector && (spriteHref || (b.markFile ? markToSprite(b.markFile) : null));
  const cls = "mark" + (size === "sm" ? " sm" : size === "xs" ? " xs" : "") + (href || isVector ? "" : " letter");
  if (isVector) {
    return (
      '<div class="' +
      cls +
      '"><span class="glyph"><svg class="mark-sprite" aria-hidden="true"><use href="#mark-' +
      id +
      '"/></svg></span></div>'
    );
  }
  if (href) {
    return (
      '<div class="' +
      cls +
      '"><span class="glyph"><svg class="mark-sprite" aria-hidden="true"><use href="' +
      esc(href) +
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
