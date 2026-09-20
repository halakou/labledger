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
  {
    id: "wired",
    label: "WIRED",
    mark: "W",
    color: "#1c1914",
    feed: "https://www.wired.com/feed/tag/ai/latest/rss",
    listing: null,
    hosts: ["wired.com"],
    iconHosts: ["wired.com", "www.wired.com"],
    icons: ["https://www.wired.com/favicon.ico"],
  },
  {
    id: "techcrunch",
    label: "TechCrunch",
    mark: "X",
    color: "#2f4a3d",
    feed: "https://techcrunch.com/category/artificial-intelligence/feed/",
    listing: null,
    hosts: ["techcrunch.com"],
    iconHosts: ["techcrunch.com", "www.techcrunch.com"],
    icons: ["https://techcrunch.com/favicon.ico"],
  },
  {
    id: "msftai",
    label: "Microsoft AI",
    mark: "Q",
    color: "#2c3d4f",
    feed: "https://www.microsoft.com/en-us/microsoft-cloud/blog/feed/",
    listing: null,
    hosts: ["microsoft.com"],
    icons: ["https://www.microsoft.com/favicon.ico"],
  },
];

const GH_ICONS = ["github.com", "avatars.githubusercontent.com", "githubusercontent.com"];

export const OPEN_PROJECTS = [
  {
    id: "pytorch",
    label: "PyTorch",
    mark: "Y",
    color: "#4a3228",
    kind: "blog",
    repo: null,
    feed: "https://pytorch.org/blog/feed/",
    hosts: ["pytorch.org"],
    pathPrefix: "/blog/",
    icons: ["https://pytorch.org/favicon.ico"],
  },
  {
    id: "vllm",
    label: "vLLM",
    mark: "V",
    color: "#3d4a2e",
    kind: "github",
    repo: "vllm-project/vllm",
    feed: "https://github.com/vllm-project/vllm/releases.atom",
    hosts: ["github.com"],
    iconHosts: GH_ICONS,
    pathPrefix: "/vllm-project/vllm/releases",
    icons: ["https://github.com/vllm-project.png"],
  },
  {
    id: "sglang",
    label: "SGLang",
    mark: "S",
    color: "#2c3d4f",
    kind: "github",
    repo: "sgl-project/sglang",
    feed: "https://github.com/sgl-project/sglang/releases.atom",
    hosts: ["github.com"],
    iconHosts: GH_ICONS,
    pathPrefix: "/sgl-project/sglang/releases",
    icons: ["https://github.com/sgl-project.png"],
  },
  {
    id: "ollama",
    label: "Ollama",
    mark: "L",
    color: "#243044",
    kind: "github",
    repo: "ollama/ollama",
    feed: "https://github.com/ollama/ollama/releases.atom",
    hosts: ["github.com"],
    iconHosts: GH_ICONS,
    pathPrefix: "/ollama/ollama/releases",
    icons: ["https://github.com/ollama.png"],
  },
  {
    id: "transformers",
    label: "Transformers",
    mark: "F",
    color: "#1c1914",
    kind: "github",
    repo: "huggingface/transformers",
    feed: "https://github.com/huggingface/transformers/releases.atom",
    hosts: ["github.com"],
    iconHosts: GH_ICONS,
    pathPrefix: "/huggingface/transformers/releases",
    icons: ["https://github.com/huggingface.png"],
  },
  {
    id: "comfyui",
    label: "ComfyUI",
    mark: "C",
    color: "#4a2e3d",
    kind: "github",
    repo: "Comfy-Org/ComfyUI",
    feed: "https://github.com/Comfy-Org/ComfyUI/releases.atom",
    hosts: ["github.com"],
    iconHosts: GH_ICONS,
    pathPrefix: "/Comfy-Org/ComfyUI/releases",
    icons: ["https://github.com/Comfy-Org.png"],
  },
  {
    id: "deepspeed",
    label: "DeepSpeed",
    mark: "E",
    color: "#355046",
    kind: "github",
    repo: "deepspeedai/DeepSpeed",
    feed: "https://github.com/deepspeedai/DeepSpeed/releases.atom",
    hosts: ["github.com"],
    iconHosts: GH_ICONS,
    pathPrefix: "/deepspeedai/DeepSpeed/releases",
    icons: ["https://github.com/deepspeedai.png"],
  },
  {
    id: "llamacpp",
    label: "llama.cpp",
    mark: "G",
    color: "#2a2a28",
    kind: "github",
    repo: "ggerganov/llama.cpp",
    feed: "https://github.com/ggerganov/llama.cpp/releases.atom",
    hosts: ["github.com"],
    iconHosts: ["github.com", "avatars.githubusercontent.com", "githubusercontent.com"],
    pathPrefix: "/ggerganov/llama.cpp/releases",
    icons: ["https://github.com/ggerganov.png"],
  },
  {
    id: "langchain",
    label: "LangChain",
    mark: "C",
    color: "#3d4a2e",
    kind: "github",
    repo: "langchain-ai/langchain",
    feed: "https://github.com/langchain-ai/langchain/releases.atom",
    hosts: ["github.com"],
    iconHosts: ["github.com", "avatars.githubusercontent.com", "githubusercontent.com"],
    pathPrefix: "/langchain-ai/langchain/releases",
    icons: ["https://github.com/langchain-ai.png"],
  },
  {
    id: "jax",
    label: "JAX",
    mark: "J",
    color: "#2f4a3d",
    kind: "github",
    repo: "jax-ml/jax",
    feed: "https://github.com/jax-ml/jax/releases.atom",
    hosts: ["github.com"],
    iconHosts: GH_ICONS,
    pathPrefix: "/jax-ml/jax/releases",
    icons: ["https://github.com/jax-ml.png"],
  },
];

export const LAB_BY_ID = Object.fromEntries(LABS.map((l) => [l.id, l]));
export const OPEN_BLOCK = [
  // noisy auto-release patterns: skip daily CI build numbers and pre-release tags
  /^b\d{4,}$/,            // llama.cpp daily builds like b11065
  /-rc\d+$/,             // release candidates
  /==/,                   // python distribution version artifacts
];

export const OPEN_BY_ID = Object.fromEntries(OPEN_PROJECTS.map((p) => [p.id, p]));
export const MAX_BRIEFS = 28;
export const PER_FEED = 6;
export const MAX_OPEN = 8;
export const PER_OPEN = 3;
export const RECENT_MS = 21 * 24 * 60 * 60 * 1000;
export const ARCHIVE_MAX = 500;
export const OPEN_ARCHIVE_MAX = 200;
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
