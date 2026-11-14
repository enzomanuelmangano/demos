//! chess.js 1.4.0 (node_modules/chess.js/src/chess.ts), the rules react-native-chessboard runs:
//! the 0x88 board, `_moves` (pseudo-legal generation, castling through unattacked squares, en
//! passant, the four promotions, then the legality filter), `_makeMove` / `_undoMove`,
//! `_attacked` (the ATTACKS / RAYS tables), `fen()` (the en-passant square only when a capture
//! is legal), `load()`, `_moveToSan` with `getDisambiguator`, the game-over tests and `perft`.
//! The position count behind `isThreefoldRepetition` is keyed by the position (board, turn,
//! castling, en passant) where chess.js keys it by its Zobrist hash of the same fields.
//! `validateFen` is reduced to the shape checks `load` needs: the demo only loads START_FEN.

use std::collections::HashMap;

/// A side (chess.js `Color`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Side {
    /// 'w'.
    W,
    /// 'b'.
    B,
}

impl Side {
    /// swapColor.
    pub fn other(self) -> Side {
        match self {
            Side::W => Side::B,
            Side::B => Side::W,
        }
    }
    fn index(self) -> usize {
        self as usize
    }
    /// 'w' / 'b'.
    pub fn letter(self) -> char {
        match self {
            Side::W => 'w',
            Side::B => 'b',
        }
    }
}

/// A piece type (chess.js `PieceSymbol`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Kind {
    /// 'p'.
    P,
    /// 'n'.
    N,
    /// 'b'.
    B,
    /// 'r'.
    R,
    /// 'q'.
    Q,
    /// 'k'.
    K,
}

impl Kind {
    /// The lowercase letter.
    pub fn letter(self) -> char {
        match self {
            Kind::P => 'p',
            Kind::N => 'n',
            Kind::B => 'b',
            Kind::R => 'r',
            Kind::Q => 'q',
            Kind::K => 'k',
        }
    }
    /// From a lowercase letter.
    pub fn from_letter(c: char) -> Option<Kind> {
        Some(match c {
            'p' => Kind::P,
            'n' => Kind::N,
            'b' => Kind::B,
            'r' => Kind::R,
            'q' => Kind::Q,
            'k' => Kind::K,
            _ => return None,
        })
    }
    fn mask(self) -> u8 {
        match self {
            Kind::P => 0x1,
            Kind::N => 0x2,
            Kind::B => 0x4,
            Kind::R => 0x8,
            Kind::Q => 0x10,
            Kind::K => 0x20,
        }
    }
    fn offsets(self) -> &'static [i32] {
        match self {
            Kind::N => &[-18, -33, -31, -14, 18, 33, 31, 14],
            Kind::B => &[-17, -15, 17, 15],
            Kind::R => &[-16, 1, 16, -1],
            _ => &[-17, -16, -15, 1, 17, 16, 15, -1],
        }
    }
    /// The sprite column (react-native-chessboard's sheet: p, n, b, r, q, k).
    pub fn column(self) -> usize {
        self as usize
    }
}

/// A piece on a square.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Piece {
    /// Its side.
    pub color: Side,
    /// Its type.
    pub kind: Kind,
}

/// BITS.
pub mod bits {
    /// NORMAL.
    pub const NORMAL: u8 = 1;
    /// CAPTURE.
    pub const CAPTURE: u8 = 2;
    /// BIG_PAWN.
    pub const BIG_PAWN: u8 = 4;
    /// EP_CAPTURE.
    pub const EP_CAPTURE: u8 = 8;
    /// PROMOTION.
    pub const PROMOTION: u8 = 16;
    /// KSIDE_CASTLE.
    pub const KSIDE_CASTLE: u8 = 32;
    /// QSIDE_CASTLE.
    pub const QSIDE_CASTLE: u8 = 64;
}

const EMPTY: i32 = -1;
const RANK_1: i32 = 7;
const RANK_2: i32 = 6;
const RANK_7: i32 = 1;
const RANK_8: i32 = 0;
const A8: i32 = 0;
const H1: i32 = 119;
const PROMOTIONS: [Kind; 4] = [Kind::N, Kind::B, Kind::R, Kind::Q];

#[rustfmt::skip]
const ATTACKS: [u8; 239] = [
  20, 0, 0, 0, 0, 0, 0, 24,  0, 0, 0, 0, 0, 0,20, 0,
   0,20, 0, 0, 0, 0, 0, 24,  0, 0, 0, 0, 0,20, 0, 0,
   0, 0,20, 0, 0, 0, 0, 24,  0, 0, 0, 0,20, 0, 0, 0,
   0, 0, 0,20, 0, 0, 0, 24,  0, 0, 0,20, 0, 0, 0, 0,
   0, 0, 0, 0,20, 0, 0, 24,  0, 0,20, 0, 0, 0, 0, 0,
   0, 0, 0, 0, 0,20, 2, 24,  2,20, 0, 0, 0, 0, 0, 0,
   0, 0, 0, 0, 0, 2,53, 56, 53, 2, 0, 0, 0, 0, 0, 0,
  24,24,24,24,24,24,56,  0, 56,24,24,24,24,24,24, 0,
   0, 0, 0, 0, 0, 2,53, 56, 53, 2, 0, 0, 0, 0, 0, 0,
   0, 0, 0, 0, 0,20, 2, 24,  2,20, 0, 0, 0, 0, 0, 0,
   0, 0, 0, 0,20, 0, 0, 24,  0, 0,20, 0, 0, 0, 0, 0,
   0, 0, 0,20, 0, 0, 0, 24,  0, 0, 0,20, 0, 0, 0, 0,
   0, 0,20, 0, 0, 0, 0, 24,  0, 0, 0, 0,20, 0, 0, 0,
   0,20, 0, 0, 0, 0, 0, 24,  0, 0, 0, 0, 0,20, 0, 0,
  20, 0, 0, 0, 0, 0, 0, 24,  0, 0, 0, 0, 0, 0,20
];

#[rustfmt::skip]
const RAYS: [i32; 239] = [
   17,  0,  0,  0,  0,  0,  0, 16,  0,  0,  0,  0,  0,  0, 15, 0,
    0, 17,  0,  0,  0,  0,  0, 16,  0,  0,  0,  0,  0, 15,  0, 0,
    0,  0, 17,  0,  0,  0,  0, 16,  0,  0,  0,  0, 15,  0,  0, 0,
    0,  0,  0, 17,  0,  0,  0, 16,  0,  0,  0, 15,  0,  0,  0, 0,
    0,  0,  0,  0, 17,  0,  0, 16,  0,  0, 15,  0,  0,  0,  0, 0,
    0,  0,  0,  0,  0, 17,  0, 16,  0, 15,  0,  0,  0,  0,  0, 0,
    0,  0,  0,  0,  0,  0, 17, 16, 15,  0,  0,  0,  0,  0,  0, 0,
    1,  1,  1,  1,  1,  1,  1,  0, -1, -1,  -1,-1, -1, -1, -1, 0,
    0,  0,  0,  0,  0,  0,-15,-16,-17,  0,  0,  0,  0,  0,  0, 0,
    0,  0,  0,  0,  0,-15,  0,-16,  0,-17,  0,  0,  0,  0,  0, 0,
    0,  0,  0,  0,-15,  0,  0,-16,  0,  0,-17,  0,  0,  0,  0, 0,
    0,  0,  0,-15,  0,  0,  0,-16,  0,  0,  0,-17,  0,  0,  0, 0,
    0,  0,-15,  0,  0,  0,  0,-16,  0,  0,  0,  0,-17,  0,  0, 0,
    0,-15,  0,  0,  0,  0,  0,-16,  0,  0,  0,  0,  0,-17,  0, 0,
  -15,  0,  0,  0,  0,  0,  0,-16,  0,  0,  0,  0,  0,  0,-17
];

fn rank(sq: i32) -> i32 {
    sq >> 4
}
fn file(sq: i32) -> i32 {
    sq & 0xf
}

/// A square's name ("e4") from its 0x88 index.
pub fn algebraic(sq: i32) -> String {
    let f = (b'a' + file(sq) as u8) as char;
    let r = (b'8' - rank(sq) as u8) as char;
    format!("{f}{r}")
}

/// The 0x88 index of "e4".
pub fn square(name: &str) -> Option<i32> {
    let b = name.as_bytes();
    if b.len() != 2 || !(b'a'..=b'h').contains(&b[0]) || !(b'1'..=b'8').contains(&b[1]) {
        return None;
    }
    Some((7 - (b[1] - b'1') as i32) * 16 + (b[0] - b'a') as i32)
}

/// The 0x88 index of (file, row from the top).
pub fn at(file: usize, row: usize) -> i32 {
    (row * 16 + file) as i32
}

fn pawn_offsets(c: Side) -> [i32; 4] {
    match c {
        Side::B => [16, 32, 17, 15],
        Side::W => [-16, -32, -17, -15],
    }
}

fn second_rank(c: Side) -> i32 {
    match c {
        Side::B => RANK_7,
        Side::W => RANK_2,
    }
}

fn rooks(c: Side) -> [(i32, u8); 2] {
    match c {
        Side::W => [(112, bits::QSIDE_CASTLE), (119, bits::KSIDE_CASTLE)],
        Side::B => [(0, bits::QSIDE_CASTLE), (7, bits::KSIDE_CASTLE)],
    }
}

/// chess.js `InternalMove`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InternalMove {
    /// The mover.
    pub color: Side,
    /// 0x88 from.
    pub from: i32,
    /// 0x88 to.
    pub to: i32,
    /// The moving piece's type.
    pub piece: Kind,
    /// What it takes.
    pub captured: Option<Kind>,
    /// What it becomes.
    pub promotion: Option<Kind>,
    /// BITS.
    pub flags: u8,
}

/// chess.js `Move` (the fields the board and the demo read).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Move {
    /// The mover.
    pub color: Side,
    /// The moving piece's type.
    pub piece: Kind,
    /// "e2".
    pub from: String,
    /// "e4".
    pub to: String,
    /// What it took.
    pub captured: Option<Kind>,
    /// What it became.
    pub promotion: Option<Kind>,
    /// FLAGS letters ("n", "c", "b", "e", "p", "k", "q").
    pub flags: String,
    /// Standard algebraic notation.
    pub san: String,
}

#[derive(Clone, Debug)]
struct History {
    mv: InternalMove,
    kings: [i32; 2],
    turn: Side,
    castling: [u8; 2],
    ep: i32,
    half_moves: u32,
    move_number: u32,
}

/// The game (chess.js `Chess`).
#[derive(Clone, Debug)]
pub struct Chess {
    board: [Option<Piece>; 128],
    turn: Side,
    kings: [i32; 2],
    ep: i32,
    half_moves: u32,
    move_number: u32,
    history: Vec<History>,
    played: Vec<Move>,
    castling: [u8; 2],
    positions: HashMap<String, u32>,
}

/// The standard start.
pub const DEFAULT_POSITION: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

fn add_move(moves: &mut Vec<InternalMove>, color: Side, from: i32, to: i32, piece: Kind, captured: Option<Kind>, flags: u8) {
    let r = rank(to);
    if piece == Kind::P && (r == RANK_1 || r == RANK_8) {
        for promotion in PROMOTIONS {
            moves.push(InternalMove { color, from, to, piece, captured, promotion: Some(promotion), flags: flags | bits::PROMOTION });
        }
    } else {
        moves.push(InternalMove { color, from, to, piece, captured, promotion: None, flags });
    }
}

fn disambiguator(mv: &InternalMove, moves: &[InternalMove]) -> String {
    let (mut ambiguities, mut same_rank, mut same_file) = (0, 0, 0);
    for m in moves {
        if mv.piece == m.piece && mv.from != m.from && mv.to == m.to {
            ambiguities += 1;
            if rank(mv.from) == rank(m.from) {
                same_rank += 1;
            }
            if file(mv.from) == file(m.from) {
                same_file += 1;
            }
        }
    }
    if ambiguities == 0 {
        return String::new();
    }
    let a = algebraic(mv.from);
    if same_rank > 0 && same_file > 0 {
        a
    } else if same_file > 0 {
        a[1..2].to_string()
    } else {
        a[0..1].to_string()
    }
}

impl Chess {
    /// `new Chess(fen)`.
    pub fn new(fen: &str) -> Option<Chess> {
        let mut c = Chess {
            board: [None; 128],
            turn: Side::W,
            kings: [EMPTY; 2],
            ep: EMPTY,
            half_moves: 0,
            move_number: 1,
            history: Vec::new(),
            played: Vec::new(),
            castling: [0; 2],
            positions: HashMap::new(),
        };
        c.load(fen).then_some(c)
    }

    fn clear(&mut self) {
        self.board = [None; 128];
        self.kings = [EMPTY; 2];
        self.turn = Side::W;
        self.castling = [0; 2];
        self.ep = EMPTY;
        self.half_moves = 0;
        self.move_number = 1;
        self.history.clear();
        self.played.clear();
        self.positions.clear();
    }

    /// `load(fen)`: false (the game untouched) for a FEN it can't read.
    pub fn load(&mut self, fen: &str) -> bool {
        let mut tokens: Vec<&str> = fen.split_whitespace().collect();
        if tokens.len() >= 2 && tokens.len() < 6 {
            let adjustments = ["-", "-", "0", "1"];
            let missing = 6 - tokens.len();
            tokens.extend_from_slice(&adjustments[4 - missing..]);
        }
        if tokens.len() != 6 || !valid_shape(&tokens) {
            return false;
        }
        self.clear();
        let mut sq = 0i32;
        for ch in tokens[0].chars() {
            if ch == '/' {
                sq += 8;
            } else if let Some(d) = ch.to_digit(10) {
                sq += d as i32;
            } else {
                let color = if ch < 'a' { Side::W } else { Side::B };
                let kind = Kind::from_letter(ch.to_ascii_lowercase()).unwrap();
                self.put(Piece { color, kind }, sq);
                sq += 1;
            }
        }
        self.turn = if tokens[1] == "w" { Side::W } else { Side::B };
        let c = tokens[2];
        if c.contains('K') {
            self.castling[0] |= bits::KSIDE_CASTLE;
        }
        if c.contains('Q') {
            self.castling[0] |= bits::QSIDE_CASTLE;
        }
        if c.contains('k') {
            self.castling[1] |= bits::KSIDE_CASTLE;
        }
        if c.contains('q') {
            self.castling[1] |= bits::QSIDE_CASTLE;
        }
        self.ep = if tokens[3] == "-" { EMPTY } else { square(tokens[3]).unwrap_or(EMPTY) };
        self.half_moves = tokens[4].parse().unwrap_or(0);
        self.move_number = tokens[5].parse().unwrap_or(1);
        self.inc_position_count();
        true
    }

    /// `reset()`.
    pub fn reset(&mut self) {
        self.load(DEFAULT_POSITION);
    }

    fn put(&mut self, piece: Piece, sq: i32) {
        if piece.kind == Kind::K {
            let k = self.kings[piece.color.index()];
            if k != EMPTY && k != sq {
                return;
            }
            self.kings[piece.color.index()] = sq;
        }
        self.board[sq as usize] = Some(piece);
    }

    /// `get(square)`.
    pub fn get(&self, sq: i32) -> Option<Piece> {
        self.board[sq as usize]
    }

    /// `turn()`.
    pub fn turn(&self) -> Side {
        self.turn
    }

    /// `board()`: rows from rank 8.
    pub fn board(&self) -> [[Option<Piece>; 8]; 8] {
        let mut out = [[None; 8]; 8];
        for (r, row) in out.iter_mut().enumerate() {
            for (f, cell) in row.iter_mut().enumerate() {
                *cell = self.board[r * 16 + f];
            }
        }
        out
    }

    /// `fen()`.
    pub fn fen(&mut self) -> String {
        let mut out = String::new();
        let mut empty = 0;
        let mut i = A8;
        while i <= H1 {
            if let Some(p) = self.board[i as usize] {
                if empty > 0 {
                    out.push_str(&empty.to_string());
                    empty = 0;
                }
                out.push(if p.color == Side::W { p.kind.letter().to_ascii_uppercase() } else { p.kind.letter() });
            } else {
                empty += 1;
            }
            if (i + 1) & 0x88 != 0 {
                if empty > 0 {
                    out.push_str(&empty.to_string());
                }
                if i != H1 {
                    out.push('/');
                }
                empty = 0;
                i += 8;
            }
            i += 1;
        }
        let mut castling = String::new();
        if self.castling[0] & bits::KSIDE_CASTLE != 0 {
            castling.push('K');
        }
        if self.castling[0] & bits::QSIDE_CASTLE != 0 {
            castling.push('Q');
        }
        if self.castling[1] & bits::KSIDE_CASTLE != 0 {
            castling.push('k');
        }
        if self.castling[1] & bits::QSIDE_CASTLE != 0 {
            castling.push('q');
        }
        if castling.is_empty() {
            castling.push('-');
        }
        let ep = self.printed_ep().map_or("-".to_string(), algebraic);
        format!("{out} {} {castling} {ep} {} {}", self.turn.letter(), self.half_moves, self.move_number)
    }

    /// The en-passant square `fen()` prints: only when a pawn of the side to move can take there
    /// without leaving its king attacked.
    fn printed_ep(&mut self) -> Option<i32> {
        if self.ep == EMPTY {
            return None;
        }
        let big = self.ep + if self.turn == Side::W { 16 } else { -16 };
        for sq in [big + 1, big - 1] {
            if sq & 0x88 != 0 {
                continue;
            }
            let color = self.turn;
            if self.board[sq as usize] == Some(Piece { color, kind: Kind::P }) {
                self.make_move(InternalMove { color, from: sq, to: self.ep, piece: Kind::P, captured: Some(Kind::P), promotion: None, flags: bits::EP_CAPTURE });
                let legal = !self.king_attacked(color);
                self.undo_move();
                if legal {
                    return Some(self.ep);
                }
            }
        }
        None
    }

    fn position_key(&self) -> String {
        let mut k: Vec<u8> = Vec::with_capacity(72);
        for i in 0..128 {
            if i & 0x88 == 0 {
                k.push(match self.board[i] {
                    None => b'.',
                    Some(p) => {
                        let c = p.kind.letter() as u8;
                        if p.color == Side::W {
                            c.to_ascii_uppercase()
                        } else {
                            c
                        }
                    }
                });
            }
        }
        format!("{} {} {} {} {}", String::from_utf8(k).unwrap(), self.turn.letter(), self.castling[0], self.castling[1], self.ep)
    }

    fn inc_position_count(&mut self) {
        *self.positions.entry(self.position_key()).or_insert(0) += 1;
    }

    fn attacked(&self, color: Side, sq: i32) -> bool {
        let mut i = A8;
        while i <= H1 {
            if i & 0x88 != 0 {
                i += 8;
                continue;
            }
            let Some(piece) = self.board[i as usize].filter(|p| p.color == color) else {
                i += 1;
                continue;
            };
            let difference = i - sq;
            if difference == 0 {
                i += 1;
                continue;
            }
            let index = (difference + 119) as usize;
            if ATTACKS[index] & piece.kind.mask() != 0 {
                if piece.kind == Kind::P {
                    if (difference > 0 && piece.color == Side::W) || (difference <= 0 && piece.color == Side::B) {
                        return true;
                    }
                    i += 1;
                    continue;
                }
                if piece.kind == Kind::N || piece.kind == Kind::K {
                    return true;
                }
                let offset = RAYS[index];
                let mut j = i + offset;
                let mut blocked = false;
                while j != sq {
                    if self.board[j as usize].is_some() {
                        blocked = true;
                        break;
                    }
                    j += offset;
                }
                if !blocked {
                    return true;
                }
            }
            i += 1;
        }
        false
    }

    fn king_attacked(&self, color: Side) -> bool {
        let sq = self.kings[color.index()];
        sq != EMPTY && self.attacked(color.other(), sq)
    }

    /// `isAttacked(square, by)`.
    pub fn is_attacked(&self, sq: i32, by: Side) -> bool {
        self.attacked(by, sq)
    }

    /// `isCheck()`.
    pub fn is_check(&self) -> bool {
        self.king_attacked(self.turn)
    }

    /// `isCheckmate()`.
    pub fn is_checkmate(&mut self) -> bool {
        self.is_check() && self.moves_internal(true, None).is_empty()
    }

    /// `isStalemate()`.
    pub fn is_stalemate(&mut self) -> bool {
        !self.is_check() && self.moves_internal(true, None).is_empty()
    }

    /// `isInsufficientMaterial()`.
    pub fn is_insufficient_material(&self) -> bool {
        let mut pieces = [0u32; 6];
        let mut bishops = Vec::new();
        let mut count = 0;
        let mut color = 0;
        let mut i = A8;
        while i <= H1 {
            color = (color + 1) % 2;
            if i & 0x88 != 0 {
                i += 8;
                continue;
            }
            if let Some(p) = self.board[i as usize] {
                pieces[p.kind as usize] += 1;
                if p.kind == Kind::B {
                    bishops.push(color);
                }
                count += 1;
            }
            i += 1;
        }
        if count == 2 {
            return true;
        }
        if count == 3 && (pieces[Kind::B as usize] == 1 || pieces[Kind::N as usize] == 1) {
            return true;
        }
        if count == pieces[Kind::B as usize] + 2 {
            let sum: u32 = bishops.iter().sum();
            if sum == 0 || sum as usize == bishops.len() {
                return true;
            }
        }
        false
    }

    /// `isThreefoldRepetition()`.
    pub fn is_threefold_repetition(&self) -> bool {
        self.positions.get(&self.position_key()).copied().unwrap_or(0) >= 3
    }

    /// `isDrawByFiftyMoves()`.
    pub fn is_draw_by_fifty_moves(&self) -> bool {
        self.half_moves >= 100
    }

    /// `isDraw()`.
    pub fn is_draw(&mut self) -> bool {
        self.is_draw_by_fifty_moves() || self.is_stalemate() || self.is_insufficient_material() || self.is_threefold_repetition()
    }

    /// `isGameOver()`.
    pub fn is_game_over(&mut self) -> bool {
        self.is_checkmate() || self.is_draw()
    }

    /// `_moves({ legal, square })`.
    pub fn moves_internal(&mut self, legal: bool, for_square: Option<i32>) -> Vec<InternalMove> {
        let mut moves = Vec::new();
        let us = self.turn;
        let them = us.other();
        let (first, last, single) = match for_square {
            Some(sq) => (sq, sq, true),
            None => (A8, H1, false),
        };
        let mut from = first;
        while from <= last {
            if from & 0x88 != 0 {
                from += 8;
                continue;
            }
            let Some(p) = self.board[from as usize].filter(|p| p.color == us) else {
                from += 1;
                continue;
            };
            if p.kind == Kind::P {
                let off = pawn_offsets(us);
                let mut to = from + off[0];
                if self.board[to as usize].is_none() {
                    add_move(&mut moves, us, from, to, Kind::P, None, bits::NORMAL);
                    to = from + off[1];
                    if second_rank(us) == rank(from) && self.board[to as usize].is_none() {
                        add_move(&mut moves, us, from, to, Kind::P, None, bits::BIG_PAWN);
                    }
                }
                for &o in &off[2..4] {
                    let to = from + o;
                    if to & 0x88 != 0 {
                        continue;
                    }
                    if let Some(t) = self.board[to as usize].filter(|t| t.color == them) {
                        add_move(&mut moves, us, from, to, Kind::P, Some(t.kind), bits::CAPTURE);
                    } else if to == self.ep {
                        add_move(&mut moves, us, from, to, Kind::P, Some(Kind::P), bits::EP_CAPTURE);
                    }
                }
            } else {
                for &offset in p.kind.offsets() {
                    let mut to = from;
                    loop {
                        to += offset;
                        if to & 0x88 != 0 {
                            break;
                        }
                        match self.board[to as usize] {
                            None => add_move(&mut moves, us, from, to, p.kind, None, bits::NORMAL),
                            Some(t) => {
                                if t.color == us {
                                    break;
                                }
                                add_move(&mut moves, us, from, to, p.kind, Some(t.kind), bits::CAPTURE);
                                break;
                            }
                        }
                        if p.kind == Kind::N || p.kind == Kind::K {
                            break;
                        }
                    }
                }
            }
            from += 1;
        }
        let king = self.kings[us.index()];
        if !single || last == king {
            if self.castling[us.index()] & bits::KSIDE_CASTLE != 0 {
                let (cf, ct) = (king, king + 2);
                if self.board[(cf + 1) as usize].is_none() && self.board[ct as usize].is_none() && !self.attacked(them, king) && !self.attacked(them, cf + 1) && !self.attacked(them, ct) {
                    add_move(&mut moves, us, king, ct, Kind::K, None, bits::KSIDE_CASTLE);
                }
            }
            if self.castling[us.index()] & bits::QSIDE_CASTLE != 0 {
                let (cf, ct) = (king, king - 2);
                if self.board[(cf - 1) as usize].is_none()
                    && self.board[(cf - 2) as usize].is_none()
                    && self.board[(cf - 3) as usize].is_none()
                    && !self.attacked(them, king)
                    && !self.attacked(them, cf - 1)
                    && !self.attacked(them, ct)
                {
                    add_move(&mut moves, us, king, ct, Kind::K, None, bits::QSIDE_CASTLE);
                }
            }
        }
        if !legal || king == EMPTY {
            return moves;
        }
        let mut out = Vec::with_capacity(moves.len());
        for m in moves {
            self.make_move(m);
            if !self.king_attacked(us) {
                out.push(m);
            }
            self.undo_move();
        }
        out
    }

    /// `moves({ square, verbose: true })`, the targets only (what `selectPiece` keeps).
    pub fn targets(&mut self, sq: i32) -> Vec<i32> {
        self.moves_internal(true, Some(sq)).iter().map(|m| m.to).collect()
    }

    /// `move({ from, to, promotion })`: `None` where chess.js throws.
    pub fn play(&mut self, from: i32, to: i32, promotion: Option<Kind>) -> Option<Move> {
        let moves = self.moves_internal(true, None);
        let mv = *moves.iter().find(|m| m.from == from && m.to == to && (m.promotion.is_none() || promotion == m.promotion))?;
        let pretty = self.pretty(&mv, &moves);
        self.make_move(mv);
        self.inc_position_count();
        self.played.push(pretty.clone());
        Some(pretty)
    }

    fn pretty(&mut self, mv: &InternalMove, legal: &[InternalMove]) -> Move {
        const NAMES: [(u8, char); 7] =
            [(bits::NORMAL, 'n'), (bits::CAPTURE, 'c'), (bits::BIG_PAWN, 'b'), (bits::EP_CAPTURE, 'e'), (bits::PROMOTION, 'p'), (bits::KSIDE_CASTLE, 'k'), (bits::QSIDE_CASTLE, 'q')];
        let flags = NAMES.iter().filter(|(b, _)| mv.flags & b != 0).map(|(_, c)| *c).collect();
        Move { color: mv.color, piece: mv.piece, from: algebraic(mv.from), to: algebraic(mv.to), captured: mv.captured, promotion: mv.promotion, flags, san: self.move_to_san(mv, legal) }
    }

    fn move_to_san(&mut self, mv: &InternalMove, legal: &[InternalMove]) -> String {
        let mut out = String::new();
        if mv.flags & bits::KSIDE_CASTLE != 0 {
            out.push_str("O-O");
        } else if mv.flags & bits::QSIDE_CASTLE != 0 {
            out.push_str("O-O-O");
        } else {
            if mv.piece != Kind::P {
                out.push(mv.piece.letter().to_ascii_uppercase());
                out.push_str(&disambiguator(mv, legal));
            }
            if mv.flags & (bits::CAPTURE | bits::EP_CAPTURE) != 0 {
                if mv.piece == Kind::P {
                    out.push_str(&algebraic(mv.from)[0..1]);
                }
                out.push('x');
            }
            out.push_str(&algebraic(mv.to));
            if let Some(p) = mv.promotion {
                out.push('=');
                out.push(p.letter().to_ascii_uppercase());
            }
        }
        self.make_move(*mv);
        if self.is_check() {
            out.push(if self.is_checkmate() { '#' } else { '+' });
        }
        self.undo_move();
        out
    }

    /// `history({ verbose: true })`.
    pub fn history(&self) -> &[Move] {
        &self.played
    }

    fn make_move(&mut self, mv: InternalMove) {
        let us = self.turn;
        let them = us.other();
        self.history.push(History { mv, kings: self.kings, turn: self.turn, castling: self.castling, ep: self.ep, half_moves: self.half_moves, move_number: self.move_number });
        self.board[mv.to as usize] = self.board[mv.from as usize].take();
        if mv.flags & bits::EP_CAPTURE != 0 {
            let at = if self.turn == Side::B { mv.to - 16 } else { mv.to + 16 };
            self.board[at as usize] = None;
        }
        if let Some(p) = mv.promotion {
            self.board[mv.to as usize] = Some(Piece { color: us, kind: p });
        }
        if self.board[mv.to as usize].map(|p| p.kind) == Some(Kind::K) {
            self.kings[us.index()] = mv.to;
            if mv.flags & bits::KSIDE_CASTLE != 0 {
                self.board[(mv.to - 1) as usize] = self.board[(mv.to + 1) as usize].take();
            } else if mv.flags & bits::QSIDE_CASTLE != 0 {
                self.board[(mv.to + 1) as usize] = self.board[(mv.to - 2) as usize].take();
            }
            self.castling[us.index()] = 0;
        }
        if self.castling[us.index()] != 0 {
            for (sq, flag) in rooks(us) {
                if mv.from == sq && self.castling[us.index()] & flag != 0 {
                    self.castling[us.index()] ^= flag;
                    break;
                }
            }
        }
        if self.castling[them.index()] != 0 {
            for (sq, flag) in rooks(them) {
                if mv.to == sq && self.castling[them.index()] & flag != 0 {
                    self.castling[them.index()] ^= flag;
                    break;
                }
            }
        }
        if mv.flags & bits::BIG_PAWN != 0 {
            let ep = if us == Side::B { mv.to - 16 } else { mv.to + 16 };
            let pawn = Some(Piece { color: them, kind: Kind::P });
            let beside = |d: i32| (mv.to + d) & 0x88 == 0 && self.board[(mv.to + d) as usize] == pawn;
            self.ep = if beside(-1) || beside(1) { ep } else { EMPTY };
        } else {
            self.ep = EMPTY;
        }
        if mv.piece == Kind::P || mv.flags & (bits::CAPTURE | bits::EP_CAPTURE) != 0 {
            self.half_moves = 0;
        } else {
            self.half_moves += 1;
        }
        if us == Side::B {
            self.move_number += 1;
        }
        self.turn = them;
    }

    fn undo_move(&mut self) -> Option<InternalMove> {
        let old = self.history.pop()?;
        let mv = old.mv;
        self.kings = old.kings;
        self.turn = old.turn;
        self.castling = old.castling;
        self.ep = old.ep;
        self.half_moves = old.half_moves;
        self.move_number = old.move_number;
        let us = self.turn;
        let them = us.other();
        self.board[mv.from as usize] = self.board[mv.to as usize].take();
        self.board[mv.from as usize] = Some(Piece { color: us, kind: mv.piece });
        if let Some(c) = mv.captured {
            if mv.flags & bits::EP_CAPTURE != 0 {
                let at = if us == Side::B { mv.to - 16 } else { mv.to + 16 };
                self.board[at as usize] = Some(Piece { color: them, kind: Kind::P });
            } else {
                self.board[mv.to as usize] = Some(Piece { color: them, kind: c });
            }
        }
        if mv.flags & (bits::KSIDE_CASTLE | bits::QSIDE_CASTLE) != 0 {
            let (to, from) = if mv.flags & bits::KSIDE_CASTLE != 0 { (mv.to + 1, mv.to - 1) } else { (mv.to - 2, mv.to + 1) };
            self.board[to as usize] = self.board[from as usize].take();
        }
        Some(mv)
    }

    /// `undo()`.
    pub fn undo(&mut self) -> Option<Move> {
        let key = self.position_key();
        let mv = self.undo_move()?;
        let legal = self.moves_internal(true, None);
        let pretty = self.pretty(&mv, &legal);
        if let Some(n) = self.positions.get_mut(&key) {
            *n -= 1;
            if *n == 0 {
                self.positions.remove(&key);
            }
        }
        self.played.pop();
        Some(pretty)
    }

    /// `perft(depth)`.
    pub fn perft(&mut self, depth: u32) -> u64 {
        let moves = self.moves_internal(false, None);
        let color = self.turn;
        let mut nodes = 0;
        for m in moves {
            self.make_move(m);
            if !self.king_attacked(color) {
                nodes += if depth > 1 { self.perft(depth - 1) } else { 1 };
            }
            self.undo_move();
        }
        nodes
    }

    /// findKingSquare(chess, color).
    pub fn king(&self, color: Side) -> Option<i32> {
        (0..128).find(|&i| i & 0x88 == 0 && self.board[i as usize] == Some(Piece { color, kind: Kind::K }))
    }
}

/// The shape checks of validateFen that `load` relies on (six fields, eight ranks of eight).
fn valid_shape(tokens: &[&str]) -> bool {
    let rows: Vec<&str> = tokens[0].split('/').collect();
    if rows.len() != 8 {
        return false;
    }
    for row in rows {
        let mut n = 0;
        for c in row.chars() {
            if let Some(d) = c.to_digit(10) {
                n += d;
            } else if Kind::from_letter(c.to_ascii_lowercase()).is_some() {
                n += 1;
            } else {
                return false;
            }
        }
        if n != 8 {
            return false;
        }
    }
    (tokens[1] == "w" || tokens[1] == "b")
        && tokens[2].chars().all(|c| "KQkq-".contains(c))
        && (tokens[3] == "-" || square(tokens[3]).is_some())
        && tokens[4].parse::<u32>().is_ok()
        && tokens[5].parse::<u32>().is_ok_and(|n| n >= 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sq(s: &str) -> i32 {
        square(s).unwrap()
    }

    // The positions and counts of chess.js's own perft tests (__tests__/perft.test.ts) and the
    // Chess Programming Wiki's.
    #[test]
    fn perft_counts() {
        let cases: [(&str, u32, u64); 6] = [
            (DEFAULT_POSITION, 4, 197_281),
            ("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 3, 97_862),
            ("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 4, 43_238),
            ("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 3, 9_467),
            ("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 3, 62_379),
            ("r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 3, 89_890),
        ];
        for (fen, depth, nodes) in cases {
            assert_eq!(Chess::new(fen).unwrap().perft(depth), nodes, "{fen}");
        }
    }

    #[test]
    fn the_demo_opens_one_move_from_mate() {
        // START_FEN: 18. Kd2# is White's own king stepping aside (REPLAY_MOVES, REVIEW_MOVES).
        let mut c = Chess::new(crate::chessboard::START_FEN).unwrap();
        assert_eq!(c.fen(), crate::chessboard::START_FEN);
        assert!(!c.is_check());
        let m = c.play(sq("e1"), sq("d2"), None).unwrap();
        assert_eq!(m.san, "Kd2#");
        assert_eq!(m.flags, "n");
        assert!(c.is_checkmate() && !c.is_stalemate());
        assert_eq!(c.turn(), Side::B);
        assert_eq!(c.king(Side::B), Some(sq("g1")));
        // O-O-O is legal there too (the Q right): the rook rides along.
        let mut c = Chess::new(crate::chessboard::START_FEN).unwrap();
        let m = c.play(sq("e1"), sq("c1"), None).unwrap();
        assert_eq!((m.san.as_str(), m.flags.as_str()), ("O-O-O#", "q"));
        assert_eq!(c.get(sq("d1")), Some(Piece { color: Side::W, kind: Kind::R }));
        assert_eq!(c.get(sq("a1")), None);
    }

    #[test]
    fn en_passant_promotion_stalemate_and_san() {
        // En passant: the double push sets the square only with a pawn beside it.
        let mut c = Chess::new("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1").unwrap();
        c.play(sq("e2"), sq("e4"), None).unwrap();
        assert_eq!(c.fen(), "4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1");
        let m = c.play(sq("d4"), sq("e3"), None).unwrap();
        assert_eq!((m.san.as_str(), m.flags.as_str(), m.captured), ("dxe3", "e", Some(Kind::P)));
        assert_eq!(c.get(sq("e4")), None);
        let mut c = Chess::new("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1").unwrap();
        c.play(sq("e2"), sq("e4"), None).unwrap();
        assert!(c.fen().contains(" b - - "));
        // Promotion: four moves to one square, the piece chosen; none without one.
        let mut c = Chess::new("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1").unwrap();
        assert_eq!(c.moves_internal(true, Some(sq("e7"))).len(), 4);
        let m = c.play(sq("e7"), sq("e8"), Some(Kind::N)).unwrap();
        assert_eq!((m.san.as_str(), m.flags.as_str()), ("e8=N+", "np"));
        let mut c = Chess::new("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1").unwrap();
        // A move to the last rank names its piece or is no move (chess.js throws).
        assert!(c.play(sq("e7"), sq("e8"), None).is_none());
        // Stalemate.
        let mut c = Chess::new("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").unwrap();
        assert!(c.is_stalemate() && !c.is_checkmate() && c.is_draw());
        // Disambiguation.
        let mut c = Chess::new("4k3/8/8/8/8/8/8/R4RK1 w - - 0 1").unwrap();
        assert_eq!(c.play(sq("a1"), sq("d1"), None).unwrap().san, "Rad1");
        // Illegal: into check, or not this side's turn.
        let mut c = Chess::new(crate::chessboard::START_FEN).unwrap();
        assert!(c.play(sq("e1"), sq("f1"), None).is_none());
        assert!(c.play(sq("g1"), sq("h1"), None).is_none());
        // Insufficient material and the fifty-move rule.
        assert!(Chess::new("8/8/8/8/8/8/8/K1k5 w - - 0 1").unwrap().is_insufficient_material());
        assert!(Chess::new("8/8/8/8/8/8/1N6/K1k5 w - - 0 1").unwrap().is_insufficient_material());
        assert!(Chess::new("8/8/8/8/8/8/8/K1k5 w - - 100 80").unwrap().is_draw_by_fifty_moves());
    }

    #[test]
    fn threefold_repetition_and_undo() {
        let mut c = Chess::new(DEFAULT_POSITION).unwrap();
        for _ in 0..2 {
            for (a, b) in [("g1", "f3"), ("g8", "f6"), ("f3", "g1"), ("f6", "g8")] {
                c.play(sq(a), sq(b), None).unwrap();
            }
        }
        assert!(c.is_threefold_repetition());
        c.undo().unwrap();
        assert!(!c.is_threefold_repetition());
        assert_eq!(c.history().len(), 7);
    }

    #[test]
    fn a_full_game_replays_to_the_reviewed_mate() {
        // Lasker–Thomas, London 1912: REVIEW_MOVES' SANs, played from the start.
        let mut c = Chess::new(DEFAULT_POSITION).unwrap();
        let game = [
            ("d2", "d4"),
            ("e7", "e6"),
            ("g1", "f3"),
            ("f7", "f5"),
            ("b1", "c3"),
            ("g8", "f6"),
            ("c1", "g5"),
            ("f8", "e7"),
            ("g5", "f6"),
            ("e7", "f6"),
            ("e2", "e4"),
            ("f5", "e4"),
            ("c3", "e4"),
            ("b7", "b6"),
            ("f3", "e5"),
            ("e8", "g8"),
            ("f1", "d3"),
            ("c8", "b7"),
            ("d1", "h5"),
            ("d8", "e7"),
            ("h5", "h7"),
            ("g8", "h7"),
            ("e4", "f6"),
            ("h7", "h6"),
            ("e5", "g4"),
            ("h6", "g5"),
            ("h2", "h4"),
            ("g5", "f4"),
            ("g2", "g3"),
            ("f4", "f3"),
            ("d3", "e2"),
            ("f3", "g2"),
            ("h1", "h2"),
            ("g2", "g1"),
        ];
        for (a, b) in game {
            c.play(sq(a), sq(b), None).unwrap_or_else(|| panic!("{a}{b}"));
        }
        let sans: Vec<&str> = c.history().iter().map(|m| m.san.as_str()).collect();
        assert_eq!(sans.join(" "), "d4 e6 Nf3 f5 Nc3 Nf6 Bg5 Be7 Bxf6 Bxf6 e4 fxe4 Nxe4 b6 Ne5 O-O Bd3 Bb7 Qh5 Qe7 Qxh7+ Kxh7 Nxf6+ Kh6 Neg4+ Kg5 h4+ Kf4 g3+ Kf3 Be2+ Kg2 Rh2+ Kg1");
        // The board is START_FEN's (its clocks aside).
        assert_eq!(c.fen().split(' ').take(3).collect::<Vec<_>>(), crate::chessboard::START_FEN.split(' ').take(3).collect::<Vec<_>>());
        assert_eq!(c.play(sq("e1"), sq("d2"), None).unwrap().san, "Kd2#");
    }
}
