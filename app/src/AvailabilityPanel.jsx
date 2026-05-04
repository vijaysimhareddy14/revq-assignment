import React, { useState } from 'react'

const PLATFORM_META = {
  blinkit:  { label: 'Blinkit',   color: '#eab308' },
  zepto:    { label: 'Zepto',     color: '#7c3aed' },
  instamart:{ label: 'Instamart', color: '#16a34a' },
}

const ALL_PLATFORMS = ['blinkit', 'zepto', 'instamart']

const s = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 },
  platformRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  platformLabel: { fontWeight: 700, fontSize: 13 },
  stat: { fontSize: 22, fontWeight: 800, lineHeight: 1 },
  statSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  barWrap: { marginTop: 12, height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999, transition: 'width 0.4s' },
  oosSection: { marginTop: 12 },
  oosTitle: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9ca3af', marginBottom: 6 },
  oosToggle: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6b7280', padding: 0, textDecoration: 'underline' },
  pinList: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  pin: { background: '#fef2f2', color: '#991b1b', fontSize: 11, padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' },
  notListed: { color: '#9ca3af', fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  scrapeNote: { fontSize: 10, color: '#d1d5db', marginTop: 10 },
}

function AvailabilityCard({ listing }) {
  const [showOos, setShowOos] = useState(false)
  const meta = PLATFORM_META[listing.platform_id] || { label: listing.platform_id, color: '#6b7280' }
  const pct = listing.total_pincodes > 0
    ? Math.round((listing.live_pincodes / listing.total_pincodes) * 100)
    : 0
  const barColor = pct === 100 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444'

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch { return iso }
  }

  return (
    <div style={s.card}>
      <div style={s.platformRow}>
        <span style={{ ...s.dot, background: meta.color }} />
        <span style={s.platformLabel}>{meta.label}</span>
      </div>

      <div style={s.stat}>{listing.live_pincodes} <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280' }}>/ {listing.total_pincodes}</span></div>
      <div style={s.statSub}>pincodes live</div>

      <div style={s.barWrap}>
        <div style={{ ...s.barFill, width: `${pct}%`, background: barColor }} />
      </div>

      {listing.oos_pincodes?.length > 0 && (
        <div style={s.oosSection}>
          <div style={s.oosTitle}>Out of stock</div>
          <button style={s.oosToggle} onClick={() => setShowOos(v => !v)}>
            {showOos ? 'Hide' : `Show ${listing.oos_pincodes.length} pincode${listing.oos_pincodes.length > 1 ? 's' : ''}`}
          </button>
          {showOos && (
            <div style={s.pinList}>
              {listing.oos_pincodes.map(pin => (
                <span key={pin} style={s.pin}>{pin}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={s.scrapeNote}>Scraped {formatDate(listing.last_scraped_at)}</div>
    </div>
  )
}

function NotListedCard({ platformId }) {
  const meta = PLATFORM_META[platformId] || { label: platformId, color: '#d1d5db' }
  return (
    <div style={{ ...s.card, opacity: 0.5 }}>
      <div style={s.platformRow}>
        <span style={{ ...s.dot, background: '#d1d5db' }} />
        <span style={{ ...s.platformLabel, color: '#9ca3af' }}>{meta.label}</span>
      </div>
      <div style={s.notListed}>Not listed on this platform</div>
    </div>
  )
}

export default function AvailabilityPanel({ listings }) {
  if (!listings || listings.length === 0) {
    return <div style={{ color: '#6b7280', fontSize: 13 }}>No availability data.</div>
  }

  const listingByPlatform = Object.fromEntries(listings.map(l => [l.platform_id, l]))

  return (
    <div style={s.grid}>
      {ALL_PLATFORMS.map(pid =>
        listingByPlatform[pid]
          ? <AvailabilityCard key={pid} listing={listingByPlatform[pid]} />
          : <NotListedCard key={pid} platformId={pid} />
      )}
    </div>
  )
}
