import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GITHUB_USER = process.env.GITHUB_USER || 'raynorpat';
const GITEA_TOKEN = process.env.GITEA_TOKEN;
const GITEA_URL = process.env.GITEA_URL;
const GITEA_USER = process.env.GITEA_USER || 'raynorpat';

if (!GITEA_TOKEN || !GITEA_URL) {
  console.error('Missing GITEA_TOKEN or GITEA_URL');
  process.exit(1);
}

const now = new Date();
const oneYearAgo = new Date(now);
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
oneYearAgo.setUTCHours(0, 0, 0, 0);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const toISO = (d) => d.toISOString().slice(0, 10);

const toLocalDate = (ts) => {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Scrape the public profile calendar so opted-in private contributions match
// github.com (GraphQL omits them unless the token has read:user as that user).
async function fetchGitHub() {
  const res = await fetch(`https://github.com/users/${GITHUB_USER}/contributions`, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'raynorpat.com-contribution-heatmap',
    },
  });
  if (!res.ok) throw new Error(`GitHub contributions page: ${res.status}`);
  const html = await res.text();
  const pairs = [
    ...html.matchAll(
      /data-date="(\d{4}-\d{2}-\d{2})"[^>]*id="(contribution-day-component-[^"]+)"[\s\S]*?<\/td>\s*<tool-tip[^>]*for="\2"[^>]*>([^<]+)<\/tool-tip>/g
    ),
  ];
  if (pairs.length === 0) {
    throw new Error('GitHub contributions page: no calendar days found');
  }
  const byDate = {};
  for (const [, date, , text] of pairs) {
    const m = /^(\d+) contribution/.exec(text);
    byDate[date] = m ? Number(m[1]) : 0;
  }
  return byDate;
}

async function fetchGitea() {
  const res = await fetch(`${GITEA_URL}/api/v1/users/${GITEA_USER}/heatmap`, {
    headers: GITEA_TOKEN ? { Authorization: `token ${GITEA_TOKEN}` } : {},
  });
  if (!res.ok) throw new Error(`Gitea API: ${res.status}`);
  const data = await res.json();
  const byDate = {};
  for (const entry of data) {
    const date = toLocalDate(entry.timestamp);
    byDate[date] = (byDate[date] || 0) + entry.contributions;
  }
  return byDate;
}

function buildGrid(merged) {
  const start = new Date(oneYearAgo);
  const end = new Date(now);
  const days = [];
  let max = 0;

  const current = new Date(start);
  const dayOfWeek = (current.getDay() + 6) % 7;
  current.setDate(current.getDate() - dayOfWeek);

  const months = [];
  let lastMonth = -1;

  while (current <= end) {
    const date = toISO(current);
    const count = merged[date] || 0;
    if (count > max) max = count;
    days.push(count);

    const m = current.getMonth();
    const weekIdx = Math.floor((days.length - 1) / 7);
    if (m !== lastMonth) {
      months.push({ name: MONTHS[m], week: weekIdx });
      lastMonth = m;
    }

    current.setDate(current.getDate() + 1);
  }

  while (days.length % 7 !== 0) days.push(0);

  const grid = [];
  for (let i = 0; i < days.length; i += 7) {
    grid.push(days.slice(i, i + 7));
  }

  return { grid, max, months };
}

async function main() {
  const [gh, gitea] = await Promise.all([fetchGitHub(), fetchGitea()]);

  const merged = { ...gh };
  for (const [date, count] of Object.entries(gitea)) {
    merged[date] = (merged[date] || 0) + count;
  }

  const { grid, max, months } = buildGrid(merged);
  const sumByDate = (byDate) => Object.values(byDate).reduce((a, b) => a + b, 0);
  const nonZeroDays = Object.values(merged).filter((c) => c > 0).length;

  const out = JSON.stringify({ months, grid, max });
  writeFileSync(join(__dirname, '..', 'data', 'contributions.json'), out);
  console.log(
    `Wrote data/contributions.json (nonZeroDays=${nonZeroDays}, gh=${sumByDate(gh)}, gitea=${sumByDate(gitea)}, max=${max}, weeks=${grid.length})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
