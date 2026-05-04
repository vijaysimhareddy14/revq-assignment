-- RevQ schema
-- Core principle: canonical products live in `products`, platform listings live
-- in `platform_listings`. Cross-platform identity is solved by a many-to-many
-- join table `product_listing_map` so one canonical product can link to 1–N
-- platform listings (handles multipacks, regional SKU splits, etc.)

-- ─────────────────────────────────────────────────────────────────────────────
-- Lookup: platforms
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platforms (
    id   TEXT PRIMARY KEY,  -- 'blinkit' | 'zepto' | 'instamart'
    name TEXT NOT NULL
);

INSERT OR IGNORE INTO platforms VALUES ('blinkit',  'Blinkit');
INSERT OR IGNORE INTO platforms VALUES ('zepto',    'Zepto');
INSERT OR IGNORE INTO platforms VALUES ('instamart','Swiggy Instamart');

-- ─────────────────────────────────────────────────────────────────────────────
-- Canonical products
-- One row per real-world SKU (brand + variant + size).
-- No platform-specific IDs here.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id           TEXT PRIMARY KEY,  -- our internal UUID
    brand        TEXT NOT NULL,
    canonical_name TEXT NOT NULL,   -- human-readable, platform-neutral
    weight_grams INTEGER,           -- normalised to grams; NULL if unknown
    image_url    TEXT,              -- best available across platforms
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);

-- ─────────────────────────────────────────────────────────────────────────────
-- Platform listings  (one row per platform SKU)
-- Stores the platform's own ID and display data at the time of first scrape.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_listings (
    id              TEXT PRIMARY KEY,   -- our internal UUID for this listing
    platform_id     TEXT NOT NULL REFERENCES platforms(id),
    platform_sku_id TEXT NOT NULL,      -- blinkit_id / sku_code / product_id
    display_name    TEXT NOT NULL,
    image_url       TEXT,
    first_seen_at   TEXT NOT NULL,
    last_scraped_at TEXT NOT NULL,

    UNIQUE (platform_id, platform_sku_id)
);

CREATE INDEX IF NOT EXISTS idx_pl_platform ON platform_listings(platform_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Cross-platform identity map
-- A canonical product maps to one listing per platform (usually).
-- confidence: 'exact' | 'high' | 'manual' — lets us flag uncertain matches.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_listing_map (
    product_id  TEXT NOT NULL REFERENCES products(id),
    listing_id  TEXT NOT NULL REFERENCES platform_listings(id),
    confidence  TEXT NOT NULL DEFAULT 'high',
    PRIMARY KEY (product_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_plm_listing ON product_listing_map(listing_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Price snapshots  (time-series, append-only)
-- One row per scrape per listing. Never update; always insert.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id    TEXT    NOT NULL REFERENCES platform_listings(id),
    scraped_at    TEXT    NOT NULL,  -- ISO-8601 UTC
    mrp           INTEGER NOT NULL,  -- paise would be better; rupees for now
    selling_price INTEGER NOT NULL,
    discount_pct  REAL    GENERATED ALWAYS AS
                    (ROUND((1.0 - CAST(selling_price AS REAL) / mrp) * 100, 1)) VIRTUAL
);

-- The two most common access patterns:
--   1. latest price per listing  → filter by listing_id ORDER BY scraped_at DESC LIMIT 1
--   2. 30-day history            → filter by listing_id + scraped_at range
CREATE INDEX IF NOT EXISTS idx_ps_listing_time ON price_snapshots(listing_id, scraped_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Availability snapshots  (time-series, append-only)
-- One row per (listing, pincode, scrape). in_stock is boolean int (0/1).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS availability_snapshots (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id TEXT    NOT NULL REFERENCES platform_listings(id),
    scraped_at TEXT    NOT NULL,
    pincode    TEXT    NOT NULL,
    in_stock   INTEGER NOT NULL CHECK (in_stock IN (0, 1)),
    qty        INTEGER          -- NULL if platform doesn't report quantity
);

-- Query 3: pincodes where product is OOS → join product→listings→availability
-- Filter on scraped_at = latest scrape date, in_stock = 0.
CREATE INDEX IF NOT EXISTS idx_as_listing_pin_time
    ON availability_snapshots(listing_id, pincode, scraped_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Convenience view: current prices across platforms for a canonical product
-- Usage: SELECT * FROM v_current_prices WHERE product_id = '...';
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS v_current_prices AS
SELECT
    plm.product_id,
    pl.platform_id,
    pl.display_name,
    pl.last_scraped_at,
    ps.mrp,
    ps.selling_price,
    ps.discount_pct,
    ps.scraped_at AS price_as_of
FROM product_listing_map plm
JOIN platform_listings pl ON pl.id = plm.listing_id
JOIN price_snapshots ps ON ps.listing_id = pl.id
WHERE ps.scraped_at = (
    SELECT MAX(scraped_at) FROM price_snapshots WHERE listing_id = pl.id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Convenience view: current availability summary per product per platform
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS v_current_availability AS
SELECT
    plm.product_id,
    pl.platform_id,
    pl.last_scraped_at,
    COUNT(*) AS total_pincodes,
    SUM(av.in_stock) AS live_pincodes
FROM product_listing_map plm
JOIN platform_listings pl ON pl.id = plm.listing_id
JOIN availability_snapshots av ON av.listing_id = pl.id
WHERE av.scraped_at = (
    SELECT MAX(scraped_at) FROM availability_snapshots WHERE listing_id = pl.id
)
GROUP BY plm.product_id, pl.platform_id, pl.last_scraped_at;
