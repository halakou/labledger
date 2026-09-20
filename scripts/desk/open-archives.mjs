import { OPEN_PROJECTS } from "./config.mjs";
import { write } from "./net.mjs";
import { esc, kindLabel } from "./core.mjs";
import { rowHtml, shell } from "./render.mjs";
import { SITE } from "./core.mjs";

export async function writeOpenRss(openBriefs) {
  const items = (openBriefs || [])
    .map(
      (b) =>
        "<item><title>" +
        esc(b.headline) +
        "</title><link>" +
        SITE + b.path +
        "</link><guid>" +
        SITE + b.path +
        "</guid><category>" +
        esc(b.lab) +
        "</category><description>" +
        esc(b.dek) +
        "</description><pubDate>" +
        new Date(b.publishedAt).toUTCString() +
        "</pubDate></item>",
    )
    .join("");
  await write(
    "open/rss.xml",
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">' +
      "<channel><title>Lab Ledger Desk — Open releases</title><link>" +
      SITE +
      "/open/</link><description>Official release notes from open-source AI projects: vLLM, SGLang, Ollama, Transformers, ComfyUI, DeepSpeed, JAX, PyTorch, llama.cpp, LangChain.</description>" +
      '<atom:link href="' +
      SITE +
      '/open/rss.xml" rel="self" type="application/rss+xml"/>' +
      items +
      "</channel></rss>",
  );
}

export async function writeOpenArchives({ allOpen, today }) {
  for (const proj of OPEN_PROJECTS) {
    const rows = allOpen.filter((b) => b.labId === proj.id).slice(0, 80);
    const how = proj.kind === "github" ? "Official GitHub releases." : "Official blog.";
    await write(
      "lab/" + proj.id + "/index.html",
      shell({
        title: proj.label + " — Lab Ledger Desk",
        description: "Open-source " + proj.label + " releases filed by Lab Ledger Desk.",
        path: "/lab/" + proj.id + "/",
        body: [
          '<article class="method"><p class="kicker">Open project</p><h1>',
          esc(proj.label),
          '</h1><p class="dek">',
          how,
          '</p></article><section class="board">',
          rows.map(rowHtml).join("") || '<p class="empty">No filed release for ' + esc(proj.label) + " yet.</p>",
          "</section>",
        ].join(""),
      }),
    );
  }
}
