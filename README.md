# RevQ take-home submission

## 1. Cross-platform product identity — how I solved it, what breaks it

Each canonical product gets a deterministic slug: `brand_slug | sorted_flavour_tokens | weight_grams_as_int`.

**Normalisation steps before slugging:**
- Weight: convert kg → g, extract from display name if not a separate field (Instamart mixes `g` and `0.36 kg`)
- Brand: lowercased, aliased (`yoga bar` → `yogabar`)
- Flavour: lowercase the display name, strip brand, strip weight/pack-size noise (`pack`, `of`, `6`, `g`, `gm`, `x`…), sort remaining tokens, deduplicate → order-insensitive

**What breaks it:**

- **Subvariant naming**: Instamart has `Almond + Cashew Crunch Muesli` while Zepto has `Almond Crunch Muesli`. After noise removal these slug differently → two canonical products instead of one. Could be the same product or genuinely different; I erred on splitting.
- **Variety packs**: Blinkit's `Variety Pack - Chocolate Chunk & Peanut Butter` and Instamart's `Variety | 6 Bars Mixed` are probably the same but their flavour slugs diverge because the ingredient list differs between platforms.
- **Name drift**: If a platform renames a SKU mid-year, slugs diverge and a duplicate canonical product is silently created. Needs periodic dedup review.
- **Missing weight field**: If a future scrape format omits the weight field and the name doesn't contain it, matching degrades to name-only, which is lossy for multi-size products.
- **Pack sizes that encode differently**: `6X60GM` (Zepto), `Pack of 6 (360g)` (Blinkit), `Pack of 6 | 60g` (Instamart) all strip to the same flavour slug + weight=360 cleanly _now_, but this relies on the noise regex covering every encoding variant platforms might introduce.

Current result: 47 canonical products from 48 platform listings (19 Blinkit + 15 Zepto + 14 Instamart), with a handful correctly unified across platforms and the rest conservatively left as separate records.

---

## 2. Component tree and why

```
main.jsx
├── ProductList              — index page, not required but needed for navigation
└── ProductPage              — /product/:id (the required route)
    ├── LoadingState         — skeleton, shown while useProduct's 200ms async resolves
    ├── ErrorState           — shown when id has no match in data
    ├── EmptyState           — shown if product exists but has no listings
    ├── [header]             — inline: product image, brand, name, weight
    ├── PriceTable           — row per platform, shows price / MRP / discount / scrape date
    └── AvailabilityPanel    — card per platform, shows live/total pincodes + OOS list
        └── AvailabilityCard — per-platform availability with expandable OOS pincode list
```

Split rationale: `PriceTable` and `AvailabilityPanel` each get a `listings` prop (array) and are independently testable. Neither knows about routing or the product shape beyond what they display. `ProductPage` owns the data fetch and decides which state to render. `useProduct` is a hook rather than context because there's only one product on screen at a time — context would be overhead with no benefit here.

---

## 3. Where state lives and why

| State | Lives in | Why |
|---|---|---|
| Product data, loading, error | `useProduct` hook (local to `ProductPage`) | One route, one product — no sharing needed, no global store justified |
| OOS pincode expand/collapse | `AvailabilityCard` (local) | Pure UI toggle, no other component cares |
| Image load error | `ProductPage` (local) | Controls fallback rendering, scoped to one img tag |

There is no global state. With a single route and no user auth or cross-page shared data, reaching for Redux/Zustand/Context would be premature. If a "compare two products" feature were added, price selection state would move up; until then everything stays local.

---

## 4. What's fragile or unfinished

- **Matching is conservative, not smart.** The slug approach splits Instamart's `Almond + Cashew Crunch Muesli` from Zepto's `Almond Crunch Muesli` even though they're probably the same SKU. A real system would need fuzzy matching + a human review queue for confidence < 1.0.
- **`display_name` on canonical product is whichever platform's listing is listed first** — Blinkit in this run. It should be a curated field, not platform-sourced.
- **No 30-day chart.** The schema supports it (price_snapshots is append-only time-series) but the React app only shows the current snapshot because we only have one day's data.
- **No real backend.** Data is pre-built JSON in `src/data.json`. The comment in `useProduct.js` marks where the `fetch('/api/product/:id')` would go.
- **No tests.** Zero. Given the 4-hour constraint this was the first cut.
- **Instamart weight `0.36 kg`** is correctly normalised to 360g in the ingest, but the normalisation relies on a regex that would miss unusual unit spellings (e.g. `kgs`, `Kg`).

---

## 5. Next 4 hours — what I'd build and why that first

**Fuzzy cross-platform matching with a review queue.**

Right now the 47 canonical products are probably 35–38 real products and ~10 mismatched splits. Every downstream feature (price comparison, share-of-voice, availability rollup) is wrong if identity is wrong. A schema correction is cheap; bad identity baked into months of price history is expensive to fix.

Concretely: run TF-IDF cosine similarity on normalised names + weight proximity, flag pairs above a threshold as `confidence = 'candidate'`, surface them in an admin UI with a "merge / split" action. Once a merge decision is made, point both `product_listing_map` rows at the winning `product.id` and update the `canonical_name`.

That single change makes every chart, every comparison, and every OOS alert more accurate — with no new UI features required.
