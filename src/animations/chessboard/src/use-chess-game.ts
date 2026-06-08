import { Alert } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import { useSetAtom } from 'jotai';
import { usePatternComposer } from 'react-native-pulsar';

import { useCheckmateAura } from './checkmate-aura';
import {
  FOOLS_MATE,
  PLAYERS,
  REPLAY,
  REVIEW_ACCURACY,
  REVIEW_MOVES,
} from './constants';
import { MATE_PATTERN, moveTick } from './haptics';
import {
  capturedAtom,
  clockSv,
  gameOverSv,
  pausedAtom,
  pliesAtom,
  resetGameAtom,
  runningAtom,
  selectedPlyAtom,
  startedSv,
  statusAtom,
  turnSv,
} from './state';
import { delay, kingFromFen, measureInWindow, statusFor } from './utils';

import type { Side } from './types';
import type { View } from 'react-native';
import type { ChessboardRef, MoveResult } from 'react-native-chessboard';

// The whole game machine behind the chessboard screen: the canned replay
// (start / pause / resume / cancel), the per-move state + shared-value writes,
// haptics, the chess clocks and the checkmate-aura trigger. The screen itself
// stays a pure layout — it renders the refs and handlers returned from here.
export const useChessGame = ({
  flipped,
  pieceSize,
}: {
  flipped: boolean;
  pieceSize: number;
}) => {
  const boardRef = useRef<ChessboardRef>(null);
  const boardBoxRef = useRef<View>(null);
  const { show, hide } = useCheckmateAura();

  const setPlies = useSetAtom(pliesAtom);
  const setSelectedPly = useSetAtom(selectedPlyAtom);
  const setRunning = useSetAtom(runningAtom);
  const setPausedAtom = useSetAtom(pausedAtom);
  const setCaptured = useSetAtom(capturedAtom);
  const setStatus = useSetAtom(statusAtom);
  const resetGame = useSetAtom(resetGameAtom);

  // False once unmounted, so the async replay / aura timer bail instead of
  // driving a torn-down tree.
  const alive = useRef(true);
  const runningRef = useRef(false);
  const auraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumping the generation cancels any in-flight replay: the loop re-checks it
  // after every await and bails when it no longer matches.
  const replayGen = useRef(0);

  // Pause is read synchronously by the replay loop and the clock ticker; the
  // atom mirror drives the play/pause icon.
  const pausedRef = useRef(false);
  const setPaused = useCallback(
    (value: boolean) => {
      pausedRef.current = value;
      setPausedAtom(value);
    },
    [setPausedAtom],
  );

  // The mate crescendo as a single native pattern — play() schedules it on the
  // haptic engine, stop() cancels it (reset / unmount mid-sequence).
  const mateHaptic = usePatternComposer(MATE_PATTERN);

  const playSequence = useCallback(async () => {
    if (runningRef.current) return;
    const gen = ++replayGen.current;
    runningRef.current = true;
    setRunning(true);
    setPaused(false);
    boardRef.current?.resetBoard();
    resetGame();
    await delay(REPLAY.START_DELAY);
    for (const [from, to] of FOOLS_MATE) {
      if (!alive.current || replayGen.current !== gen) return;
      // Hold here while paused — the position freezes between moves and the
      // loop picks back up exactly where it stopped.
      while (pausedRef.current) {
        if (!alive.current || replayGen.current !== gen) return;
        await delay(REPLAY.PAUSE_POLL);
      }
      await boardRef.current?.move({ from, to });
      if (!alive.current || replayGen.current !== gen) return;
      await delay(REPLAY.MOVE_GAP);
    }
    if (replayGen.current !== gen) return;
    runningRef.current = false;
    setRunning(false);
  }, [resetGame, setRunning, setPaused]);

  // Play toggles between starting the replay, holding it, and resuming it.
  const togglePlay = useCallback(() => {
    if (!runningRef.current) {
      playSequence();
      return;
    }
    setPaused(!pausedRef.current);
  }, [playSequence, setPaused]);

  // Rematch: cancel whatever is in flight (replay, pending aura, the mate
  // crescendo) and reset to a fresh, playable board.
  const rematch = useCallback(() => {
    replayGen.current++;
    runningRef.current = false;
    setRunning(false);
    setPaused(false);
    if (auraTimer.current != null) clearTimeout(auraTimer.current);
    mateHaptic.stop();
    hide();
    boardRef.current?.resetBoard();
    resetGame();
  }, [resetGame, setRunning, setPaused, hide, mateHaptic]);

  // New Game: confirm before clearing the current board (native alert). Works
  // mid-replay too — confirming aborts the replay and resets.
  const confirmNewGame = useCallback(() => {
    Alert.alert(
      'New Game?',
      'This clears the current board and starts fresh.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'New Game', style: 'destructive', onPress: rematch },
      ],
    );
  }, [rematch]);

  // Checkmate → settle the board into a blurred haze with a breathing
  // accent-blue aurora centred on the mated king, and raise a calm result
  // card. Atmosphere, not a shockwave.
  const showAura = useCallback(
    async (fen: string, moverColor: Side) => {
      const kingColor: Side = moverColor === 'w' ? 'b' : 'w';
      const king = kingFromFen(fen, kingColor);
      if (!king) return;
      const box = await measureInWindow(boardBoxRef);
      if (!box || !alive.current) return;
      const col = flipped ? 7 - king.file : king.file;
      const row = flipped ? 7 - king.rowFromTop : king.rowFromTop;
      // The mover delivered mate, so the mover wins.
      const winner = PLAYERS[moverColor].name;
      show({
        x: box.x + col * pieceSize + pieceSize / 2,
        y: box.y + row * pieceSize + pieceSize / 2,
        subtitle: `${winner} wins`,
        oppName: PLAYERS.b.name,
        accuracy: REVIEW_ACCURACY,
        moves: REVIEW_MOVES,
        onRematch: rematch,
        onReview: () => {}, // dismiss to inspect the final board
      });
    },
    [flipped, pieceSize, show, rematch],
  );

  const onMove = useCallback(
    (result: MoveResult) => {
      const { isCheckmate, isStalemate, isCheck } = result.state;
      const mover = result.move.color as Side;
      const taken = result.move.captured;

      setPlies(prev => [
        ...prev,
        {
          san: result.move.san,
          fen: result.state.fen,
          from: result.move.from,
          to: result.move.to,
        },
      ]);
      // Each landing move becomes the selected ply (-1 → 0 → 1 → …).
      setSelectedPly(s => s + 1);
      if (taken) {
        setCaptured(prev => ({ ...prev, [mover]: [...prev[mover], taken] }));
      }
      setStatus(statusFor(result));
      // Mirror the hot state onto shared values — the cards' turn treatment
      // animates from these without re-rendering.
      turnSv.set(mover === 'w' ? 'b' : 'w');
      gameOverSv.set(isCheckmate || isStalemate);
      startedSv.set(true);

      if (isCheckmate) {
        mateHaptic.play();
        // Only checkmate earns the aura — schedule the snapshot for when the
        // screen is fully static (see REPLAY.AURA_DELAY).
        auraTimer.current = setTimeout(
          () => showAura(result.state.fen, mover),
          REPLAY.AURA_DELAY,
        );
      } else {
        moveTick({ capture: Boolean(taken), check: isCheck });
      }
    },
    [showAura, mateHaptic, setPlies, setSelectedPly, setCaptured, setStatus],
  );

  // Auto-play the replay on mount; tear everything down on unmount.
  useEffect(() => {
    alive.current = true;
    playSequence();
    return () => {
      alive.current = false;
      if (auraTimer.current != null) clearTimeout(auraTimer.current);
      mateHaptic.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chess clocks: once per second, burn a second from whoever is to move —
  // only while a live game is on the board and not held on pause. Pure shared
  // values, so the ticking never renders anything.
  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return;
      if (!startedSv.get() || gameOverSv.get()) return;
      const sv = clockSv[turnSv.get()];
      sv.set(Math.max(0, sv.get() - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return { boardRef, boardBoxRef, onMove, togglePlay, confirmNewGame };
};
