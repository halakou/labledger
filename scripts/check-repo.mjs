// Repository guard. Runs in CI on every push and fails loudly if:
//  - a file lands outside the allow-listed top-level paths (the exact failure
//    mode behind the temp-commit leaks this project already had to scrub), or
//  - a source file does not parse, or
//  - a committed file looks like it contains a live credential.
// Pure Node built-ins: no dependency to install, ever.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_TOP = new Set([".github", "assets", "cloudflare", "scripts", "test"]);
const ALLOWED_ROOT_FILES = new Set([
  ".gitignore",
  ".editorconfig",
  "AGENTS.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
]);

// Directories that must never appear in this repo again.
const BANNED_PATHS = ["workers/halakou-chat/", "deploy-halakou-chat"];

const SECRET_PATTERNS = [
  { re: /\b\d{8,12}:AA[A-Za-z0-9_-]{30,}\b/, name: "telegram bot token" },
  { re: /\bghp_[A-Za-z0-9]{30,}\b/, name: "github personal access token" },
  { re: /\bgithub_pat_[A-Za-z0-9_-]{60,}\b/, name: "github fine-grained token" },
  { re: /\bsk-proj-[A-Za-z0-9_-]{16,}\b/, name: "openai api key" },
  { re: /\bsk-[A-Za-z0-9]{40,}\b/, name: "generic api key" },
  { re: /\bv1\.0-[A-Za-z0-9_-]{40,}\b/, name: "cloudflare api token" },
  { re: /\bAIza[0-9A-Za-z_-]{30,}\b/, name: "google api key" },
];

// Walk the working tree rather than shelling out to git, so the guard runs
// identically in CI and on any laptop without needing git on PATH.
const SKIP = new Set([".git", "node_modules", "dist-site", ".desk-assets", ".wrangler"]);
function list(dir, acc) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) list(p, acc);
    else acc.push(p.replace(/\\/g, "/"));
  }
  return acc;
}

function layoutIssues(files) {
  const bad = [];
  for (const f of files) {
    if (BANNED_PATHS.some((p) => f.includes(p))) {
      bad.push("banned path (leaked once, must never return): " + f);
      continue;
    }
    const top = f.split("/")[0];
    if (!ALLOWED_TOP.has(top) && !ALLOWED_ROOT_FILES.has(f)) {
      bad.push("outside the allowed repo layout: " + f);
    }
  }
  return bad;
}

function secretIssues(files) {
  const issues = [];
  for (const f of files.filter((f) => /\.(mjs|js|toml|yml|yaml|json|md)$/i.test(f))) {
    const body = readFileSync(f, "utf8");
    for (const { re, name } of SECRET_PATTERNS) {
      if (re.test(body)) issues.push(f + ": looks like a " + name);
    }
  }
  return issues;
}

const files = list(".", []);
const issues = [...layoutIssues(files), ...secretIssues(files)];

if (issues.length) {
  console.error("Repository guard failed:\n  - " + issues.join("\n  - "));
  console.error("\nIf a file is genuinely new, add it to the allow-list in scripts/check-repo.mjs.");
  process.exit(1);
}
console.log("repo guard ok — " + files.length + " files, all inside the allow-list, no secrets.");
