//! The intro's touches, taken by its one surface as RN takes them (onboarding/index.tsx's root
//! pager pan and pattern-beat.tsx's board and ghost gestures, all worklets): the pager under
//! the finger, its release, the board's taps and piece drags, and taps on the ghost. Nothing
//! here commits to the app while a finger moves; the app hears what happened once.
//!
//! - Pager (index.tsx:253-311): activates 12 pt across, either way; `p = origin - dx / width`,
//!   `dx` counted from where it activated (Gesture Handler's translation leaves the slop out: a
//!   half-width swipe recorded on RN settles back, measured 2026-11-09),
//!   0.35 of any overshoot past either end; released, `projected = p - vx * 0.12 / width`
//!   rounds to a page at most one from where it began, 0…1, settled in 340 ms. `vx` is Gesture
//!   Handler's `velocityX` (packages/gestures: the pan's velocity over its last 100 ms of moves).
//!   Reduce Motion: the finger does not move it; a swipe of 56 pt (counted from where the pan
//!   activated, as `translationX`) or 500 pt/s turns one page (a dip).
//! - Board (use-board-gesture.ts): only when it takes touches; pressed on a piece, the pan
//!   starts past 5 pt (the piece is carried, the pager never sees the touch); on an empty
//!   square the touch is the pager's. A touch that lifts within 5 pt of its press is the
//!   square's tap (`maxDistance(5)`, use-board-gesture.ts:647), within RNGH's 500 ms `maxDuration`.
//! - Ghost (pattern-beat.tsx ghostTapGesture): a press that lifts within 500 ms short of 12 pt,
//!   anywhere else, is offered to the ghost.

/// What a touch did, for the surface to act on.
#[derive(Clone, Debug, PartialEq)]
pub enum Effect {
    /// The pager is at `p` under the finger.
    Pager(f64),
    /// Let go: settle on page `to` from `from`.
    Release { to: f64, from: f64 },
    /// Reduce Motion's swipe: turn to `to` under a fade.
    Dip(f64),
    /// A tap at a canvas point, for the ghost.
    Poke(f32, f32),
    /// A tap on square `s`.
    Tap(usize),
    /// The piece on `s` is picked up, pressed at (`x`, `y`) in its square.
    Lift { s: usize, x: f32, y: f32 },
    /// The carried piece: the finger's travel since the press.
    Carry(f32, f32),
    /// The carried piece is let go.
    Drop,
}

/// What the gesture needs to know of the screen when a finger lands.
#[derive(Clone, Copy, Debug)]
pub struct Scene {
    /// The canvas's width (points).
    pub width: f32,
    /// The board's square at rest (x, y, side, canvas points) when it takes touches.
    pub board: Option<(f32, f32, f32)>,
    /// Which squares hold a piece.
    pub pieces: u64,
    /// Where the pager is, pages.
    pub p: f64,
    pub reduced: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Kind {
    /// Not decided: the square under the press, and whether a piece is on it.
    Pending {
        square: Option<usize>,
        piece: bool,
    },
    /// Activated where the finger was then (x).
    Pager(f32),
    Piece,
}

#[derive(Clone, Copy, Debug)]
struct Touch {
    id: u32,
    start: (f32, f32, f64),
    origin: f64,
    kind: Kind,
    moved: f32,
}

const PAGER_SLOP: f32 = 12.0;
const PIECE_SLOP: f32 = 5.0;
/// A square's tap fails past this (use-board-gesture.ts:647 `maxDistance(5)`), or held past
/// TAP_MS (RNGH's Tap `maxDuration` default, 500 ms).
const SQUARE_TAP_SLOP: f32 = 5.0;
const RUBBER: f64 = 0.35;
const PROJECT_S: f64 = 0.12;
const DIP_DISTANCE: f32 = 56.0;
const DIP_SPEED: f32 = 500.0;
const TAP_MS: f64 = 500.0;

/// One finger at a time.
#[derive(Default)]
pub struct Gesture {
    touch: Option<Touch>,
    scene: Option<Scene>,
    /// The finger's samples, for the release's velocity (RNGH's `velocityX`).
    velocity: gestures::PanGesture,
}

/// What one touch event did: at most a lift and its first carry, held without a heap (a move
/// arrives every frame a finger is down).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Effects([Option<Effect>; 2]);

impl Effects {
    fn one(e: Effect) -> Effects {
        Effects([Some(e), None])
    }
    fn push(&mut self, e: Effect) {
        let slot = self.0.iter_mut().find(|s| s.is_none()).expect("two effects at most");
        *slot = Some(e);
    }
}

impl IntoIterator for Effects {
    type Item = Effect;
    type IntoIter = std::iter::Flatten<std::array::IntoIter<Option<Effect>, 2>>;
    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter().flatten()
    }
}

#[cfg(test)]
impl PartialEq<Vec<Effect>> for Effects {
    fn eq(&self, other: &Vec<Effect>) -> bool {
        self.clone().into_iter().collect::<Vec<_>>() == *other
    }
}

#[cfg(test)]
impl std::ops::Index<usize> for Effects {
    type Output = Effect;
    fn index(&self, i: usize) -> &Effect {
        self.0[i].as_ref().expect("an effect")
    }
}

impl Gesture {
    pub fn busy(&self) -> bool {
        self.touch.is_some()
    }

    /// A finger lands at (x, y) at `ms`.
    pub fn down(&mut self, id: u32, x: f32, y: f32, ms: f64, scene: Scene) {
        if self.touch.is_some() {
            return;
        }
        let square = scene.board.and_then(|(bx, by, side)| {
            let (c, r) = ((x - bx) / (side / 8.0), (y - by) / (side / 8.0));
            ((0.0..8.0).contains(&c) && (0.0..8.0).contains(&r)).then(|| r as usize * 8 + c as usize)
        });
        let piece = square.is_some_and(|s| scene.pieces & (1 << s) != 0);
        self.touch = Some(Touch { id, start: (x, y, ms), origin: scene.p, kind: Kind::Pending { square, piece }, moved: 0.0 });
        self.scene = Some(scene);
        self.velocity = gestures::PanGesture::new().min_distance(0.0);
        self.velocity.event(id, gestures::Phase::Down, x, y, ms, true);
    }

    /// The finger moves.
    pub fn moved(&mut self, id: u32, x: f32, y: f32, ms: f64) -> Effects {
        let (Some(t), Some(scene)) = (self.touch.as_mut(), self.scene) else { return Effects::default() };
        if t.id != id {
            return Effects::default();
        }
        self.velocity.event(id, gestures::Phase::Move, x, y, ms, true);
        let (dx, dy) = (x - t.start.0, y - t.start.1);
        t.moved = t.moved.max((dx * dx + dy * dy).sqrt());
        let mut out = Effects::default();
        if let Kind::Pending { square, piece } = t.kind {
            if piece && t.moved >= PIECE_SLOP {
                let s = square.unwrap();
                let (bx, by, side) = scene.board.unwrap();
                let sq = side / 8.0;
                t.kind = Kind::Piece;
                out.push(Effect::Lift { s, x: t.start.0 - bx - (s % 8) as f32 * sq, y: t.start.1 - by - (s / 8) as f32 * sq });
            } else if !piece && dx.abs() >= PAGER_SLOP {
                t.kind = Kind::Pager(x);
            }
        }
        match t.kind {
            Kind::Piece => out.push(Effect::Carry(dx, dy)),
            Kind::Pager(at) if !scene.reduced => {
                let next = t.origin - (x - at) as f64 / scene.width.max(1.0) as f64;
                let p = if next < 0.0 {
                    next * RUBBER
                } else if next > 1.0 {
                    1.0 + (next - 1.0) * RUBBER
                } else {
                    next
                };
                out.push(Effect::Pager(p));
            }
            _ => {}
        }
        out
    }

    /// The finger lifts (or the platform cancels it).
    pub fn up(&mut self, id: u32, x: f32, y: f32, ms: f64, cancelled: bool) -> Effects {
        let (Some(t), Some(scene)) = (self.touch, self.scene) else { return Effects::default() };
        if t.id != id {
            return Effects::default();
        }
        self.touch = None;
        let phase = if cancelled { gestures::Phase::Cancel } else { gestures::Phase::Up };
        let vx = match self.velocity.event(id, phase, x, y, ms, true) {
            gestures::Event::End(pan) => pan.velocity_x,
            _ => 0.0,
        };
        match t.kind {
            Kind::Piece => Effects::one(Effect::Drop),
            Kind::Pager(at) if scene.reduced => {
                // `translationX`: from where the pan activated, the slop left out.
                let dx = x - at;
                let from = t.origin.round();
                let step = if dx <= -DIP_DISTANCE || vx <= -DIP_SPEED {
                    1.0
                } else if dx >= DIP_DISTANCE || vx >= DIP_SPEED {
                    -1.0
                } else {
                    0.0
                };
                let to = (from + step).clamp(0.0, 1.0);
                if to != from && !cancelled {
                    Effects::one(Effect::Dip(to))
                } else {
                    Effects::default()
                }
            }
            Kind::Pager(at) => {
                let next = t.origin - (x - at) as f64 / scene.width.max(1.0) as f64;
                let p = if next < 0.0 {
                    next * RUBBER
                } else if next > 1.0 {
                    1.0 + (next - 1.0) * RUBBER
                } else {
                    next
                };
                let page = t.origin.round();
                let projected = p - vx as f64 * PROJECT_S / scene.width.max(1.0) as f64;
                let to = projected.round().clamp((page - 1.0).max(0.0), (page + 1.0).min(1.0));
                Effects::one(Effect::Release { to, from: p })
            }
            Kind::Pending { square, .. } if !cancelled && t.moved < PAGER_SLOP => match square {
                Some(s) if t.moved < SQUARE_TAP_SLOP && ms - t.start.2 <= TAP_MS => Effects::one(Effect::Tap(s)),
                Some(_) => Effects::default(),
                None if ms - t.start.2 <= TAP_MS => Effects::one(Effect::Poke(x, y)),
                None => Effects::default(),
            },
            Kind::Pending { .. } => Effects::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scene(p: f64) -> Scene {
        Scene { width: 400.0, board: Some((0.0, 100.0, 400.0)), pieces: 1 << 28, p, reduced: false }
    }

    #[test]
    fn a_swipe_turns_one_page_and_a_short_one_springs_back() {
        let mut g = Gesture::default();
        g.down(1, 300.0, 50.0, 0.0, Scene { board: None, ..scene(0.0) });
        g.moved(1, 200.0, 50.0, 100.0);
        assert_eq!(g.up(1, 100.0, 50.0, 200.0, false), vec![Effect::Release { to: 1.0, from: 0.25 }]);
        g.down(1, 300.0, 50.0, 0.0, Scene { board: None, ..scene(0.0) });
        assert_eq!(g.moved(1, 290.0, 50.0, 500.0), vec![]);
        g.moved(1, 260.0, 50.0, 1000.0);
        assert_eq!(g.up(1, 260.0, 50.0, 1100.0, false), vec![Effect::Release { to: 0.0, from: 0.0 }]);
    }

    #[test]
    fn past_the_ends_only_a_third_of_the_finger_moves_it() {
        let mut g = Gesture::default();
        g.down(1, 100.0, 50.0, 0.0, Scene { board: None, ..scene(0.0) });
        g.moved(1, 120.0, 50.0, 50.0);
        assert_eq!(g.moved(1, 320.0, 50.0, 100.0), vec![Effect::Pager(-0.5 * RUBBER)]);
    }

    #[test]
    fn a_piece_is_carried_and_an_empty_square_is_the_pagers() {
        let mut g = Gesture::default();
        // e5 is square 28: (4, 3) at 50 pt squares.
        g.down(1, 225.0, 275.0, 0.0, scene(1.0));
        let lift = g.moved(1, 231.0, 275.0, 16.0);
        assert_eq!(lift[0], Effect::Lift { s: 28, x: 25.0, y: 25.0 });
        assert_eq!(g.moved(1, 300.0, 275.0, 32.0), vec![Effect::Carry(75.0, 0.0)]);
        assert_eq!(g.up(1, 300.0, 275.0, 48.0, false), vec![Effect::Drop]);
        g.down(1, 175.0, 275.0, 0.0, scene(1.0));
        assert!(matches!(g.moved(1, 200.0, 275.0, 16.0)[0], Effect::Pager(_)));
        g.down(2, 0.0, 0.0, 0.0, scene(1.0));
        g.up(1, 200.0, 275.0, 32.0, true);
        g.down(1, 175.0, 275.0, 0.0, scene(1.0));
        assert_eq!(g.up(1, 176.0, 275.0, 80.0, false), vec![Effect::Tap(27)]);
    }

    /// A square's tap fails past 5 pt (use-board-gesture.ts `maxDistance(5)`), short of the pager's 12.
    #[test]
    fn a_square_tap_fails_past_five_points() {
        let mut g = Gesture::default();
        g.down(1, 175.0, 275.0, 0.0, scene(1.0));
        g.moved(1, 179.0, 275.0, 16.0);
        assert_eq!(g.up(1, 179.0, 275.0, 32.0, false), vec![Effect::Tap(27)]);
        g.down(1, 175.0, 275.0, 0.0, scene(1.0));
        g.moved(1, 182.0, 275.0, 16.0);
        assert_eq!(g.up(1, 182.0, 275.0, 32.0, false), vec![]);
    }

    /// The release's speed is Gesture Handler's (over the last 100 ms of moves), not the last two
    /// samples': a flick that slows on its last move still turns the page.
    #[test]
    fn a_flick_is_judged_on_its_last_100_ms() {
        let mut g = Gesture::default();
        g.down(1, 300.0, 50.0, 0.0, Scene { board: None, ..scene(0.0) });
        for (k, x) in [260.0, 220.0, 180.0, 140.0, 139.0].into_iter().enumerate() {
            g.moved(1, x, 50.0, 16.0 * (k + 1) as f64);
        }
        let out: Vec<_> = g.up(1, 139.0, 50.0, 96.0, false).into_iter().collect();
        assert!(matches!(out[..], [Effect::Release { to, .. }] if to == 1.0), "{out:?}");
    }

    /// Reduce Motion: the swipe's 56 pt count from where the pan activated (`translationX`), the
    /// 12 pt slop left out (index.tsx:284-297).
    #[test]
    fn reduce_motion_counts_the_swipe_from_activation() {
        let reduced = |p| Scene { board: None, reduced: true, ..scene(p) };
        let mut g = Gesture::default();
        g.down(1, 300.0, 50.0, 0.0, reduced(0.0));
        assert_eq!(g.moved(1, 288.0, 50.0, 400.0), vec![]);
        g.moved(1, 240.0, 50.0, 800.0);
        assert_eq!(g.up(1, 240.0, 50.0, 1200.0, false), vec![], "60 pt from the press, 48 from activation");
        g.down(1, 300.0, 50.0, 0.0, reduced(0.0));
        g.moved(1, 288.0, 50.0, 400.0);
        g.moved(1, 230.0, 50.0, 800.0);
        assert_eq!(g.up(1, 230.0, 50.0, 1200.0, false), vec![Effect::Dip(1.0)]);
    }

    /// RNGH's Tap fails when held past its `maxDuration` (500 ms): a long press on a square is no tap.
    #[test]
    fn a_square_held_past_500_ms_is_no_tap() {
        let mut g = Gesture::default();
        g.down(1, 175.0, 275.0, 0.0, scene(1.0));
        assert_eq!(g.up(1, 175.0, 275.0, 500.0, false), vec![Effect::Tap(27)]);
        g.down(1, 175.0, 275.0, 1000.0, scene(1.0));
        assert_eq!(g.up(1, 175.0, 275.0, 1501.0, false), vec![]);
    }
}
