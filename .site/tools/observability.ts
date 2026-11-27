#!/usr/bin/env bun
// Amplitude and Sentry in the built pages, configured as the reference's (src/providers/analytics, src/lib/
// sentry-options.ts, instrumentation-client.ts), when the build has their PUBLIC keys (EXPO_PUBLIC_AMPLITUDE_API_KEY,
// EXPO_PUBLIC_SENTRY_DSN: the reference ships both in its browser bundle). Without them nothing is written: the public
// build stays byte-identical. Run after tools/seo/postbuild.ts:   bun tools/observability.ts [dist]
//
// - Amplitude: the browser SDK (same major, the vendor's CDN build, pinned and SRI-checked), `init(key, undefined,
//   { defaultTracking: { sessions: true } })`, then `utm_source_open { utm_source }` when the URL has one: the only
//   event the reference sends. The SDK loads after the page (the reference imports it dynamically after hydration).
// - Sentry: the browser bundle with tracing, the reference's options (sample rates, release, environment, the
//   NetworkError / React-warning filters, cookie and auth header scrubbing, console-credential and auth-route
//   breadcrumb redaction).
// - Sentry's user, subscription context and tags (the reference's useSentryUserContext): components/account/account.ts
//   sets them when the user is known; one set before the SDK loaded (window.__reactiiveSentryUser) is applied after init.
// - The callback's `accessToken` query never leaves in an event: beforeSend and beforeSendTransaction scrub it from the
//   transaction name, the request URL and query, breadcrumbs and spans; beforeBreadcrumb from navigation and http URLs.
// - Nothing failing is lost: errors and rejections before the SDK has loaded are kept (up to 20) and sent once it has;
//   console.error is sent too (once per message, up to 20 a page), because that is how Exact's runtime reports what it
//   survives (a wasm trap in a GPU module, a refused GPU input), which no handler would otherwise see. Events carry the
//   deployed commit as their release, `preview` or `production` as their environment, and a `surface` tag: `site`, or
//   `demos-app` for the framed Demos app (tools/compose.ts runs this script on its pages too).
// - On localhost / 127.0.0.1 nothing is sent: Amplitude is initialised opted out and logs what it would track,
//   Sentry is initialised with `enabled: false` and `debug: true`. Production data stays clean.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SITE = resolve(import.meta.dir, '..');
const dist = resolve(SITE, process.argv[2] ?? 'dist');
const fromEnvLocal = (name: string) => {
  const p = join(SITE, '.env.local');
  if (!existsSync(p)) return '';
  const m = new RegExp(`^${name}=(.*)$`, 'm').exec(readFileSync(p, 'utf8'));
  return m ? m[1].trim() : '';
};
const setting = (name: string) => process.env[name] ?? fromEnvLocal(name);
const AMPLITUDE_KEY = setting('EXPO_PUBLIC_AMPLITUDE_API_KEY');
const SENTRY_DSN = setting('EXPO_PUBLIC_SENTRY_DSN');
// The release is the deployed commit (Vercel's, else the checkout's), so an event names the build it came from; the
// environment tells a preview deploy from production (Vercel's VERCEL_ENV), so previews never mix into production.
const SHA = process.env.VERCEL_GIT_COMMIT_SHA || spawnSync('git', ['rev-parse', 'HEAD'], { cwd: SITE, encoding: 'utf8' }).stdout?.trim() || '';
const RELEASE = /^[0-9a-f]{40}$/.test(SHA) ? `reactiive-site@${SHA.slice(0, 12)}` : '0.1.0';
const ENVIRONMENT = process.env.VERCEL_ENV === 'preview' ? 'preview' : 'production';
const AMPLITUDE_SDK = { src: 'https://cdn.amplitude.com/libs/analytics-browser-2.45.8-min.js.gz', integrity: 'sha384-Y6KRT/CpyDBs+2StdEYYiroFykv48Oa5ny/k7Gyknhzm63FFL0z1iuJGUgPrRUuW' };
const SENTRY_SDK = { src: 'https://browser.sentry-cdn.com/10.72.0/bundle.tracing.min.js', integrity: 'sha384-jw6S2PDdJKrirsZq4Dz8L0J1o3fyoZUAMkYg3sErU2aKKzgnkFto63KFAHQg73i8' };
const MARK = 'data-reactiive-observability';

if (!AMPLITUDE_KEY && !SENTRY_DSN) {
  console.log('observability: no public Amplitude key or Sentry DSN: nothing written');
  process.exit(0);
}
if (!/^[A-Za-z0-9]+$/.test(AMPLITUDE_KEY || 'x')) throw new Error('observability: EXPO_PUBLIC_AMPLITUDE_API_KEY is not a plain key');
if (SENTRY_DSN && !/^https:\/\/[A-Za-z0-9]+@[A-Za-z0-9.-]+\/[0-9]+$/.test(SENTRY_DSN)) throw new Error('observability: EXPO_PUBLIC_SENTRY_DSN is not a DSN');

// The page script: plain ES5-ish, no module, run once per document.
const script = `(function(){
var A=${JSON.stringify(AMPLITUDE_KEY)},D=${JSON.stringify(SENTRY_DSN)};
var local=/^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname);
var Q=[];function early(e){if(Q.length<20)Q.push(e.type==='error'?(e.error||new Error(String(e.message))):e.reason);}
if(D){addEventListener('error',early);addEventListener('unhandledrejection',early);}
function load(s,i,f){var e=document.createElement('script');e.src=s;e.integrity=i;e.crossOrigin='anonymous';e.async=true;e.onload=f;document.head.appendChild(e);}
if(D)load(${JSON.stringify(SENTRY_SDK.src)},${JSON.stringify(SENTRY_SDK.integrity)},function(){
var S=window.Sentry;if(!S)return;var dev=local;
function scrub(v){return typeof v==='string'?v.replace(/([?&#]accessToken=)[^&#\s]*/g,'$1[REDACTED]'):v;}
function clean(e){if(e.transaction)e.transaction=scrub(e.transaction);if(e.request){e.request.url=scrub(e.request.url);if(e.request.query_string)e.request.query_string=scrub('?'+(typeof e.request.query_string==='string'?e.request.query_string:'')).slice(1);}
(e.breadcrumbs||[]).forEach(function(b){if(b.message)b.message=scrub(b.message);if(b.data){['url','to','from'].forEach(function(k){if(b.data[k])b.data[k]=scrub(b.data[k]);});}});
(e.spans||[]).forEach(function(sp){if(sp.description)sp.description=scrub(sp.description);if(sp.data){['url','http.url','http.query'].forEach(function(k){if(sp.data[k])sp.data[k]=scrub(sp.data[k]);});}});
if(e.contexts&&e.contexts.trace&&e.contexts.trace.data){['url','http.url','http.query'].forEach(function(k){if(e.contexts.trace.data[k])e.contexts.trace.data[k]=scrub(e.contexts.trace.data[k]);});}return e;}
S.init({dsn:D,debug:dev,tracesSampleRate:dev?1:0.1,release:${JSON.stringify(RELEASE)},environment:dev?'development':${JSON.stringify(ENVIRONMENT)},enabled:!local,initialScope:{tags:{surface:location.pathname.indexOf('/demos/app')===0?'demos-app':'site'}},
integrations:[S.browserTracingIntegration()],
beforeSendTransaction:function(e){return clean(e);},
beforeSend:function(e){var x=e.exception&&e.exception.values&&e.exception.values[0];if(x&&x.type==='NetworkError')return null;if(!dev&&x&&x.value&&x.value.indexOf('Warning:')>=0)return null;
e=clean(e);if(e.request&&e.request.cookies)delete e.request.cookies;if(e.request&&e.request.headers){var h=Object.assign({},e.request.headers);delete h.authorization;delete h.cookie;e.request.headers=h;}return e;},
beforeBreadcrumb:function(b){if(b.category==='console'&&b.data&&b.data.arguments){if(b.data.arguments.some(function(a){return typeof a==='string'&&(a.indexOf('password')>=0||a.indexOf('token')>=0||a.indexOf('secret')>=0);}))return null;}
var t=b.data&&b.data.to;if(b.category==='navigation'&&typeof t==='string'&&(t.indexOf('/api/auth')>=0||t.indexOf('/api/login')>=0||t.indexOf('accessToken=')>=0))b.data=Object.assign({},b.data,{to:'[REDACTED_AUTH_ROUTE]'});
if(b.category==='navigation'&&b.data&&typeof b.data.from==='string'&&b.data.from.indexOf('accessToken=')>=0)b.data=Object.assign({},b.data,{from:'[REDACTED_AUTH_ROUTE]'});if(b.data&&b.data.url)b.data=Object.assign({},b.data,{url:scrub(b.data.url)});if(b.message)b.message=scrub(b.message);return b;}});
removeEventListener('error',early);removeEventListener('unhandledrejection',early);
Q.forEach(function(x){S.captureException(x,{tags:{phase:'before-sentry'}});});Q=[];
var ce=console.error,sent=0,seen={};
console.error=function(){ce.apply(console,arguments);try{if(sent>=20)return;var err=null,parts=[];
for(var i=0;i<arguments.length;i++){var a=arguments[i];if(!err&&a instanceof Error)err=a;parts.push(a instanceof Error?a.message:typeof a==='string'?a:(function(){try{return JSON.stringify(a);}catch(_){return String(a);}})());}
var msg=parts.join(' ').slice(0,500),key=msg.slice(0,200);if(!msg||seen[key])return;seen[key]=1;sent++;
if(err)S.captureException(err,{tags:{source:'console.error'},extra:{console:msg}});else S.captureMessage(msg,{level:'error',tags:{source:'console.error'}});}catch(_){}};
var U=window.__reactiiveSentryUser;if(U){try{S.setUser(U.user);S.setContext('subscription',U.context);for(var k in U.tags)S.setTag(k,U.tags[k]);}catch(e){}}
if(local)console.info('[sentry] localhost: initialised with enabled:false (nothing is sent)');});
function amp(){load(${JSON.stringify(AMPLITUDE_SDK.src)},${JSON.stringify(AMPLITUDE_SDK.integrity)},function(){
var a=window.amplitude;if(!a)return;var utm=new URLSearchParams(location.search).get('utm_source');
a.init(A,undefined,{defaultTracking:{sessions:true},optOut:local}).promise.then(function(){
if(utm){if(local)console.info('[amplitude] localhost (opted out, not sent): utm_source_open',{utm_source:utm});else a.track('utm_source_open',{utm_source:utm});}
else if(local)console.info('[amplitude] localhost: initialised opted out (nothing is sent)');});});}
if(A){if(document.readyState==='complete')setTimeout(amp,0);else addEventListener('load',function(){setTimeout(amp,0);});}
})();`;

const tag = `<script ${MARK}>${script.replace(/\n/g, '')}</script>`;
let pages = 0;
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (!n.startsWith('.')) walk(p); continue; }
    if (!n.endsWith('.html')) continue;
    let html = readFileSync(p, 'utf8');
    if (html.includes(MARK)) html = html.replace(new RegExp(`<script ${MARK}>[\\s\\S]*?</script>`), '');
    // Exact writes no </head>: the head ends where the page's markup starts.
    const cut = html.search(/<div id="exact-root"|<body|<\/head>/);
    if (cut < 0) continue;
    writeFileSync(p, html.slice(0, cut) + tag + html.slice(cut));
    pages++;
  }
};
walk(dist);
console.log(`observability: ${[AMPLITUDE_KEY && 'Amplitude', SENTRY_DSN && 'Sentry'].filter(Boolean).join(' + ')} on ${pages} pages (localhost: nothing sent)`);
