import { stmts } from './db.js';

const WINDOW = 10;

function intervalsDays(timestamps) {
  const sorted = [...timestamps].sort();
  const out = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = Date.parse(sorted[i - 1]);
    const curr = Date.parse(sorted[i]);
    out.push((curr - prev) / 86_400_000);
  }
  return out;
}

function avg(nums) {
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 10) / 10;
}

function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  return Math.round(m * 10) / 10;
}

export function statsForSlug(slug) {
  const rows = stmts.recentForSlug.all(slug, WINDOW);
  if (rows.length === 0) {
    return {
      count: 0,
      last_watered: null,
      avg_interval_days: null,
      median_interval_days: null,
      recent: [],
    };
  }
  const total = stmts.countBySlug.get(slug).n;
  const recent = rows.map((r) => r.watered_at);
  const intervals = intervalsDays(recent);
  return {
    count: total,
    last_watered: recent[0],
    avg_interval_days: avg(intervals),
    median_interval_days: median(intervals),
    recent: recent.slice(0, 5),
  };
}

export function statsAll() {
  const slugs = stmts.distinctSlugs.all().map((r) => r.plant_slug);
  const out = {};
  for (const slug of slugs) {
    out[slug] = statsForSlug(slug);
  }
  return out;
}
