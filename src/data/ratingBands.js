/** Rating bands used for the "solved by rating" breakdown and achievements. */
export const RATING_BANDS = [
  { id: '500-999',   label: '500–999',   min: 0,    max: 999 },
  { id: '1000-1499', label: '1000–1499', min: 1000, max: 1499 },
  { id: '1500-1999', label: '1500–1999', min: 1500, max: 1999 },
  { id: '2000+',     label: '2000+',     min: 2000, max: Infinity },
]

/** Map a puzzle rating to one of RATING_BANDS' ids. */
export function getRatingBand(rating) {
  const band = RATING_BANDS.find(b => rating >= b.min && rating <= b.max)
  return band ? band.id : RATING_BANDS[0].id
}
