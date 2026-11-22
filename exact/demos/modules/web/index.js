// The app's native views on the web (modules/apple/*.swift are the iPhone's). The host defines each roster tag
// and hands `create` the element; each view draws into its shadow root. Props arrive as strings, as on iOS,
// and the events are the same: press 0, change 1, message 8. The launcher's own views (icon-grid, page-dots,
// still-art, search-reveal, demo-card, inspiration-sheet) are drawn in Contract on the web (home/web-phone.contract).
export const abi = 1;
const tags = [
  'rolling-count', 'demo-card', 'glass-button', 'mate-haptic', 'swift-slider', 'painting-menu', 'variable-blur',
  'glass-pane', 'inspiration-sheet', 'audio-track', 'system-alert', 'toggle-sheet', 'music-tabbar', 'native-tabbar',
  'page-dots', 'search-reveal', 'still-art', 'icon-grid', 'motion-feed', 'home-shake',
];
export const roster = Object.fromEntries(tags.map((t) => [t, { snapshot: false }]));

const num = (v, d) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : d; };
const base = ':host{display:block;position:relative;box-sizing:border-box}*{box-sizing:border-box}';
const shadow = (el, css) => {
  const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = base + css;
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;inset:0';
  root.replaceChildren(style, box);
  return box;
};
const SYMBOLS = {
  xmark: '<path d="M5 5L15 15M15 5L5 15" stroke-linecap="round"/>',
  checkmark: '<path d="M4 10.5L8.2 14.5L16 5.5" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M10 4V16M4 10H16" stroke-linecap="round"/>',
  info: '<circle cx="10" cy="5.2" r="1.2" fill="currentColor" stroke="none"/><path d="M10 8.6V15" stroke-linecap="round"/>',
  'chevron.backward': '<path d="M12 4L6 10L12 16" stroke-linecap="round" stroke-linejoin="round"/>',
  ellipsis: '<circle cx="4" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1.4" fill="currentColor" stroke="none"/>',
  'house.fill': '<path d="M3 10L10 3.5L17 10V16.5H12.2V12H7.8V16.5H3Z" fill="currentColor" stroke="none"/>',
  'square.grid.2x2.fill': '<rect x="3" y="3" width="6" height="6" rx="1.4" fill="currentColor" stroke="none"/><rect x="11" y="3" width="6" height="6" rx="1.4" fill="currentColor" stroke="none"/><rect x="3" y="11" width="6" height="6" rx="1.4" fill="currentColor" stroke="none"/><rect x="11" y="11" width="6" height="6" rx="1.4" fill="currentColor" stroke="none"/>',
  'dot.radiowaves.left.and.right': '<circle cx="10" cy="10" r="1.8" fill="currentColor" stroke="none"/><path d="M6.6 6.6A4.8 4.8 0 0 0 6.6 13.4M13.4 6.6A4.8 4.8 0 0 1 13.4 13.4M4.2 4.2A8.2 8.2 0 0 0 4.2 15.8M15.8 4.2A8.2 8.2 0 0 1 15.8 15.8" stroke-linecap="round"/>',
  'music.note.square.stack.fill': '<rect x="3" y="3" width="14" height="14" rx="3.4" fill="currentColor" stroke="none"/><path d="M8 13.4V7.6L13 6.6V12" stroke="#000" stroke-opacity=".7" stroke-width="1.4" stroke-linecap="round"/>',
};
const icon = (name, size = 20, width = 2.2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="${width}">${SYMBOLS[name] ?? '<circle cx="10" cy="10" r="6"/>'}</svg>`;

// An overlay in the page above the demo, where a sheet or a menu opens: the screen's own rectangle (the frame's
// display, scaled as it is) on a desktop, the whole page elsewhere. It lives outside the runtime's tree.
function overlay(el) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483000;overflow:hidden;transform-origin:0 0;pointer-events:none';
  const place = () => {
    const device = document.querySelector('[data-testid="web-device"]');
    if (device) {
      const r = device.getBoundingClientRect(), s = r.width / 420;
      host.style.cssText += `;left:${r.left}px;top:${r.top}px;width:420px;height:912px;transform:scale(${s});border-radius:62px`;
    } else host.style.cssText += ';left:0;top:0;width:100vw;height:100vh;transform:none;border-radius:0';
  };
  place();
  document.body.append(host);
  addEventListener('resize', place);
  return { host, close() { removeEventListener('resize', place); host.remove(); } };
}
const GLASS = 'background:rgba(40,40,44,.55);backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);box-shadow:0 4px 14px rgba(0,0,0,.22),inset 0 0 0 .5px rgba(255,255,255,.22)';

const views = {
  // A glass (or blur) pane behind other content.
  'glass-pane'(el, props) {
    const box = shadow(el, '');
    const draw = (p) => {
      const clear = p['glass-style'] === 'clear', none = p['glass-style'] === 'none', light = p.scheme === 'light';
      const r = p['corner-size'] === 'capsule' ? '9999px' : `${num(p['corner-size'], 0)}px`;
      const tint = p['pane-tint'] ? `linear-gradient(${p['pane-tint']}, ${p['pane-tint']}),` : '';
      const fill = none ? 'transparent' : light ? 'rgba(255,255,255,.55)' : clear ? 'rgba(255,255,255,.08)' : 'rgba(40,40,44,.5)';
      box.style.cssText = `position:absolute;inset:0;border-radius:${r};background:${tint}${fill ? `linear-gradient(${fill},${fill})` : ''};` +
        (none ? '' : `backdrop-filter:blur(${clear ? 10 : 22}px) saturate(180%);-webkit-backdrop-filter:blur(${clear ? 10 : 22}px) saturate(180%);box-shadow:0 8px 24px rgba(0,0,0,.12),inset 0 0 0 .5px rgba(255,255,255,${light ? .6 : .25})`);
    };
    draw(props);
    return { set: draw };
  },
  // A round glass button with an SF symbol; `edge` is the bar side it sits on (no effect here).
  'glass-button'(el, props, event) {
    const box = shadow(el, 'button{all:unset;cursor:pointer;position:absolute;inset:0;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .15s}button:active{transform:scale(.92)}');
    const b = document.createElement('button');
    b.setAttribute('role', 'button');
    b.style.cssText = GLASS;
    b.addEventListener('click', () => event(0));
    box.append(b);
    const draw = (p) => { b.innerHTML = icon(p.symbol === 'chevron.backward' ? 'chevron.backward' : p.symbol ?? 'xmark'); b.setAttribute('aria-label', p.caption ?? ''); };
    draw(props);
    return { set: draw };
  },
  // A progressive blur: the radius runs along the height by a ramp, drawn as three stacked blurs under masks.
  'variable-blur'(el, props) {
    const box = shadow(el, '');
    box.style.pointerEvents = 'none';
    const layers = [0.25, 0.5, 1].map(() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0'; box.append(d); return d; });
    const draw = (p) => {
      const radius = num(p['blur-radius'], 20), from = num(p['ramp-from'], 0) * 100, to = num(p['ramp-to'], 1) * 100, up = p['ramp-up'] === 'true';
      const dir = up ? 'to top' : 'to bottom', span = Math.max(1, to - from);
      layers.forEach((d, i) => {
        const a = from + span * (i / 3), b = from + span * ((i + 1) / 3 + (i === 2 ? 0 : 0.35)), c = Math.min(100, b + span * 0.4);
        const mask = `linear-gradient(${dir}, transparent ${a}%, #000 ${Math.min(100, b)}%, #000 ${i === 2 ? 100 : c}%, ${i === 2 ? '#000' : 'transparent'} 100%)`;
        d.style.cssText = `position:absolute;inset:0;backdrop-filter:blur(${radius * [0.25, 0.55, 1][i]}px);-webkit-backdrop-filter:blur(${radius * [0.25, 0.55, 1][i]}px);-webkit-mask-image:${mask};mask-image:${mask}`;
      });
    };
    draw(props);
    return { set: draw };
  },
  // Numbers that roll: each changed character slides in the direction of the change.
  'rolling-count'(el, props, event) {
    const box = shadow(el, '.t{position:absolute;white-space:pre;display:flex;line-height:1;font-variant-numeric:tabular-nums}.c{display:inline-block;overflow:visible}');
    const t = document.createElement('div');
    t.className = 't';
    box.append(t);
    let text = null, last = {};
    const draw = (p) => {
      const top = p.anchor === 'top-leading';
      const family = p.family ? `"${p.family}", ` : '';
      const weight = { ultraLight: 200, thin: 100, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900 }[p.weight] ?? 700;
      const design = { default: 'system-ui', rounded: 'ui-rounded, "SF Pro Rounded", system-ui', monospaced: 'ui-monospace, monospace', serif: 'ui-serif, serif' }[p.design] ?? 'ui-rounded, "SF Pro Rounded", system-ui';
      t.style.cssText = `font:${weight} ${num(p.points, 17)}px/1 ${family}${design};letter-spacing:${num(p.tracking, 0)}px;color:${p.tint ?? '#000'};` +
        (top ? 'left:0;top:0' : 'left:0;right:0;top:0;justify-content:center;text-align:center');
      const next = p.count ?? '';
      if (next !== text) {
        const down = p.down === 'true', secs = num(p.seconds, 0.3), delay = num(p.delay, 0) * 1000;
        const old = text ?? '';
        const chars = [...next];
        t.replaceChildren(...chars.map((ch, i) => {
          const s = document.createElement('span');
          s.className = 'c'; s.textContent = ch;
          if (text !== null && ch !== [...old][i]) {
            const dy = (down ? -1 : 1) * num(p.points, 17) * 0.55;
            s.animate([{ transform: `translateY(${dy}px)`, opacity: 0, filter: 'blur(3px)' }, { transform: 'none', opacity: 1, filter: 'none' }],
              { duration: secs * 1000, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
          }
          return s;
        }));
        text = next;
      }
      last = p;
    };
    draw(props);
    queueMicrotask(() => event(8, 'rolling-count:2'));
    return { set: draw };
  },
  // A slider: the filled track, the unfilled track from the thumb's edge, a glass capsule thumb that widens when held.
  'swift-slider'(el, props, event) {
    const box = shadow(el, '.k{position:absolute;inset:0;touch-action:none;cursor:pointer}.f,.u{position:absolute;top:12.3px;height:6px;border-radius:3px}.th{position:absolute;top:1px;height:28px;border-radius:14px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.28),0 0 0 .5px rgba(0,0,0,.08);transition:width .18s,margin .18s}');
    const k = document.createElement('div'), f = document.createElement('div'), u = document.createElement('div'), th = document.createElement('div');
    k.className = 'k'; f.className = 'f'; u.className = 'u'; th.className = 'th';
    f.style.background = '#0a84ff';
    k.append(u, f, th); box.append(k);
    k.setAttribute('role', 'slider');
    let value = 0, held = false;
    const draw = () => {
      const w = el.clientWidth, half = held ? 33 : 18.5, c = 18.5 + value * (w - 37);
      f.style.cssText += `;left:0;width:${c}px`;
      u.style.cssText += `;left:${c + half}px;right:0;display:${c + half < w ? 'block' : 'none'}`;
      th.style.cssText += `;left:${c - half}px;width:${half * 2}px`;
      k.setAttribute('aria-valuenow', String(value));
    };
    const move = (e) => {
      const r = el.getBoundingClientRect(), s = r.width / (el.clientWidth || 1);
      const x = (e.clientX - r.left) / s;
      const v = Math.min(1, Math.max(0, (x - 18.5) / (el.clientWidth - 37)));
      if (v !== value) { value = v; draw(); event(1, String(v)); }
    };
    k.addEventListener('pointerdown', (e) => { held = true; k.setPointerCapture(e.pointerId); move(e); draw(); });
    k.addEventListener('pointermove', (e) => { if (held) move(e); });
    const up = () => { held = false; draw(); };
    k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up);
    const set = (p) => {
      f.style.background = '#0a84ff';
      u.style.background = p['max-track-tint'] && p['max-track-tint'] !== '#00000000' ? p['max-track-tint'] : 'rgba(60,60,67,.18)';
      if (p.progress !== undefined && !held) value = Math.min(1, Math.max(0, num(p.progress, value)));
      draw();
    };
    set(props);
    new ResizeObserver(draw).observe(el);
    return { set };
  },
  // The checkmate crescendo: the phone's vibration motor where there is one.
  'mate-haptic'(el, props) {
    let played = props.plays, stopped = props.stops;
    return { set(p) {
      if (p.plays !== played) { played = p.plays; navigator.vibrate?.([30, 40, 30, 60, 80, 90, 120, 40, 60, 160]); }
      if (p.stops !== stopped) { stopped = p.stops; navigator.vibrate?.(0); }
    } };
  },
  // A sheet of switches over the demo.
  'toggle-sheet'(el, props, event) {
    let layer = null, p = props;
    const close = () => { layer?.close(); layer = null; };
    const open = () => {
      if (layer) return;
      layer = overlay(el);
      const rows = String(p.switches ?? '').split('|').filter(Boolean).map((r) => { const [id, on, ...l] = r.split(':'); return { id, on: on === '1' || on === 'true', label: l.join(':') }; });
      const tint = p['switch-tint'] ?? '#34c759';
      const root = layer.host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>*{box-sizing:border-box;font-family:-apple-system,system-ui,sans-serif}.s{position:absolute;inset:0;background:rgba(0,0,0,.4);pointer-events:auto;animation:f .25s both}.p{position:absolute;left:0;right:0;bottom:0;background:#1c1c1e;color:#fff;border-radius:38px 38px 0 0;padding:28px 22px 44px;pointer-events:auto;animation:u .38s cubic-bezier(.32,.72,0,1) both}.g{position:absolute;top:8px;left:50%;width:36px;height:5px;margin-left:-18px;border-radius:3px;background:#555}h2{font-size:20px;font-weight:600;text-align:center;margin:6px 0 22px}.r{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;font-size:17px}.w{width:51px;height:31px;border-radius:16px;background:#39393d;position:relative;transition:background .2s;cursor:pointer}.w::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.3);transition:transform .2s}.w.on::after{transform:translateX(20px)}@keyframes f{from{opacity:0}}@keyframes u{from{transform:translateY(100%)}}</style><div class="s"></div><div class="p"><div class="g"></div><h2></h2></div>`;
      root.querySelector('h2').textContent = p.caption ?? '';
      const panel = root.querySelector('.p');
      for (const r of rows) {
        const row = document.createElement('div'); row.className = 'r';
        const label = document.createElement('span'); label.textContent = r.label;
        const sw = document.createElement('div'); sw.className = 'w' + (r.on ? ' on' : ''); sw.setAttribute('role', 'switch');
        if (r.on) sw.style.background = tint;
        sw.addEventListener('click', () => { r.on = !r.on; sw.classList.toggle('on', r.on); sw.style.background = r.on ? tint : ''; event(1, `${r.id}:${r.on}`); });
        row.append(label, sw); panel.append(row);
      }
      root.querySelector('.s').addEventListener('click', () => { close(); event(1, 'dismissed'); });
    };
    const set = (n) => { p = n; n.open === 'true' ? open() : close(); };
    set(props);
    return { set, destroy: close };
  },
  // A round glass ellipsis button that opens movement > painter > painting.
  'painting-menu'(el, props, event) {
    const box = shadow(el, 'button{all:unset;cursor:pointer;position:absolute;right:0;top:0;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .15s}button:active{transform:scale(.92)}');
    const b = document.createElement('button');
    b.style.cssText = GLASS; b.innerHTML = icon('ellipsis'); b.setAttribute('aria-label', 'Choose a painting');
    box.append(b);
    let p = props, layer = null;
    const tree = () => { const out = []; for (const e of String(p.items ?? '').split('|')) { const [k, id, ...n] = e.split(' '); const node = { id, name: n.join(' '), kids: [] }; if (k === 'm') out.push(node); else if (k === 'p' && out.length) out.at(-1).kids.push(node); else if (k === 't' && out.at(-1)?.kids.length) out.at(-1).kids.at(-1).kids.push(node); } return out; };
    const close = () => { layer?.close(); layer = null; };
    b.addEventListener('click', () => {
      if (layer) return close();
      layer = overlay(el);
      const r = b.getBoundingClientRect(), root = layer.host.attachShadow({ mode: 'open' });
      const dev = layer.host.getBoundingClientRect(), s = dev.width / 420;
      root.innerHTML = `<style>*{box-sizing:border-box;font-family:-apple-system,system-ui,sans-serif}.s{position:absolute;inset:0;pointer-events:auto}.m{position:absolute;width:260px;max-height:70%;overflow:auto;background:rgba(44,44,46,.82);backdrop-filter:blur(30px) saturate(180%);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.4);color:#fff;pointer-events:auto;animation:i .2s cubic-bezier(.2,.8,.2,1) both;transform-origin:top right}.i{display:flex;align-items:center;gap:8px;padding:12px 16px;font-size:17px;cursor:pointer;border-bottom:.5px solid rgba(255,255,255,.12)}.i:active{background:rgba(255,255,255,.12)}.i b{width:18px;font-weight:600}.i span{flex:1}@keyframes i{from{opacity:0;transform:scale(.9)}}</style><div class="s"></div><div class="m"></div>`;
      const m = root.querySelector('.m');
      m.style.right = `${420 - ((r.right - dev.left) / s)}px`; m.style.top = `${(r.bottom - dev.top) / s + 8}px`;
      const stack = [];
      const show = (title, items) => {
        m.replaceChildren();
        if (stack.length) { const back = document.createElement('div'); back.className = 'i'; back.innerHTML = '<b>‹</b><span></span>'; back.querySelector('span').textContent = title; back.onclick = () => { stack.pop(); const [t, i] = stack.at(-1) ?? ['', null]; stack.length ? show(t, i) : top(); }; m.append(back); }
        for (const it of items) {
          const row = document.createElement('div'); row.className = 'i';
          const leaf = !it.kids;
          row.innerHTML = `<b>${leaf && (p.selected ?? '') === it.id ? '✓' : ''}</b><span></span>${leaf ? '' : '<b style="text-align:right">›</b>'}`;
          row.querySelector('span').textContent = it.name;
          row.onclick = () => { if (leaf) { close(); event(1, it.id); } else { stack.push([it.name, it.kids]); show(it.name, it.kids); } };
          m.append(row);
        }
      };
      const top = () => show('', [{ id: '', name: 'Default' }, ...tree()]);
      top();
      root.querySelector('.s').addEventListener('click', close);
    });
    return { set(n) { p = n; }, destroy: close };
  },
  // Plays the demo's track: its length, its loudness by slice, its clock and its end, as messages.
  'audio-track'(el, props, event) {
    const audio = new Audio();
    audio.preload = 'auto';
    let file = null, token = null, want = false, timer = null;
    const url = (f) => new URL(f, document.baseURI).href;
    const load = async (f) => {
      file = f; audio.src = url(f);
      audio.onerror = () => event(8, `missing:${f}`);
      audio.onloadedmetadata = () => event(8, `ready:${audio.duration}`);
      audio.onended = () => { event(8, 'ended:'); clearInterval(timer); };
      try {
        const buf = await (await fetch(url(f))).arrayBuffer();
        const data = (await new (globalThis.AudioContext ?? globalThis.webkitAudioContext)().decodeAudioData(buf)).getChannelData(0);
        const n = 50, step = Math.floor(data.length / n), lv = [];
        for (let i = 0; i < n; i++) { let s = 0; for (let j = i * step; j < (i + 1) * step; j += 16) s += data[j] * data[j]; lv.push(Math.sqrt(s / (step / 16))); }
        const max = Math.max(...lv) || 1;
        event(8, 'wave:' + lv.map((v) => (v / max).toFixed(3)).join(','));
      } catch {}
    };
    const set = (p) => {
      const f = p.file || 'assets/audio/track.m4a';
      if (f !== file) load(f);
      const seek = p.seek;
      if (seek?.includes(':')) { const [t, s] = [seek.slice(0, seek.indexOf(':')), Number(seek.slice(seek.indexOf(':') + 1))]; if (t !== token) { token = t; if (Number.isFinite(s)) audio.currentTime = s; } }
      const w = (p['play-state'] ?? p.playing) === 'true';
      if (w !== want) {
        want = w;
        if (w) { audio.play().catch(() => {}); clearInterval(timer); timer = setInterval(() => event(8, `time:${audio.currentTime}`), 500); }
        else { audio.pause(); clearInterval(timer); }
      }
    };
    set(props);
    return { set, destroy() { audio.pause(); clearInterval(timer); audio.src = ''; } };
  },
  // The bottom tab bar: a floating glass capsule.
  'native-tabbar'(el, props, event) {
    const box = shadow(el, '.b{position:absolute;left:16px;right:16px;bottom:22px;height:62px;border-radius:31px;display:flex;align-items:stretch;padding:4px;color:#fff;font:600 10px -apple-system,system-ui,sans-serif}.t{all:unset;cursor:pointer;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:27px;color:rgba(255,255,255,.62);transition:background .2s,color .2s}.t.on{background:rgba(255,255,255,.14)}');
    const bar = document.createElement('div');
    bar.className = 'b'; bar.style.cssText = GLASS;
    box.append(bar);
    const draw = (p) => {
      const titles = String(p['tab-titles'] ?? '').split('|'), symbols = String(p['tab-symbols'] ?? '').split('|'), sel = num(p['selected-tab'], 0);
      bar.replaceChildren(...titles.map((t, i) => {
        const b = document.createElement('button');
        b.className = 't' + (i === sel ? ' on' : ''); b.innerHTML = icon(symbols[i], 22); b.append(t);
        if (i === sel && p['tab-tint']) b.style.color = p['tab-tint'];
        b.addEventListener('click', () => event(1, `tab:${i}`));
        return b;
      }));
    };
    draw(props);
    return { set: draw };
  },
};
views['music-tabbar'] = views['native-tabbar'];

export function create(tag, element, json, event) {
  const props = JSON.parse(json);
  const make = views[tag];
  if (!make) { shadow(element, ''); return {}; }
  return make(element, props, event) ?? {};
}
export function setProps(h, json) { h.set?.(JSON.parse(json)); }
export function snapshot() {}
export function destroy(h) { h.destroy?.(); }
