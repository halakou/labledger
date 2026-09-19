import { mkdir, rm } from "node:fs/promises";
import { CHANNEL, OUT, runLog } from "./core.mjs";
import { writeArchives } from "./archives.mjs";
import { writeOgCards } from "./ogcard.mjs";
import { writeHome, writeLlms, writeStatic } from "./site-home.mjs";
import { writeDigest } from "./site-digest.mjs";

export async function publishSite({ allBriefs, briefs, today, fontNames, markMap }) {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await mkdir(OUT + "/fonts", { recursive: true });
  await mkdir(OUT + "/marks", { recursive: true });
  const ogOk = await writeStatic(fontNames);
  await writeLlms(briefs);
  const ogCount = await writeOgCards(allBriefs);
  await writeHome({ allBriefs, briefs, today });
  const weekCount = await writeDigest({ allBriefs, briefs, today });
  await writeArchives({ allBriefs, briefs, today });
  console.log(
    "wrote board " +
      briefs.length +
      ", ledger " +
      allBriefs.length +
      ", week " +
      weekCount +
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
