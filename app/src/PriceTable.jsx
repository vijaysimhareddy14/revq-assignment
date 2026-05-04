import React from 'react'

const PLATFORM_META = {
  blinkit:  { label: 'Blinkit',   color: '#eab308', bg: '#fefce8' },
  zepto:    { label: 'Zepto',     color: '#7c3aed', bg: '#f5f3ff' },
  instamart:{ label: 'Instamart', color: '#16a34a', bg: '#f0fdf4' },
}

const s = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '12px 14px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' },
  lastRow: { borderBottom: 'none' },
  platformBadge: { display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  price: { fontWeight: 700, fontSize: 15 },
  mrp: { color: '#9ca3af', textDecoration: 'line-through', fontSize: 13 },
  discountBadge: { display: 'inline-block', background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20 },
  scraped: { fontSize: 11, color: '#9ca3af' },
  empty: { padding: '20px 14px', color: '#6b7280', fontSize: 13, textAlign: 'center' },
  notListed: { color: '#d1d5db', fontSize: 13, fontStyle: 'italic' },
}

function formatDate(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function DiscountBadge({ pct }) {
  if (!pct) return null
  return <span style={s.discountBadge}>{Math.round(pct)}% off</span>
}

const ALL_PLATFORMS = ['blinkit', 'zepto', 'instamart']

export default function PriceTable({ listings }) {
  if (!listings || listings.length === 0) {
    return <div style={{ ...s.table, ...s.empty }}>No pricing data available.</div>
  }

  const listingByPlatform = Object.fromEntries(listings.map(l => [l.platform_id, l]))

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Platform</th>
          <th style={s.th}>Price</th>
          <th style={s.th}>MRP</th>
          <th style={s.th}>Discount</th>
          <th style={s.th}>Last scraped</th>
        </tr>
      </thead>
      <tbody>
        {ALL_PLATFORMS.map((pid, i) => {
          const meta = PLATFORM_META[pid] || { label: pid, color: '#6b7280', bg: '#f9fafb' }
          const listing = listingByPlatform[pid]
          const isLast = i === ALL_PLATFORMS.length - 1

          return (
            <tr key={pid}>
              <td style={{ ...s.td, ...(isLast ? s.lastRow : {}) }}>
                <span style={s.platformBadge}>
                  <span style={{ ...s.dot, background: meta.color }} />
                  {meta.label}
                </span>
              </td>
              {listing ? (
                <>
                  <td style={{ ...s.td, ...(isLast ? s.lastRow : {}) }}>
                    <span style={s.price}>₹{listing.selling_price}</span>
                  </td>
                  <td style={{ ...s.td, ...(isLast ? s.lastRow : {}) }}>
                    <span style={s.mrp}>₹{listing.mrp}</span>
                  </td>
                  <td style={{ ...s.td, ...(isLast ? s.lastRow : {}) }}>
                    <DiscountBadge pct={listing.discount_pct} />
                  </td>
                  <td style={{ ...s.td, ...(isLast ? s.lastRow : {}) }}>
                    <span style={s.scraped}>{formatDate(listing.last_scraped_at)}</span>
                  </td>
                </>
              ) : (
                <td colSpan={4} style={{ ...s.td, ...(isLast ? s.lastRow : {}) }}>
                  <span style={s.notListed}>Not listed on this platform</span>
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
