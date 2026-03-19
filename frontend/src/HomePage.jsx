import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'

// ── Helpers ────────────────────────────────────────────────────
const STYLES = ['Bollywood', 'Bharatanatyam', 'Hip Hop', 'Contemporary', 'Kathak', 'Folk', 'Jazz', 'Fusion']
const LEVELS = ['absolute_beginner', 'beginner', 'intermediate', 'advanced']
const LEVEL_LABELS = { absolute_beginner: 'Absolute Beginner', beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }

const SORT_OPTIONS = [
  { value: 'soonest',   label: '🗓 Soonest' },
  { value: 'popular',   label: '🔥 Most Popular' },
  { value: 'price_asc', label: '₹ Price: Low → High' },
  { value: 'price_desc',label: '₹ Price: High → Low' },
  { value: 'newest',    label: '✨ Newest' },
]

const styleColors = {
  bollywood: '#c8430a', bharatanatyam: '#5b4fcf',
  contemporary: '#1a7a3c', hiphop: '#b5420e',
  kathak: '#8b4513', folk: '#c47800',
  jazz: '#1a5db5', fusion: '#7a1a7a',
}

function getStyleColor(tags) {
  const key = tags?.[0]?.toLowerCase().replace(/\s/g, '') || ''
  return styleColors[key] || '#c8430a'
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

function getLowestPrice(tiers) {
  if (!tiers?.length) return 0
  return Math.min(...tiers.map(t => t.price))
}

function isDateInRange(dateStr, range) {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOfWeek = today.getDay()

  if (range === 'today') {
    return d >= today && d < new Date(today.getTime() + 86400000)
  }
  if (range === 'weekend') {
    // This coming Sat & Sun
    const sat = new Date(today)
    sat.setDate(today.getDate() + ((6 - dayOfWeek + 7) % 7 || 7))
    const sun = new Date(sat)
    sun.setDate(sat.getDate() + 1)
    const endSun = new Date(sun.getTime() + 86400000)
    return d >= sat && d < endSun
  }
  if (range === 'week') {
    const endOfWeek = new Date(today.getTime() + 7 * 86400000)
    return d >= today && d < endOfWeek
  }
  if (range === 'next_week') {
    const startNext = new Date(today.getTime() + 7 * 86400000)
    const endNext = new Date(today.getTime() + 14 * 86400000)
    return d >= startNext && d < endNext
  }
  return true // 'all'
}

// ── SessionCard ────────────────────────────────────────────────
function SessionCard({ session, onClick, onChoreoClick }) {
  const tiers = session.price_tiers || []
  const lowestPrice = getLowestPrice(tiers)
  const totalSeats = tiers.reduce((sum, t) => sum + t.seats, 0)
  const bookedCount = session.bookings_count || 0
  const pct = totalSeats > 0 ? bookedCount / totalSeats : 0
  const isFull = session.status === 'full' || bookedCount >= totalSeats
  const isHot = pct >= 0.7 && !isFull
  const seatsLeft = totalSeats - bookedCount
  const color = getStyleColor(session.style_tags)
  const isNew = session.created_at && (Date.now() - new Date(session.created_at)) < 7 * 86400000

  return (
    <div
      onClick={onClick}
      style={{
        background: 'white', borderRadius: 16, overflow: 'hidden',
        border: '1px solid #e2dbd4', cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.12)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Cover */}
      <div style={{
        height: 130, background: color,
        display: 'flex', alignItems: 'flex-end',
        padding: '10px 14px', position: 'relative',
      }}>
        {/* Badges */}
        <div style={{ position: 'absolute', top: 10, left: 14, display: 'flex', gap: 6 }}>
          <span style={{
            background: 'rgba(0,0,0,0.35)', color: 'white',
            fontSize: 10, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', padding: '3px 8px', borderRadius: 20,
          }}>
            {session.style_tags?.[0] || 'Dance'}
          </span>
          {isNew && (
            <span style={{ background: '#e8a020', color: 'white', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20 }}>
              NEW
            </span>
          )}
        </div>
        {isHot && (
          <div style={{
            position: 'absolute', top: 10, right: 14,
            background: 'rgba(200,67,10,0.9)', color: 'white',
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
          }}>
            🔥 Filling fast
          </div>
        )}
        {isFull && (
          <div style={{
            position: 'absolute', top: 10, right: 14,
            background: 'rgba(0,0,0,0.6)', color: 'white',
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
          }}>
            FULL
          </div>
        )}
        {/* Choreo name bottom of cover */}
        <div
          onClick={e => { e.stopPropagation(); onChoreoClick && onChoreoClick(session.choreographer_id) }}
          style={{
            background: 'rgba(0,0,0,0.45)', color: 'white',
            fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
            cursor: onChoreoClick ? 'pointer' : 'default',
            textDecoration: onChoreoClick ? 'underline' : 'none',
          }}
        >
          {session.profiles?.full_name || 'Choreographer'}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: '#0f0c0c',
          marginBottom: 6, lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {session.title}
        </div>

        <div style={{ fontSize: 12, color: '#7a6e65', marginBottom: 10 }}>
          📅 {formatDate(session.scheduled_at)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{
            background: '#f0ebe6', color: '#5a4e47',
            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
          }}>
            {LEVEL_LABELS[session.skill_level] || session.skill_level || '—'}
          </span>
          <span style={{ fontSize: 12, color: isFull ? '#cc0000' : '#7a6e65' }}>
            {isFull ? 'Join Waitlist' : `${seatsLeft} seats left`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f0c0c' }}>
            {lowestPrice > 0 ? `₹${lowestPrice}` : 'Free'}
            {tiers.length > 1 && <span style={{ fontSize: 12, fontWeight: 400, color: '#7a6e65' }}> onwards</span>}
          </div>
          <button style={{
            background: isFull ? '#333' : '#c8430a',
            color: 'white', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {isFull ? 'Waitlist' : 'Book'}
          </button>
        </div>
      </div>
    </div>
  )
}

const AGE_GROUPS = ['All', 'Kids', 'Teens', 'Adults', 'Seniors']

// ── FilterPanel ────────────────────────────────────────────────
function FilterPanel({ filters, onChange, onReset, activeCount, ageFilter, onAgeChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (key, val) => {
    const arr = filters[key]
    onChange(key, arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: activeCount > 0 ? '#c8430a' : 'white',
          color: activeCount > 0 ? 'white' : '#0f0c0c',
          border: '1px solid #e2dbd4', borderRadius: 10,
          padding: '8px 16px', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        ⚙️ Filters {activeCount > 0 && `(${activeCount})`}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, left: 0, zIndex: 100,
          background: 'white', borderRadius: 16, border: '1px solid #e2dbd4',
          boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
          padding: 24, width: 360,
        }}>
          {/* Date */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Date</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[['all', 'Any time'], ['today', 'Today'], ['weekend', 'This Weekend'], ['week', 'This Week'], ['next_week', 'Next Week']].map(([val, label]) => (
                <button key={val} onClick={() => onChange('date', val)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid #e2dbd4',
                    background: filters.date === val ? '#0f0c0c' : 'white',
                    color: filters.date === val ? 'white' : '#5a4e47',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Price */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Price</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[['all', 'Any'], ['free', 'Free'], ['under500', 'Under ₹500'], ['500to1000', '₹500–1000'], ['above1000', '₹1000+']].map(([val, label]) => (
                <button key={val} onClick={() => onChange('price', val)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid #e2dbd4',
                    background: filters.price === val ? '#0f0c0c' : 'white',
                    color: filters.price === val ? 'white' : '#5a4e47',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Skill Level */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Skill Level</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LEVELS.map(val => (
                <button key={val} onClick={() => toggle('levels', val)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid #e2dbd4',
                    background: filters.levels.includes(val) ? '#0f0c0c' : 'white',
                    color: filters.levels.includes(val) ? 'white' : '#5a4e47',
                  }}>
                  {LEVEL_LABELS[val]}
                </button>
              ))}
            </div>
          </div>

          {/* Availability */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Availability</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['open_only', 'Open only'], ['include_full', 'Include Full']].map(([val, label]) => (
                <button key={val} onClick={() => onChange('availability', val)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid #e2dbd4',
                    background: filters.availability === val ? '#0f0c0c' : 'white',
                    color: filters.availability === val ? 'white' : '#5a4e47',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Age Group */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Age Group</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {AGE_GROUPS.map(ag => {
                const isActive = ag === 'All' ? !ageFilter : ageFilter === ag
                return (
                  <button key={ag} onClick={() => onAgeChange(ag === 'All' ? null : ag)}
                    style={{
                      padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid #e2dbd4',
                      background: isActive ? '#0f0c0c' : 'white',
                      color: isActive ? 'white' : '#5a4e47',
                    }}>
                    {ag === 'All' ? 'All Ages' : ag}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Reset */}
          {activeCount > 0 && (
            <button onClick={() => { onReset(); setOpen(false) }}
              style={{
                width: '100%', background: '#faf7f2', border: '1px solid #e2dbd4',
                borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', color: '#7a6e65',
              }}>
              Reset all filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main HomePage ──────────────────────────────────────────────
export default function HomePage({ onLoginClick, user, onLogout, onSessionClick, profile, onSwitchToTeaching, onProfileClick }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  // Style filter (quick chips)
  const [styleFilter, setStyleFilter] = useState('All')

  // Age group filter — null means no filter (show all)
  const [ageFilter, setAgeFilter] = useState(null)

  // Sort
  const [sort, setSort] = useState('soonest')

  // Advanced filters
  const [filters, setFilters] = useState({
    date: 'all',
    price: 'all',
    levels: [],
    availability: 'open_only',
  })

  useEffect(() => { fetchSessions() }, [])

  async function fetchSessions() {
    setLoading(true)
    const { data, error } = await supabase
      .from('sessions')
      .select('*, profiles(full_name)')
      .in('status', ['open', 'confirmed', 'full'])
      .order('scheduled_at', { ascending: true })

    if (error) console.error('Error fetching sessions:', error)
    else setSessions(data || [])
    setLoading(false)
  }

  function updateFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val }))
  }

  function resetFilters() {
    setFilters({ date: 'all', price: 'all', levels: [], availability: 'open_only' })
    setStyleFilter('All')
    setAgeFilter(null)
    setSort('soonest')
  }

  // Count active non-default filters
  const activeFilterCount = [
    filters.date !== 'all',
    filters.price !== 'all',
    filters.levels.length > 0,
    filters.availability !== 'open_only',
    styleFilter !== 'All',
    !!ageFilter,
  ].filter(Boolean).length

  // ── Apply filters ──
  let filtered = sessions.filter(s => {
    // Style
    if (styleFilter !== 'All') {
      const match = s.style_tags?.some(
        tag => tag.toLowerCase().replace(/\s/g, '') === styleFilter.toLowerCase().replace(/\s/g, '')
      )
      if (!match) return false
    }
    // Age group — null/'All Ages' = no filter; specific value = must match or session must include 'All Ages'
    const ageMatch = !ageFilter || ageFilter === 'All Ages' || (Array.isArray(s.age_groups) && s.age_groups.length > 0 && (s.age_groups.includes(ageFilter) || s.age_groups.includes('All Ages')))
    if (!ageMatch) return false
    // Date
    if (filters.date !== 'all' && !isDateInRange(s.scheduled_at, filters.date)) return false
    // Price
    const price = getLowestPrice(s.price_tiers)
    if (filters.price === 'free' && price > 0) return false
    if (filters.price === 'under500' && price >= 500) return false
    if (filters.price === '500to1000' && (price < 500 || price > 1000)) return false
    if (filters.price === 'above1000' && price < 1000) return false
    // Level
    if (filters.levels.length > 0 && !filters.levels.includes(s.skill_level)) return false
    // Availability
    if (filters.availability === 'open_only' && s.status === 'full') return false
    return true
  })

  // ── Apply sort ──
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'soonest') return new Date(a.scheduled_at) - new Date(b.scheduled_at)
    if (sort === 'newest') return new Date(b.created_at) - new Date(a.created_at)
    if (sort === 'price_asc') return getLowestPrice(a.price_tiers) - getLowestPrice(b.price_tiers)
    if (sort === 'price_desc') return getLowestPrice(b.price_tiers) - getLowestPrice(a.price_tiers)
    if (sort === 'popular') {
      const pctA = a.bookings_count / (a.max_seats || 1)
      const pctB = b.bookings_count / (b.max_seats || 1)
      return pctB - pctA
    }
    return 0
  })

  const isPendingChoreo = profile?.role === 'choreographer' && !profile?.choreographer_approved

  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }}>

      {/* NAV */}
      <nav style={{
        background: '#0f0c0c', padding: '0 40px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 900, color: '#faf7f2' }}>
          Nrithya<span style={{ color: '#c8430a' }}>Holics</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {user && profile?.role === 'choreographer' && profile?.choreographer_approved && (
            <button onClick={onSwitchToTeaching} style={{
              background: '#c8430a', color: 'white', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer'
            }}>🎭 Switch to Teaching</button>
          )}
          {user ? (
            <>
              <button onClick={onProfileClick} style={{
                background: 'transparent', border: '1px solid rgba(250,247,242,0.3)',
                color: '#faf7f2', padding: '8px 16px', borderRadius: 8,
                cursor: 'pointer', fontSize: 14,
              }}>My Profile</button>
              <button onClick={onLogout} style={{
                background: 'transparent', border: '1px solid rgba(250,247,242,0.3)',
                color: '#faf7f2', padding: '8px 16px', borderRadius: 8,
                cursor: 'pointer', fontSize: 14,
              }}>Log out</button>
            </>
          ) : (
            <button onClick={onLoginClick} style={{
              background: '#c8430a', color: 'white', border: 'none',
              padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
            }}>Sign in</button>
          )}
        </div>
      </nav>

      {/* Pending choreo banner */}
      {isPendingChoreo && (
        <div style={{
          background: '#fff8e6', borderBottom: '1px solid #e8a020',
          padding: '12px 40px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <span style={{ fontSize: 14, color: '#5a4e47' }}>
            Your choreographer application is under review. We'll notify you once approved.
          </span>
        </div>
      )}

      {/* HERO */}
      <div style={{
        background: '#0f0c0c', padding: '48px 40px 40px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontFamily: 'Georgia, serif', fontSize: 'clamp(28px, 5vw, 52px)',
          fontWeight: 900, color: '#faf7f2', marginBottom: 8, lineHeight: 1.1,
        }}>
          Learn from India's best<br />
          <span style={{ color: '#c8430a' }}>dance choreographers.</span>
        </h1>
        <p style={{ color: 'rgba(250,247,242,0.5)', fontSize: 16, marginBottom: 32 }}>
          Live online classes. Book a seat. Dance from anywhere.
        </p>

        {/* Style chips */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['All', ...STYLES].map(s => (
            <button key={s} onClick={() => setStyleFilter(s)} style={{
              background: styleFilter === s ? '#c8430a' : 'rgba(250,247,242,0.1)',
              color: '#faf7f2', border: '1px solid rgba(250,247,242,0.2)',
              padding: '7px 16px', borderRadius: 20, cursor: 'pointer',
              fontSize: 13, fontWeight: styleFilter === s ? 600 : 400,
              transition: 'all 0.15s',
            }}>{s}</button>
          ))}
        </div>

        {/* Age group chips */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          {['All Ages', 'Kids', 'Teens', 'Adults', 'Seniors'].map(ag => {
            const isActive = ag === 'All Ages' ? !ageFilter : ageFilter === ag
            return (
              <button key={ag} onClick={() => setAgeFilter(ag === 'All Ages' ? null : ag)} style={{
                background: isActive ? '#5b4fcf' : 'rgba(250,247,242,0.07)',
                color: '#faf7f2', border: '1px solid rgba(250,247,242,0.15)',
                padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s',
              }}>{ag}</button>
            )
          })}
        </div>
      </div>

      {/* FILTER + SORT BAR */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2dbd4',
        padding: '12px 40px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
        position: 'sticky', top: 64, zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FilterPanel
            filters={filters}
            onChange={updateFilter}
            onReset={resetFilters}
            activeCount={activeFilterCount}
            ageFilter={ageFilter}
            onAgeChange={setAgeFilter}
          />
          {/* Active filter pills */}
          {filters.date !== 'all' && (
            <FilterPill label={`Date: ${filters.date.replace('_', ' ')}`} onRemove={() => updateFilter('date', 'all')} />
          )}
          {filters.price !== 'all' && (
            <FilterPill label={`Price: ${filters.price}`} onRemove={() => updateFilter('price', 'all')} />
          )}
          {filters.levels.map(l => (
            <FilterPill key={l} label={LEVEL_LABELS[l]} onRemove={() => updateFilter('levels', filters.levels.filter(x => x !== l))} />
          ))}
          {filters.availability === 'include_full' && (
            <FilterPill label="Including Full" onRemove={() => updateFilter('availability', 'open_only')} />
          )}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#7a6e65', whiteSpace: 'nowrap' }}>Sort by</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{
              background: 'white', border: '1px solid #e2dbd4',
              borderRadius: 8, padding: '7px 12px', fontSize: 13,
              color: '#0f0c0c', fontWeight: 600, cursor: 'pointer', outline: 'none',
            }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* SESSION GRID */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 24px' }}>

        {/* Results count */}
        {!loading && (
          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: '#7a6e65' }}>
              {filtered.length === 0
                ? 'No sessions found'
                : `${filtered.length} session${filtered.length !== 1 ? 's' : ''} found`}
            </span>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} style={{
                background: 'none', border: 'none', color: '#c8430a',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                Clear all filters
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', color: '#7a6e65', padding: '80px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>💃</div>
            Loading sessions...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7a6e65', padding: '80px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f0c0c', marginBottom: 8 }}>No sessions match your filters</div>
            <div style={{ fontSize: 14, marginBottom: 24 }}>Try adjusting or clearing your filters</div>
            <button onClick={resetFilters} style={{
              background: '#c8430a', color: 'white', border: 'none',
              borderRadius: 10, padding: '12px 24px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer',
            }}>Clear all filters</button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
            gap: 24,
          }}>
            {filtered.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                onClick={() => onSessionClick(s.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── FilterPill ─────────────────────────────────────────────────
function FilterPill({ label, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: '#f0ebe6', borderRadius: 20,
      padding: '4px 10px 4px 12px', fontSize: 12, fontWeight: 600, color: '#5a4e47',
    }}>
      {label}
      <button onClick={onRemove} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#7a6e65', fontSize: 14, lineHeight: 1, padding: 0,
      }}>×</button>
    </div>
  )
}
