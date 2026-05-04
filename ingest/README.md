# Ingest

## Requirements

Python 3.11+ (stdlib only, no pip installs needed).

## One-command run

```bash
# From the /ingest directory:
python ingest.py ../../data/blinkit_sample.json --db revq.db
python ingest.py ../../data/zepto_sample.json   --db revq.db
python ingest.py ../../data/instamart_sample.json --db revq.db
```

Running all three populates a single `revq.db` with cross-platform-linked products.

## What it does

1. Detects the platform from the JSON structure.
2. Normalises weight (kg → g), scrape timestamp (unix epoch / ISO / date string → ISO UTC).
3. Matches each scraped SKU to a canonical product using a slug: `brand | sorted_flavour_tokens | weight_grams`.
4. Writes to `products`, `platform_listings`, `product_listing_map`, `price_snapshots`, `availability_snapshots`.

## Verify

```bash
sqlite3 revq.db "SELECT p.canonical_name, pl.platform_id, ps.selling_price
FROM products p
JOIN product_listing_map plm ON plm.product_id = p.id
JOIN platform_listings pl ON pl.id = plm.listing_id
JOIN price_snapshots ps ON ps.listing_id = pl.id
ORDER BY p.canonical_name, pl.platform_id
LIMIT 30;"
```
