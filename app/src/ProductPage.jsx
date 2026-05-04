import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useProduct } from './useProduct'
import PriceTable from './PriceTable'
import AvailabilityPanel from './AvailabilityPanel'

const s = {
  page: { maxWidth: 860, margin: '0 auto', padding: '24px 16px' },
  back: { fontSize: 13, color: '#6b7280', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 },
  header: { display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap' },
  imgWrap: { flexShrink: 0, width: 100, height: 100, borderRadius: 10, overflow: 'hidden', background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  img: { width: '100%', height: '100%', objectFit: 'contain' },
  imgPlaceholder: { fontSize: 11, color: '#9ca3af', letterSpacing: 1 },
  meta: { flex: 1, minWidth: 0 },
  brand: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#6b7280', marginBottom: 4 },
  name: { fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginBottom: 6, margin: 0 },
  weight: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6b7280', marginBottom: 12, margin: '0 0 12px 0' },

  // Loading / error / empty
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 8 },
  errorBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '16px 20px', color: '#991b1b', fontSize: 14 },
  skeleton: { background: '#e5e7eb', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' },
}

function Skeleton({ width = '100%', height = 16, style = {} }) {
  return <div style={{ ...s.skeleton, width, height, ...style }} />
}

function LoadingState() {
  return (
    <div style={s.page}>
      <Skeleton width={60} height={14} style={{ marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
        <Skeleton width={100} height={100} style={{ borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <Skeleton width={60} height={11} style={{ marginBottom: 8 }} />
          <Skeleton width='75%' height={20} style={{ marginBottom: 8 }} />
          <Skeleton width={80} height={13} />
        </div>
      </div>
      <Skeleton height={13} width={120} style={{ marginBottom: 12 }} />
      <Skeleton height={120} style={{ borderRadius: 8, marginBottom: 24 }} />
      <Skeleton height={13} width={120} style={{ marginBottom: 12 }} />
      <Skeleton height={80} style={{ borderRadius: 8 }} />
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div style={s.page}>
      <Link to="/" style={s.back}>← All products</Link>
      <div style={s.errorBox}>
        <strong>Error</strong> — {message}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={s.page}>
      <Link to="/" style={s.back}>← All products</Link>
      <div style={{ ...s.center, color: '#6b7280', fontSize: 14 }}>
        <span style={{ fontSize: 32 }}>🔍</span>
        <span>No data found for this product.</span>
      </div>
    </div>
  )
}

export default function ProductPage() {
  const { id } = useParams()
  const { status, data: product, error } = useProduct(id)
  const [imgError, setImgError] = useState(false)

  if (status === 'loading') return <LoadingState />
  if (status === 'error')   return <ErrorState message={error} />
  if (!product || !product.listings?.length) return <EmptyState />

  const weightLabel = product.weight_grams
    ? product.weight_grams >= 1000
      ? `${product.weight_grams / 1000} kg`
      : `${product.weight_grams} g`
    : null

  return (
    <div style={s.page}>
      <Link to="/" style={s.back}>← All products</Link>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={s.header}>
        <div style={s.imgWrap}>
          {product.image_url && !imgError
            ? <img src={product.image_url} alt={product.display_name} style={s.img} onError={() => setImgError(true)} />
            : <span style={s.imgPlaceholder}>NO IMG</span>
          }
        </div>
        <div style={s.meta}>
          <div style={s.brand}>{product.brand}</div>
          <h1 style={s.name}>{product.display_name}</h1>
          {weightLabel && <div style={s.weight}>{weightLabel}</div>}
        </div>
      </div>

      {/* ── Price comparison ────────────────────────────────── */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Price comparison</h2>
        <PriceTable listings={product.listings} />
      </div>

      {/* ── Availability ────────────────────────────────────── */}
      <div style={s.section}>
        <h2 style={s.sectionTitle}>Availability</h2>
        <AvailabilityPanel listings={product.listings} />
      </div>
    </div>
  )
}
