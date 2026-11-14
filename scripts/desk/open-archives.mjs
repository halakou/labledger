import { OPEN_PROJECTS } from "./config.mjs";
import { write } from "./net.mjs";
import { esc, kindLabel } from "./core.mjs";
import { rowHtml, shell } from "./render.mjs";
import { SITE } from "./core.mjs";
import { feedLinks, feedLinksHtml, rssFeedXml, writeSurfaceFeeds } from "./archives.mjs";

export async function writeOpenRss(openBriefs) {
  // P1-4: one RSS builder for every feed now — the item shape lives in
  // rssFeedItem, once. Open briefs carry no alsoFiled, so the description
  // is exactly their dek, as before.
  await write(
    "open/rss.xml",
    rssFeedXml({
      title: "Lab Ledger Desk — Open releases",
      link: SITE + "/open/",
      description:
        "Official release notes from open-source AI projects: vLLM, SGLang, Ollama, Transformers, ComfyUI, DeepSpeed, JAX, PyTorch, llama.cpp, LangChain.",
      selfUrl: SITE + "/open/rss.xml",
      items: openBriefs || [],
    }),
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
        extra: feedLinks("lab/" + proj.id, proj.label + " — Lab Ledger Desk"),
        body: [
          '<article class="method"><p class="kicker">Open project</p><h1>',
          esc(proj.label),
          '</h1><p class="dek">',
          how,
          "</p>",
          feedLinksHtml("lab/" + proj.id),
          '</article><section class="board">',
          rows.map(rowHtml).join("") || '<p class="empty">No filed release for ' + esc(proj.label) + " yet.</p>",
          "</section>",
        ].join(""),
      }),
    );
    // P1-4: the project's own feeds, from the same rows its page renders.
    await writeSurfaceFeeds("lab/" + proj.id, {
      title: proj.label + " — Lab Ledger Desk",
      pageUrl: SITE + "/lab/" + proj.id + "/",
      description: "Open-source " + proj.label + " releases filed by Lab Ledger Desk.",
      rows,
    });
  }
}
