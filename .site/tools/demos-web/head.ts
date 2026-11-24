// The /demos/ page's head, today's (the live reactiive.io/demos, 2026-11-23), written over the demos build's
// `<title>Demos</title>` by tools/compose.ts. Absolute URLs are made against the deploy's canonical origin.
// One difference from today's head, on purpose: no og:site_name. Exact's runtime titles a page with no route title by
// og:site_name when the head has one (navigation.js), so with it the tab would read "Reactiive", not "Demos | Reactiive".
const DESCRIPTION = 'Explore the beauty of React Native animations with Reanimated, Skia and Gesture Handler';
const attr = (s: string) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

export function demosHead(origin: string) {
  const url = `${origin}/demos`, image = `${origin}/og/demos.png`;
  const meta: [string, string, string][] = [
    ['name', 'description', DESCRIPTION],
    ['name', 'author', 'Enzo Manuel Mangano'],
    ['name', 'creator', 'Enzo Manuel Mangano'],
    ['name', 'publisher', 'Reactiive'],
    ['property', 'og:title', 'Demos'],
    ['property', 'og:description', DESCRIPTION],
    ['property', 'og:url', url],
    ['property', 'og:locale', 'en_US'],
    ['property', 'og:image', image],
    ['property', 'og:image:secure_url', image],
    ['property', 'og:image:width', '1280'],
    ['property', 'og:image:height', '720'],
    ['property', 'og:image:alt', 'Exclusive weekly React Native animations source code.'],
    ['property', 'og:type', 'website'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:creator', '@reactiive_'],
    ['name', 'twitter:title', 'Demos'],
    ['name', 'twitter:description', DESCRIPTION],
    ['name', 'twitter:image', image],
    // Full screen from a phone's home screen, as the manifest's `standalone` already is elsewhere (D20).
    ['name', 'apple-mobile-web-app-capable', 'yes'],
    ['name', 'mobile-web-app-capable', 'yes'],
    ['name', 'apple-mobile-web-app-status-bar-style', 'black-translucent'],
    ['name', 'apple-mobile-web-app-title', 'Demos'],
  ];
  return [
    '<title>Demos | Reactiive</title>',
    ...meta.map(([k, n, v]) => `<meta ${k}="${n}" content="${attr(v)}">`),
    `<link rel="canonical" href="${attr(url)}">`,
    `<link rel="alternate" type="application/rss+xml" href="${attr(origin)}/rss.xml">`,
  ].join('\n');
}
