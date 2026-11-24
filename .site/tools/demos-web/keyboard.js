/* The framed app's iOS keyboard for reactiive.io's /demos (desktop): the iPhone Air in the page has no software
   keyboard, so a focused field showed only a caret. This draws iOS 26's keyboard inside the phone's display, slides it
   with the system's curve, types into the focused field with real input (execCommand: beforeinput / input, maxlength,
   the caret) and lifts what iOS lifts: a keyboard toolbar (`data-toolbarplacement="keyboard"`) by the keys' height, and
   `env.keyboardHeight` (exactViewport) through a VirtualKeyboard stand-in, as a phone's browser reports it.
   Not part of the Demos app: tools/compose.ts inlines it after bridge.js into the composed /demos/app/ HTML only.
   Active only in a frame (the site's), with a fine pointer (a desktop), and only for a field inside the drawn phone
   (`web-device`): a phone's full-screen /demos/app/ keeps the OS keyboard, and nothing below runs there.
   Cost before the first focus: one focusin listener; the keyboard's nodes are built on the first focus.
   Geometry and colours are measured on an iPhone Air simulator (iOS 26.5, 3x screenshots, .site/.out/keyboard-ref):
   points of the 420 x 912 display. Motion: show = a critically damped spring (omega 23/s, 400 ms), hide =
   UIKit's keyboard curve over 220 ms, both fitted to a 30 fps recording of the simulator; under
   prefers-reduced-motion, a 160 ms opacity fade in place instead of the slide. */
(function () {
  if (window.parent === window || !window.matchMedia || !matchMedia('(pointer: fine)').matches) return;

  // ---- env.keyboardHeight: the VirtualKeyboard API's rect, which the web host reads (keyboardInset) ----
  const vk = new EventTarget();
  let vkRect = new DOMRect(0, 0, 0, 0);
  Object.defineProperty(vk, 'boundingRect', { get: () => vkRect });
  vk.overlaysContent = true;
  vk.show = vk.hide = () => {};
  try { Object.defineProperty(navigator, 'virtualKeyboard', { configurable: true, get: () => vk }); } catch {}
  const report = (h) => {
    if (vkRect.height === h) return;
    vkRect = new DOMRect(0, 912 - h, 420, h);
    vk.dispatchEvent(new Event('geometrychange'));
  };

  // ---- measured geometry (display points) ----
  const W = 420, H = 912, BASE = 318, PRED = 26.2;
  const ROW = [619.33, 675.33, 731.33, 787.33], KH = 44.67, KR = 7.33;
  const P10 = (x0, w) => Array.from({ length: 10 }, (_, i) => [x0 + i * 41.33, w]);
  const R1 = P10(7.33, 33.67), R2 = P10(27.33, 34.67).slice(0, 9), R3 = P10(68.67, 34.67).slice(0, 7);
  const SHIFT = [7, 47], DEL = [366, 47.33];
  const R4 = { k123: [7, 44.67], emoji: [58.33, 45], space: [110, 200], ret: [316.67, 96.67] };
  const R4URL = [[110, 62.33], [179, 62], [247.67, 62.33]];
  const R4MAIL = [[110, 131], [247.67, 62.33]];
  const SYM2 = P10(7, 34.33), SYM3 = Array.from({ length: 5 }, (_, i) => [68.67 + i * 57.83, 51.33]);
  const NUM = { cols: [[5.67, 130.33], [144, 130.67], [282.67, 130.33]], rows: [618, 674, 730, 786], h: 50 };
  const GLOBE = [42.2, 871.8], MIC = [377.2, 870.8];
  const COLORS = {
    light: { panel: 'rgba(215,218,222,0.7255)', key: 'rgba(255,255,255,0.734)', keyFilter: 'brightness(1.128)', ink: '#000', pred: '#36373b', sep: 'rgba(60,60,67,0.18)', rim: 'inset 0 0.33px 0 rgba(255,255,255,0.78), inset 0 0.67px 0 rgba(255,255,255,0.59), inset 0 1px 0 rgba(255,255,255,0.36)', pop: '#fff', press: 'rgba(0,0,0,0.13)' },
    dark: { panel: 'rgba(28,28,28,0.831)', key: 'rgba(227,227,227,0.186)', keyFilter: 'none', ink: '#fff', pred: '#acacac', sep: 'rgba(255,255,255,0.12)', rim: 'inset 0 0.33px 0 rgba(255,255,255,0.2), inset 0 0.67px 0 rgba(255,255,255,0.14), inset 0 1px 0 rgba(255,255,255,0.08)', pop: '#6b6b6b', press: 'rgba(255,255,255,0.16)' },
  };
  const BLUE = '#007aff';
  // Show: critically damped, omega 23/s, sampled for linear(); hide: UIKit's keyboard curve (curve 7).
  const SHOW_MS = 400, HIDE_MS = 220;
  const SHOW_EASE = 'linear(' + Array.from({ length: 33 }, (_, i) => { const t = i / 32 * SHOW_MS / 1000, w = 23; const v = i === 32 ? 1 : 1 - (1 + w * t) * Math.exp(-w * t); return `${v.toFixed(4)} ${(i / 32 * 100).toFixed(2)}%`; }).join(',') + ')';
  const HIDE_EASE = 'cubic-bezier(0.38,0.7,0.125,1)';
  // Reduce Motion: iOS cross-fades the keyboard in place instead of sliding it; a short opacity fade, the bars it lifts
  // moved at once.
  const FADE_MS = 160;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The display's bottom outline (airDisplayPath), for the keys' panel.
  const BOTTOM = 'L420 817.22C420 844.51 420 858.16 415.36 872.85C409.52 888.88 396.88 901.52 380.85 907.36C366.16 912 352.51 912 325.22 912L94.78 912C67.49 912 53.84 912 39.15 907.36C23.12 901.52 10.48 888.88 4.64 872.85C0 858.16 0 844.51 0 817.22';

  // ---- glyphs (SF Symbols' shapes at the measured sizes) ----
  const svg = (w, h, body, extra = '', k = 1) => `<svg width="${w * k}" height="${h * k}" viewBox="0 0 ${w} ${h}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" ${extra}>${body}</svg>`;
  const G = {
    shift: (on, lock) => svg(20, lock ? 21 : 17.4, `<path d="M10 1.2L19 10.4H14.1V16.2H5.9V10.4H1Z" ${on ? 'fill="currentColor"' : ''}/>${lock ? '<rect x="5.9" y="18.6" width="8.2" height="1.6" rx="0.4" fill="currentColor" stroke="none"/>' : ''}`, '', 1.08),
    del: () => svg(21, 17, '<path d="M7.1 1H18.2C19.3 1 20 1.7 20 2.8V14.2C20 15.3 19.3 16 18.2 16H7.1L1 8.5Z"/><path d="M10.2 5.2L15.8 11.8M15.8 5.2L10.2 11.8"/>'),
    ret: () => svg(21, 18, '<path d="M19.4 1.2V7.6C19.4 9.8 18.3 10.9 16.1 10.9H2"/><path d="M7 5.9L2 10.9L7 15.9"/>', 'stroke-width="1.8"', 1.13),
    emoji: () => svg(20, 20, '<circle cx="10" cy="10" r="8.5" stroke-width="1.85"/><circle cx="7" cy="7.8" r="1.15" fill="currentColor" stroke="none"/><circle cx="13" cy="7.8" r="1.15" fill="currentColor" stroke="none"/><path d="M5.6 11.6C6.5 13.8 8.1 14.9 10 14.9S13.5 13.8 14.4 11.6Z" fill="currentColor" stroke-width="1.2"/>', 'style="transform:translateY(-1.3px)"'),
    globe: () => svg(28, 28, '<circle cx="14" cy="14" r="12.4"/><ellipse cx="14" cy="14" rx="5.6" ry="12.4"/><path d="M14 1.6V26.4M1.6 14H26.4M3.6 7.6H24.4M3.6 20.4H24.4"/>', 'stroke-width="1.6"'),
    mic: () => svg(20, 29, '<rect x="5.6" y="1.2" width="8.8" height="16.2" rx="4.4"/><path d="M1.6 12.6C1.6 17.8 5.3 21.4 10 21.4S18.4 17.8 18.4 12.6M10 21.4V27.2M5.4 27.6H14.6"/>', 'stroke-width="1.75"'),
    search: () => svg(22, 22, '<circle cx="9.2" cy="9.2" r="7.4"/><path d="M14.6 14.6L20.6 20.6"/>', 'stroke-width="2.4"'),
    numdel: () => svg(25, 21, '<path d="M8.3 1.2H22C23.2 1.2 24 2 24 3.2V17.8C24 19 23.2 19.8 22 19.8H8.3L1.2 10.5Z"/><path d="M12.2 6.3L18.8 14.7M18.8 6.3L12.2 14.7"/>', 'stroke-width="1.8"'),
  };

  // ---- the field ----
  const TEXTUAL = /^(?:text|search|url|email|tel|number|password|)$/;
  const fieldOf = (e) => {
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (!(t instanceof HTMLElement)) return null;
    if (t instanceof HTMLTextAreaElement) return t.readOnly || t.disabled ? null : t;
    if (t instanceof HTMLInputElement) return TEXTUAL.test(t.type) && !t.readOnly && !t.disabled && t.inputMode !== 'none' ? t : null;
    return t.isContentEditable ? t : null;
  };
  const hostOf = (el) => { let n = el; while (n.getRootNode() instanceof ShadowRoot) n = n.getRootNode().host; return n; };
  // The drawn phone a field is in (each route draws its own frame), or null.
  const phoneOf = (el) => hostOf(el).closest('[data-testid="web-device"]');
  let dev = null;
  const attr = (el, n) => (el.getAttribute(n) || '').toLowerCase();
  function kindOf(el) {
    const im = attr(el, 'inputmode'), type = el instanceof HTMLInputElement ? el.type : '';
    const mode = im === 'numeric' || im === 'decimal' || im === 'tel' || type === 'tel' || type === 'number' ? 'num'
      : im === 'url' || type === 'url' ? 'url' : im === 'email' || type === 'email' ? 'email' : 'text';
    const hint = attr(el, 'enterkeyhint') || (type === 'search' || im === 'search' ? 'search' : '');
    const cs = getComputedStyle(el).colorScheme || '';
    const dark = /dark/.test(cs) && !/^light/.test(cs) ? true : /light/.test(cs) ? false : matchMedia('(prefers-color-scheme: dark)').matches;
    const cap = el.hasAttribute('autocapitalize') ? attr(el, 'autocapitalize') : (mode === 'text' && type !== 'password' ? 'sentences' : 'none');
    const pred = mode === 'text' && type !== 'password' && attr(el, 'autocorrect') !== 'off' && attr(el, 'spellcheck') !== 'false';
    return { mode, hint, dark, cap: cap === 'off' ? 'none' : cap === 'on' ? 'sentences' : cap, pred, decimal: im === 'decimal' };
  }
  const value = (el) => (el.isContentEditable ? el.textContent : el.value) || '';
  const caretAt = (el) => (el.isContentEditable ? value(el).length : el.selectionStart ?? value(el).length);

  // ---- state ----
  let built = null, field = null, kind = null, layer = 'abc', shift = false, lock = false, shown = false, K = 0;
  let lastShiftTap = 0, hideTimer = 0, alive = 0, lifted = [];

  // ---- the keyboard's nodes, built on first use ----
  function build() {
    const root = document.createElement('div');
    root.setAttribute('data-site-keyboard', '');
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:912px;transform-origin:0 0;pointer-events:none;z-index:2147483000;visibility:hidden;contain:layout style';
    const css = document.createElement('style');
    css.textContent = `[data-site-keyboard] *{box-sizing:border-box;margin:0;-webkit-user-select:none;user-select:none}
[data-site-keyboard] .kb{position:absolute;left:0;bottom:0;width:420px;pointer-events:auto;touch-action:none;font-family:-apple-system,"SF Pro Text",system-ui,"Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased;font-kerning:normal;cursor:default}
[data-site-keyboard] .panel{position:absolute;inset:0;backdrop-filter:blur(24px) saturate(1.6);-webkit-backdrop-filter:blur(24px) saturate(1.6);border-radius:27px 27px 0 0}
[data-site-keyboard] .caps{position:absolute;inset:0}
[data-site-keyboard] .k{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:${KR}px;line-height:1}
[data-site-keyboard] .k.on::after{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--press)}
[data-site-keyboard] .lab{position:absolute;left:0;right:0;text-align:center;white-space:pre}
[data-site-keyboard] .pred{position:absolute;left:0;width:420px;height:44px;display:flex}
[data-site-keyboard] .pred div{flex:1;position:relative;display:flex;align-items:center;justify-content:center;font-size:17px;letter-spacing:-0.4px;white-space:nowrap;overflow:hidden}
[data-site-keyboard] .pred div+div::before{content:"";position:absolute;left:-0.33px;top:12.2px;width:0.67px;height:23.67px;background:var(--sep)}
[data-site-keyboard] .pop{position:absolute;pointer-events:none;display:none;filter:drop-shadow(0 0 0.6px rgba(0,0,0,.28)) drop-shadow(0 3px 7px rgba(0,0,0,.18))}
[data-site-keyboard] .pop svg{position:absolute;left:0;top:0;overflow:visible}
[data-site-keyboard] .pop span{position:absolute;left:0;right:0;text-align:center;font-size:35px;font-weight:300;line-height:1}`;
    root.append(css);
    const kb = document.createElement('div'); kb.className = 'kb';
    const panel = document.createElement('div'); panel.className = 'panel';
    const caps = document.createElement('div'); caps.className = 'caps';
    const keys = document.createElement('div');
    const pred = document.createElement('div'); pred.className = 'pred';
    const pop = document.createElement('div'); pop.className = 'pop';
    kb.append(panel, caps, keys, pred, pop);
    root.append(kb);
    document.body.append(root);
    // Taps never take the field's focus; the page under the keys never sees them.
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    kb.addEventListener('mousedown', stop);
    kb.addEventListener('touchstart', stop, { passive: false });
    kb.addEventListener('click', stop);
    kb.addEventListener('contextmenu', stop);
    kb.addEventListener('pointerdown', down);
    kb.addEventListener('pointermove', move);
    kb.addEventListener('pointerup', up);
    kb.addEventListener('pointercancel', cancel);
    addEventListener('resize', place);
    new ResizeObserver(place).observe(document.documentElement);
    built = { root, kb, panel, caps, keys, pred, pop, list: [], anim: null, out: true };
    return built;
  }

  // The overlay sits exactly over the display (the frame scales it).
  function place() {
    if (!built) return;
    if (!dev?.isConnected) return;
    const r = dev.getBoundingClientRect(), s = r.width / W;
    built.root.style.transform = `translate(${r.left}px,${r.top}px) scale(${s})`;
  }

  // ---- layout: the keys of the current layer as boxes in the keyboard's own coordinates ----
  const top = () => H - K; // the keyboard's top in display points
  function keyList() {
    const L = [];
    const add = (id, x, w, row, o = {}) => L.push({ id, x, y: (typeof row === 'number' && row < 4 ? ROW[row] : row) - top(), w, h: o.h ?? KH, ...o });
    const up = shift || lock;
    if (kind.mode === 'num') {
      const labels = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ']];
      labels.forEach(([d, l], i) => add('c:' + d, NUM.cols[i % 3][0], NUM.cols[i % 3][1], NUM.rows[Math.floor(i / 3)], { h: NUM.h, num: d, sub: l }));
      if (kind.decimal) add('c:.', NUM.cols[0][0], NUM.cols[0][1], NUM.rows[3], { h: NUM.h, num: '.', bare: true });
      add('c:0', NUM.cols[1][0], NUM.cols[1][1], NUM.rows[3], { h: NUM.h, num: '0', sub: '' });
      add('del', NUM.cols[2][0], NUM.cols[2][1], NUM.rows[3], { h: NUM.h, glyph: G.numdel(), bare: true });
      return L;
    }
    if (layer === 'abc') {
      const r1 = 'qwertyuiop', r2 = 'asdfghjkl', r3 = 'zxcvbnm';
      R1.forEach(([x, w], i) => add('c:' + r1[i], x, w, 0, { letter: true }));
      R2.forEach(([x, w], i) => add('c:' + r2[i], x, w, 1, { letter: true }));
      R3.forEach(([x, w], i) => add('c:' + r3[i], x, w, 2, { letter: true }));
      add('shift', SHIFT[0], SHIFT[1], 2, { glyph: G.shift(up, lock) });
      for (const k of L) if (k.letter) k.label = up ? k.id.slice(2).toUpperCase() : k.id.slice(2);
    } else {
      const sym = layer === 'sym';
      const r1 = sym ? '[]{}#%^*+=' : '1234567890', r2 = sym ? ['_', '\\', '|', '~', '<', '>', '€', '£', '¥', '•'] : ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'];
      R1.forEach(([x, w], i) => add('c:' + r1[i], x, w, 0, { label: r1[i], letter: true }));
      SYM2.forEach(([x, w], i) => add('c:' + r2[i], x, w, 1, { label: r2[i], letter: true }));
      ['.', ',', '?', '!', "'"].forEach((c, i) => add('c:' + c, SYM3[i][0], SYM3[i][1], 2, { label: c === "'" ? '’' : c, letter: true }));
      add(sym ? 'k123' : 'ksym', SHIFT[0], SHIFT[1], 2, { label: sym ? '123' : '#+=', fn: true });
    }
    add('del', DEL[0], DEL[1], 2, { glyph: G.del() });
    add('layer', R4.k123[0], R4.k123[1], 3, { label: layer === 'abc' ? '123' : 'ABC', fn: true });
    add('emoji', R4.emoji[0], R4.emoji[1], 3, { glyph: G.emoji() });
    if (kind.mode === 'url') { add('c:.', R4URL[0][0], R4URL[0][1], 3, { fn: true, glyph: '<svg width="3" height="3" style="transform:translateY(8px)"><circle cx="1.5" cy="1.5" r="1.35" fill="currentColor"/></svg>' }); add('c:/', R4URL[1][0], R4URL[1][1], 3, { label: '/', fn: true }); add('c:.com', R4URL[2][0], R4URL[2][1], 3, { label: '.com', fn: true }); }
    else if (kind.mode === 'email') { add('space', R4MAIL[0][0], R4MAIL[0][1], 3, { label: '' }); add('c:@', R4MAIL[1][0], 30, 3, { label: '@', fn: true }); add('c:.', R4MAIL[1][0] + 32.33, 30, 3, { label: '.', fn: true }); }
    else add('space', R4.space[0], R4.space[1], 3, { label: '' });
    const h = kind.hint, blue = /^(go|send|search|done|join)$/.test(h);
    add('return', R4.ret[0], R4.ret[1], 3, h === 'search' ? { glyph: G.search(), blue } : /^(go|send|done|next|previous|join)$/.test(h) ? { label: h, fn: true, blue } : { glyph: G.ret() });
    add('globe', 3, 78, 845, { h: 54, glyph: G.globe(), bare: true });
    // The URL keyboard has no dictation key (as the simulator's).
    if (kind.mode !== 'url') add('mic', 338, 78, 845, { h: 54, glyph: G.mic(), bare: true });
    return L;
  }

  // ---- drawing ----
  // Redrawn only when the layout changes (a layer, the shift, the field's kind): a keystroke touches no key node.
  let drawn = '';
  function render() {
    const b = built, c = COLORS[kind.dark ? 'dark' : 'light'];
    const t = top();
    const sig = [K, kind.dark, kind.mode, kind.hint, kind.decimal, kind.pred, layer, shift, lock].join();
    if (sig === drawn) { if (kind.pred) predict(); return; }
    drawn = sig;
    b.kb.style.height = `${K}px`;
    b.kb.style.color = c.ink;
    b.kb.style.setProperty('--press', c.press);
    b.kb.style.setProperty('--sep', c.sep);
    b.panel.style.background = c.panel;
    b.panel.style.boxShadow = c.rim;
    // The panel's outline: 27 pt corners at the top, the display's own corners at the bottom.
    const off = (s) => s.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => `${x} ${(Number(y) - t).toFixed(2)}`);
    b.panel.style.clipPath = `path('M0 27C0 12.09 12.09 0 27 0L393 0C407.91 0 420 12.09 420 27${off(BOTTOM)}Z')`;
    b.list = keyList();
    // The caps: one layer, masked to every cap (one backdrop read for all of them, not one per key).
    const caps = b.list.filter((k) => !k.bare);
    const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${K}">${caps.filter((k) => !k.blue).map((k) => `<rect x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" rx="${KR}"/>`).join('')}</svg>`)}")`;
    Object.assign(b.caps.style, { background: c.key, backdropFilter: c.keyFilter, webkitBackdropFilter: c.keyFilter, maskImage: mask, webkitMaskImage: mask, maskSize: '420px 100%', webkitMaskSize: '420px 100%', maskRepeat: 'no-repeat', webkitMaskRepeat: 'no-repeat' });
    b.keys.replaceChildren(...b.list.map((k) => {
      const e = document.createElement('div');
      e.className = 'k';
      e.dataset.id = k.id;
      e.style.cssText = `left:${k.x}px;top:${k.y}px;width:${k.w}px;height:${k.h}px`;
      if (k.blue) { e.style.background = BLUE; e.style.color = '#fff'; }
      if (k.bare) e.style.borderRadius = '0';
      if (k.glyph) e.innerHTML = k.glyph;
      else if (k.num) {
        e.innerHTML = `<span class="lab" style="top:${k.sub == null ? 13.5 : 9.6}px;font-size:21.5px">${k.num}</span>` + (k.sub ? `<span class="lab" style="top:37.3px;font-size:10px;font-weight:600;letter-spacing:1.6px;padding-left:1.6px">${k.sub}</span>` : '');
      } else if (k.label != null) {
        // Letters: lowercase is drawn larger than capitals (as iOS does); the baseline sits 28.5 pt under the cap's top.
        const fn = k.fn, lower = k.letter && /^[a-z]$/.test(k.label);
        // Function labels: 18 pt ("123", "ABC", "go"), ".com" 19 pt, the URL row's "." and "/" 20.5 pt.
        const one = fn && k.label.length === 1, size = one ? 20.5 : k.label === '.com' ? 19 : fn ? 18 : lower ? 24 : 22.25;
        e.innerHTML = `<span class="lab" style="font-size:${size}px;top:${one ? 10.1 : k.label === '.com' ? 9.3 : fn ? 12.4 : lower ? 7.6 : 9.4}px;${fn ? 'letter-spacing:-0.2px' : ''}">${k.label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
      }
      k.el = e;
      return e;
    }));
    // Predictions (fields that correct): three suggestions over the keys.
    b.pred.style.display = kind.pred ? 'flex' : 'none';
    if (kind.pred) { b.pred.style.top = `${567.8 - t}px`; b.pred.style.color = c.pred; predict(); }
  }

  // A small word list for the suggestions bar (the empty field shows iOS's own three).
  const WORDS = 'the,to,and,a,i,you,it,in,that,of,is,for,on,my,this,have,be,with,me,so,just,but,not,we,what,are,at,can,do,if,your,all,was,like,get,know,good,will,love,go,no,one,now,how,out,up,about,they,think,there,see,time,from,day,then,make,new,here,really,when,want,great,back,would,thanks,today,more,some,need,going,people,work,right,well,still,also,next,ideas,idea,write,note,notes,maybe,first,feel,hello,hey,hi,home,later,look,much,nice,only,please,thing,things,where,why,yes,yeah,very,way,which,who,soon'.split(',');
  function currentWord() { const v = value(field).slice(0, caretAt(field)); const m = /[A-Za-z’']+$/.exec(v); return m ? m[0] : ''; }
  function predict() {
    const w = currentWord(), lw = w.toLowerCase();
    let s;
    if (!w) s = ['I', 'The', 'I’m'];
    else {
      const hits = WORDS.filter((x) => x.startsWith(lw) && x !== lw).slice(0, 2).map((x) => (w[0] === w[0].toUpperCase() ? x[0].toUpperCase() + x.slice(1) : x));
      s = [`“${w}”`, ...hits]; while (s.length < 3) s.push('');
    }
    built.pred.replaceChildren(...s.map((t) => { const d = document.createElement('div'); d.textContent = t; d.dataset.word = t; return d; }));
  }

  // ---- the key balloon (letters) ----
  function balloon(k) {
    const p = built.pop, c = COLORS[kind.dark ? 'dark' : 'light'];
    const bw = k.w + 24, bh = 54, kx = k.x, ky = k.y;
    let bx = kx - 12; bx = Math.max(2, Math.min(W - 2 - bw, bx));
    const by = ky - 59, r = 10.5, x0 = 0, y0 = 0;
    const lx = kx - bx, rx = kx + k.w - bx, neck = ky - by, end = neck + k.h;
    const d = `M${x0 + r} ${y0}H${bw - r}Q${bw} ${y0} ${bw} ${r}V${bh - 6}C${bw} ${bh + 4} ${rx} ${neck + 2} ${rx} ${neck + 13}V${end - KR}Q${rx} ${end} ${rx - KR} ${end}H${lx + KR}Q${lx} ${end} ${lx} ${end - KR}V${neck + 13}C${lx} ${neck + 2} ${x0} ${bh + 4} ${x0} ${bh - 6}V${r}Q${x0} ${y0} ${r} ${y0}Z`;
    p.style.cssText = `display:block;left:${bx}px;top:${by}px;width:${bw}px;height:${end}px`;
    const lab = k.label;
    p.innerHTML = `<svg width="${bw}" height="${end}"><path d="${d}" fill="${c.pop}"/></svg><span style="top:${/^[a-z]$/.test(lab) ? 5.5 : 9}px;color:${c.ink}">${lab.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
  }
  const noBalloon = () => { if (built) built.pop.style.display = 'none'; };

  // ---- input ----
  const toKb = (e) => { const r = built.kb.getBoundingClientRect(), s = r.width / W || 1; return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }; };
  // The key under a point: the caps' hit areas meet halfway across the gaps, as iOS's do.
  function hit(p) {
    let best = null, bd = Infinity;
    for (const k of built.list) {
      const dx = p.x < k.x ? k.x - p.x : p.x > k.x + k.w ? p.x - k.x - k.w : 0;
      const dy = p.y < k.y ? k.y - p.y : p.y > k.y + k.h ? p.y - k.y - k.h : 0;
      const d = dx * dx + dy * dy * 1.6;
      if (d < bd) { bd = d; best = k; }
    }
    return bd < 900 ? best : null;
  }
  let press = null, repeat = 0;
  function light(k, on) { if (k?.el && !k.letter) k.el.classList.toggle('on', on); if (k?.letter && on && !k.fn) balloon(k); if (!on) noBalloon(); }
  function down(e) {
    if (!field || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); e.stopPropagation();
    try { built.kb.setPointerCapture(e.pointerId); } catch {}
    const p = toKb(e);
    if (kind.pred && p.y < ROW[0] - top() - 6) {
      const r = built.pred.getBoundingClientRect(), i = Math.floor((e.clientX - r.left) / (r.width / 3));
      const w = built.pred.children[i]?.dataset.word;
      if (w) pick(w.replace(/[“”]/g, ''));
      return;
    }
    const k = hit(p);
    if (!k) return;
    press = { id: e.pointerId, k };
    light(k, true);
    if (k.id === 'del') { act(k); clearTimeout(repeat); const again = (ms) => { repeat = setTimeout(() => { if (press?.k === k) { act(k); again(95); } }, ms); }; again(480); }
    else if (k.id === 'shift' || k.id === 'layer' || k.id === 'ksym' || k.id === 'k123') act(k);
  }
  function move(e) {
    if (!press || e.pointerId !== press.id || press.k.id === 'del') return;
    const k = hit(toKb(e));
    if (k && k !== press.k && press.k.letter && k.letter) { light(press.k, false); press.k = k; light(k, true); }
  }
  function up(e) {
    if (!press || e.pointerId !== press.id) return;
    e.stopPropagation();
    const k = press.k; press = null; clearTimeout(repeat);
    light(k, false);
    if (!/^(del|shift|layer|ksym|k123)$/.test(k.id)) act(k);
  }
  function cancel() { if (press) light(press.k, false); press = null; clearTimeout(repeat); }

  const fire = (type, key, extra = {}) => {
    const code = key === 'Enter' ? 'Enter' : key === 'Backspace' ? 'Backspace' : key === ' ' ? 'Space' : /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : /^\d$/.test(key) ? 'Digit' + key : '';
    return field.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true, composed: true, ...extra }));
  };
  function type(text) {
    const k = text.length === 1 ? text : 'Unidentified';
    if (!fire('keydown', k)) { fire('keyup', k); return; }
    document.execCommand('insertText', false, text);
    fire('keyup', k);
  }
  function act(k) {
    if (!field) return;
    if (k.id.startsWith('c:')) {
      let ch = k.id.slice(2);
      if (k.letter && /^[a-z]$/.test(ch) && (shift || lock)) ch = ch.toUpperCase();
      type(ch);
      if (shift && !lock && layer === 'abc') shift = false;
      if (layer !== 'abc' && ch === "'") layer = 'abc';
      after();
    } else if (k.id === 'space') {
      type(' ');
      if (layer !== 'abc') layer = 'abc';
      after();
    } else if (k.id === 'del') {
      if (fire('keydown', 'Backspace')) document.execCommand('delete');
      fire('keyup', 'Backspace');
      after();
    } else if (k.id === 'shift') {
      const now = performance.now();
      if (lock) { lock = false; shift = false; }
      else if (now - lastShiftTap < 320 && shift) lock = true;
      else shift = !shift;
      lastShiftTap = now;
      render();
    } else if (k.id === 'layer') { layer = layer === 'abc' ? 'num' : 'abc'; shift = false; lock = false; after(); }
    else if (k.id === 'ksym') { layer = 'sym'; render(); }
    else if (k.id === 'k123') { layer = 'num'; render(); }
    else if (k.id === 'return') enter();
  }
  // Return: the key's events first (the app's own submit); a text view takes a new line, a field its form's submit,
  // then lets go of the keys, as UIKit's return does.
  function enter() {
    const el = field;
    const go = fire('keydown', 'Enter');
    if (go) fire('keypress', 'Enter', { charCode: 13, keyCode: 13 });
    fire('keyup', 'Enter');
    if (!go || field !== el) return;
    if (el instanceof HTMLTextAreaElement || el.isContentEditable) { document.execCommand('insertText', false, '\n'); after(); return; }
    if (el.form) el.form.requestSubmit?.();
    if (field === el) el.blur();
  }
  function pick(w) {
    const cur = currentWord();
    for (let i = 0; i < cur.length; i++) document.execCommand('delete');
    type(w + ' ');
    after();
  }
  // After a change: the auto-capital (sentences / words / characters) and the suggestions.
  function after() {
    if (!field) return;
    if (!lock && layer === 'abc') shift = autoShift();
    render();
  }
  function autoShift() {
    const v = value(field).slice(0, caretAt(field));
    if (kind.cap === 'characters') return true;
    if (kind.cap === 'words') return v === '' || /\s$/.test(v);
    if (kind.cap === 'sentences') return v.trim() === '' || /[.!?]\s+$/.test(v) || /\n$/.test(v);
    return false;
  }

  // ---- motion: the keys and what rides them, on one timeline ----
  const ty = (el) => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return m.m42; };
  // The resting value is written inline and the animation runs over it without a fill, so once it ends nothing is
  // animated: the keys (and the lifted bars) leave the compositor's animated layer and raster sharp at the frame's scale.
  function slide(to, from) {
    const b = built, show = to === 0;
    if (reduced()) return fade(show);
    const start = from ?? ty(b.kb);
    b.anim?.cancel();
    b.kb.style.opacity = ''; b.out = !show;
    const opts = { duration: show ? SHOW_MS : HIDE_MS, easing: show ? SHOW_EASE : HIDE_EASE };
    b.kb.style.transform = `translateY(${to}px)`;
    b.anim = b.kb.animate([{ transform: `translateY(${start}px)` }, { transform: `translateY(${to}px)` }], opts);
    // Keyboard toolbars ride the keys' top (iOS lifts them by the keys' height): each from where the keys' top is now.
    const bars = dev?.isConnected ? [...dev.querySelectorAll('[data-toolbarplacement="keyboard"]')] : [];
    for (const l of lifted) if (!bars.includes(l.el)) { l.a?.cancel(); l.el.style.translate = ''; }
    lifted = bars.map((el) => {
      lifted.find((l) => l.el === el)?.a?.cancel();
      el.style.translate = show ? `0 ${-K}px` : '';
      return { el, a: el.animate([{ translate: `0 ${-(K - start)}px` }, { translate: `0 ${-(K - to)}px` }], opts) };
    });
    b.anim.onfinish = () => { b.anim = null; if (!shown) { b.root.style.visibility = 'hidden'; lifted = []; } };
  }
  // The Reduce Motion show and hide: the keys at rest in place, their opacity faded from where it is now (from nothing
  // when they were away, so a show fades in; at full when only their height changed).
  function fade(show) {
    const b = built;
    const start = b.anim ? Number(getComputedStyle(b.kb).opacity) : b.out ? 0 : 1;
    b.anim?.cancel();
    b.out = !show;
    b.kb.style.transform = 'translateY(0px)';
    b.kb.style.opacity = show ? '1' : '0';
    b.anim = b.kb.animate([{ opacity: start }, { opacity: show ? 1 : 0 }], { duration: FADE_MS, easing: 'ease-out' });
    const bars = dev?.isConnected ? [...dev.querySelectorAll('[data-toolbarplacement="keyboard"]')] : [];
    for (const l of lifted) { l.a?.cancel(); if (!bars.includes(l.el)) l.el.style.translate = ''; }
    lifted = bars.map((el) => { el.style.translate = show ? `0 ${-K}px` : ''; return { el, a: null }; });
    b.anim.onfinish = () => { b.anim = null; if (!shown) { b.root.style.visibility = 'hidden'; lifted = []; } };
  }

  function open(el) {
    clearTimeout(hideTimer);
    const b = built ?? build();
    const was = shown, oldK = K, nk = kindOf(el);
    const same = field === el;
    field = el; kind = nk;
    if (!same) { layer = 'abc'; lock = false; }
    shift = autoShift();
    K = BASE + (kind.pred && kind.mode !== 'num' ? PRED : 0);
    place();
    render();
    b.root.style.visibility = 'visible';
    shown = true;
    if (!was) slide(0, b.anim ? Math.min(K, ty(b.kb) + K - oldK) : K);
    else if (oldK !== K) slide(0, ty(b.kb) + K - oldK);
    // The page hears of the keys a frame after they start to move (the app's re-layout is not in the slide's first frame).
    requestAnimationFrame(() => { if (shown && field === el) report(K); });
    // A search list scrolls its last rows above the keys (the search's own sheet, in its shadow root).
    searchInset(el, K);
    clearInterval(alive);
    alive = setInterval(() => { if (field && !field.isConnected) close(); }, 300);
  }
  function close() {
    clearTimeout(hideTimer); clearInterval(alive);
    if (!shown) return;
    shown = false;
    const el = field; field = null;
    cancel(); noBalloon();
    slide(K);
    report(0);
    searchInset(el, 0);
  }
  function searchInset(el, h) {
    const root = el?.getRootNode?.();
    if (!(root instanceof ShadowRoot) || !root.querySelector('.list')) return;
    let s = root.querySelector('style[data-site-keyboard]');
    if (!s) { s = document.createElement('style'); s.setAttribute('data-site-keyboard', ''); root.append(s); }
    s.textContent = h ? `.list{padding-bottom:${h + 24}px !important}` : '';
  }

  // ---- focus: the only listeners before the first field ----
  document.addEventListener('focusin', (e) => {
    const el = fieldOf(e);
    const d = el && phoneOf(el);
    if (d) { dev = d; open(el); }
    else if (shown && !(e.composedPath()[0] instanceof HTMLElement && built?.root.contains(e.composedPath()[0]))) close();
  }, true);
  document.addEventListener('focusout', (e) => {
    if (!shown || fieldOf(e) !== field) return;
    // A field that takes its focus back at once (cherry-blossom-qrcode refocuses on blur) keeps the keys up.
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const a = document.activeElement, deep = a?.shadowRoot?.activeElement ?? a;
      if (deep && deep === field) return;
      close();
    }, 80);
  }, true);
  // The Mac's keyboard keeps typing; its keys light on the drawn one.
  document.addEventListener('keydown', (e) => {
    if (!shown || !e.isTrusted || !built) return;
    const k = e.key === 'Backspace' ? built.list.find((x) => x.id === 'del') : e.key === 'Enter' ? built.list.find((x) => x.id === 'return') : e.key === ' ' ? built.list.find((x) => x.id === 'space') : built.list.find((x) => x.id === 'c:' + e.key.toLowerCase());
    if (k?.el) { k.el.classList.add('on'); setTimeout(() => k.el.classList.remove('on'), 110); }
  }, true);
  document.addEventListener('input', (e) => { if (shown && fieldOf(e) === field && !press) { if (!lock && layer === 'abc') { const s = autoShift(); if (s !== shift) { shift = s; render(); } else if (kind.pred) predict(); } } }, true);
})();
