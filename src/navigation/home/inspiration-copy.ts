import { AnimationInspirations } from '../../animations/inspirations';

/** What the Inspiration sheet says about a demo, and where it links to. */
export interface InspirationCopy {
  /** How the demo came about, dated where the history allows. */
  story: string;
  action: { label: string; url: string };
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * "March 4, 2025", from a YYYY-MM-DD day. Spelled out by hand rather than
 * through Intl, so the sheet reads the same whatever locale data the runtime
 * ships with.
 */
const formatDay = (day: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split('-').map(Number);
  const name = MONTHS[month - 1];
  return name ? `${name} ${date}, ${year}` : null;
};

const X_HOSTS = new Set([
  'x.com',
  'twitter.com',
  'www.x.com',
  'www.twitter.com',
  'mobile.x.com',
  'mobile.twitter.com',
]);

type Source = { host: string } & (
  | { kind: 'x-post'; handle: string | null }
  | { kind: 'x-profile'; handle: string }
  | { kind: 'app-store' }
  | { kind: 'video' }
  | { kind: 'web' }
);

const readSource = (link: string): Source => {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    // Not a URL anyone can parse: still a link to offer, with no host to
    // name it by.
    return { kind: 'web', host: link };
  }
  const host = url.hostname.toLowerCase();
  if (X_HOSTS.has(host)) {
    // x.com/<handle>/status/<id>, x.com/i/status/<id>,
    // x.com/i/web/status/<id>, or a bare x.com/<handle>.
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.includes('status')) {
      return {
        kind: 'x-post',
        host,
        handle: parts[0] === 'i' ? null : parts[0],
      };
    }
    if (parts[0] && parts[0] !== 'i') {
      return { kind: 'x-profile', host, handle: parts[0] };
    }
  }
  if (host === 'apps.apple.com') return { kind: 'app-store', host };
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    return { kind: 'video', host };
  }
  return { kind: 'web', host };
};

const withAt = (name: string) => (name.startsWith('@') ? name : `@${name}`);

/**
 * The sheet's copy for a demo, or null when the demo credits no one (or
 * credits someone with no link or X handle to send people to).
 */
export const getInspirationCopy = (slug: string): InspirationCopy | null => {
  const inspiration = AnimationInspirations[slug];
  if (!inspiration) return null;
  const { authorName, builtOn } = inspiration;
  // An X handle credited without a post still has a profile to send people to.
  const link =
    inspiration.link ??
    (authorName?.startsWith('@')
      ? `https://x.com/${authorName.slice(1)}`
      : null);
  if (!link) return null;
  const source = readSource(link);
  // "This animation was built on <day> and is inspired by …", or, where the
  // day is not on record, "This animation is inspired by …".
  const day = builtOn ? formatDay(builtOn) : null;
  const lead = day
    ? `This animation was built on ${day} and is inspired by`
    : 'This animation is inspired by';

  if (source.kind === 'x-post' || source.kind === 'x-profile') {
    // A credit that is not a handle names the author; the post is someone
    // else's — a curator's, usually — and is said to be theirs.
    if (authorName && !authorName.startsWith('@')) {
      const by = source.handle ? ` by ${withAt(source.handle)}` : '';
      return source.kind === 'x-post'
        ? {
            story: `${lead} ${authorName}, featured in a post on X${by}.`,
            action: { label: 'See Post', url: link },
          }
        : {
            story: `${lead} ${authorName}, on X.`,
            action: { label: 'See Profile', url: link },
          };
    }
    // The credited handle, or the link's own account where none is named.
    const handle = authorName ?? withAt(source.handle ?? 'unknown');
    if (source.kind === 'x-profile') {
      return {
        story: `${lead} the work of ${handle} on X.`,
        action: { label: 'See Profile', url: link },
      };
    }
    // A post can come from someone other than the author: a curator sharing
    // their work (x.com/i/status links carry no account at all).
    const ownPost =
      source.handle === null ||
      source.handle.toLowerCase() === handle.slice(1).toLowerCase();
    return {
      story: ownPost
        ? `${lead} a post on X by ${handle}.`
        : `${lead} the work of ${handle}, featured in a post on X.`,
      action: { label: 'See Post', url: link },
    };
  }

  const credit = authorName ?? source.host;
  if (source.kind === 'app-store') {
    // An app is named, not handled.
    const app = credit.replace(/^@/, '');
    return {
      story: `${lead} an interaction in the ${app} app.`,
      action: { label: 'View on the App Store', url: link },
    };
  }
  return {
    story: `${lead} ${credit}.`,
    action: {
      label: source.kind === 'video' ? 'Watch Video' : 'Open Link',
      url: link,
    },
  };
};
