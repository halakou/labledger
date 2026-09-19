import { join } from "node:path";

export const SITE = (process.env.SITE_URL || "https://labledgerdesk.pages.dev").replace(/\/$/, "");
export const OUT = "dist-site";
export const AMP = "\x26";
export const POSTED_FILE = ".desk-posted.json";
export const QUEUE_FILE = ".desk-queue.json";
export const ARCHIVE_FILE = ".desk-archive.json";
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

export const LABS = [
  {
    id: "openai",
    label: "OpenAI",
    mark: "O",
    color: "#1c1914",
    feed: "https://openai.com/news/rss.xml",
    listing: null,
    hosts: ["openai.com"],
    icons: ["https://openai.com/apple-touch-icon-180x180.png", "https://openai.com/favicon.ico", "https://openai.com/favicon-32x32.png"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    mark: "A",
    color: "#6e2f22",
    feed: null,
    listing: "https://www.anthropic.com/news",
    hosts: ["anthropic.com"],
    icons: ["https://www.anthropic.com/favicon.ico", "https://www.anthropic.com/images/favicon.ico"],
  },
  {
    id: "google",
    label: "Google",
    mark: "G",
    color: "#2f4a3d",
    feed: "https://blog.google/technology/ai/rss/",
    listing: null,
    hosts: ["blog.google"],
    icons: ["https://blog.google/static/blogv2/images/google.png", "https://blog.google/favicon.ico"],
  },
  {
    id: "deepmind",
    label: "DeepMind",
    mark: "D",
    color: "#3d3a2e",
    feed: "https://deepmind.google/blog/rss.xml",
    listing: null,
    hosts: ["deepmind.google"],
    iconHosts: ["deepmind.google"],
    icons: ["https://deepmind.google/favicon.ico"],
  },
  {
    id: "mistral",
    label: "Mistral",
    mark: "M",
    color: "#4a3b28",
    feed: "https://mistral.ai/news/rss",
    listing: null,
    hosts: ["mistral.ai"],
    icons: ["https://mistral.ai/favicon.ico", "https://mistral.ai/images/favicon.png"],
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    mark: "H",
    color: "#1c1914",
    feed: "https://huggingface.co/blog/feed.xml",
    listing: null,
    hosts: ["huggingface.co"],
    icons: ["https://huggingface.co/front/assets/huggingface_logo-noborder.svg"],
  },
  {
    id: "microsoft",
    label: "Microsoft Research",
    mark: "W",
    color: "#2c3d4f",
    feed: "https://www.microsoft.com/en-us/research/feed/",
    listing: null,
    hosts: ["microsoft.com"],
    icons: ["https://www.microsoft.com/favicon.ico"],
  },
  {
    id: "nvidia",
    label: "NVIDIA",
    mark: "N",
    color: "#3d4a2e",
    feed: "https://blogs.nvidia.com/blog/category/generative-ai/feed/",
    listing: null,
    hosts: ["blogs.nvidia.com"],
    iconHosts: ["blogs.nvidia.com", "nvidia.com"],
    icons: ["https://blogs.nvidia.com/favicon.ico", "https://www.nvidia.com/favicon.ico"],
  },
  {
    id: "aws",
    label: "AWS",
    mark: "B",
    color: "#4a3228",
    feed: "https://aws.amazon.com/blogs/machine-learning/feed/",
    listing: null,
    hosts: ["aws.amazon.com"],
    icons: ["https://aws.amazon.com/favicon.ico"],
  },
  {
    id: "apple",
    label: "Apple",
    mark: "P",
    color: "#2a2a28",
    feed: "https://machinelearning.apple.com/rss.xml",
    listing: null,
    hosts: ["machinelearning.apple.com"],
    icons: ["https://machinelearning.apple.com/favicon.ico"],
  },
  {
    id: "gresearch",
    label: "Google Research",
    mark: "R",
    color: "#355046",
    feed: "https://research.google/blog/rss/",
    listing: null,
    hosts: ["research.google"],
    iconHosts: ["research.google", "google.com"],
    icons: ["https://www.google.com/favicon.ico", "https://research.google/favicon.ico"],
  },
  {
    id: "bair",
    label: "BAIR",
    mark: "K",
    color: "#4a2e3d",
    feed: "https://bair.berkeley.edu/blog/feed.xml",
    listing: null,
    hosts: ["bair.berkeley.edu"],
    icons: ["https://bair.berkeley.edu/favicon.ico"],
  },
  {
    id: "mit",
    label: "MIT News",
    mark: "I",
    color: "#8a2a22",
    feed: "https://news.mit.edu/rss/topic/artificial-intelligence2",
    listing: null,
    hosts: ["news.mit.edu"],
    iconHosts: ["news.mit.edu", "mit.edu"],
    icons: ["https://www.mit.edu/favicon.ico", "https://news.mit.edu/favicon.ico"],
  },
  {
    id: "mittr",
    label: "MIT Review",
    mark: "T",
    color: "#243044",
    feed: "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
    listing: null,
    hosts: ["technologyreview.com"],
    iconHosts: ["technologyreview.com", "wp.technologyreview.com"],
    icons: ["https://www.technologyreview.com/static/media/favicon.1cfcdb44759a0f93ddf5feb5405dd4cc.ico", "https://wp.technologyreview.com/favicon.ico", "https://www.technologyreview.com/favicon.ico"],
  },
];

export const LAB_BY_ID = Object.fromEntries(LABS.map((l) => [l.id, l]));
export const MAX_BRIEFS = 28;
export const PER_FEED = 6;
export const RECENT_MS = 21 * 24 * 60 * 60 * 1000;
export const ARCHIVE_MAX = 500;
export const MARK_MAX = 96 * 1024;

export function handleFrom(raw) {
  if (!raw) return "";
  let v = String(raw).trim();
  v = v.replace(/^https?:\/\/(www\.)?(t\.me|telegram\.me)\//i, "");
  v = v.replace(/^@/, "");
  v = v.split(/[/?#]/)[0];
  if (/^-?\d+$/.test(v)) return "";
  if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v)) return v;
  return "";
}

export function channelUrl() {
  const explicit = handleFrom(process.env.TELEGRAM_CHANNEL_URL || "");
  if (explicit) return "https://t.me/" + explicit;
  const fromChat = handleFrom(process.env.TELEGRAM_CHAT_ID || "");
  if (fromChat) return "https://t.me/" + fromChat;
  return "https://t.me/labledgerdesk";
}

export const CHANNEL = channelUrl();
export const runLog = [];
