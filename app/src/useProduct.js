import { useState, useEffect } from 'react'

// In production this would be a fetch() to /api/product/:id
// Here we import the pre-built JSON directly (no server needed).
import allProducts from './data.json'

const productMap = Object.fromEntries(allProducts.map(p => [p.id, p]))

export function useProduct(id) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  useEffect(() => {
    // Simulate async fetch so loading state is exercised
    setState({ status: 'loading', data: null, error: null })
    const timer = setTimeout(() => {
      const product = productMap[id]
      if (!product) {
        setState({ status: 'error', data: null, error: 'Product not found' })
      } else {
        setState({ status: 'ok', data: product, error: null })
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [id])

  return state
}

export function useAllProducts() {
  return allProducts
}
