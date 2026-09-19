const ALLOWED_PREFIX = "https://";

function deskUrl(env) {
  const raw = String(env.DESK_URL || "").trim().replace(/\/$/, "");
  if (!raw.startsWith(ALLOWED_PREFIX)) return null;
  return `${raw}/api/ingest`;
}

async function ping(env) {
  const url = deskUrl(env);
  const secret = String(env.INGEST_SECRET || "").trim();
  if (!url || !secret) return { ok: false, error: "missing" };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });
  const at = new Date().toISOString();
  if (env.DESK) await env.DESK.put("last", `${res.status} ${at}`);
  return { ok: res.ok, status: res.status };
}

export default {
  async scheduled(_controller, env) {
    await ping(env);
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/health") {
      const last = env.DESK ? await env.DESK.get("last") : null;
      return Response.json({ ok: true, last });
    }
    return new Response("Lab Ledger desk", { status: 200 });
  },
};
