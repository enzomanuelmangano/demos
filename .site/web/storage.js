/* The old site's storage, kept (docs/storage.md). The reference (the Next site this one replaces on the same origin)
   keeps its session and its settings under its own localStorage keys; this site's runtime keeps its persisted state
   under Exact's (`exact.state.<name>`). This script, the first of every page's head (tools/storage-bridge.ts writes it
   there, with the reference's public obfuscation key, only in a build with the accounts on), makes them one:

   - at load, before the runtime reads its state, the reference's keys are the truth: `@AccessStorage` (the session's
     JWT, XOR with EXPO_PUBLIC_ACCESS_KEY then base64: src/client/jwt) becomes `exact.state.accessToken`,
     `@UtmSource` (plain text: src/states/analytics) `exact.state.utmSource`, `reactiive:signed-in` ("1": the header
     hint) `exact.state.signedHint`, and html[data-auth=in] is set from the hint as the reference's head script does;
   - whenever the runtime writes one of those three, the reference's key is written the reference's way (or removed
     where the reference removes it), so a rollback to the old site finds the session and the settings as they are;
   - a page that starts its runtime only on intent (docs/decisions.md D16) starts it once idle for a signed-in reader,
     so the avatar replaces the reserved circle without a press.

   Nothing else is read, written or removed: every other key on the origin (TanStack Query's REACTIIVE_CACHE,
   Amplitude's AMP_* cookies, localStorage, sessionStorage and IndexedDB, anything older) is left as it is. */
(function () {
  var K = '__REACTIIVE_ACCESS_KEY__', L;
  try { L = window.localStorage; L.getItem('@AccessStorage'); } catch (e) { return; }
  var P = Storage.prototype, set = P.setItem, del = P.removeItem, get = P.getItem;
  var TOKEN = '@AccessStorage', UTM = '@UtmSource', HINT = 'reactiive:signed-in';
  var X_TOKEN = 'exact.state.accessToken', X_UTM = 'exact.state.utmSource', X_HINT = 'exact.state.signedHint';
  function xor(s) {
    var o = [];
    for (var i = 0; i < s.length; i++) o.push(String.fromCharCode(s.charCodeAt(i) ^ K.charCodeAt(i % K.length)));
    return o.join('');
  }
  function put(k, v) { try { if (get.call(L, k) !== v) set.call(L, k, v); } catch (e) {} }
  function drop(k) { try { if (get.call(L, k) !== null) del.call(L, k); } catch (e) {} }

  /* The reference's keys into the runtime's (its getItem: no item, or one that does not decode, is no session). */
  var raw = get.call(L, TOKEN), token = '';
  if (raw) try { token = xor(atob(raw)); } catch (e) { token = ''; }
  put(X_TOKEN, JSON.stringify(token));
  put(X_UTM, JSON.stringify(get.call(L, UTM) || ''));
  // A hint without a session (signed out elsewhere) is already the signed-out state: the reference's AuthSlot removes
  // it as soon as it renders "Sign In"; here at once, since no runtime may start on this page to learn it.
  var hinted = get.call(L, HINT) === '1' && !!token;
  if (!hinted) drop(HINT);
  put(X_HINT, hinted ? 'true' : 'false');
  if (hinted) document.documentElement.dataset.auth = 'in';

  /* The runtime's writes back into the reference's keys. */
  function mirror(k, text) {
    if (k !== X_TOKEN && k !== X_UTM && k !== X_HINT) return;
    var v = null;
    try { v = text == null ? null : JSON.parse(text); } catch (e) { return; }
    if (k === X_TOKEN) {
      if (typeof v === 'string' && v) { try { put(TOKEN, btoa(xor(v))); } catch (e) {} } else drop(TOKEN); // useSignOut: removeItem
    } else if (k === X_UTM) {
      if (typeof v === 'string' && v) put(UTM, v); // setUtmSource; the reference never clears it
    } else if (v === true) put(HINT, '1');
    else { drop(HINT); delete document.documentElement.dataset.auth; } // AuthSlot signed out: removeItem
  }
  P.setItem = function (k, v) { set.call(this, k, v); if (this === L) mirror(String(k), String(v)); };
  P.removeItem = function (k) { del.call(this, k); if (this === L) mirror(String(k), null); };

  /* A signed-in reader on a page that activates on intent: start the runtime once idle (Exact's capture script's own
     start: the checkpoint's entry, its answers fetched beside it). */
  if (!token) return;
  function start() {
    var c = document.querySelector('script[type="application/vnd.exact.checkpoint"]'), x = self.exact = self.exact || {};
    if (!c || x.ready || c.dataset.activate != 'interaction') return;
    if (c.dataset.src) x.answers = fetch(c.dataset.src).then(function (r) { return r.ok ? r.text() : null; }, function () { return null; });
    x.ready = import(c.dataset.entry);
  }
  function idle() { (self.requestIdleCallback || setTimeout)(start, { timeout: 2000 }); }
  if (document.readyState != 'loading') idle(); else document.addEventListener('DOMContentLoaded', idle, { once: true });
})();
