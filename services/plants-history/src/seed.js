import { stmts } from './db.js';

const ENTITY_PATTERN = /^input_datetime\.plant_(.+)_last_watered$/;

export async function runSeed() {
  const base = process.env.HA_BASE_URL || 'http://localhost:8123';
  const token = process.env.HA_TOKEN;
  if (!token) {
    console.warn('SEED skipped: HA_TOKEN not set');
    return;
  }

  let resp;
  try {
    resp = await fetch(`${base}/api/states`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.warn(`SEED: failed to list states (${err.message})`);
    return;
  }
  if (!resp.ok) {
    console.warn(`SEED: HA returned ${resp.status} listing states`);
    return;
  }

  const plants = (await resp.json())
    .map((s) => {
      const m = s.entity_id.match(ENTITY_PATTERN);
      return m ? { slug: m[1], unixTs: s.attributes?.timestamp } : null;
    })
    .filter(Boolean);

  let inserted = 0;
  for (const { slug, unixTs } of plants) {
    if (stmts.countBySlug.get(slug).n > 0) continue;
    if (!unixTs) {
      console.warn(`SEED ${slug}: no timestamp on entity`);
      continue;
    }
    const iso = new Date(unixTs * 1000).toISOString();
    stmts.insert.get(slug, iso, 'backfill');
    inserted++;
    console.log(`SEED ${slug}: inserted ${iso}`);
  }
  console.log(`SEED complete: ${inserted} backfilled, ${plants.length - inserted} skipped`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runSeed();
  process.exit(0);
}
