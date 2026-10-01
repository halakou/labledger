import { mkdir, rm } from "node:fs/promises";
import { CHANNEL, LABS, runLog } from "./core.mjs";
import { OPEN_PROJECTS, getOut } from "./config.mjs";
import { writeArchives } from "./archives.mjs";
import { writeOgCards } from "./ogcard.mjs";
import { writeMarkSprite } from "./sprite.mjs";
import { writeHome, writeLlms, writeOpenBoard, writeSearch, writeStatic } from "./site-home.mjs";
import { writeOpenArchives, writeOpenRss } from "./open-archives.mjs";
import { writeDonate } from "./donate.mjs";
import { writeTerms } from "./terms.mjs";
import { writePrivacy } from "./privacy.mjs";
import { writeDigest } from "./site-digest.mjs";
import { writeLearn } from "./learn.mjs";

export async function publishSite({ allBriefs, briefs, openBriefs = [], allOpen = [], today, fontNames, markMap }) {
  await rm(getOut(), { recursive: true, force: true });
  await mkdir(getOut(), { recursive: true });
  await mkdir(getOut() + "/fonts", { recursive: true });
  await mkdir(getOut() + "/marks", { recursive: true });
  const ogOk = await writeStatic(fontNames);
  // The sprite must be written after OUT is cleared, and it reads the fetched
  // marks, so build it here rather than in build-desk.mjs.
  await writeMarkSprite([...new Set([...LABS, ...OPEN_PROJECTS].map((l) => l.id))]);
  await writeLlms(briefs, openBriefs);
  const ogCount = await writeOgCards([...allBriefs, ...allOpen]);
  await writeHome({ allBriefs, briefs, openBriefs, today });
  await writeOpenBoard({ openBriefs, today });
  // Server-side search: every brief on one page, filtered by ?q= on load.
  await writeSearch({ allBriefs, briefs, openBriefs, today });
  await writeOpenArchives({ allOpen, today });
  await writeOpenRss(openBriefs);
  await writeDonate({ today, briefsCount: allBriefs.length, openCount: openBriefs.length, labsCount: LABS.length + OPEN_PROJECTS.length });
  await writeTerms({ today });
  await writePrivacy();
  const guideCount = await writeLearn();
  const weekCount = await writeDigest({ allBriefs, briefs, openBriefs, today });
  await writeArchives({ allBriefs, briefs, openBriefs, allOpen, today });
  console.log(
    "wrote board " +
      briefs.length +
      ", ledger " +
      allBriefs.length +
      ", open " +
      openBriefs.length +
      ", week " +
      weekCount +
      ", guides " +
      guideCount +
      ", marks " +
      Object.values(markMap).filter(Boolean).length +
      ", fonts " +
      fontNames.length +
      ", og " +
      ogOk +
      ", cards " +
      ogCount +
      ", channel " +
      CHANNEL,
  );
  console.log("run: " + runLog.join(" | "));
}
