import { useState, useEffect, useCallback } from 'react'

const PAGE = 50

const FILTERS = [
  { key: 'all',         label: 'All' },
  { key: 'computer',    label: 'vs Computer' },
  { key: 'multiplayer', label: 'Multiplayer' },
]

function outcomeLabel(outcome) {
  if (outcome === 'win')  return 'Win'
  if (outcome === 'loss') return 'Loss'
  if (outcome === 'draw') return 'Draw'
  return '—'
}

export default function GameHistoryBrowser({ user, supabase, onReview }) {
  const [filter,  setFilter]  = useState('all')
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [offset,  setOffset]  = useState(0)

  const fetchPage = useCallback(async (activeFilter, currentOffset, replace) => {
    if (!user?.id || !supabase) return
    setLoading(true)
    setError(null)

    let query = supabase
      .from('game_history')
      .select('id, game_mode, opponent_name, player_color, game_outcome, pgn_string, accuracy_score, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(currentOffset, currentOffset + PAGE - 1)

    if (activeFilter !== 'all') {
      query = query.eq('game_mode', activeFilter)
    }

    const { data, error: err } = await query
    setLoading(false)

    if (err) {
      setError('Could not load game history.')
      return
    }

    const next = data || []
    setRows(prev => replace ? next : [...prev, ...next])
    setHasMore(next.length === PAGE)
    setOffset(currentOffset + next.length)
  }, [user?.id, supabase])

  // Reset + refetch on filter change or user change
  useEffect(() => {
    setRows([])
    setOffset(0)
    setHasMore(false)
    fetchPage(filter, 0, true)
  }, [filter, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleLoadMore() {
    fetchPage(filter, offset, false)
  }

  if (!user?.id) {
    return <p className="settings-hint">Sign in to view game history.</p>
  }

  return (
    <div className="ghb-root">
      <div className="ghb-filters">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`ghb-filter-btn${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && rows.length === 0 && (
        <p className="settings-hint">Loading…</p>
      )}

      {error && <p className="settings-hint">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="settings-hint">No games found.</p>
      )}

      {rows.map(g => {
        const date    = new Date(g.created_at).toLocaleDateString()
        const mode    = g.game_mode === 'multiplayer' ? 'Multiplayer' : 'vs Computer'
        const color   = g.player_color === 'white' ? 'White' : g.player_color === 'black' ? 'Black' : null
        const outcome = g.game_outcome
        const hasPgn  = !!g.pgn_string?.trim()

        return (
          <div className="ghb-row" key={g.id}>
            <span className="ghb-meta">
              <span className="ghb-date">{date}</span>
              <span className={`ghb-mode ghb-mode-${g.game_mode}`}>{mode}</span>
              {color && <span className="ghb-color">{color}</span>}
              <span className={`ghb-outcome ghb-outcome-${outcome}`}>
                {outcomeLabel(outcome)}
              </span>
              {g.accuracy_score != null && (
                <span className="ghb-accuracy">{g.accuracy_score}%</span>
              )}
            </span>
            <button
              className="link-btn"
              onClick={() => {
                if (!hasPgn) return
                const col = g.player_color === 'black' ? 'b' : 'w'
                onReview(g.pgn_string, col)
              }}
              disabled={!hasPgn}
            >
              Review
            </button>
          </div>
        )
      })}

      {hasMore && (
        <button
          className="ghb-load-more"
          onClick={handleLoadMore}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
