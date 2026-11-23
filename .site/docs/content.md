# Writing content

The articles and docs are MDX, written as on reactiive.io: the same folders, the same `index.json` fields, the same
component tags. They live in `.site/.content/` (a dot directory, so Exact never captures the sources) and are edited
there by hand. `tools/gen-content.ts` turns them into pages at build; its output (`content-gen/`, `assets/content/`,
`.out/content/`) is generated, gitignored and never edited.

## Add an article

1. Create `.content/articles/<slug>/` with:
   - `index.mdx`: the article, starting with `<Title date="YYYY-MM-DD" slug="<slug>">Title</Title>`;
   - `index.json`: its metadata (below);
   - `images/`: its pictures, referenced relatively (`![alt](./images/x.png)`, `"featuredImage": "./images/header.webp"`).
2. Run `bun tools/gen-content.ts` (or keep `bun run content:watch` running).

It then has its page at `/articles/<slug>`, a card on `/articles` (newest first) and on `/series/<series>`, an entry in
`/rss.xml` and `sitemap.xml`, and its head and JSON-LD (`tools/seo/postbuild.ts`, from the same `index.json`). A new `series` value makes a new `/series/<series>` page (titled from the slug).

## index.json

| field | required | |
|---|---|---|
| `title` | yes | the page title and the RSS title |
| `shortTitle` | no | the card's title (else `title`) |
| `subtitle` | yes | the description (head, card, RSS) |
| `author` | yes | |
| `date` | yes | `YYYY-MM-DD`; the cards sort by it |
| `slug` | yes | equal to the folder's name |
| `tags` | yes | strings |
| `featuredImage` | yes | `./images/…`: the card's cover and the share image |
| `series` | no | a kebab-case slug |
| `repository` | no | `{ url, directory }`, kept from the reference, not shown |

Any other field, a missing required one or a wrong type fails the build, naming the file.

## Markdown and components

Markdown (GFM): headings `##`–`####` (with anchors), paragraphs (a line break in the source is a line break on the
page, as live), `**strong**`, `*em*`, `` `code` ``, links, lists (nested, tight or loose), fenced code (```` ```tsx ````,
```` ```tsx diff ```` with `+ `/`- ` lines, ```` ```terminal ````), images (sized at build; PNGs become WebP), `.mp4`
images (a looping video), `---`, `> quotes`, `<br />`.

| component | props | what it draws |
|---|---|---|
| `<Title date slug>` | children: the title | the h1 and the long date |
| `<GithubCard repo="owner/name" path?>` | | the repo card (stars and forks from `.content/github-repos.json`; `bun tools/gen-content.ts --refresh-repos` updates it from GitHub's public API) |
| `<YouTubeEmbed videoId={'…'} />` | | the player (youtube-nocookie), framed once near the window |
| `<Embed url="https://x.com/…/status/…" />` | | the post, framed once near the window |
| `<InlineMath>…</InlineMath>`, `<BlockMath>…</BlockMath>` | TeX | SVG made at build (no MathJax in the browser) |
| an article's own component | imported from `./mdx-client` | its interactive demo (`interactive/<slug>/`); not yet ported ones draw the reference's empty 16:9 frame |

Any other tag, a raw HTML block or an `{expression}` (comments aside) fails the build with the file and line.

## Develop

```sh
cd .site
bun run content:watch &          # converts again on every edit under .content/
bun exact.mjs serve dist         # or: bun run build && bun tools/compose.ts && bun tools/serve.ts --port 4311
```

`bun run build` converts and builds. Demo-tied content is not ported (`docs/progress-content.md`): `SKIPPED` in
`tools/gen-content.ts`.
