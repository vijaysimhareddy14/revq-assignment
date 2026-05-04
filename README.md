# RevQ Take-Home Assignment

## 🚀 Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/vijaysimhareddy14/revq-assignment.git
cd revq-assignment
```

---

### 2. Recreate Database

The SQLite database (`revq.db`) is not included in the repo.

Run:

```bash
cd ingest
python3 ingest.py ../data/blinkit_sample.json
python3 ingest.py ../data/zepto_sample.json
python3 ingest.py ../data/instamart_sample.json
```

This will generate a fresh database with all products and mappings.

---

### 3. Run Frontend

```bash
nvm install 20
nvm use 20
cd app
npm install
npm run dev
```

Open: http://localhost:5173

---

## 1. Cross-platform Product Identity — how I solved it, what breaks it

Each canonical product gets a deterministic slug:

```
brand_slug | sorted_flavour_tokens | weight_grams
```

### Normalisation steps

* **Weight**: convert kg → g, extract from display name if needed
* **Brand**: lowercased, aliased (`yoga bar` → `yogabar`)
* **Flavour/name**:

  * lowercase
  * remove brand + weight + pack noise (`pack`, `of`, `6`, `gm`, `x`, etc.)
  * tokenize → sort → deduplicate (order-insensitive)

This produces stable identifiers across platforms.

---

### What breaks it

* **Subvariant naming**
  Example:

  * `Almond + Cashew Crunch Muesli` vs `Almond Crunch Muesli`
    → treated as separate (intentionally conservative)

* **Variety packs**
  Different ingredient listings across platforms lead to different slugs

* **Name drift over time**
  Renames create duplicate canonical products

* **Missing weight field**
  Falls back to name-only matching → less reliable

* **Inconsistent pack encoding**
  e.g. `6X60GM`, `Pack of 6 (360g)`, `Pack of 6 | 60g`

---

### Result

* 47 canonical products from 48 platform listings
* High precision, lower recall (intentional)

> Sample dataset has limited cross-platform overlap, so only a few products match across platforms.

---

## 2. Component Tree

```
main.jsx
├── ProductList
└── ProductPage (/product/:id)
    ├── LoadingState
    ├── ErrorState
    ├── EmptyState
    ├── Header (inline)
    ├── PriceTable
    └── AvailabilityPanel
        └── AvailabilityCard
```

### Rationale

* `ProductPage` owns data fetching
* `PriceTable` and `AvailabilityPanel` are independent, reusable components
* `useProduct` hook encapsulates data logic
* No unnecessary global state

---

## 3. State Management

| State                        | Location           | Reason            |
| ---------------------------- | ------------------ | ----------------- |
| Product data, loading, error | `useProduct`       | Single-page scope |
| UI toggles (OOS expand)      | `AvailabilityCard` | Local UI concern  |
| Image fallback               | `ProductPage`      | Scoped rendering  |

No global state used — not needed for this scope.

---

## 4. What’s Fragile / Incomplete

* Matching is heuristic-based (no fuzzy matching yet)
* Some products that should match remain split
* `display_name` comes from first platform (not curated)
* No backend API (uses static JSON)
* No 30-day visualization (schema supports it)
* No tests (time constraint)
* Weight normalization relies on regex (not fully robust)

---

## 5. Next 4 Hours — What I’d Build

### 🔥 Priority: Improve product matching

Current system has:

* ~47 canonical → ~35–38 actual products

### Plan:

* TF-IDF / cosine similarity on names
* Combine with weight proximity
* Assign confidence score
* Build review UI for merge/split decisions

### Why this first?

Everything depends on correct identity:

* price comparison
* availability tracking
* analytics

Fixing identity improves all downstream features.

---

## Summary

* Built ingestion pipeline for 3 platforms
* Designed schema for cross-platform mapping
* Normalized messy real-world data
* Stored in SQLite
* Built React UI for product comparison
* Validated results using SQL joins

---
