// The signed-in features' data (docs/stubs.md, decisions.md D15): the reference's client, against the reference's own
// API (`/api/*`, served by the old Next deployment through the host's rewrite, or locally by tools/local-env/api.ts
// through tools/serve.ts). The session is the reference's: a Bearer JWT the OAuth callback hands to
// `/profile?accessToken=…`, kept by the page (app.contract `accessToken`, persisted) and sent as `Authorization`.
// No cookie is involved, so every request is `credentials: 'omit'`.
//
// EXPO_PUBLIC_WEBSITE_URL is the reference's own public setting (its API client's base; here the origin the grant
// names, default the live one). SITE_ACCOUNTS=1 turns the accounts on; unset (every build without the env, the
// public one included) they are off: the header draws the signed-out "Sign In" as before, opening nothing, and no
// request is made. Only public values are read here: they are inlined into the page.
import type { Result } from '../../app.contract.d.ts';

export const WEBSITE_URL = import.meta.env.EXPO_PUBLIC_WEBSITE_URL ?? 'https://reactiive.io';
const ACCOUNTS = import.meta.env.SITE_ACCOUNTS ?? '';
export const API = `${WEBSITE_URL}/api`;
const ON = ACCOUNTS === '1';

type Me = Result<'userInfo'>;
const SIGNED_OUT: Me = { signedIn: false, rejected: false, id: '', name: '', email: '', picture: '', relay: false, supporter: false, plan: '', planType: '', planStatus: '', expires: '' };

// date-fns `format(new Date(expiresAt), 'MMMM d, yyyy')` (the reader's time zone), as the reference's SubscriptionBox
// and cancel dialog write it; '' when there is no date.
const longDate = (v: unknown) => {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const api = (path: string, token: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API}${path}`, { ...init, headers, credentials: 'omit', cache: 'no-store' });
};
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const accountSources = {
  siteConfig: async (): Promise<Result<'siteConfig'>> => ({ accounts: ON }),

  // GET /api/user/info (states/auth/user.ts). A 401 is a token the server no longer takes: signed out, and the page
  // forgets it (`rejected`). Any other failure fails the resource (kept signed in, as the reference's query error).
  userInfo: async ([token]: [string]): Promise<Me> => {
    if (!ON || !token) return SIGNED_OUT;
    const r = await api('/user/info', token);
    if (r.status === 401) return { ...SIGNED_OUT, rejected: true };
    if (!r.ok) throw new Error(`user/info answered ${r.status}`);
    const body = (await r.json()) as { user?: Record<string, unknown>; plan?: { status?: string; subscriptionType?: string; expiresAt?: string } | null };
    const u = body.user ?? {};
    const email = str(u.email);
    const status = str(body.plan?.status);
    const supporter = status === 'active' || status === 'cancelled';
    const planType = str(body.plan?.subscriptionType);
    return {
      signedIn: email !== '',
      rejected: false,
      id: String(u.id ?? ''),
      name: str(u.name),
      email,
      picture: str(u.profilePicture),
      relay: email.includes('privaterelay.appleid.com'),
      supporter,
      // states/auth/user.ts: planData is the plan when there is one; currentPlan its subscriptionType for a supporter.
      plan: supporter ? planType : '',
      planType: body.plan ? planType : '',
      planStatus: body.plan ? status : '',
      expires: body.plan ? longDate(body.plan.expiresAt) : '',
    };
  },

  // GET /api/auth/{google,apple}-sign-up → { url }: asked when the sign-in dialog opens, so its buttons are plain links
  // to the provider (the reference asks at the press, then sets window.location: the same request, the same page).
  // Asked on every build once the dialog has opened (Sign In works as live's; `attempt` asks again after a failure).
  authUrl: async ([provider, utm, armed]: [string, string, boolean, number]): Promise<string> => {
    if (!armed) return '';
    const r = await api(`/auth/${provider}-sign-up${utm ? `?utm_source=${encodeURIComponent(utm)}` : ''}`, '');
    if (!r.ok) throw new Error(`auth/${provider}-sign-up answered ${r.status}`);
    const { url } = (await r.json()) as { url?: string };
    if (!url || !/^https:\/\//.test(url)) throw new Error('no sign-in URL');
    return url;
  },

  // POST /api/feedback/submit (providers/modal/feedback-modal): { feedback, isAnonymous, demoName }.
  sendFeedback: async ([token, text, anonymous, demo]: [string, string, boolean, string]): Promise<Result<'sendFeedback'>> => {
    if (!ON || !token) return { ok: false };
    const body: Record<string, unknown> = { feedback: text, isAnonymous: anonymous };
    if (demo) body.demoName = demo;
    const r = await api('/feedback/submit', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: r.ok };
  },

  // POST /api/purchase/cancel-subscription (hooks/use-subscription.ts `cancelSubscription`: axios `client.post(path)`,
  // no body, the Bearer token, axios's Accept). Only from the cancel dialog's confirm button.
  cancelSubscription: async ([token]: [string]): Promise<Result<'cancelSubscription'>> => {
    if (!ON || !token) return { ok: false };
    const r = await api('/purchase/cancel-subscription', token, { method: 'POST', headers: { Accept: 'application/json, text/plain, */*' } });
    return { ok: r.ok };
  },

  // GET /api/github/stars?repo=… (hooks/use-github-stars.ts): the live count, through the site's server (token and an
  // hour's cache there). Asked on the reader's page only (`live`), never at build: the snapshot is the fallback.
  githubStars: async ([repo, snapshot, live]: [string, number, boolean]): Promise<number> => {
    if (!ON || !live) return snapshot;
    try {
      const r = await api(`/github/stars?repo=${encodeURIComponent(repo)}`, '');
      const { stars } = (await r.json()) as { stars?: number };
      return r.ok && typeof stars === 'number' && stars > 0 ? stars : snapshot;
    } catch {
      return snapshot;
    }
  },
};
