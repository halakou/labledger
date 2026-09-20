import { join } from "node:path";

export const SITE = (process.env.SITE_URL || "https://labledgerdesk.pages.dev").replace(/\/$/, "");
export const OUT = "dist-site";
export const AMP = "\x26";
export const POSTED_FILE = ".desk-posted.json";
export const QUEUE_FILE = ".desk-queue.json";
export const ARCHIVE_FILE = ".desk-archive.json";
export const OPEN_ARCHIVE_FILE = ".desk-open.json";
export const ASSET_DIR = ".desk-assets";
export const FONT_DIR = join(ASSET_DIR, "fonts");
export const MARK_DIR = join(ASSET_DIR, "marks");
export const OG_CANDIDATES = ["assets/og.jpg", "public/og.jpg", "/workspace/public/og.jpg"];
export const UA = "LabLedgerDesk/1.2 (+https://labledgerdesk.pages.dev)";
export const FONT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const KINDS = [
  { id: "launch", label: "Launch" },
  { id: "research", label: "Research" },
  { id: "note", label: "Note" },
];
export const TOPICS = [
  { id: "llm", label: "LLM" },
  { id: "hardware", label: "Hardware" },
  { id: "medical", label: "Medical" },
  { id: "safety", label: "Safety" },
  { id: "open", label: "Open models" },
  { id: "agents", label: "Agents" },
  { id: "science", label: "Science" },
  { id: "enterprise", label: "Enterprise" },
];
