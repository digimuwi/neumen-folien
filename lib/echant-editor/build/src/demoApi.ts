/**
 * The embed's single mocked seam.
 *
 * Every eChant service talks to the backend through `services/apiFetch.ts`, so
 * the build aliases that one module to this file. The chant services, the page
 * document service and the neume-class service above it are the real app code,
 * unchanged — they just get their JSON from the bundle instead of from FastAPI.
 *
 * Routes that would change server state or need a model (save, publish, split,
 * recognition) answer 501 with a readable message rather than being stubbed out
 * with a lie.
 */

import payloads from '../data/payloads-cropped.json';
import inlineFacsimile from '../../facsimile.jpg?inline';
import { fallbackNeumeClasses } from '@echant/data/neumeTypes';
import { deriveNeumeNameOffline, NameComponent } from './deriveName';

export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

export const CHANT_ID = payloads.chantDocument.id;
export const PAGE_ID = payloads.pageDocument.id;

/**
 * The folio, inline as a data URL.
 *
 * `facsimile.jpg` ships next to the bundle and is the source of truth, but the
 * default is the inlined copy: the annotation canvas reads the image back with
 * `getImageData`, and on `file://` an `<img>` from a separate file taints the
 * canvas, so that read throws. A data URL is same-origin everywhere.
 */
export const INLINE_FACSIMILE = inlineFacsimile;

let facsimileUrl = INLINE_FACSIMILE;
export const setFacsimileUrl = (url: string): void => {
  facsimileUrl = url;
};

/**
 * Serve the chant with its text and syllables but no neumes — the state a page
 * is in after its text has been read and before anyone has annotated the
 * notation. The syllables keep their zones, so the facsimile still shows what
 * the neumes will be attached to.
 */
let blank = false;
export const setBlank = (value: boolean): void => {
  blank = value;
};

const chantDocument = () => (blank ? { ...payloads.chantDocument, neumes: [] } : payloads.chantDocument);

const json = (body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const notImplemented = (what: string): Response =>
  new Response(JSON.stringify({ detail: `${what} is not part of this offline demo.` }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  });

const pageDocument = () => ({
  ...payloads.pageDocument,
  image: { ...payloads.pageDocument.image, data_url: facsimileUrl },
});

const deriveName = async (init?: RequestInit): Promise<Response> => {
  const body = JSON.parse(String(init?.body ?? '{}')) as {
    components?: NameComponent[];
    base_type?: string | null;
  };
  return json({ name: deriveNeumeNameOffline(body.components ?? [], body.base_type) });
};

type Route = { match: RegExp; method?: string; handle: (init?: RequestInit) => Response | Promise<Response> };

const ROUTES: Route[] = [
  { match: /\/chants\/[^/]+\/document(\?|$)/, method: 'GET', handle: () => json(chantDocument()) },
  { match: /\/chants\/[^/]+$/, method: 'GET', handle: () => json(payloads.chant) },
  {
    match: /\/pages\/[^/]+\/document(\?|$)/,
    method: 'GET',
    handle: () => json(pageDocument(), { ETag: `"${payloads.pageDocument.version}"` }),
  },
  { match: /\/neume-classes\/derive-name$/, method: 'POST', handle: deriveName },
  { match: /\/neume-classes$/, method: 'GET', handle: () => json(fallbackNeumeClasses) },
  { match: /\/manuscripts\/[^/]+\/chants$/, method: 'GET', handle: () => json([payloads.chant]) },
  {
    match: /\/manuscripts\/[^/]+\/pages$/,
    method: 'GET',
    handle: () => json(payloads.chantDocument.pages.map((p) => ({ id: p.id, folio_label: p.folio_label }))),
  },
  { match: /\/recognize/, handle: () => notImplemented('Recognition') },
  { match: /\/chants\/[^/]+\/document$/, method: 'PUT', handle: () => notImplemented('Saving') },
];

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? 'GET').toUpperCase();
  const route = ROUTES.find((r) => (r.method ?? method) === method && r.match.test(url));
  if (!route) {
    console.warn('[EChantDemo] unmocked request', method, url);
    return notImplemented(`${method} ${url}`);
  }
  return route.handle(init);
}

export async function parseErrorBody(response: Response): Promise<string | null> {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.detail === 'string' && parsed.detail) return parsed.detail;
  } catch {
    /* not JSON */
  }
  return text;
}

export async function throwIfBad(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const detail = await parseErrorBody(response);
  throw new Error(detail || `${action} failed: ${response.status} ${response.statusText}`);
}

export async function jsonOrThrow<T>(response: Response, action: string): Promise<T> {
  await throwIfBad(response, action);
  return response.json() as Promise<T>;
}
