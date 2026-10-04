import {
  GLYPH_TILT,
  INK,
  INK_MAX,
  INK_MIN,
  LIGHT_DIR,
  SIZE_LIT,
  BEYOND_LOOK,
  EDGE_LINES,
  FLIGHT_BANK,
  FLIGHT_LIFT,
  GLYPH_ROLL,
  LAND_SPREAD,
  PATH_BOW,
  RIPPLE_JITTER,
  SIZE_SHADOW,
  STAGGER,
  RETURN_WINDOW,
} from '../constants';

/**
 * One instanced quad per letter, carrying it from the page to the bust.
 *
 * Everything happens in VIEW space. The page could be projected as a flat
 * overlay and the bust as a 3D scene, with the two cross-faded — but then the
 * letters would not travel between them, they would dissolve. Instead the page
 * is placed on the plane through the camera target: its pixels map to exactly
 * the same screen positions there, so at morph 0 the page is screen-locked and
 * pin-sharp, and at any value in between the letter is at a real point in
 * space, on a real path, with a real perspective divide.
 *
 * The second consequence is that the bust can spin while the page does not. The
 * page is defined in the camera's own frame, so the view matrix never touches
 * it; the bust is defined in world space, so the view matrix is the only thing
 * that does.
 */
export const glyphShader = /* wgsl */ `
// Laid out to WGSL's own alignment rules, and no wider than it has to be.
//
// There is no view MATRIX here, and that is the point. The camera never turns
// — it looks down -Z at a fixed target — so the view transform is a pure
// translation, and a translation applied to a DIRECTION is the identity. The
// matrix version ran two mat4 products per vertex, seventy thousand vertices
// a frame, and one of them was arithmetic that returned its own input.
//
// The model transform is a rotation, so it is a mat3: the fourth row and
// column of a rotation carry nothing.
struct Uniforms {
  proj       : mat4x4f,
  model      : mat3x3f,   // lean + spin about the shape's own axis
  viewOffset : vec3f,     // the camera's translation, in world units
  morph      : f32,   // the one clock: 0 page .. 1 figure, and back
  // half-extents of the page plane in view space, and its depth
  pagePlane  : vec3f,
  scroll     : f32,   // how far the column has been pulled up, px
  screen     : vec2f,
  ratio      : f32,   // device pixels per point
  pageGlyph  : f32,   // one atlas cell at page scale, view-space units
  bustGlyph  : f32,   // one atlas cell at figure scale, view-space units
  cellPx     : f32,
  atlasCols  : f32,
  centreY    : f32,   // where the page starts coming apart, column px
  atlasDims  : vec2f,
  atlasOrigin : vec2f,  // glyph origin within a cell, device px
  reach      : f32,   // the farthest any letter is from there, px
  cross      : f32,   // 0 the first sculpture and its text, 1 the second
  rewind     : f32,   // 1 while the letters are on their way back to the page
};

// A fixed random per letter, from its place on the page — the same every
// frame, so the little disorder in the departure front never shimmers.
fn hash(p : vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(0) @binding(1) var glyphSampler : sampler;
@group(0) @binding(2) var glyphAtlas : texture_2d<f32>;

struct VertexIn {
  @location(0) corner : vec2f,
  // Packed: xyz is the point and w its occlusion; xy of the page is the glyph
  // origin and zw are its atlas cell and its advance.
  @location(1) posA  : vec4f,
  @location(2) nrmA  : vec3f,
  @location(3) pageA : vec4f,
  @location(4)  posB  : vec4f,
  @location(5)  nrmB  : vec3f,
  @location(7)  pageB : vec4f,
  @location(8)  posC  : vec4f,
  @location(9)  nrmC  : vec3f,
  @location(10) pageC : vec4f,
  // 1 where this slot has a seat in that figure, 0 where it does not.
  @location(11) presence : vec3f,
  @builtin(instance_index) id : u32,
};

// A fixed random per INSTANCE. Not per page position: during a crossing the
// page position is a blend of three, it moves every frame, and a hash of a
// moving input is a new random every frame — every mark's roll flickered.
fn seed(id : u32) -> f32 {
  var h = id * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  return f32(h) / 4294967295.0;
}

fn shadeOf(n : vec3f, light : vec3f, ao : f32) -> f32 {
  let lambert = clamp(dot(n, light), 0.0, 1.0);
  let lit = pow(lambert, 0.85) * mix(0.35, 1.0, ao);
  return clamp(pow(1.0 - lit, 1.45), 0.0, 1.0);
}

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv        : vec2f,
  @location(1) alpha     : f32,
  @location(2) local     : vec2f,
  @location(3) look      : f32,
};


@vertex
fn vs(input : VertexIn) -> VertexOut {
  var out : VertexOut;

  // --- where the letter starts: where it is ON SCREEN, which is its place in
  // the column minus however far the reader has scrolled. Leaving from its
  // place in the document instead would launch most of the text from somewhere
  // nobody can see, and whatever is in view would jump before it moved.
  // Where the letter is on screen: its origin in the column minus the
  // scroll, in device pixels — and then rounded EXACTLY as Skia rounds a
  // glyph origin for horizontal text: x to the nearest quarter pixel (with
  // Skia's own eighth-pixel bias), y to the nearest whole one. The quarter
  // picks which of the four atlas masks was drawn for this x; the integers
  // put the cell's texels on the pixels Skia's mask occupies. Get either
  // wrong by a fraction and the bilinear filter smears the letter, and the
  // handoff from text to quad is a visible soften.
  // A letter whose home is far below (or above) the screen does not fly in
  // from there: it would cross thousands of pixels in the time its neighbour
  // crosses a hundred, and read as a streak. It starts from just past the
  // edge instead — behind the fade, where it is invisible at rest anyway —
  // so no journey is longer than the screen and every letter moves at a
  // speed you can follow. On screen, this is the letter's real place.
  let edge = u.cellPx / u.ratio * ${EDGE_LINES};
  /**
   * Which of the two the instance is living as, right now.
   *
   * Positions blend, because crossing between them IS the animation. The
   * glyph does not: a letter is one character or the other, so cell and adv
   * snap at the half, which lands while the marks are grains on a statue and
   * far too small for a swap to register.
   */
  /**
   * A weight per figure, as a tent centred on it.
   *
   * At cross 1.4 the second carries 0.6 and the third 0.4 and the first
   * carries nothing. Between any two neighbours the pair sums to one, so this
   * is a plain interpolation — with no branch and nothing to change when a
   * fourth is added.
   */
  let w = max(
    vec3f(0.0),
    vec3f(1.0) - abs(vec3f(u.cross) - vec3f(0.0, 1.0, 2.0)),
  );
  let posAo = input.posA * w.x + input.posB * w.y + input.posC * w.z;
  let bustPos = posAo.xyz;
  // Blended but NOT normalized. Where two figures disagree about which way
  // the surface faces, this shrinks toward zero across the crossing instead of
  // snapping from one direction to the other at the half, and a short normal
  // is exactly what the billboard below should lean on least.
  let bustNrm = input.nrmA * w.x + input.nrmB * w.y + input.nrmC * w.z;
  let pageAll = input.pageA * w.x + input.pageB * w.y + input.pageC * w.z;
  let pagePx = pageAll.xy;
  let adv = pageAll.w;
  // The glyph does not blend: a letter is one character or another, so it
  // snaps to the nearest figure.
  let nearest = u.cross;
  var cell = input.pageA.z;
  if (nearest > 1.5) {
    cell = input.pageC.z;
  } else if (nearest > 0.5) {
    cell = input.pageB.z;
  }
  /**
   * A mark that belongs to only one of them.
   *
   * Squared so the going is quick and the arriving late — two thin crowds
   * crossing look worse than one.
   */
  let live = dot(input.presence, w);
  // Smoothstep, not a square. Squared, a mark that belongs to only one figure
  // was already half gone a quarter of the way across, which read as a cut
  // rather than a crossing; this one leaves late and arrives early, and is
  // gentle at both ends.
  let liveFade = smoothstep(0.0, 1.0, live);

  let realY = pagePx.y - u.scroll;
  let homeY = clamp(realY, -edge, u.screen.y + edge);
  let fromBeyond = realY != homeY;
  let xo = pagePx.x * u.ratio;
  let yo = homeY * u.ratio;
  let q = floor((xo + 0.125) * 4.0);
  let x0 = floor(q * 0.25);
  let subpixel = q - x0 * 4.0;
  let y0 = floor(yo + 0.5);

  // The quad is TIGHT on the glyph: its advance plus a sliver each side for
  // bearings and overhangs, the full cell tall. Tight so that neighbours on
  // one plane barely overlap — a depth test between two quads at the same
  // depth is decided by draw order, and a full-cell quad overlapped its
  // neighbour by two thirds, losing the middle of every letter but one.
  let pad = u.cellPx * 0.12;
  let sx0 = u.atlasOrigin.x - pad;
  let sx1 = u.atlasOrigin.x + adv * u.ratio + pad;
  let sy0 = 0.0;
  let sy1 = u.cellPx;
  let cellLeft = x0 - u.atlasOrigin.x;
  let cellTop = y0 - u.atlasOrigin.y;
  let quadW = (sx1 - sx0) / u.cellPx;
  let quadH = (sy1 - sy0) / u.cellPx;
  let onScreen = vec2f(cellLeft + (sx0 + sx1) * 0.5, cellTop + (sy0 + sy1) * 0.5) / u.ratio;

  // Where the letter is on its path: a pure function of the one clock, so a
  // tap that sends the clock back sends every letter back along the very
  // path it came by, from wherever it is. There is nothing to reverse, no
  // state to hand over, and nothing that can jump.
  //
  // The page comes apart from the middle of the SCREEN as it was at the tap
  // and outward. Each letter's delay is its distance from that point,
  // square-rooted so the letters in view take the first part of the window
  // and the thousands above and below stream in over the rest; a little
  // jitter so the front is a tide, not a drawn circle.
  let fromCentre = distance(pagePx, vec2f(u.screen.x * 0.5, u.centreY));
  let near = sqrt(min(fromCentre / u.reach, 1.0));

  /**
   * Going out and coming back are not the same event.
   *
   * One front served both, and running it backwards is what a rewind looks
   * like: outward from the middle on the way out, inward on the way home, the
   * same letters in the same order. A return should have its own shape.
   *
   * So the way back is ordered down the page instead of out from a point. The
   * column re-forms from the top, the way a page is read, and the two halves
   * of the journey stop being mirror images of each other.
   *
   * Inverted, because the clock runs down on the way home: the letter with
   * the SMALLEST delay is the one still travelling when the clock reaches
   * zero. To land the top of the page first, the top needs the largest.
   */
  let down = 1.0 - clamp((pagePx.y - u.scroll) / u.screen.y, 0.0, 1.0);
  let front = mix(near, down, u.rewind);
  let delay = front * (1.0 - ${RIPPLE_JITTER}) + hash(pagePx) * ${RIPPLE_JITTER};
  // Each letter's window runs from its own departure to the END of the
  // clock, so every letter is still settling as the spring settles and none
  // is cut off mid-stride. Linear within the window: the clock is the
  // spring, and its curve is the letter's curve.
  let grain = seed(input.id);
  // Out and home are windowed differently.
  //
  // Out: departures spread over the first half, arrivals bunched at the end,
  // so the page comes apart and the figure lands as one.
  //
  // Home is NOT that run backwards. Backwards, every letter's window ended
  // near the top of the clock, so as it started down they all left the
  // figure on the same frame and the statue went to fog before a single line
  // of the page existed. Here each letter gets a window of its own, placed by
  // the front: the letters bound for the top of the page leave first and land
  // first, the ones for the bottom leave last — so the figure is taken apart
  // over the whole return while the column fills in under it, and there is a
  // stream between the two the whole time rather than a cloud.
  let outStart = delay * ${STAGGER};
  let outEnd = 1.0 - grain * ${LAND_SPREAD};
  let homeStart = delay * (1.0 - ${RETURN_WINDOW});
  let homeEnd = homeStart + ${RETURN_WINDOW};
  let start = mix(outStart, homeStart, u.rewind);
  let end = mix(outEnd, homeEnd, u.rewind);
  let e = clamp((u.morph - start) / (end - start), 0.0, 1.0);

  let ndc = vec2f(
    (onScreen.x / u.screen.x) * 2.0 - 1.0,
    1.0 - (onScreen.y / u.screen.y) * 2.0
  );
  let pageView = vec3f(ndc * u.pagePlane.xy, u.pagePlane.z);

  // --- where it lands: a point on the shape, which the model matrix is
  // spinning. The camera never moves; a torus orbited by the camera barely
  // changes, because it is symmetric about the very axis such an orbit turns.
  let worldPos = u.model * bustPos;
  // View space is world space slid over: a translation moves a point and
  // leaves a direction alone, so the normal needs no transform at all.
  let bustView = worldPos + u.viewOffset;
  let normalView = u.model * bustNrm;


  // How a letter MOVES and how it LOOKS are two different curves, and sharing
  // one was wrong. The motion curve is an ease-out, so it is nearly half done a
  // fifth of the way along — which meant a letter had taken the figure's colour
  // and size almost the moment it left the page, and left looking like a mark
  // rather than like itself.
  //
  // This one holds the letter's own appearance through the first quarter,
  // changes it across the middle of the journey, and is finished before it
  // lands. What leaves the article is a letter; what arrives is a mark; the
  // swap happens out in the open where there is nothing to compare it to.
  //
  // LINEAR between those bounds, not eased. The motion already has a curve;
  // giving the appearance one too means the colour and the size race ahead at
  // one end of the window and crawl at the other, and the change reads as two
  // events instead of one steady crossing.
  // Size and ink change over the middle of the JOURNEY, not of the time: a
  // letter is text until it is a fifth of the way there and a mark from four
  // fifths on, whichever way it is going and however often it turns round.
  // A letter from beyond the edge is never seen as text, so it does not
  // arrive as text: it comes in already part way toward the figure's look —
  // smaller, shaded — and finishes the change with the rest.
  let lookE = select(e, mix(${BEYOND_LOOK}, 1.0, e), fromBeyond);
  let look = clamp((lookE - 0.22) / 0.6, 0.0, 1.0);

  // A quadratic Bezier, not a straight line. A few thousand parallel segments
  // read as a march; one control point per letter, pushed sideways by its own
  // seed and forward toward the camera, turns the same journey into a swarm
  // that curves. The sideways push is signed, so half the letters bow one way
  // and half the other and the paths cross instead of running in parallel.
  // Straight from the page to the figure, rising toward the camera through
  // the middle of the trip. The same lift for every letter: the swarm comes
  // off the page as one sheet. At e = 0 this is pageView exactly, which is
  // what puts a resting letter on Skia's pixels to the bit.
  let lift = ${FLIGHT_LIFT} * sin(3.1415927 * e);
  let travel = bustView - pageView;
  let aside = normalize(vec3f(-travel.y, travel.x, 0.0) + vec3f(0.0, 0.0, 1e-5));
  let bow = (grain - 0.5) * ${PATH_BOW} * length(travel) * sin(3.1415927 * e);
  let centre = mix(pageView, bustView, e) + vec3f(0.0, 0.0, lift) + aside * bow;

  // --- shading. Lambert alone renders a convex form as a smooth gradient — an
  // egg. The features that read are concave, and only the baked occlusion sees
  // them. On paper the convention inverts: ink THINS where the light falls.
  let light = normalize(vec3f(${LIGHT_DIR[0]}, ${LIGHT_DIR[1]}, ${LIGHT_DIR[2]}));
  // Lit in WORLD space, so the light stays put while the shape turns under it.
  //
  // Shaded once per figure and the RESULTS blended, not the normals. A mark
  // whose seat on the next figure faces the other way used to have its
  // blended normal flip at the half of the crossing, and its ink, size and
  // visibility jumped in one frame — marks blinking as you scrolled.
  let toCamera = -normalize(bustView);
  let nA = normalize(u.model * input.nrmA);
  let nB = normalize(u.model * input.nrmB);
  let nC = normalize(u.model * input.nrmC);
  let shade = dot(
    vec3f(
      shadeOf(nA, light, input.posA.w),
      shadeOf(nB, light, input.posB.w),
      shadeOf(nC, light, input.posC.w),
    ),
    w,
  );

  // --- the quad. It leans toward the skin as it lands; leaning all the way
  // would turn the letters edge-on at the rim, where they stop being letters.
  let tilt = ${GLYPH_TILT} * look;
  let facingCamera = vec3f(0.0, 0.0, 1.0);
  let billboard = normalize(mix(facingCamera, normalView, tilt));
  var right = cross(vec3f(0.0, 1.0, 0.0), billboard);
  if (length(right) < 1e-4) { right = vec3f(1.0, 0.0, 0.0); }
  right = normalize(right);
  let up = normalize(cross(billboard, right));

  // Letters all the way through. They stopped being dots once the surface got
  // real depth: occlusion, not uniformity, is what makes the form read now, so
  // the marks are free to go back to being type.
  // The quad is TIGHT on the glyph — its advance wide, three quarters of the
  // cell tall — not the full cell. Cells are wider than letters advance, and
  // full-cell quads on one plane overlapped by two thirds; with a depth test
  // the later one lost wherever they overlapped, which was the middle, which
  // was the letter. Only the first quad of a line ever showed. Tight quads do
  // not overlap, so there is nothing to lose.
  let sizeShade = mix(${SIZE_LIT}, ${SIZE_SHADOW}, shade);
  let em = mix(u.pageGlyph, u.bustGlyph * sizeShade, look);
  let halfW = em * 0.5 * quadW;
  let halfH = em * 0.5 * quadH;
  // A slight roll on the figure, none on the page.
  let roll = (grain - 0.5) * 2.0 * ${GLYPH_ROLL} * look;
  let cr = cos(roll);
  let sr = sin(roll);
  let cx = input.corner.x * halfW;
  let cy = input.corner.y * halfH;
  let flat = right * (cx * cr - cy * sr) + up * (cx * sr + cy * cr);
  // The bank. Mid-flight the letter tips into its direction of travel, like
  // a card thrown across a table: about the vertical axis for sideways
  // motion, about the horizontal for up and down. With the lift toward the
  // camera this is what makes the flight read as depth rather than as
  // sliding — a letter turning edge-on and back is unmistakably a thing in
  // space.
  let swing = sin(3.1415927 * e) * ${FLIGHT_BANK};
  let dir = travel / max(length(travel), 1e-4);
  let ay = swing * dir.x;
  let ax = -swing * dir.y;
  let o1 = vec3f(
    flat.x * cos(ay) + flat.z * sin(ay),
    flat.y,
    -flat.x * sin(ay) + flat.z * cos(ay)
  );
  let offset = vec3f(
    o1.x,
    o1.y * cos(ax) - o1.z * sin(ax),
    o1.y * sin(ax) + o1.z * cos(ax)
  );
  out.position = u.proj * vec4f(centre + offset, 1.0);

  // A letter on the far side has turned away. The bust is a sparse cloud with
  // no surface to hide behind, so nothing would occlude it — this is what makes
  // the cloud read as solid once it rotates.
  let facing = dot(
    smoothstep(
      vec3f(-0.10),
      vec3f(0.42),
      vec3f(dot(nA, toCamera), dot(nB, toCamera), dot(nC, toCamera)),
    ),
    w,
  );
  // No fade in. A letter is drawn by Skia until the front reaches it and by
  // WebGPU from that instant on, at full strength, and in between it simply
  // moves. Ramping the alpha made the handoff safe and made the letter blink:
  // what you saw was one thing dissolving while another appeared, rather than
  // a letter travelling.
  //
  // The two renderers can do this because they now agree on where a letter is
  // to within a fraction of its own width, and on when it leaves to within a
  // frame — same origin, same function, same clock.
  let onShape = facing * mix(${INK_MIN}, ${INK_MAX}, shade);
  // Two guards, and both earn their place.
  //
  // The first is the handoff: a mark is dark from the instant its letter
  // leaves, over a window two frames wide. Wide enough that a hair of
  // floating-point noise in the distance cannot flicker it on and off, narrow
  // enough that nobody sees a fade — what you see is the article's letter going
  // out and this one already moving.
  //
  // The second is the resting state: while the column is still an article,
  // WebGPU draws nothing at all. Without it the letters nearest the middle of
  // the screen sit at phase zero with a positive alpha and print themselves on
  // top of the text Skia is drawing, which reads as a smudge down the middle of
  // the page and took an embarrassingly long time to recognise.
  // A mark starts as the letter it replaces — full ink, page size — and only
  // takes on the figure's shading as it arrives. Born with the statue's
  // lighting instead, the ones headed for a lit surface detach almost
  // invisible, so the article appears to lose letters into nothing.
  // Gated on the morph clock, deliberately: at rest Skia paints the paragraph
  // in vector outlines and this pass draws nothing. From the first frame of
  // the morph every letter is drawn here — the ones not yet moving sit on the
  // very pixels Skia had them on, at page size and full ink, which is what
  // makes the one global handoff invisible. Strictly greater than zero: Skia
  // keeps the column for two frames past this, and the overlap is the
  // guarantee that no frame is ever empty. A letter takes the figure's
  // shading only as look brings it in.
  out.alpha =
    mix(1.0, onShape, look) * select(0.0, 1.0, u.morph > 0.0) * liveFade;
  out.local = input.corner;
  out.look = look;

  // The cell for this glyph at this subpixel phase, and the same tight window
  // into it that the quad covers — so one texel is one device pixel at rest.
  let index = cell * 4.0 + subpixel;
  let col = index % u.atlasCols;
  let row = floor(index / u.atlasCols);
  let origin = vec2f(col * u.cellPx, row * u.cellPx);
  let uv0 = (origin + vec2f(sx0, sy0)) / u.atlasDims;
  let uv1 = (origin + vec2f(sx1, sy1)) / u.atlasDims;
  let t = vec2f((input.corner.x + 1.0) * 0.5, (1.0 - input.corner.y) * 0.5);
  out.uv = mix(uv0, uv1, t);
  return out;
}

@fragment
fn fs(input : VertexOut) -> @location(0) vec4f {
  // Coverage is the alpha channel: ink drawn on nothing, by the same font
  // through the same rasteriser as the page. At rest it is used as-is — the
  // soft edge IS the letter, and cutting it is what made the type look thin.
  //
  // In the figure the cut comes back. A blended fragment that also writes
  // depth occludes whatever is behind it with its soft edge, and every mark
  // grows a pale halo that eats the marks further back; a hard edge keeps the
  // depth buffer honest, and at that size the aliasing reads as bite. The
  // threshold rides in with look, so a resting letter loses nothing and a
  // letter on the statue is cut clean. Fully empty texels are always dropped:
  // they carry no ink, and must not write depth.
  let coverage = textureSample(glyphAtlas, glyphSampler, input.uv).a;
  let cut = mix(0.002, 0.34, input.look);
  if (coverage < cut) { discard; }
  let a = coverage * input.alpha;
  return vec4f(vec3f(${INK[0]}, ${INK[1]}, ${INK[2]}) * a, a);
}
`;
