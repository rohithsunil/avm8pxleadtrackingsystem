import { HttpError, json, readJson } from './http.js';
import { clearCookie, getRole, login, requireRole, sessionCookie } from './auth.js';
import { createLead, findByPhone, getLead, listLeads, updateLead } from './leads.js';
import { createCampaign, getOptions, updateCampaign, updateSettings } from './settings.js';
import { dashboard } from './dashboard.js';
import { getWeek, saveWeek } from './adstats.js';
import { editSummary, getSummary, parseLead, writeSummary } from './ai.js';

const BOTH = ['staff', 'agency'];
const AGENCY = ['agency'];

// [method, path pattern, roles (null = public), handler(req, ctx)]
const routes = [
  ['POST', '/login', null, async (req) => {
    const { pin } = await readJson(req);
    const role = await login(req, pin);
    return json({ role }, 200, { 'set-cookie': sessionCookie(req, role) });
  }],
  ['POST', '/logout', null, async (req) => json({ ok: true }, 200, { 'set-cookie': clearCookie(req) })],
  ['GET', '/me', null, async (req) => json({ role: getRole(req) })],

  ['GET', '/options', BOTH, async (req, { role }) => json(await getOptions(role))],

  ['GET', '/leads', BOTH, async (req, { url }) => json(await listLeads(url.searchParams))],
  ['GET', '/leads/check-phone', BOTH, async (req, { url }) => json(await findByPhone(url.searchParams.get('phone')))],
  ['POST', '/leads', BOTH, async (req) => json(await createLead(await readJson(req)), 201)],
  ['GET', '/leads/:id', BOTH, async (req, { id }) => json(await getLead(id))],
  ['PATCH', '/leads/:id', BOTH, async (req, { id }) => json(await updateLead(id, await readJson(req)))],
  ['POST', '/parse', BOTH, async (req, { role }) => json(await parseLead(await readJson(req), role))],

  ['GET', '/dashboard', AGENCY, async (req, { url }) => json(await dashboard(url.searchParams))],
  ['GET', '/ad-stats', AGENCY, async (req, { url }) => json(await getWeek(url.searchParams))],
  ['PUT', '/ad-stats', AGENCY, async (req) => json(await saveWeek(await readJson(req)))],
  ['GET', '/summary', AGENCY, async (req, { url }) => json(await getSummary(url.searchParams))],
  ['POST', '/summary', AGENCY, async (req) => json(await writeSummary(await readJson(req)))],
  ['PUT', '/summary', AGENCY, async (req) => json(await editSummary(await readJson(req)))],
  ['PUT', '/settings', AGENCY, async (req) => json(await updateSettings(await readJson(req)))],
  ['POST', '/campaigns', AGENCY, async (req) => json(await createCampaign(await readJson(req)), 201)],
  ['PATCH', '/campaigns/:id', AGENCY, async (req, { id }) => json(await updateCampaign(id, await readJson(req)))],
];

function match(pattern, path) {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) {
      if (!/^\d+$/.test(b[i])) return null;
      params[a[i].slice(1)] = Number(b[i]);
    } else if (a[i] !== b[i]) return null;
  }
  return params;
}

export async function handle(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';
  try {
    // Reject cross-site writes: the cookie is SameSite=Lax, this closes the rest.
    if (req.method !== 'GET') {
      const origin = req.headers.get('origin');
      if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Cross-site request blocked');
    }
    for (const [method, pattern, roles, handler] of routes) {
      if (method !== req.method) continue;
      const params = match(pattern, path);
      if (!params) continue;
      const role = roles ? requireRole(req, ...roles) : null;
      return await handler(req, { url, role, ...params });
    }
    throw new HttpError(404, 'Not found');
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, fields: err.fields }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
