#!/usr/bin/env node
// Sync local knowledge/ files into an OpenAI Vector Store and write VECTOR_STORE_ID to wrangler.toml
// Usage: OPENAI_API_KEY=... node backend/tools/sync-vector-store.mjs

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY is required');
  process.exit(1);
}

const ROOT = path.resolve(process.cwd());
const KNOWLEDGE_DIR = path.join(ROOT, 'knowledge');
const WRANGLER_TOML = path.join(ROOT, 'backend', 'cloudflare-worker', 'wrangler.toml');
const VECTOR_STORE_NAME = process.env.VECTOR_STORE_NAME || 'jerry-site-knowledge';

async function main() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error(`ERROR: knowledge/ directory not found at ${KNOWLEDGE_DIR}`);
    process.exit(1);
  }
  let files = walk(KNOWLEDGE_DIR)
    .filter(f => /\.(md|markdown|txt)$/i.test(f))
    .filter(f => path.basename(f) !== '.gitkeep');
  files = files.filter(f => !isGitIgnored(f));
  if (!files.length) {
    console.warn('No .md/.txt files found in knowledge/. Nothing to upload.');
  }

  // Create or fetch vector store
  let vectorStoreId = await ensureVectorStore(VECTOR_STORE_NAME);
  console.log('Vector store:', vectorStoreId);

  // Fetch remote attachments (filename/bytes)
  // Note: We re-list again before pruning to avoid stale views while uploads are in-flight.
  let remote = await listVectorStoreFilesDetailed(vectorStoreId);
  let remoteByName = groupBy(remote, x => x.filename || x.name || '');
  const localInfo = files.map(abs => ({
    abs,
    rel: path.relative(KNOWLEDGE_DIR, abs).replace(/\\/g,'/'),
    bytes: fs.statSync(abs).size,
  }));

  // Upload new/changed files; skip if same filename + same size already attached
  for (const info of localInfo) {
    const candidates = remoteByName.get(info.rel) || [];
    const same = candidates.find(r => Number(r.bytes) === Number(info.bytes));
    if (same) {
      console.log(`Skip (unchanged): ${info.rel}`);
      continue;
    }
    process.stdout.write(`Uploading ${info.rel} ... `);
    const fileId = await uploadFile(info.abs, info.rel);
    await attachFile(vectorStoreId, fileId);
    console.log('ok');
  }

  // Re-list after potential uploads so pruning sees the latest state
  remote = await listVectorStoreFilesDetailed(vectorStoreId);
  remoteByName = groupBy(remote, x => x.filename || x.name || '');

  // Prune: detach remote files that no longer exist locally, and de-dup older duplicates by name
  const localNames = new Set(localInfo.map(x => x.rel));
  const toDetach = [];
  for (const [name, arr] of remoteByName.entries()) {
    // If file name is not in local set -> detach all versions
    if (!localNames.has(name)) {
      for (const r of arr) toDetach.push(r);
      continue;
    }
    // Keep the newest by created_at among same-named files; detach older duplicates
    if (arr.length > 1) {
      const sorted = arr.slice().sort((a,b)=> (b.created_at||0) - (a.created_at||0));
      for (let i=1; i<sorted.length; i++) toDetach.push(sorted[i]);
    }
  }
  for (const r of toDetach) {
    process.stdout.write(`Detaching stale: ${r.filename} (${r.id}) ... `);
    await detachFile(vectorStoreId, r.id);
    // Optionally delete the file object to save storage if env var set
    if (process.env.OPENAI_DELETE_FILES === '1') {
      await deleteFile(r.id);
      process.stdout.write('deleted ');
    }
    console.log('done');
  }

  // Write VECTOR_STORE_ID into wrangler.toml if missing or different
  writeVectorStoreId(WRANGLER_TOML, vectorStoreId);
  console.log('\nDone. VECTOR_STORE_ID set in wrangler.toml');
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

async function ensureVectorStore(name) {
  // Try to find an existing vector store by name (OpenAI API lacks list+filter by name; we simply create a new one if not provided)
  // If you already know your ID, set VECTOR_STORE_ID in env to skip creation
  if (process.env.VECTOR_STORE_ID) return process.env.VECTOR_STORE_ID;
  const res = await fetch('https://api.openai.com/v1/vector_stores', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to create vector store: ${res.status} ${t}`);
  }
  const data = await res.json();
  return data.id;
}

async function uploadFile(absPath, displayName) {
  const buf = fs.readFileSync(absPath);
  const form = new FormData();
  form.append('purpose', 'assistants');
  form.append('file', new Blob([buf], { type: 'text/plain' }), displayName);
  const res = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to upload file ${displayName}: ${res.status} ${t}`);
  }
  const data = await res.json();
  return data.id;
}

async function attachFile(vectorStoreId, fileId) {
  const res = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to attach file to vector store: ${res.status} ${t}`);
  }
}

async function detachFile(vectorStoreId, fileId) {
  const res = await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files/${fileId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to detach file ${fileId}: ${res.status} ${t}`);
  }
}

async function deleteFile(fileId) {
  const res = await fetch(`https://api.openai.com/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to delete file ${fileId}: ${res.status} ${t}`);
  }
}

async function listVectorStoreFilesDetailed(vectorStoreId) {
  const out = [];
  let after = null;
  while (true) {
    const url = new URL(`https://api.openai.com/v1/vector_stores/${vectorStoreId}/files`);
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Failed to list vector store files: ${res.status} ${t}`);
    }
    const data = await res.json();
    const batch = data.data || [];
    // Enrich with file metadata (filename/bytes/created_at)
    for (const f of batch) {
      // Prefer file_id; some API shapes return id = vsfile_..., not file_...
      const fid = f.file_id || f.id;
      if (!fid) continue;
      const meta = await fetch(`https://api.openai.com/v1/files/${fid}`, {
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      });
      if (!meta.ok) continue;
      const info = await meta.json();
      out.push({ id: fid, filename: info.filename, bytes: info.bytes, created_at: info.created_at });
    }
    if (!data.has_more) break;
    after = data.last_id || (batch.length ? (batch[batch.length-1].id || batch[batch.length-1].file_id) : null);
    if (!after) break;
  }
  return out;
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    const a = m.get(k); if (a) a.push(x); else m.set(k, [x]);
  }
  return m;
}

function writeVectorStoreId(tomlPath, id) {
  let text = fs.readFileSync(tomlPath, 'utf8');
  if (text.includes('VECTOR_STORE_ID')) {
    text = text.replace(/VECTOR_STORE_ID\s*=\s*"[^"]*"/g, `VECTOR_STORE_ID = "${id}"`);
  } else {
    // Append into [vars] block; if missing, add one
    if (!/\n\[vars\]/.test(text)) {
      text += `\n\n[vars]\n`;
    }
    text = text.replace(/\n\[vars\][^\n]*/m, (m) => m) + `\nVECTOR_STORE_ID = "${id}"\n`;
  }
  fs.writeFileSync(tomlPath, text);
}

function isGitIgnored(filePath) {
  try {
    const res = spawnSync('git', ['check-ignore', '-q', '--', filePath], { cwd: ROOT });
    // status 0 => ignored, 1 => not ignored, 128 => error (fallback to not ignored)
    return res.status === 0;
  } catch {
    return false;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
