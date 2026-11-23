# Accounts: every signed-in screen and the storage continuity (branch site-accounts, 2026-11-23)

Owner's requirements: (A) every account screen and state as live, signed out and signed in; `/manage-subscription`
with a subscription's status and its cancel only (no prices, no checkout); (B) no reader loses their browser storage
at the cutover. Contract and proof of (B): `docs/storage.md`. What is ported and stubbed: `docs/stubs.md`.

## Done

- **Storage (B).** `web/storage.js` (first script of every page, `tools/storage-bridge.ts`): `@AccessStorage` (XOR +
  base64 with the public `EXPO_PUBLIC_ACCESS_KEY`), `@UtmSource`, `reactiive:signed-in` (+ `html[data-auth=in]`) are the
  runtime's persisted states both ways; every other key untouched; a signed-in reader's intent-activated page starts its
  runtime when idle. `tools/local-env/storage-continuity.ts`: 51/51 PASS headless and headed (old → new → rollback →
  sign-out → sign-in → new visitor, one origin via `tools/local-env/switch.ts`).
- **Screens (A).** Avatar menu with "Support Demos" / "Manage Support"; `/profile` with the SubscriptionBox (both faces)
  and the legal footer; `/manage-subscription` (header, billing-issue and cancelled banners' text, the current plan's
  card without price, "Cancel Plan", Plan Benefits; neutral without a plan); the cancel confirmation and
  POST `/api/purchase/cancel-subscription` identical to the reference's request (mocked in tests, never sent); the
  loading circle for a reader signed in at the last visit; up to 640 px the dialogs are vaul's bottom sheet (handle,
  no X, 500 ms slide), above it Radix's fade + zoom 95 % with the blurred overlay.
- **Fixed on the way.** The desktop header bar clipped the avatar's menu (overflow hidden): only its top 14 px showed;
  the profile's mobile sign-out card showed on desktop (an inverted clamp); the profile's footer variant.
- **Parity** (`tools/local-env/account-parity.ts`, first viewport, % of pixels over 32/255): `/profile` 0.03 % (1440,
  every plan state), 0.81 % (390); cancel dialog 0.04 % / 0.45 %; `/manage-subscription` 0.8-8 % (the removed price
  cards, by design); the sign-in dialog differs only by the page behind it (/demos is the redesigned page, D17).

## Not done / owner

- Swipe-to-dismiss of the mobile sheet (vaul's drag) is not ported: overlay tap and Escape close it.
- Sentry user context (`use-sentry-user-context`) is not set.
- Production: repository variables `SITE_ACCOUNTS=1`, `EXPO_PUBLIC_ACCESS_KEY`, Amplitude, Sentry (`docs/deploy.md`).
