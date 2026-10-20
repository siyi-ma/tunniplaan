// ChatGPT Sites adapter.
//
// A Site is one Worker plus the ASSETS binding. Secrets arrive on `env` for
// each request; there is no process.env here, and this module must not pull
// in node:crypto (the Netlify human-verification signer uses it). Admission
// is the platform's workspace sign-in: it puts the visitor's email on
// `oai-authenticated-user-email` and rejects anonymous requests before they
// reach us. We still require the header, because a Worker that trusts the
// platform to have already checked is one missed setting away from serving
// the dataset to whoever can hit the URL.
//
// The slider cookie stays on Netlify. This adapter never mints or reads it.

import { neon } from '@neondatabase/serverless';
import { handleRequest as handleManifest } from '../../server/api/manifest.js';
import { handleRequest as handleCourses } from '../../server/api/courses.js';
import { handleRequest as handleTimetable } from '../../server/api/timetable.js';
import { privatizePublicCache } from '../../server/api/cache.js';

export const AUTH_EMAIL_HEADER = 'oai-authenticated-user-email';

// TalTech Uni-ID addresses are @taltech.ee. sar-reader's Sites worker was not
// readable from this repo, so the default is the university domain rather than
// a guess at that project's constant. Set ALLOWED_EMAIL_DOMAINS to a comma
// separated list, or to `*`, to widen it. A blank setting keeps the default:
// an empty allow-list would lock every signed-in student out.
export const DEFAULT_ALLOWED_DOMAINS = 'taltech.ee';

export interface SitesEnv {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  NEON_DATABASE_URL?: string;
  ALLOWED_EMAIL_DOMAINS?: string;
  CALENDAR_SESSION_LIMIT?: string;
}

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

export interface FetchDeps {
  sql?: Sql;
  createSql?: (databaseUrl: string) => Sql;
  assetsFetch?: (request: Request) => Promise<Response>;
}

interface NetlifyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

interface Route {
  id: string;
  failure: string;
  run: (event: ReturnType<typeof toNetlifyEvent>, sql: Sql, env: SitesEnv) => Promise<NetlifyResult>;
}

const ROUTES: Record<string, Route> = {
  '/api/getDatasetManifest': {
    id: 'manifest',
    failure: 'manifest_unavailable',
    run: (event, sql) => handleManifest(event, sql),
  },
  '/api/getCourses': {
    id: 'courses',
    failure: 'courses_unavailable',
    run: (event, sql) => handleCourses(event, sql),
  },
  '/api/getTimetable': {
    id: 'timetable',
    failure: 'Error processing timetable data.',
    run: (event, sql, env) => handleTimetable(event, sql, {
      sessionLimit: sessionLimitFromEnv(env),
    }),
  },
};

let cachedSql: { url: string; sql: Sql } | null = null;

export function _resetSqlCache(): void {
  cachedSql = null;
}

export function sessionLimitFromEnv(env: SitesEnv | undefined): number {
  const raw = env ? env.CALENDAR_SESSION_LIMIT : undefined;
  if (raw === undefined || String(raw).trim() === '') return 4000;
  const parsed = parseInt(String(raw), 10);
  return parsed > 0 ? parsed : 4000;
}

export function emailDomain(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (!domain || /\s/.test(domain) || !domain.includes('.')) return null;
  return domain;
}

export function allowedDomains(raw: string | undefined): string[] | '*' {
  const value = raw === undefined || raw.trim() === '' ? DEFAULT_ALLOWED_DOMAINS : raw.trim();
  if (value === '*') return '*';
  return value.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
}

function jsonError(status: number, error: string, extra?: Record<string, string>): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  }
  return new Response(JSON.stringify({ error }), { status, headers });
}

export function authorize(request: Request, env: SitesEnv = {}): Response | null {
  const email = request.headers.get(AUTH_EMAIL_HEADER);
  const domain = email ? emailDomain(email) : null;
  if (!domain) return jsonError(401, 'unauthenticated');
  const allowed = allowedDomains(env.ALLOWED_EMAIL_DOMAINS);
  if (allowed === '*') return null;
  if (!allowed.includes(domain)) return jsonError(403, 'forbidden_domain');
  return null;
}

export function toNetlifyEvent(request: Request) {
  const url = new URL(request.url);
  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (!Object.prototype.hasOwnProperty.call(queryStringParameters, key)) {
      queryStringParameters[key] = value;
    }
  });
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    httpMethod: request.method,
    queryStringParameters,
    headers,
    body: null as string | null,
  };
}

export function toWebResponse(result: NetlifyResult): Response {
  // Same rewrite as Netlify's scopeCacheToClient: gated bytes must not be
  // stored in a cache that the next visitor can hit by URL alone.
  const scoped = privatizePublicCache(result) as NetlifyResult;
  const headers = new Headers();
  for (const [key, value] of Object.entries(scoped.headers || {})) {
    if (typeof value === 'string') headers.set(key, value);
  }
  return new Response(scoped.body ?? '', { status: scoped.statusCode, headers });
}

function rememberSql(url: string, create: (databaseUrl: string) => Sql): Sql {
  if (!cachedSql || cachedSql.url !== url) {
    cachedSql = { url, sql: create(url) };
  }
  return cachedSql.sql;
}

function sqlForRequest(env: SitesEnv, deps: FetchDeps): Sql {
  if (deps.sql) return deps.sql;
  const url = env && env.NEON_DATABASE_URL;
  if (!url) throw new Error('NEON_DATABASE_URL is not configured');
  const create = deps.createSql || ((databaseUrl: string) => neon(databaseUrl) as unknown as Sql);
  return rememberSql(url, create);
}

async function serveAsset(request: Request, env: SitesEnv, deps: FetchDeps): Promise<Response> {
  const fetchAsset = deps.assetsFetch
    || (env.ASSETS && typeof env.ASSETS.fetch === 'function'
      ? env.ASSETS.fetch.bind(env.ASSETS)
      : null);
  if (!fetchAsset) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return fetchAsset(request);
}

export async function handleFetch(
  request: Request,
  env: SitesEnv = {},
  deps: FetchDeps = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) {
    return serveAsset(request, env, deps);
  }

  const denial = authorize(request, env);
  if (denial) return denial;

  const route = ROUTES[url.pathname];
  if (!route) return jsonError(404, 'not_found');
  if (request.method !== 'GET') {
    return jsonError(405, 'method_not_allowed', { Allow: 'GET' });
  }

  let sql: Sql;
  try {
    sql = sqlForRequest(env, deps);
  } catch (error) {
    console.error(`${route.id} configuration error:`, error);
    return jsonError(500, route.failure);
  }

  try {
    const result = await route.run(toNetlifyEvent(request), sql, env);
    return toWebResponse(result);
  } catch (error) {
    console.error(`${route.id} failed:`, error);
    return jsonError(500, route.failure);
  }
}
