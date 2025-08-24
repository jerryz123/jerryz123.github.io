#!/usr/bin/env node
// List files attached to the configured OpenAI Vector Store
// Usage: OPENAI_API_KEY=... node backend/tools/list-vector-store.mjs

import fs from 'node:fs';
import path from 'node:path';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY is required');
  process.exit(1);
}

const ROOT = path.resolve(process.cwd());
const WRANGLER_TOML = path.join(ROOT, 'backend', 'cloudflare-worker', 'wrangler.toml');

function readVectorStoreId() {
  const text = fs.readFileSync(WRANGLER_TOML, 'utf8');
  const m = text.match(/VECTOR_STORE_ID\s*=\s*"([^"]+)"/);
  if (!m) return process.env.VECTOR_STORE_ID || null;
  return m[1];
}

async function getJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${t}`);
  }
  return await res.json();
}

function fmtBytes(n) {
  if (n == null) return '';
  const units = ['B','KB','MB','GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length-1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

async function main() {
  const vectorStoreId = readVectorStoreId();
  if (!vectorStoreId) {
    console.error('VECTOR_STORE_ID not found in wrangler.toml (or env).');
    process.exit(1);
  }
  const base = 'https://api.openai.com/v1';
  const vs = await getJson(`${base}/vector_stores/${vectorStoreId}`);
  console.log(`Vector Store: ${vs.id}`);
  if (vs.name) console.log(`Name: ${vs.name}`);
  if (vs.created_at) console.log(`Created: ${new Date(vs.created_at*1000).toISOString()}`);
  console.log('');

  const files = await listAll(`${base}/vector_stores/${vectorStoreId}/files`);
  if (!files.length) {
    console.log('No files attached.');
    return;
  }
  // Map file_id -> file info
  const details = [];
  for (const f of files) {
    // Some APIs return { id: "file_...", ... }; older samples used file_id
    const fid = f.file_id || f.id;
    if (!fid) {
      console.warn('Skipping entry with missing file id:', f);
      continue;
    }
    const info = await getJson(`${base}/files/${fid}`);
    details.push({
      id: fid,
      name: info.filename,
      bytes: info.bytes,
      created: info.created_at,
      status: f.status || info.status,
    });
  }
  // Print table
  const rows = details
    .sort((a,b)=> (a.name||'').localeCompare(b.name||''))
    .map(d => `${d.name}  \t${fmtBytes(d.bytes)}\t${d.status||''}\t${new Date(d.created*1000).toISOString()}`);
  console.log('Files (name \t size \t status \t created):');
  for (const r of rows) console.log(r);
}

async function listAll(url) {
  const out = [];
  let after = null;
  while (true) {
    const u = new URL(url);
    u.searchParams.set('limit', '100');
    if (after) u.searchParams.set('after', after);
    const page = await getJson(u.toString());
    const data = page.data || [];
    out.push(...data);
    if (!page.has_more) break;
    after = (page.last_id) || (data.length ? data[data.length-1].id : null);
    if (!after) break;
  }
  return out;
}

main().catch(e => { console.error(e); process.exit(1); });
