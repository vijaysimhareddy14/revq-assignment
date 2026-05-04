import React from 'react'
import { Link } from 'react-router-dom'
import { useAllProducts } from './useProduct'

const s = {
  page: { maxWidth: 900, margin: '0 auto', padding: '32px 16px' },
  header: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, margin: 0, color: '#1a1d23' },
  sub: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 },
  card: {
    background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
    padding: 16, textDecoration: 'none', color: 'inherit',
    display: 'flex', flexDirection: 'column', gap: 8,
    transition: 'box-shadow 0.15s',
  },
  img: { width: '100%', height: 120, objectFit: 'contain', background: '#f9fafb', borderRadius: 6 },
  imgPlaceholder: {
    width: '100%', height: 120, background: '#f3f4f6', borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, color: '#9ca3af', letterSpacing: 1
  },
  name: { fontSize: 13, fontWeight: 600, lineHeight: 1.4 },
  platforms: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 'auto' },
  badge: { fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4 },
}

const PLATFORM_COLORS = {
  blinkit:  { bg: '#fef08a', color: '#713f12' },
  zepto:    { bg: '#e9d5ff', color: '#4c1d95' },
  instamart:{ bg: '#bbf7d0', color: '#14532d' },
}

const PLATFORM_LABELS = {
  blinkit: 'Blinkit',
  zepto: 'Zepto',
  instamart: 'Instamart',
}

export default function ProductList() {
  const products = useAllProducts()

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>RevQ · Yogabar</h1>
        <p style={s.sub}>{products.length} canonical products · 3 platforms · single-day snapshot</p>
      </div>
      <div style={s.grid}>
        {products.map(p => (
          <Link
            key={p.id}
            to={`/product/${p.id}`}
            style={s.card}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            {p.image_url
              ? <img src={p.image_url} alt={p.display_name} style={s.img} onError={e => { e.target.style.display='none' }} />
              : <div style={s.imgPlaceholder}>NO IMG</div>
            }
            <span style={s.name}>{p.display_name}</span>
            <div style={s.platforms}>
              {p.listings.map(l => {
                const c = PLATFORM_COLORS[l.platform_id] || { bg: '#e5e7eb', color: '#374151' }
                return (
                  <span key={l.platform_id} style={{ ...s.badge, background: c.bg, color: c.color }}>
                    {PLATFORM_LABELS[l.platform_id] || l.platform_id}
                  </span>
                )
              })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
