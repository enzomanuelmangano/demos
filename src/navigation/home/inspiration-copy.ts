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
const formatDay = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return `${MONTHS[month - 1]} ${date}, ${year}`;
};

const X_HOSTS = new Set([
  'x.com',
  'twitter.com',
  'www.x.com',
  'www.twitter.com',
]);

type Source =
  | { kind: 'x-post'; handle: string | null }
  | { kind: 'x-profile'; handle: string }
  | { kind: 'app-store' }
  | { kind: 'video' }
  | { kind: 'web' };

const readSource = (link: string): Source => {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { kind: 'web' };
  }
  const host = url.hostname.toLowerCase();
  if (X_HOSTS.has(host)) {
    // x.com/<handle>/status/<id>, x.com/i/status/<id>, or a bare x.com/<handle>.
    const [first, second] = url.pathname.split('/').filter(Boolean);
    if (second === 'status') {
      return { kind: 'x-post', handle: first === 'i' ? null : first };
    }
    if (first) return { kind: 'x-profile', handle: first };
  }
  if (host === 'apps.apple.com') return { kind: 'app-store' };
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    return { kind: 'video' };
  }
  return { kind: 'web' };
};

const withAt = (name: string) => (name.startsWith('@') ? name : `@${name}`);

/**
 * The sheet's copy for a demo, or null when the demo credits no one (or
 * credits someone without a link to send people to).
 */
export const getInspirationCopy = (slug: string): InspirationCopy | null => {
  const inspiration = AnimationInspirations[slug];
  if (!inspiration?.link) return null;
  const { authorName, link, builtOn } = inspiration;
  const source = readSource(link);
  // "This animation was built on <day> and is inspired by …", or, where the
  // day is not on record, "This animation is inspired by …".
  const lead = builtOn
    ? `This animation was built on ${formatDay(builtOn)} and is inspired by`
    : 'This animation is inspired by';

  if (source.kind === 'x-post' || source.kind === 'x-profile') {
    // The credited author, or the link's own account where none is named.
    const handle =
      authorName && authorName.startsWith('@')
        ? authorName
        : withAt(source.handle ?? authorName ?? 'unknown');
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

  const credit = authorName ?? new URL(link).hostname;
  if (source.kind === 'app-store') {
    return {
      story: `${lead} an interaction in the ${credit} app.`,
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
