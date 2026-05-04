# Schema design notes

## 1. Cross-platform product identity — approach and failure modes

**How it's modelled**

A `products` table holds one row per real-world SKU. A `platform_listings` table holds one row per platform SKU (with the platform's own ID). `product_listing_map` is a many-to-many join that connects them, with a `confidence` field (`exact` / `high` / `manual`).

Matching is done at ingest time using a deterministic slug: `brand + normalised_name_tokens + weight_grams`. Weight is normalised to grams first (Instamart mixes `g` and `kg`). Name is lowercased, stripped of pack-size noise ("Pack of 6", "60g"), and key flavour tokens are extracted. If the slug matches an existing product exactly, we link to it. If it's within 1 edit-distance on the flavour tokens and weight matches, we link with `confidence = 'high'`. Otherwise we create a new canonical product.

**What it breaks on**

- **Pack-size ambiguity**: Instamart's "Peanut Butter Crunchy 400g" and Blinkit's "Peanut Butter - Crunchy (400 g)" match cleanly. But "Almond Crunch Muesli" appears on Instamart with both "Almond + Cashew Crunch" and Zepto with "Almond Crunch" — these are genuinely different products with similar names, and a slug-match would merge them. The current ingest script errs on the side of creating separate canonical products when token overlap is ambiguous.
- **Variant drift**: If a platform renames a SKU mid-year (e.g. "Choco Almond" → "Chocolate Almond"), slugs diverge and you silently create a duplicate canonical product. Requires periodic dedup review.
- **Weight in display name only**: Some Instamart entries express weight as `"0.36" kg` in a separate field but omit it from the name. If the field is missing from a future scrape format, matching degrades to name-only, which is lossy.
- **Variety packs**: Blinkit's "Variety Pack - Chocolate Chunk & Peanut Butter (6x60g)" and Instamart's "Variety | 6 Bars Mixed" probably refer to the same thing but the ingredient list differs — we treat them as one canonical product but note `confidence = 'high'` rather than `'exact'`.

---

## 2. One denormalisation / index for scale

**Index added:** `idx_ps_listing_time ON price_snapshots(listing_id, scraped_at DESC)`

With append-only time-series tables and millions of rows, "latest price per listing" is the hottest query (every product page hit). A composite index on `(listing_id, scraped_at DESC)` lets SQLite/Postgres satisfy this with a single index scan + LIMIT 1, rather than a full table sort. The `DESC` ordering matches the query's `ORDER BY scraped_at DESC`.

**Denormalisation considered but not taken**: A `current_prices` cache table (one row per listing, updated on each ingest) would make page loads ~O(1), but adds dual-write complexity and a stale-read window during ingestion. At the current scale the index is enough. If read volume grew 10×, I'd add the cache layer with a `last_updated_at` sentinel.

---

## 3. What changes at 100× scrape volume

**Volume estimate**: 3 platforms × ~500 brands × ~30 products × 8 pincodes × 4 scrapes/day = ~1.4M availability rows/day, ~175K price rows/day. At 100× that's ~140M availability rows/day.

Changes I'd make:

1. **Partition `availability_snapshots` and `price_snapshots` by month** (in Postgres: `PARTITION BY RANGE (scraped_at)`). Queries always include a date range; partitioning makes old partitions cold storage candidates.

2. **Move to Postgres** — SQLite doesn't support parallel writes. Ingestion would need connection pooling and concurrent workers at this scale.

3. **Separate OLAP from OLTP**: the time-series tables move to a columnar store (ClickHouse or BigQuery). The `products` / `platform_listings` / `product_listing_map` tables stay in Postgres. The React app reads from Postgres; the 30-day chart queries hit ClickHouse.

4. **Materialise the "current" snapshot**: instead of a view that does a correlated subquery, maintain a `current_price_cache` and `current_availability_cache` table updated by the ingestion pipeline. Reads become a simple PK lookup.

5. **Async matching**: at 100× volume, running slug-matching synchronously during ingest becomes a bottleneck. Move identity resolution to an async queue (product matching service), with listings landing first as `unmatched` and being linked after.
