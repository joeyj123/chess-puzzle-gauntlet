/**
 * generate-puzzles.mjs
 *
 * Reads lichess_db_puzzle.csv from the project root (gitignored, ~1.1GB)
 * and writes a filtered, balanced public/puzzles.json.
 *
 * Usage (from project root):
 *   node scripts/generate-puzzles.mjs
 *
 * Requirements:
 *   - Node.js 18+ (uses built-in readline + fs streams, no extra packages)
 *   - lichess_db_puzzle.csv must exist in the project root
 *
 * Lichess CSV columns (no header row — they define it this way):
 *   0  PuzzleId
 *   1  FEN
 *   2  Moves          (space-separated UCI, e.g. "e2e4 d7d5 c2c4")
 *   3  Rating
 *   4  RatingDeviation
 *   5  Popularity     (−100 to 100)
 *   6  NbPlays
 *   7  Themes         (space-separated)
 *   8  GameUrl
 *   9  OpeningTags    (may be empty)
 */

import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const CSV_PATH  = join(ROOT, 'lichess_db_puzzle.csv')
const OUT_PATH  = join(ROOT, 'public', 'puzzles.json')

// ── Filters ──────────────────────────────────────────────────────────────────

const MIN_RATING     = 500
const MAX_RATING     = 2500
const MAX_RD         = 75    // RatingDeviation — lower = more reliable rating
const MIN_PLAYS      = 50    // ignore puzzles nobody has tried
const MIN_POPULARITY = -10   // filter out actively disliked puzzles

// ── Target distribution ───────────────────────────────────────────────────────
// We want ~27,000 puzzles with a roughly even spread across rating bands.
// Adjust TARGET_TOTAL and BANDS to taste.

const TARGET_TOTAL = 27000

const BANDS = [
  { min:  500, max:  799, share: 0.12 },   // ~3,240  beginner
  { min:  800, max: 1099, share: 0.18 },   // ~4,860  easy
  { min: 1100, max: 1399, share: 0.22 },   // ~5,940  medium-low
  { min: 1400, max: 1699, share: 0.22 },   // ~5,940  medium-high
  { min: 1700, max: 1999, share: 0.16 },   // ~4,320  hard
  { min: 2000, max: 2500, share: 0.10 },   // ~2,700  expert
]

// Compute per-band quota
const quotas = BANDS.map(b => ({
  ...b,
  quota: Math.round(TARGET_TOTAL * b.share),
  collected: [],
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLine(line) {
  // CSV is comma-separated; fields don't contain commas, so split is safe
  const parts = line.split(',')
  if (parts.length < 8) return null

  const id      = parts[0].trim()
  const fen     = parts[1].trim()
  const moves   = parts[2].trim().split(' ').filter(Boolean)
  const rating  = parseInt(parts[3], 10)
  const rd      = parseInt(parts[4], 10)
  const pop     = parseInt(parts[5], 10)
  const plays   = parseInt(parts[6], 10)
  const themes  = parts[7].trim().split(' ').filter(Boolean)

  if (!id || !fen || moves.length < 2) return null
  if (isNaN(rating) || isNaN(rd) || isNaN(plays)) return null

  return { id, fen, moves, rating, rd, pop, plays, themes }
}

function passesFilter(p) {
  return (
    p.rating  >= MIN_RATING &&
    p.rating  <= MAX_RATING &&
    p.rd      <= MAX_RD     &&
    p.plays   >= MIN_PLAYS  &&
    p.pop     >= MIN_POPULARITY
  )
}

function bandFor(rating) {
  return quotas.find(b => rating >= b.min && rating <= b.max)
}

// ── Stream the CSV ────────────────────────────────────────────────────────────

console.log(`Reading ${CSV_PATH} …`)
console.log(`Target: ${TARGET_TOTAL.toLocaleString()} puzzles`)
console.log()

let linesRead   = 0
let linesKept   = 0
let allFull     = false

const rl = createInterface({
  input: createReadStream(CSV_PATH, { encoding: 'utf8' }),
  crlfDelay: Infinity,
})

for await (const line of rl) {
  linesRead++

  // Progress tick every 500k lines
  if (linesRead % 500000 === 0) {
    const kept = quotas.reduce((s, b) => s + b.collected.length, 0)
    process.stdout.write(`  …${(linesRead / 1e6).toFixed(1)}M lines read, ${kept.toLocaleString()} kept\r`)
  }

  // Skip the header row if present (Lichess files sometimes include one)
  if (linesRead === 1 && line.startsWith('PuzzleId')) continue

  if (allFull) {
    // All bands are at quota — we can stop early
    rl.close()
    break
  }

  const p = parseLine(line)
  if (!p || !passesFilter(p)) continue

  const band = bandFor(p.rating)
  if (!band || band.collected.length >= band.quota) continue

  band.collected.push({
    id:     p.id,
    fen:    p.fen,
    moves:  p.moves,
    themes: p.themes,
    rating: p.rating,
  })
  linesKept++

  // Check if all bands are now full
  allFull = quotas.every(b => b.collected.length >= b.quota)
}

// ── Assemble + shuffle output ─────────────────────────────────────────────────

process.stdout.write('\n')

const all = quotas.flatMap(b => b.collected)

// Fisher-Yates shuffle so the queue isn't sorted by rating
for (let i = all.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1))
  ;[all[i], all[j]] = [all[j], all[i]]
}

// ── Write output ──────────────────────────────────────────────────────────────

console.log(`Writing ${OUT_PATH} …`)
await writeFile(OUT_PATH, JSON.stringify(all), 'utf8')

const fileSizeKB = Math.round(JSON.stringify(all).length / 1024)
console.log()
console.log('✓ Done!')
console.log(`  Total puzzles : ${all.length.toLocaleString()}`)
console.log(`  File size     : ~${(fileSizeKB / 1024).toFixed(1)} MB`)
console.log()
console.log('Band breakdown:')
quotas.forEach(b => {
  const pct = ((b.collected.length / all.length) * 100).toFixed(1)
  console.log(`  ${String(b.min).padStart(4)}–${b.max}  ${String(b.collected.length).padStart(5)} puzzles  (${pct}%)`)
})
console.log()
console.log('Now commit and push:')
console.log('  git add public/puzzles.json')
console.log('  git commit -m "Expand puzzle set to ~27k"')
console.log('  git push')
