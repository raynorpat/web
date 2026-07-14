import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GH_TOKEN = process.env.GH_TOKEN;
const GITEA_TOKEN = process.env.GITEA_TOKEN;
const GITEA_URL = process.env.GITEA_URL;
const GITEA_USER = process.env.GITEA_USER || 'raynorpat';

if (!GH_TOKEN || !GITEA_TOKEN || !GITEA_URL) {
  console.error('Missing GH_TOKEN, GITEA_TOKEN, or GITEA_URL');
  process.exit(1);
}

const now = new Date();
const oneYearAgo = new Date(now);
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
oneYearAgo.setDate(oneYearAgo.getDate() - 1);

const toISO = (d) => d.toISOString().slice(0, 10);

const ghQuery = `{
  "query": "query { viewer { contributionsCollection(from: \\"${toISO(oneYearAgo)}T00:00:00Z\\", to: \\"${toISO(now)}T23:59:59Z\\") { contributionCalendar { months { name firstWeek } weeks { firstDay contributionDays { date contributionCount } } } } } }"
}`;

async function fetchGitHub() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${GH_TOKEN}`, 'Content-Type': 'application/json' },
    body: ghQuery,
  });
  if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
  const json = await res.json();
  const cal = json.data.viewer.contributionsCollection.contributionCalendar;
  const byDate = {};
  for (const week of cal.weeks) {
    for (const day of week.contributionDays) {
      byDate[day.date] = (byDate[day.date] || 0) + day.contributionCount;
    }
  }
  const months = cal.months.map((m) => ({ name: m.name, week: m.firstWeek }));
  return { byDate, months };
}

async function fetchGitea() {
  const res = await fetch(`${GITEA_URL}/api/v1/users/${GITEA_USER}/heatmap`, {
    headers: GITEA_TOKEN ? { Authorization: `token ${GITEA_TOKEN}` } : {},
  });
  if (!res.ok) throw new Error(`Gitea API: ${res.status}`);
  const data = await res.json();
  const byDate = {};
  for (const entry of data) {
    const date = toISO(new Date(entry.timestamp * 1000));
    byDate[date] = (byDate[date] || 0) + entry.contributions;
  }
  return byDate;
}

function buildGrid(merged) {
  const start = new Date(oneYearAgo);
  const end = new Date(now);
  const weeks = [];
  let max = 0;

  const current = new Date(start);
  while (current <= end) {
    const date = toISO(current);
    const count = merged[date] || 0;
    if (count > max) max = count;
    weeks.push(count);
    current.setDate(current.getDate() + 1);
  }

  const firstDay = new Date(start);
  const padFront = (firstDay.getDay() + 6) % 7;
  for (let i = 0; i < padFront; i++) weeks.unshift(0);

  const lastDay = new Date(end);
  const padEnd = 6 - ((lastDay.getDay() + 6) % 7);
  for (let i = 0; i < padEnd; i++) weeks.push(0);

  const grid = [];
  for (let i = 0; i < weeks.length; i += 7) {
    grid.push(weeks.slice(i, i + 7));
  }

  return { grid, max };
}

async function main() {
  const [gh, gitea] = await Promise.all([fetchGitHub(), fetchGitea()]);

  const merged = { ...gh.byDate };
  for (const [date, count] of Object.entries(gitea)) {
    merged[date] = (merged[date] || 0) + count;
  }

  const { grid, max } = buildGrid(merged);

  const out = JSON.stringify({ months: gh.months, grid, max });
  writeFileSync(join(__dirname, '..', 'data', 'contributions.json'), out);
  console.log('Wrote data/contributions.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
