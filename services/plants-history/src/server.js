import http from 'node:http';
import { stmts } from './db.js';
import { statsAll, statsForSlug } from './stats.js';

const PORT = Number(process.env.NODE_PORT || 13338);

if (process.env.SEED_ON_START === 'true') {
  const { runSeed } = await import('./seed.js');
  try {
    await runSeed();
  } catch (err) {
    console.error('Seed failed (continuing):', err.message);
  }
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function nowIso() {
  return new Date().toISOString();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/healthz') {
      const { n } = stmts.countAll.get();
      return send(res, 200, { ok: true, db_rows: n });
    }

    if (req.method === 'GET' && url.pathname === '/stats') {
      return send(res, 200, statsAll());
    }

    const waterMatch = url.pathname.match(/^\/waterings\/([^/]+)$/);
    if (req.method === 'GET' && waterMatch) {
      const slug = decodeURIComponent(waterMatch[1]);
      if (!slug) return send(res, 400, { error: 'missing slug' });
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 500);
      const rows = stmts.recentForSlug.all(slug, limit);
      return send(res, 200, rows);
    }

    if (req.method === 'POST' && url.pathname === '/waterings') {
      const body = await readJson(req);
      const slug = String(body.plant_slug || '');
      if (!slug) return send(res, 400, { error: 'missing plant_slug' });
      const watered_at = body.watered_at ? String(body.watered_at) : nowIso();
      const source = body.source ? String(body.source).slice(0, 64) : 'card_tap';
      const { id } = stmts.insert.get(slug, watered_at, source);
      return send(res, 201, { id, plant_slug: slug, watered_at, source });
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`plants-history listening on :${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
