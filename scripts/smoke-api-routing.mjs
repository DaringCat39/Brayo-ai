const baseUrl = (process.env.BRAYO_SMOKE_BASE_URL || 'http://127.0.0.1:3111').replace(/\/$/, '');

const checks = [
  {
    path: '/api/projects',
    routeId: 'projects.collection',
    validate: (body) => Array.isArray(body.projects),
  },
  {
    path: '/api/uploads',
    routeId: 'uploads.collection',
    validate: (body) => typeof body.provider === 'string' && typeof body.direct === 'boolean',
  },
];

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${check.path} returned non-JSON content (${response.status}): ${text.slice(0, 200)}`);
  }
  const resolvedRoute = response.headers.get('x-brayo-api-route');
  if (response.status === 404 || resolvedRoute === 'unmatched') {
    throw new Error(`${check.path} did not resolve through the consolidated API dispatcher.`);
  }
  if (resolvedRoute !== check.routeId) {
    throw new Error(`${check.path} resolved as ${resolvedRoute || 'an unmarked route'}, expected ${check.routeId}.`);
  }
  if (!response.ok) {
    throw new Error(`${check.path} returned ${response.status}: ${body.error || text}`);
  }
  if (!check.validate(body)) {
    throw new Error(`${check.path} returned JSON with an invalid response shape.`);
  }
  console.log(`PASS ${check.path} -> ${response.status} (${resolvedRoute})`);
}
