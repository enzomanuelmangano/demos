//! QR codes as the RN demos make them: node-qrcode 1.5.4's `QRCode.create(text, {
//! errorCorrectionLevel })` line for line (node_modules/qrcode/lib/core), react-native-qrcode-skia
//! 0.3.1's `transformMatrixIntoPath` (its default rounded modules), and Skia m157's
//! `SkDiscretePathEffect` over that path (SkContourMeasure in float, its LCGRandom), for the
//! qrcode, empty-qrcode, notion-qrcode and cherry-blossom-qrcode surfaces.
//!
//! The encoder keeps every quirk that picks the matrix: the regex split into numeric /
//! alphanumeric / byte runs (Kanji mode is off: no `toSJISFunc`), the version estimated from
//! that raw split, dijkstrajs 1.0.3's shortest path over the segment graph (its stably sorted
//! queue, strict relaxations, and `buildGraph`'s shared `lastCount`), the minimum version for
//! the merged segments, the padding, Reed–Solomon blocks and interleave, and the mask with the
//! lowest N1–N4 penalty (first on a tie). `exact/parity-tools/qr-matrix.ts` runs the real
//! library over a corpus; the test below compares every module of every one.

use skia::{point, Point};

/// An error-correction level (its format-info bits, as node-qrcode's `ECLevel`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ecl {
    /// 7 %.
    L,
    /// 15 % (node-qrcode's default).
    M,
    /// 25 %.
    Q,
    /// 30 % (react-native-qrcode-skia's default).
    H,
}

impl Ecl {
    fn bit(self) -> u32 {
        match self {
            Ecl::L => 1,
            Ecl::M => 0,
            Ecl::Q => 3,
            Ecl::H => 2,
        }
    }
    fn column(self) -> usize {
        match self {
            Ecl::L => 0,
            Ecl::M => 1,
            Ecl::Q => 2,
            Ecl::H => 3,
        }
    }
}

/// `QRCode.create(...)`'s symbol: `modules.data` row-major (1 dark), its size, version and mask.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Symbol {
    /// Modules per side (version × 4 + 17).
    pub size: usize,
    /// `modules.data`: row `i`, column `j` at `i * size + j`.
    pub data: Vec<u8>,
    /// The version (1–40).
    pub version: u32,
    /// The mask pattern (0–7).
    pub mask: u32,
}

impl Symbol {
    /// `modules.get(row, col) === 1`.
    pub fn dark(&self, row: usize, col: usize) -> bool {
        self.data[row * self.size + col] == 1
    }
}

// ─── mode.js ────────────────────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Mode {
    Numeric,
    Alphanumeric,
    Byte,
}

impl Mode {
    fn bit(self) -> u32 {
        match self {
            Mode::Numeric => 1,
            Mode::Alphanumeric => 2,
            Mode::Byte => 4,
        }
    }
    fn cc_bits(self) -> [u32; 3] {
        match self {
            Mode::Numeric => [10, 12, 14],
            Mode::Alphanumeric => [9, 11, 13],
            Mode::Byte => [8, 16, 16],
        }
    }
    /// `Mode.getCharCountIndicator`.
    fn char_count_indicator(self, version: u32) -> u32 {
        let b = self.cc_bits();
        if (1..10).contains(&version) {
            b[0]
        } else if version < 27 {
            b[1]
        } else {
            b[2]
        }
    }
    /// `getSegmentBitsLength` (the data classes' static `getBitsLength`).
    fn bits_length(self, length: u32) -> u32 {
        match self {
            Mode::Numeric => {
                10 * (length / 3)
                    + if length % 3 != 0 {
                        (length % 3) * 3 + 1
                    } else {
                        0
                    }
            }
            Mode::Alphanumeric => 11 * (length / 2) + 6 * (length % 2),
            Mode::Byte => length * 8,
        }
    }
}

const ALPHA_NUM_CHARS: &[u8; 45] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

fn is_alpha_only(c: char) -> bool {
    // regex.js `[A-Z $%*+\-./:]` (no digits).
    c.is_ascii_uppercase() || matches!(c, ' ' | '$' | '%' | '*' | '+' | '-' | '.' | '/' | ':')
}

// ─── segments.js ────────────────────────────────────────────────────────────────────────────

/// A segment as `getSegmentsFromString` / `buildNodes` keep it: the text, its mode and its
/// `length` (UTF-16 units for numeric/alphanumeric, which are ASCII; UTF-8 bytes for byte).
#[derive(Clone, Debug)]
struct Seg {
    data: String,
    mode: Mode,
    length: u32,
}

/// A data segment (`NumericData` / `AlphanumericData` / `ByteData`).
#[derive(Clone, Debug)]
struct Data {
    mode: Mode,
    data: String,
}

impl Data {
    /// `buildSingleSegment(data, mode)`: the mode as given (a hint that is always valid here).
    fn new(data: String, mode: Mode) -> Data {
        Data { mode, data }
    }
    /// `getLength()`: characters, or the UTF-8 bytes (`TextEncoder().encode`).
    fn length(&self) -> u32 {
        match self.mode {
            Mode::Byte => self.data.len() as u32,
            _ => self.data.chars().count() as u32,
        }
    }
    fn bits_length(&self) -> u32 {
        self.mode.bits_length(self.length())
    }
    fn write(&self, buf: &mut BitBuffer) {
        let bytes = self.data.as_bytes();
        match self.mode {
            Mode::Numeric => {
                let mut i = 0;
                while i + 3 <= bytes.len() {
                    buf.put(digits(&bytes[i..i + 3]), 10);
                    i += 3;
                }
                let rem = bytes.len() - i;
                if rem > 0 {
                    buf.put(digits(&bytes[i..]), rem as u32 * 3 + 1);
                }
            }
            Mode::Alphanumeric => {
                let idx = |b: u8| ALPHA_NUM_CHARS.iter().position(|&c| c == b).unwrap() as u32;
                let mut i = 0;
                while i + 2 <= bytes.len() {
                    buf.put(idx(bytes[i]) * 45 + idx(bytes[i + 1]), 11);
                    i += 2;
                }
                if bytes.len() % 2 == 1 {
                    buf.put(idx(bytes[i]), 6);
                }
            }
            Mode::Byte => {
                for &b in bytes {
                    buf.put(b as u32, 8);
                }
            }
        }
    }
}

fn digits(s: &[u8]) -> u32 {
    s.iter().fold(0, |v, d| v * 10 + (d - b'0') as u32)
}

/// `getSegmentsFromString`: the NUMERIC, ALPHANUMERIC and BYTE_KANJI regexes' matches, which
/// partition the string, in order of their index.
fn segments_from_string(s: &str) -> Vec<Seg> {
    let class = |c: char| {
        if c.is_ascii_digit() {
            Mode::Numeric
        } else if is_alpha_only(c) {
            Mode::Alphanumeric
        } else {
            Mode::Byte
        }
    };
    let mut out: Vec<Seg> = Vec::new();
    for c in s.chars() {
        let m = class(c);
        match out.last_mut() {
            Some(seg) if seg.mode == m => seg.data.push(c),
            _ => out.push(Seg {
                data: c.to_string(),
                mode: m,
                length: 0,
            }),
        }
    }
    for seg in &mut out {
        // `result[0].length`: UTF-16 units of the match.
        seg.length = seg.data.encode_utf16().count() as u32;
    }
    out
}

/// `Segments.fromString(data, version)`.
fn from_string(s: &str, version: u32) -> Vec<Data> {
    let segs = segments_from_string(s);
    // buildNodes
    let byte_len = |d: &str| d.len() as u32;
    let nodes: Vec<Vec<Seg>> = segs
        .iter()
        .map(|seg| match seg.mode {
            Mode::Numeric => vec![
                seg.clone(),
                Seg {
                    data: seg.data.clone(),
                    mode: Mode::Alphanumeric,
                    length: seg.length,
                },
                Seg {
                    data: seg.data.clone(),
                    mode: Mode::Byte,
                    length: seg.length,
                },
            ],
            Mode::Alphanumeric => vec![
                seg.clone(),
                Seg {
                    data: seg.data.clone(),
                    mode: Mode::Byte,
                    length: seg.length,
                },
            ],
            Mode::Byte => vec![Seg {
                data: seg.data.clone(),
                mode: Mode::Byte,
                length: byte_len(&seg.data),
            }],
        })
        .collect();
    // buildGraph: ids 0 = start, then every node, then end. `last_count` is the table's
    // `lastCount`, shared by every edge out of a node (and changed while they are built).
    let mut ids: Vec<Vec<usize>> = Vec::new();
    let mut node_of: Vec<Option<(usize, usize)>> = vec![None];
    for (i, g) in nodes.iter().enumerate() {
        ids.push(
            (0..g.len())
                .map(|j| {
                    node_of.push(Some((i, j)));
                    node_of.len() - 1
                })
                .collect(),
        );
    }
    let end = node_of.len();
    let mut last_count = vec![0u32; end];
    let mut graph: Vec<Vec<(usize, u32)>> = vec![Vec::new(); end + 1];
    let mut prev: Vec<usize> = vec![0];
    for (i, g) in nodes.iter().enumerate() {
        for (j, node) in g.iter().enumerate() {
            let key = ids[i][j];
            for &p in &prev {
                let cost;
                match node_of[p] {
                    Some((pi, pj)) if nodes[pi][pj].mode == node.mode => {
                        cost = node.mode.bits_length(last_count[p] + node.length)
                            - node.mode.bits_length(last_count[p]);
                        last_count[p] += node.length;
                    }
                    other => {
                        if other.is_some() {
                            last_count[p] = node.length;
                        }
                        cost = node.mode.bits_length(node.length)
                            + 4
                            + node.mode.char_count_indicator(version);
                    }
                }
                graph[p].push((key, cost));
            }
        }
        prev = ids[i].clone();
    }
    for &p in &prev {
        graph[p].push((end, 0));
    }
    // dijkstrajs.find_path(graph, 'start', 'end'): the adjacency in insertion order (every
    // key of one object is the same group's `${i}${j}`, so numeric-key ordering is j's order).
    let mut costs: Vec<Option<u32>> = vec![None; end + 1];
    let mut pred: Vec<Option<usize>> = vec![None; end + 1];
    costs[0] = Some(0);
    let mut open: Vec<(usize, u32)> = vec![(0, 0)];
    while !open.is_empty() {
        let (u, cu) = open.remove(0);
        for &(v, ce) in &graph[u] {
            let c = cu + ce;
            if costs[v].is_none_or(|cv| cv > c) {
                costs[v] = Some(c);
                open.push((v, c));
                // queue.sort(default_sorter): stable, by cost.
                open.sort_by_key(|e| e.1);
                pred[v] = Some(u);
            }
        }
    }
    let mut path = vec![end];
    let mut u = end;
    while let Some(p) = pred[u] {
        path.push(p);
        u = p;
    }
    path.reverse();
    // mergeSegments, then fromArray.
    let mut merged: Vec<Seg> = Vec::new();
    for &id in &path[1..path.len() - 1] {
        let (i, j) = node_of[id].unwrap();
        let n = &nodes[i][j];
        match merged.last_mut() {
            Some(m) if m.mode == n.mode => m.data.push_str(&n.data),
            _ => merged.push(n.clone()),
        }
    }
    merged
        .into_iter()
        .map(|s| Data::new(s.data, s.mode))
        .collect()
}

/// `Segments.rawSplit`.
fn raw_split(s: &str) -> Vec<Data> {
    segments_from_string(s)
        .into_iter()
        .map(|s| Data::new(s.data, s.mode))
        .collect()
}

// ─── version.js, utils.js, error-correction-code.js ─────────────────────────────────────────

const CODEWORDS_COUNT: [u32; 41] = [
    0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991,
    1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876,
    3034, 3196, 3362, 3532, 3706,
];

#[rustfmt::skip]
const EC_BLOCKS_TABLE: [u32; 160] = [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 4, 1, 2, 4, 4, 2, 4, 4, 4, 2, 4, 6, 5, 2, 4, 6, 6,
    2, 5, 8, 8, 4, 5, 8, 8, 4, 5, 8, 11, 4, 8, 10, 11, 4, 9, 12, 16, 4, 9, 16, 16, 6, 10, 12, 18,
    6, 10, 17, 16, 6, 11, 16, 19, 6, 13, 18, 21, 7, 14, 21, 25, 8, 16, 20, 25, 8, 17, 23, 25,
    9, 17, 23, 34, 9, 18, 25, 30, 10, 20, 27, 32, 12, 21, 29, 35, 12, 23, 34, 37, 12, 25, 34, 40,
    13, 26, 35, 42, 14, 28, 38, 45, 15, 29, 40, 48, 16, 31, 43, 51, 17, 33, 45, 54, 18, 35, 48, 57,
    19, 37, 51, 60, 19, 38, 53, 63, 20, 40, 56, 66, 21, 43, 59, 70, 22, 45, 62, 74, 24, 47, 65, 77,
    25, 49, 68, 81,
];

#[rustfmt::skip]
const EC_CODEWORDS_TABLE: [u32; 160] = [
    7, 10, 13, 17, 10, 16, 22, 28, 15, 26, 36, 44, 20, 36, 52, 64, 26, 48, 72, 88, 36, 64, 96, 112,
    40, 72, 108, 130, 48, 88, 132, 156, 60, 110, 160, 192, 72, 130, 192, 224, 80, 150, 224, 264,
    96, 176, 260, 308, 104, 198, 288, 352, 120, 216, 320, 384, 132, 240, 360, 432, 144, 280, 408, 480,
    168, 308, 448, 532, 180, 338, 504, 588, 196, 364, 546, 650, 224, 416, 600, 700, 224, 442, 644, 750,
    252, 476, 690, 816, 270, 504, 750, 900, 300, 560, 810, 960, 312, 588, 870, 1050, 336, 644, 952, 1110,
    360, 700, 1020, 1200, 390, 728, 1050, 1260, 420, 784, 1140, 1350, 450, 812, 1200, 1440,
    480, 868, 1290, 1530, 510, 924, 1350, 1620, 540, 980, 1440, 1710, 570, 1036, 1530, 1800,
    570, 1064, 1590, 1890, 600, 1120, 1680, 1980, 630, 1204, 1770, 2100, 660, 1260, 1860, 2220,
    720, 1316, 1950, 2310, 750, 1372, 2040, 2430,
];

fn ec_blocks(version: u32, ecl: Ecl) -> u32 {
    EC_BLOCKS_TABLE[(version as usize - 1) * 4 + ecl.column()]
}
fn ec_codewords(version: u32, ecl: Ecl) -> u32 {
    EC_CODEWORDS_TABLE[(version as usize - 1) * 4 + ecl.column()]
}
fn data_bits(version: u32, ecl: Ecl) -> u32 {
    (CODEWORDS_COUNT[version as usize] - ec_codewords(version, ecl)) * 8
}

/// `Version.getCapacity(version, ecl, mode)` (`None`: MIXED, the data bits).
fn capacity(version: u32, ecl: Ecl, mode: Option<Mode>) -> u32 {
    let bits = data_bits(version, ecl);
    let Some(mode) = mode else { return bits };
    let usable = bits as f64 - (mode.char_count_indicator(version) + 4) as f64;
    (match mode {
        Mode::Numeric => (usable / 10.0 * 3.0).floor(),
        Mode::Alphanumeric => (usable / 11.0 * 2.0).floor(),
        Mode::Byte => (usable / 8.0).floor(),
    }) as u32
}

/// `Version.getBestVersionForData(segments, ecl)`.
fn best_version(segs: &[Data], ecl: Ecl) -> Option<u32> {
    if segs.len() > 1 {
        (1..=40).find(|&v| {
            let total: u32 = segs
                .iter()
                .map(|d| d.mode.char_count_indicator(v) + 4 + d.bits_length())
                .sum();
            total <= capacity(v, ecl, None)
        })
    } else if segs.is_empty() {
        Some(1)
    } else {
        let d = &segs[0];
        (1..=40).find(|&v| d.length() <= capacity(v, ecl, Some(d.mode)))
    }
}

fn bch_digit(mut data: u32) -> i32 {
    let mut digit = 0;
    while data != 0 {
        digit += 1;
        data >>= 1;
    }
    digit
}

fn version_bits(version: u32) -> u32 {
    const G18: u32 =
        (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | 1;
    let g = bch_digit(G18);
    let mut d = version << 12;
    while bch_digit(d) - g >= 0 {
        d ^= G18 << (bch_digit(d) - g);
    }
    (version << 12) | d
}

fn format_bits(ecl: Ecl, mask: u32) -> u32 {
    const G15: u32 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | 1;
    const G15_MASK: u32 = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
    let g = bch_digit(G15);
    let data = (ecl.bit() << 3) | mask;
    let mut d = data << 10;
    while bch_digit(d) - g >= 0 {
        d ^= G15 << (bch_digit(d) - g);
    }
    ((data << 10) | d) ^ G15_MASK
}

// ─── bit-buffer.js, galois-field.js, polynomial.js, reed-solomon-encoder.js ────────────────

#[derive(Default)]
struct BitBuffer {
    buffer: Vec<u8>,
    length: usize,
}

impl BitBuffer {
    fn put(&mut self, num: u32, length: u32) {
        for i in 0..length {
            self.put_bit((num >> (length - i - 1)) & 1 == 1);
        }
    }
    fn put_bit(&mut self, bit: bool) {
        let i = self.length / 8;
        if self.buffer.len() <= i {
            self.buffer.push(0);
        }
        if bit {
            self.buffer[i] |= 0x80 >> (self.length % 8);
        }
        self.length += 1;
    }
}

struct Gf {
    exp: [u8; 512],
    log: [u8; 256],
}

impl Gf {
    fn new() -> Gf {
        let mut gf = Gf {
            exp: [0; 512],
            log: [0; 256],
        };
        let mut x: u32 = 1;
        for i in 0..255 {
            gf.exp[i] = x as u8;
            gf.log[x as usize] = i as u8;
            x <<= 1;
            if x & 0x100 != 0 {
                x ^= 0x11D;
            }
        }
        for i in 255..512 {
            gf.exp[i] = gf.exp[i - 255];
        }
        gf
    }
    fn mul(&self, x: u8, y: u8) -> u8 {
        if x == 0 || y == 0 {
            return 0;
        }
        self.exp[self.log[x as usize] as usize + self.log[y as usize] as usize]
    }
    fn poly_mul(&self, p1: &[u8], p2: &[u8]) -> Vec<u8> {
        let mut c = vec![0u8; p1.len() + p2.len() - 1];
        for (i, &a) in p1.iter().enumerate() {
            for (j, &b) in p2.iter().enumerate() {
                c[i + j] ^= self.mul(a, b);
            }
        }
        c
    }
    fn poly_mod(&self, divident: &[u8], divisor: &[u8]) -> Vec<u8> {
        let mut result = divident.to_vec();
        while result.len() >= divisor.len() {
            let coeff = result[0];
            for (i, &d) in divisor.iter().enumerate() {
                result[i] ^= self.mul(d, coeff);
            }
            let offset = result.iter().position(|&v| v != 0).unwrap_or(result.len());
            result.drain(..offset);
        }
        result
    }
    fn generator(&self, degree: usize) -> Vec<u8> {
        let mut poly = vec![1u8];
        for i in 0..degree {
            poly = self.poly_mul(&poly, &[1, self.exp[i]]);
        }
        poly
    }
    fn rs_encode(&self, gen: &[u8], degree: usize, data: &[u8]) -> Vec<u8> {
        let mut padded = vec![0u8; data.len() + degree];
        padded[..data.len()].copy_from_slice(data);
        let rem = self.poly_mod(&padded, gen);
        if degree > rem.len() {
            let mut buf = vec![0u8; degree];
            buf[degree - rem.len()..].copy_from_slice(&rem);
            return buf;
        }
        rem
    }
}

// ─── qrcode.js ──────────────────────────────────────────────────────────────────────────────

struct Matrix {
    size: usize,
    data: Vec<u8>,
    reserved: Vec<bool>,
}

impl Matrix {
    fn set(&mut self, row: usize, col: usize, value: bool, reserved: bool) {
        let i = row * self.size + col;
        self.data[i] = value as u8;
        if reserved {
            self.reserved[i] = true;
        }
    }
    fn get(&self, row: usize, col: usize) -> u8 {
        self.data[row * self.size + col]
    }
}

fn alignment_coords(version: u32) -> Vec<usize> {
    if version == 1 {
        return Vec::new();
    }
    let pos_count = (version / 7 + 2) as usize;
    let size = (version * 4 + 17) as usize;
    let intervals = if size == 145 {
        26
    } else {
        (((size - 13) as f64) / ((2 * pos_count - 2) as f64)).ceil() as usize * 2
    };
    let mut positions = vec![size - 7];
    for i in 1..pos_count - 1 {
        positions.push(positions[i - 1] - intervals);
    }
    positions.push(6);
    positions.reverse();
    positions
}

fn setup_format(m: &mut Matrix, ecl: Ecl, mask: u32) {
    let size = m.size;
    let bits = format_bits(ecl, mask);
    for i in 0..15 {
        let v = (bits >> i) & 1 == 1;
        if i < 6 {
            m.set(i, 8, v, true);
        } else if i < 8 {
            m.set(i + 1, 8, v, true);
        } else {
            m.set(size - 15 + i, 8, v, true);
        }
        if i < 8 {
            m.set(8, size - i - 1, v, true);
        } else if i < 9 {
            m.set(8, 15 - i - 1 + 1, v, true);
        } else {
            m.set(8, 15 - i - 1, v, true);
        }
    }
    m.set(size - 8, 8, true, true);
}

fn mask_at(p: u32, i: usize, j: usize) -> bool {
    match p {
        0 => (i + j) % 2 == 0,
        1 => i % 2 == 0,
        2 => j % 3 == 0,
        3 => (i + j) % 3 == 0,
        4 => (i / 2 + j / 3) % 2 == 0,
        5 => (i * j) % 2 + (i * j) % 3 == 0,
        6 => ((i * j) % 2 + (i * j) % 3) % 2 == 0,
        _ => ((i * j) % 3 + (i + j) % 2) % 2 == 0,
    }
}

fn apply_mask(p: u32, m: &mut Matrix) {
    for col in 0..m.size {
        for row in 0..m.size {
            if m.reserved[row * m.size + col] {
                continue;
            }
            m.data[row * m.size + col] ^= mask_at(p, row, col) as u8;
        }
    }
}

fn penalty(m: &Matrix) -> u32 {
    let size = m.size;
    let mut points = 0u32;
    // N1
    for row in 0..size {
        let (mut sc, mut sr) = (0u32, 0u32);
        let (mut lc, mut lr): (Option<u8>, Option<u8>) = (None, None);
        for col in 0..size {
            let v = m.get(row, col);
            if Some(v) == lc {
                sc += 1;
            } else {
                if sc >= 5 {
                    points += 3 + (sc - 5);
                }
                lc = Some(v);
                sc = 1;
            }
            let v = m.get(col, row);
            if Some(v) == lr {
                sr += 1;
            } else {
                if sr >= 5 {
                    points += 3 + (sr - 5);
                }
                lr = Some(v);
                sr = 1;
            }
        }
        if sc >= 5 {
            points += 3 + (sc - 5);
        }
        if sr >= 5 {
            points += 3 + (sr - 5);
        }
    }
    // N2
    let mut n2 = 0;
    for row in 0..size - 1 {
        for col in 0..size - 1 {
            let last = m.get(row, col)
                + m.get(row, col + 1)
                + m.get(row + 1, col)
                + m.get(row + 1, col + 1);
            if last == 4 || last == 0 {
                n2 += 1;
            }
        }
    }
    points += n2 * 3;
    // N3
    let mut n3 = 0;
    for row in 0..size {
        let (mut bc, mut br) = (0u32, 0u32);
        for col in 0..size {
            bc = ((bc << 1) & 0x7FF) | m.get(row, col) as u32;
            if col >= 10 && (bc == 0x5D0 || bc == 0x05D) {
                n3 += 1;
            }
            br = ((br << 1) & 0x7FF) | m.get(col, row) as u32;
            if col >= 10 && (br == 0x5D0 || br == 0x05D) {
                n3 += 1;
            }
        }
    }
    points += n3 * 40;
    // N4
    let dark: u32 = m.data.iter().map(|&v| v as u32).sum();
    let total = m.data.len() as f64;
    let k = (((dark as f64 * 100.0 / total) / 5.0).ceil() - 10.0).abs() as u32;
    points + k * 10
}

/// `QRCode.create(text, { errorCorrectionLevel })`. `None` where it throws: empty text, or more
/// data than version 40 holds.
pub fn create(text: &str, ecl: Ecl) -> Option<Symbol> {
    if text.is_empty() {
        return None;
    }
    let estimated = best_version(&raw_split(text), ecl);
    let segments = from_string(text, estimated.unwrap_or(40));
    let version = best_version(&segments, ecl)?;

    // createData
    let mut buf = BitBuffer::default();
    for d in &segments {
        buf.put(d.mode.bit(), 4);
        buf.put(d.length(), d.mode.char_count_indicator(version));
        d.write(&mut buf);
    }
    let total = CODEWORDS_COUNT[version as usize] as usize;
    let ec_total = ec_codewords(version, ecl) as usize;
    let bits = (total - ec_total) * 8;
    if buf.length + 4 <= bits {
        buf.put(0, 4);
    }
    while buf.length % 8 != 0 {
        buf.put_bit(false);
    }
    let remaining = (bits - buf.length) / 8;
    for i in 0..remaining {
        buf.put(if i % 2 == 1 { 0x11 } else { 0xEC }, 8);
    }

    // createCodewords
    let data_total = total - ec_total;
    let blocks = ec_blocks(version, ecl) as usize;
    let in_group2 = total % blocks;
    let in_group1 = blocks - in_group2;
    let total_in_group1 = total / blocks;
    let data_in_group1 = data_total / blocks;
    let data_in_group2 = data_in_group1 + 1;
    let ec_count = total_in_group1 - data_in_group1;
    let gf = Gf::new();
    let gen = gf.generator(ec_count);
    let mut dc: Vec<&[u8]> = Vec::with_capacity(blocks);
    let mut ec: Vec<Vec<u8>> = Vec::with_capacity(blocks);
    let mut offset = 0;
    let mut max_data = 0;
    for b in 0..blocks {
        let size = if b < in_group1 {
            data_in_group1
        } else {
            data_in_group2
        };
        let end = (offset + size).min(buf.buffer.len());
        let block = &buf.buffer[offset.min(end)..end];
        ec.push(gf.rs_encode(&gen, ec_count, block));
        dc.push(block);
        offset += size;
        max_data = max_data.max(size);
    }
    let mut codewords = Vec::with_capacity(total);
    for i in 0..max_data {
        for block in &dc {
            if i < block.len() {
                codewords.push(block[i]);
            }
        }
    }
    for i in 0..ec_count {
        for block in &ec {
            codewords.push(block[i]);
        }
    }

    // createSymbol
    let size = (version * 4 + 17) as usize;
    let mut m = Matrix {
        size,
        data: vec![0; size * size],
        reserved: vec![false; size * size],
    };
    for (row, col) in [(0usize, 0usize), (size - 7, 0), (0, size - 7)] {
        for r in -1i32..=7 {
            let rr = row as i32 + r;
            if rr <= -1 || size as i32 <= rr {
                continue;
            }
            for c in -1i32..=7 {
                let cc = col as i32 + c;
                if cc <= -1 || size as i32 <= cc {
                    continue;
                }
                let dark = ((0..=6).contains(&r) && (c == 0 || c == 6))
                    || ((0..=6).contains(&c) && (r == 0 || r == 6))
                    || ((2..=4).contains(&r) && (2..=4).contains(&c));
                m.set(rr as usize, cc as usize, dark, true);
            }
        }
    }
    for r in 8..size.saturating_sub(8) {
        let v = r % 2 == 0;
        m.set(r, 6, v, true);
        m.set(6, r, v, true);
    }
    let coords = alignment_coords(version);
    let n = coords.len();
    for i in 0..n {
        for j in 0..n {
            if (i == 0 && j == 0) || (i == 0 && j == n - 1) || (i == n - 1 && j == 0) {
                continue;
            }
            let (row, col) = (coords[i], coords[j]);
            for r in -2i32..=2 {
                for c in -2i32..=2 {
                    let dark = r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0);
                    m.set(
                        (row as i32 + r) as usize,
                        (col as i32 + c) as usize,
                        dark,
                        true,
                    );
                }
            }
        }
    }
    setup_format(&mut m, ecl, 0);
    if version >= 7 {
        let bits = version_bits(version);
        for i in 0..18 {
            let (row, col) = (i / 3, i % 3 + size - 8 - 3);
            let v = (bits >> i) & 1 == 1;
            m.set(row, col, v, true);
            m.set(col, row, v, true);
        }
    }
    // setupData
    let mut inc: i32 = -1;
    let mut row = size as i32 - 1;
    let mut bit_index: i32 = 7;
    let mut byte_index = 0usize;
    let mut col = size as i32 - 1;
    while col > 0 {
        if col == 6 {
            col -= 1;
        }
        loop {
            for c in 0..2 {
                let (r, cc) = (row as usize, (col - c) as usize);
                if !m.reserved[r * size + cc] {
                    let mut dark = false;
                    if byte_index < codewords.len() {
                        dark = (codewords[byte_index] >> bit_index) & 1 == 1;
                    }
                    m.set(r, cc, dark, false);
                    bit_index -= 1;
                    if bit_index == -1 {
                        byte_index += 1;
                        bit_index = 7;
                    }
                }
            }
            row += inc;
            if row < 0 || size as i32 <= row {
                row -= inc;
                inc = -inc;
                break;
            }
        }
        col -= 2;
    }
    // getBestMask
    let mut best = 0;
    let mut lowest = u32::MAX;
    for p in 0..8 {
        setup_format(&mut m, ecl, p);
        apply_mask(p, &mut m);
        let score = penalty(&m);
        apply_mask(p, &mut m);
        if score < lowest {
            lowest = score;
            best = p;
        }
    }
    apply_mask(best, &mut m);
    setup_format(&mut m, ecl, best);
    Some(Symbol {
        size,
        data: m.data,
        version,
        mask: best,
    })
}

// ─── react-native-qrcode-skia: transformMatrixIntoPath (rounded, gap 0, no logo) ───────────

/// One verb of an SkPath (a moveTo starts each contour).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Verb {
    /// `M`.
    Move(Point),
    /// `L`.
    Line(Point),
    /// `Q`: the control point, the end.
    Quad(Point, Point),
    /// `Z`.
    Close,
}

/// The SVG string's numbers as SkParse reads them: `(float)strtod` of JS's shortest decimal,
/// which is the f64 itself, then to float.
fn p(x: f64, y: f64) -> Point {
    point(x as f32, y as f32)
}

/// `Skia.Path.MakeFromSVGString(transformMatrixIntoPath(generateMatrix(...), size).path)`:
/// each dark module a contour, a rounded corner (a quad through the module's corner) where
/// neither neighbour on that corner is dark, else the corner itself. Appends to `out`.
pub fn rounded_path(symbol: &Symbol, size: f64, out: &mut Vec<Verb>) {
    let n = symbol.size;
    let cell = size / n as f64;
    let dark = |i: usize, j: usize| symbol.dark(i, j);
    for i in 0..n {
        for j in 0..n {
            if !dark(i, j) {
                continue;
            }
            let (x, y) = (j as f64 * cell, i as f64 * cell);
            let pad = 0.0 / 2.0;
            let offset = (cell - 0.0) / 2.0;
            let q1 = (x + cell - pad, y + pad);
            let q2 = (x + cell - pad, y + cell - pad);
            let q3 = (x + pad, y + cell - pad);
            let q4 = (x + pad, y + pad);
            let d1 = (x + cell - pad - offset, y + pad);
            let d2 = (x + cell - pad, y + cell - pad - offset);
            let d3 = (x + pad + offset, y + cell - pad);
            let d4 = (x + pad, y + pad + offset);
            let top = i > 0 && dark(i - 1, j);
            let right = j < n - 1 && dark(i, j + 1);
            let bottom = i < n - 1 && dark(i + 1, j);
            let left = j > 0 && dark(i, j - 1);
            out.push(Verb::Move(p(d1.0, d1.1)));
            let mut corner = |sharp: bool, from: (f64, f64), q: (f64, f64), to: (f64, f64)| {
                if sharp {
                    out.push(Verb::Line(p(q.0, q.1)));
                    out.push(Verb::Line(p(to.0, to.1)));
                } else {
                    out.push(Verb::Line(p(from.0, from.1)));
                    out.push(Verb::Quad(p(q.0, q.1), p(to.0, to.1)));
                }
            };
            corner(top || right, d1, q1, d2);
            corner(right || bottom, d2, q2, d3);
            corner(bottom || left, d3, q3, d4);
            corner(left || top, d4, q4, d1);
        }
    }
}

/// The verbs as a lyon path (what Skia fills: every contour closed).
pub fn to_lyon(verbs: &[Verb]) -> skia::Path {
    let mut b = skia::path_builder();
    let mut open = false;
    for v in verbs {
        match *v {
            Verb::Move(pt) => {
                if open {
                    b.end(true);
                }
                b.begin(pt);
                open = true;
            }
            Verb::Line(pt) => {
                b.line_to(pt);
            }
            Verb::Quad(c, pt) => {
                b.quadratic_bezier_to(c, pt);
            }
            Verb::Close => {
                if open {
                    b.end(true);
                    open = false;
                }
            }
        }
    }
    if open {
        b.end(true);
    }
    b.build()
}

// ─── Skia m157: SkContourMeasure (lines and quads) and SkDiscretePathEffect ─────────────────

const MAX_T: i32 = 0x3FFF_FFFF;
const LINE: u8 = 0;
const QUAD: u8 = 1;

fn t_scalar(t: i32) -> f32 {
    t as f32 * (1.0f32 / MAX_T as f32)
}

fn length(dx: f32, dy: f32) -> f32 {
    let m = dx * dx + dy * dy;
    if m.is_finite() {
        m.sqrt()
    } else {
        ((dx as f64 * dx as f64 + dy as f64 * dy as f64).sqrt()) as f32
    }
}

fn dist(a: Point, b: Point) -> f32 {
    length(a.x - b.x, a.y - b.y)
}

/// SkPoint::setLength(x, y, len): in double, then back to float. `None` where Skia's fails.
fn set_length(x: f32, y: f32, len: f32) -> Option<(f32, f32)> {
    let (xx, yy) = (x as f64, y as f64);
    let mag = (xx * xx + yy * yy).sqrt();
    let s = len as f64 / mag;
    let (x, y) = ((x as f64 * s) as f32, (y as f64 * s) as f32);
    if !x.is_finite() || !y.is_finite() || (x == 0.0 && y == 0.0) {
        return None;
    }
    Some((x, y))
}

fn interp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

#[derive(Clone, Copy)]
struct Segment {
    distance: f32,
    pt: usize,
    kind: u8,
    t: i32,
}

/// One contour's measure (SkContourMeasureIter::Impl::buildSegments).
#[derive(Default)]
struct Measure {
    segments: Vec<Segment>,
    pts: Vec<Point>,
    length: f32,
    closed: bool,
}

impl Measure {
    fn quad_segs(
        &mut self,
        pts: [Point; 3],
        mut distance: f32,
        mint: i32,
        maxt: i32,
        pt: usize,
        depth: u32,
    ) -> f32 {
        let too_curvy = {
            let dx = (pts[1].x / 2.0) - (((pts[0].x + pts[2].x) / 2.0) / 2.0);
            let dy = (pts[1].y / 2.0) - (((pts[0].y + pts[2].y) / 2.0) / 2.0);
            dx.abs().max(dy.abs()) > 0.5
        };
        if depth < 8 && ((maxt - mint) >> 10) != 0 && too_curvy {
            let tmp = chop_quad(pts, 0.5);
            let half = (mint + maxt) >> 1;
            distance = self.quad_segs(
                [tmp[0], tmp[1], tmp[2]],
                distance,
                mint,
                half,
                pt,
                depth + 1,
            );
            distance = self.quad_segs(
                [tmp[2], tmp[3], tmp[4]],
                distance,
                half,
                maxt,
                pt,
                depth + 1,
            );
        } else {
            let d = dist(pts[0], pts[2]);
            let prev = distance;
            distance += d;
            if distance > prev {
                self.segments.push(Segment {
                    distance,
                    pt,
                    kind: QUAD,
                    t: maxt,
                });
            }
        }
        distance
    }

    fn line_seg(&mut self, p0: Point, p1: Point, mut distance: f32, pt: usize) -> f32 {
        let d = dist(p0, p1);
        let prev = distance;
        distance += d;
        if distance > prev {
            self.segments.push(Segment {
                distance,
                pt,
                kind: LINE,
                t: MAX_T,
            });
        }
        distance
    }

    /// buildSegments from verbs[at..]: the contour's measure (None: skipped, no segments) and
    /// where the next contour starts.
    fn build(verbs: &[Verb], mut at: usize, force_closed: bool, m: &mut Measure) -> (bool, usize) {
        m.segments.clear();
        m.pts.clear();
        let mut pt_index: i64 = -1;
        let mut distance = 0.0f32;
        let mut seen_close = force_closed;
        let mut seen_move = false;
        let mut last = point(0.0, 0.0);
        while at < verbs.len() {
            let v = verbs[at];
            if seen_move && matches!(v, Verb::Move(_)) {
                break;
            }
            match v {
                Verb::Move(p0) => {
                    pt_index += 1;
                    m.pts.push(p0);
                    seen_move = true;
                    last = p0;
                }
                Verb::Line(p1) => {
                    let prev = distance;
                    distance = m.line_seg(last, p1, distance, pt_index as usize);
                    if distance > prev {
                        m.pts.push(p1);
                        pt_index += 1;
                    }
                    last = p1;
                }
                Verb::Quad(c, p2) => {
                    let prev = distance;
                    distance = m.quad_segs([last, c, p2], distance, 0, MAX_T, pt_index as usize, 0);
                    if distance > prev {
                        m.pts.push(c);
                        m.pts.push(p2);
                        pt_index += 2;
                    }
                    last = p2;
                }
                Verb::Close => seen_close = true,
            }
            at += 1;
        }
        if !distance.is_finite() || m.segments.is_empty() {
            return (false, at);
        }
        if seen_close {
            let prev = distance;
            let first = m.pts[0];
            distance = m.line_seg(m.pts[pt_index as usize], first, distance, pt_index as usize);
            if distance > prev {
                m.pts.push(first);
            }
        }
        m.length = distance;
        m.closed = seen_close;
        (true, at)
    }

    fn distance_to_segment(&self, d: f32) -> (usize, f32) {
        // SkTKSearch
        let count = self.segments.len();
        let (mut lo, mut hi) = (0usize, count - 1);
        while lo < hi {
            let mid = (hi + lo) >> 1;
            if self.segments[mid].distance < d {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        // A miss (~index) comes back as the insertion point: index ^= index >> 31.
        let index = if self.segments[hi].distance < d {
            hi + 1
        } else {
            hi
        };
        let seg = self.segments[index];
        let (mut start_t, mut start_d) = (0.0f32, 0.0f32);
        if index > 0 {
            let before = self.segments[index - 1];
            start_d = before.distance;
            if before.pt == seg.pt {
                start_t = t_scalar(before.t);
            }
        }
        let t = start_t + (t_scalar(seg.t) - start_t) * (d - start_d) / (seg.distance - start_d);
        (index, t)
    }

    fn pos_tan(&self, d: f32) -> Option<(Point, (f32, f32))> {
        if d.is_nan() {
            return None;
        }
        let d = if d < 0.0 {
            0.0
        } else if d > self.length {
            self.length
        } else {
            d
        };
        let (index, t) = self.distance_to_segment(d);
        if t.is_nan() {
            return None;
        }
        let seg = self.segments[index];
        let pts = &self.pts[seg.pt..];
        Some(match seg.kind {
            LINE => {
                let pos = point(interp(pts[0].x, pts[1].x, t), interp(pts[0].y, pts[1].y, t));
                let tan =
                    set_length(pts[1].x - pts[0].x, pts[1].y - pts[0].y, 1.0).unwrap_or((0.0, 0.0));
                (pos, tan)
            }
            _ => {
                let (p0, p1, p2) = (pts[0], pts[1], pts[2]);
                // SkQuadCoeff(src).eval(t)
                let (bx, by) = (2.0 * (p1.x - p0.x), 2.0 * (p1.y - p0.y));
                let (ax, ay) = (p2.x - 2.0 * p1.x + p0.x, p2.y - 2.0 * p1.y + p0.y);
                let pos = point((ax * t + bx) * t + p0.x, (ay * t + by) * t + p0.y);
                // SkEvalQuadTangentAt
                let tan = if (t == 0.0 && p0 == p1) || (t == 1.0 && p1 == p2) {
                    (p2.x - p0.x, p2.y - p0.y)
                } else {
                    let (bx, by) = (p1.x - p0.x, p1.y - p0.y);
                    let (ax, ay) = (p2.x - p1.x - bx, p2.y - p1.y - by);
                    let (tx, ty) = (ax * t + bx, ay * t + by);
                    (tx + tx, ty + ty)
                };
                (pos, set_length(tan.0, tan.1, 1.0).unwrap_or((0.0, 0.0)))
            }
        })
    }

    /// getSegment(0, length, dst, true) (the contour as it is: too short to mangle).
    fn whole(&self, dst: &mut Vec<Verb>) {
        let (s0, t0) = self.distance_to_segment(0.0);
        let (s1, t1) = self.distance_to_segment(self.length);
        let first = self.segments[s0];
        let pts = &self.pts[first.pt..];
        let start = if first.kind == LINE {
            point(
                interp(pts[0].x, pts[1].x, t0),
                interp(pts[0].y, pts[1].y, t0),
            )
        } else {
            self.pos_tan(0.0).map(|(p, _)| p).unwrap_or(pts[0])
        };
        dst.push(Verb::Move(start));
        let stop = self.segments[s1];
        let mut seg = s0;
        let mut start_t = t0;
        if first.pt == stop.pt {
            seg_to(&self.pts[first.pt..], first.kind, start_t, t1, dst);
        } else {
            loop {
                let s = self.segments[seg];
                seg_to(&self.pts[s.pt..], s.kind, start_t, 1.0, dst);
                // Segment::Next: the first segment with a later point.
                let pt = s.pt;
                while self.segments[seg].pt == pt {
                    seg += 1;
                }
                start_t = 0.0;
                if self.segments[seg].pt >= stop.pt {
                    break;
                }
            }
            let s = self.segments[seg];
            seg_to(&self.pts[s.pt..], s.kind, 0.0, t1, dst);
        }
    }
}

fn chop_quad(pts: [Point; 3], t: f32) -> [Point; 5] {
    let lerp = |a: Point, b: Point| point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    let p01 = lerp(pts[0], pts[1]);
    let p12 = lerp(pts[1], pts[2]);
    [pts[0], p01, lerp(p01, p12), p12, pts[2]]
}

/// SkContourMeasure_segTo for lines and quads.
fn seg_to(pts: &[Point], kind: u8, start_t: f32, stop_t: f32, dst: &mut Vec<Verb>) {
    if start_t == stop_t {
        if let Some(last) = dst.iter().rev().find_map(|v| match *v {
            Verb::Move(p) | Verb::Line(p) | Verb::Quad(_, p) => Some(p),
            Verb::Close => None,
        }) {
            dst.push(Verb::Line(last));
        }
        return;
    }
    if kind == LINE {
        dst.push(Verb::Line(if stop_t == 1.0 {
            pts[1]
        } else {
            point(
                interp(pts[0].x, pts[1].x, stop_t),
                interp(pts[0].y, pts[1].y, stop_t),
            )
        }));
        return;
    }
    let q = [pts[0], pts[1], pts[2]];
    if start_t == 0.0 {
        if stop_t == 1.0 {
            dst.push(Verb::Quad(q[1], q[2]));
        } else {
            let t = chop_quad(q, stop_t);
            dst.push(Verb::Quad(t[1], t[2]));
        }
    } else {
        let t0 = chop_quad(q, start_t);
        if stop_t == 1.0 {
            dst.push(Verb::Quad(t0[3], t0[4]));
        } else {
            let t1 = chop_quad([t0[2], t0[3], t0[4]], (stop_t - start_t) / (1.0 - start_t));
            dst.push(Verb::Quad(t1[1], t1[2]));
        }
    }
}

/// `<DiscretePathEffect length deviation>` (seed 0) on a filled path: SkDiscretePathEffectImpl's
/// onFilterPath, written into `dst` (cleared). One LCGRandom for the whole path, seeded from the
/// first contour's rounded length.
pub fn discrete(src: &[Verb], seg_length: f32, deviation: f32, dst: &mut Vec<Verb>) {
    dst.clear();
    let mut m = Measure::default();
    let mut at = 0;
    // SkPathMeasure's constructor: the first contour with segments.
    let mut have = false;
    while at < src.len() {
        let (ok, next) = Measure::build(src, at, true, &mut m);
        at = next;
        if ok {
            have = true;
            break;
        }
    }
    let first_len = if have { m.length } else { 0.0 };
    let seed = (((first_len as f64) + 0.5).floor() as f32).clamp(-2147483520.0, 2147483520.0) as i32
        as u32;
    let mut rand = seed ^ ((seed << 16) | (seed >> 16));
    let mut next = || {
        rand = rand.wrapping_mul(1664525).wrapping_add(1013904223);
        ((rand as i32) >> 15) as f32 * 1.52587890625e-5f32
    };
    let perturb = |p: Point, v: (f32, f32), scale: f32| {
        // RotateCCW, then setLength(scale)
        let n = set_length(v.1, -v.0, scale).unwrap_or((0.0, 0.0));
        point(p.x + n.0, p.y + n.1)
    };
    loop {
        let length = if have { m.length } else { 0.0 };
        if seg_length * 3.0 > length {
            if have {
                m.whole(dst);
            }
        } else {
            let mut n = ((length / seg_length) as f64 + 0.5).floor() as i32;
            n = n.min(100000);
            let delta = length / n as f32;
            let mut distance = 0.0f32;
            if m.closed {
                n -= 1;
                distance += delta / 2.0;
            }
            if let Some((p, v)) = m.pos_tan(distance) {
                let r = next();
                dst.push(Verb::Move(perturb(p, v, r * deviation)));
            }
            loop {
                n -= 1;
                if n < 0 {
                    break;
                }
                distance += delta;
                if let Some((p, v)) = m.pos_tan(distance) {
                    let r = next();
                    dst.push(Verb::Line(perturb(p, v, r * deviation)));
                }
            }
            if m.closed {
                dst.push(Verb::Close);
            }
        }
        // nextContour
        have = false;
        while at < src.len() {
            let (ok, next_at) = Measure::build(src, at, true, &mut m);
            at = next_at;
            if ok {
                have = true;
                break;
            }
        }
        if !have {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// exact/parity-tools/qr-matrix.ts's output: per line, the level, the version, the mask,
    /// the modules as hex (row-major, 4 per digit), and the text as JSON.
    const REFERENCE: &str = include_str!("../../../parity-tools/qr/reference.txt");

    fn unjson(s: &str) -> String {
        // The corpus's JSON strings: \" \\ \n \uXXXX (with surrogate pairs).
        let mut out = Vec::<u16>::new();
        let b: Vec<char> = s[1..s.len() - 1].chars().collect();
        let mut i = 0;
        while i < b.len() {
            if b[i] == '\\' {
                i += 1;
                match b[i] {
                    'n' => out.push(10),
                    't' => out.push(9),
                    'r' => out.push(13),
                    'u' => {
                        let h: String = b[i + 1..i + 5].iter().collect();
                        out.push(u16::from_str_radix(&h, 16).unwrap());
                        i += 4;
                    }
                    c => out.push(c as u16),
                }
            } else {
                let mut buf = [0u16; 2];
                out.extend_from_slice(b[i].encode_utf16(&mut buf));
            }
            i += 1;
        }
        String::from_utf16(&out).unwrap()
    }

    #[test]
    fn matrices_match_node_qrcode() {
        let mut n = 0;
        for line in REFERENCE.lines().filter(|l| !l.is_empty()) {
            let f: Vec<&str> = line.splitn(5, '\t').collect();
            let ecl = match f[0] {
                "L" => Ecl::L,
                "M" => Ecl::M,
                "Q" => Ecl::Q,
                _ => Ecl::H,
            };
            let text = unjson(f[4]);
            let s = create(&text, ecl).unwrap_or_else(|| panic!("{text:?} {ecl:?}"));
            assert_eq!(s.version.to_string(), f[1], "{text:?} {ecl:?} version");
            assert_eq!(s.mask.to_string(), f[2], "{text:?} {ecl:?} mask");
            let mut hex = String::new();
            for chunk in s.data.chunks(4) {
                let mut v = 0;
                for (k, &b) in chunk.iter().enumerate() {
                    v |= (b as u32) << (3 - k);
                }
                hex.push(char::from_digit(v, 16).unwrap());
            }
            assert_eq!(hex, f[3], "{text:?} {ecl:?} modules");
            n += 1;
        }
        assert!(n > 100, "{n} references");
    }

    #[test]
    fn discrete_matches_canvaskit() {
        // parity-tools/qr/discrete.txt: CanvasKit's DiscretePathEffect over the rounded path of
        // "reactiive.io" at H, size 378, length 10, deviation 3: its SVG string.
        const REF: &str = include_str!("../../../parity-tools/qr/discrete.txt");
        let mut lines = REF.lines();
        let header: Vec<f64> = lines
            .next()
            .unwrap()
            .split(' ')
            .map(|v| v.parse().unwrap())
            .collect();
        let s = create("reactiive.io", Ecl::H).unwrap();
        let mut src = Vec::new();
        rounded_path(&s, header[0], &mut src);
        let mut dst = Vec::new();
        discrete(&src, header[1] as f32, header[2] as f32, &mut dst);
        let want: Vec<f32> = lines
            .next()
            .unwrap()
            .split(' ')
            .map(|v| v.parse().unwrap())
            .collect();
        let mut got = Vec::new();
        for v in &dst {
            match *v {
                Verb::Move(p) | Verb::Line(p) => got.extend([p.x, p.y]),
                Verb::Quad(c, p) => got.extend([c.x, c.y, p.x, p.y]),
                Verb::Close => {}
            }
        }
        assert_eq!(got.len(), want.len());
        for (k, (a, b)) in got.iter().zip(&want).enumerate() {
            assert_eq!(a.to_bits(), b.to_bits(), "coordinate {k}: {a} vs {b}");
        }
    }
}
