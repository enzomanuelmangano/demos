//! Haptics for a surface, played by the host without a Contract commit.
//!
//! Surfaces post `"haptic:<kind>"`, and [`host`] turns each kind into an `exact_gpu::haptics`
//! pattern that the host consumes before the app sees it (one haptic engine for the page):
//! - no action, no logic turn, no plan applied, no feedback generator made per tick;
//! - drag ticks (25 a second) would otherwise each cost a full commit on the main thread,
//!   inside an 8.3 ms frame.
//!
//! The aliases `grab`, `tick`, `release` and `limit` map to the kinds they stand for; any
//! other kind (chessboard's `haptic:mate`) passes through untouched.
//!
//! Under `cargo test` [`host`] keeps the kinds; [`translate`] is what runs everywhere else.

use exact_gpu::haptics::{Event, Haptic, Pattern};

/// A surface's messages as the host should get them: each `haptic:<kind>` as its pattern.
///
/// The web's host drops `exact:haptics` patterns (a page drives no haptic engine), so there the kinds stay as they are
/// and the page module (modules/web/index.js) plays each on `navigator.vibrate` and keeps it from the app.
pub fn host(messages: Vec<String>) -> Vec<String> {
    if cfg!(test) || cfg!(target_arch = "wasm32") {
        messages
    } else {
        translate(messages)
    }
}

/// Each `haptic:<kind>` this module knows as its pattern's message; the rest as it was.
pub fn translate(mut messages: Vec<String>) -> Vec<String> {
    for m in messages.iter_mut() {
        if let Some(p) = m.strip_prefix("haptic:").and_then(pattern) {
            *m = Haptic::Pattern(p).message();
        }
    }
    messages
}

/// A tap at `time` seconds.
fn tap(time: f32, intensity: f32, sharpness: f32) -> Event {
    Event::Transient {
        time,
        intensity,
        sharpness,
    }
}

/// The kind's pattern, close to the iOS feedback generators: intensity rises light < medium <
/// heavy, sharpness is low for soft and high for rigid, notifications are two or three taps.
fn pattern(kind: &str) -> Option<Pattern> {
    let events = match kind {
        "selection" | "tick" => vec![tap(0.0, 0.45, 0.85)],
        "impact-light" | "grab" => vec![tap(0.0, 0.55, 0.6)],
        "impact-medium" | "impact" => vec![tap(0.0, 0.75, 0.6)],
        "impact-heavy" => vec![tap(0.0, 1.0, 0.5)],
        "impact-soft" | "release" => vec![tap(0.0, 0.6, 0.15)],
        "impact-rigid" | "limit" => vec![tap(0.0, 0.75, 1.0)],
        "success" => vec![tap(0.0, 0.6, 0.6), tap(0.1, 1.0, 0.7)],
        "warning" => vec![tap(0.0, 1.0, 0.6), tap(0.15, 0.6, 0.6)],
        "error" => vec![tap(0.0, 0.8, 0.8), tap(0.08, 0.8, 0.8), tap(0.2, 1.0, 0.6)],
        _ => return None,
    };
    Some(Pattern {
        events,
        curves: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_kind_becomes_a_pattern_the_host_consumes_and_the_rest_passes() {
        let out = translate(vec![
            "haptic:selection".into(),
            "haptic:mate".into(),
            "seek:1.5".into(),
            "haptic:impact-soft".into(),
        ]);
        assert_eq!(
            out[0],
            r#"exact:haptics {"pattern":{"events":[{"type":"transient","time":0,"intensity":0.45,"sharpness":0.85}],"curves":[]}}"#
        );
        assert_eq!(out[1], "haptic:mate");
        assert_eq!(out[2], "seek:1.5");
        assert!(out[3].starts_with(exact_gpu::haptics::PREFIX));
    }

    #[test]
    fn every_kind_the_demos_post_is_known() {
        for k in [
            "selection",
            "impact-light",
            "impact-medium",
            "impact-heavy",
            "impact-soft",
            "impact-rigid",
            "success",
            "warning",
            "error",
            "grab",
            "tick",
            "release",
            "limit",
        ] {
            assert!(pattern(k).is_some(), "{k}");
        }
        assert!(pattern("mate").is_none() && pattern("mate-stop").is_none());
    }

    #[test]
    fn under_test_the_kinds_stay() {
        assert_eq!(host(vec!["haptic:selection".into()]), ["haptic:selection"]);
    }
}
