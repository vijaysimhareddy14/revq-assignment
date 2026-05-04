#!/usr/bin/env python3
"""
RevQ ingest script.

Usage:
    python ingest.py <path-to-json> [--db revq.db]

Reads a Blinkit, Zepto, or Instamart sample JSON and writes to a SQLite
database initialised from schema.sql.

Cross-platform identity strategy
---------------------------------
Each product is matched to a canonical record in `products` using a
deterministic slug:  brand_slug + flavour_slug + weight_grams

- brand_slug:   lowercased brand name with spaces collapsed
- flavour_slug: lowercased name with brand, weight, pack-size noise, and
                punctuation removed; tokens sorted for order-insensitivity
- weight_grams: integer grams (converts kg; extracts from name if field missing)

If the slug already exists → link to that canonical product.
If not → create a new canonical product, then link.

This means running all three files produces a single set of canonical products
with listings from all three platforms correctly unified.
"""

import argparse
import json
import re
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ── Noise tokens stripped before slug comparison ──────────────────────────────
NOISE = re.compile(
    r'\b(pack|of|bar|bars|single|combo|g|gm|gms|kg|x|\d+)\b', re.I
)
PUNCT = re.compile(r'[^\w\s]')
MULTI_WS = re.compile(r'\s+')

BRAND_ALIASES = {
    'yogabar': 'yogabar',
    'yoga bar': 'yogabar',
}


def slugify(text: str) -> str:
    text = PUNCT.sub(' ', text.lower())
    text = NOISE.sub(' ', text)
    text = MULTI_WS.sub(' ', text).strip()
    tokens = sorted(set(text.split()))
    return ' '.join(tokens)


def extract_weight_grams(name: str, weight_val, weight_unit: str | None) -> int | None:
    """Normalise weight to grams. Falls back to parsing the product name."""
    if weight_val is not None:
        try:
            w = float(weight_val)
            if weight_unit and weight_unit.lower() == 'kg':
                return int(w * 1000)
            return int(w)
        except (ValueError, TypeError):
            pass

    # Try to extract from name: "400 g", "1 kg", "6X60GM", "360g", etc.
    m = re.search(r'(\d+(?:\.\d+)?)\s*(kg|g|gm|gms)\b', name, re.I)
    if m:
        val = float(m.group(1))
        unit = m.group(2).lower()
        return int(val * 1000) if unit == 'kg' else int(val)

    return None


def detect_brand(name: str) -> str:
    """Return the normalised brand slug from the product name."""
    lower = name.lower()
    for alias, canonical in BRAND_ALIASES.items():
        if lower.startswith(alias):
            return canonical
    return 'unknown'


def parse_scraped_at(raw: str | int) -> str:
    """Return ISO-8601 UTC string from whatever format the platform uses."""
    if isinstance(raw, (int, float)):
        dt = datetime.fromtimestamp(int(raw), tz=timezone.utc)
        return dt.isoformat()
    # Already ISO or date string
    try:
        dt = datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
        return dt.isoformat()
    except ValueError:
        return str(raw) + 'T00:00:00+00:00'


# ── Platform-specific parsers ─────────────────────────────────────────────────

def parse_blinkit(data: dict) -> dict:
    scraped_at = parse_scraped_at(data['scraped_at'])
    products = []
    for p in data['products']:
        avail = []
        for a in p.get('availability', []):
            avail.append({
                'pincode': a['pincode'],
                'in_stock': 1 if a['in_stock'] else 0,
                'qty': None,
            })
        products.append({
            'platform_sku_id': p['blinkit_id'],
            'display_name': p['name'],
            'image_url': p.get('image_url'),
            'mrp': p['mrp'],
            'selling_price': p['selling_price'],
            'weight_val': None,       # not in blinkit data directly
            'weight_unit': None,
            'scraped_at': scraped_at,
            'availability': avail,
        })
    return {'platform_id': 'blinkit', 'scraped_at': scraped_at, 'products': products}


def parse_zepto(data: dict) -> dict:
    scraped_at = parse_scraped_at(data['fetched_on'])
    products = []
    for p in data['items']:
        avail = []
        for pin, status in p.get('stock_by_pincode', {}).items():
            avail.append({
                'pincode': pin,
                'in_stock': 1 if status == 'available' else 0,
                'qty': None,
            })
        products.append({
            'platform_sku_id': p['sku_code'],
            'display_name': p['title'],
            'image_url': p.get('image'),
            'mrp': p['price']['mrp'],
            'selling_price': p['price']['final'],
            'weight_val': None,
            'weight_unit': None,
            'scraped_at': scraped_at,
            'availability': avail,
        })
    return {'platform_id': 'zepto', 'scraped_at': scraped_at, 'products': products}


def parse_instamart(data: dict) -> dict:
    scraped_at = parse_scraped_at(data['snapshot_time'])
    products = []
    for p in data['results']:
        avail = []
        for a in p.get('store_availability', []):
            qty = a.get('available_qty')
            avail.append({
                'pincode': str(a['pin']),
                'in_stock': 1 if (qty is not None and qty > 0) else 0,
                'qty': qty,
            })
        products.append({
            'platform_sku_id': p['product_id'],
            'display_name': p['display_name'],
            'image_url': p.get('image'),
            'mrp': p['store_mrp'],
            'selling_price': p['store_selling_price'],
            'weight_val': p.get('weight'),
            'weight_unit': p.get('weight_unit'),
            'scraped_at': scraped_at,
            'availability': avail,
        })
    return {'platform_id': 'instamart', 'scraped_at': scraped_at, 'products': products}


PARSERS = {
    'blinkit': parse_blinkit,
    'zepto.in': parse_zepto,
    'zepto': parse_zepto,
    'swiggy instamart': parse_instamart,
    'instamart': parse_instamart,
}

def detect_platform(data: dict) -> str:
    key = (
        data.get('platform', '') or
        data.get('platform_name', '') or
        data.get('source', '')
    ).lower()
    for k, fn in PARSERS.items():
        if k in key:
            return k
    raise ValueError(f'Unknown platform: {key!r}')


# ── DB helpers ────────────────────────────────────────────────────────────────

def init_db(db_path: str, schema_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    schema = Path(schema_path).read_text()
    conn.executescript(schema)
    return conn


def get_or_create_product(conn: sqlite3.Connection, display_name: str,
                           weight_val, weight_unit: str | None,
                           image_url: str | None) -> str:
    brand = detect_brand(display_name)
    weight_g = extract_weight_grams(display_name, weight_val, weight_unit)
    flavour = slugify(display_name.lower().replace(brand, ''))
    slug = f'{brand}|{flavour}|{weight_g}'

    # Check if we already have a product with this slug
    # We store slug in canonical_name temporarily; in prod this'd be a slug column
    row = conn.execute(
        "SELECT id FROM products WHERE brand=? AND canonical_name=?",
        (brand, slug)
    ).fetchone()

    if row:
        # Update image if we now have one and didn't before
        if image_url:
            conn.execute(
                "UPDATE products SET image_url=? WHERE id=? AND image_url IS NULL",
                (image_url, row['id'])
            )
        return row['id']

    pid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO products (id, brand, canonical_name, weight_grams, image_url) VALUES (?,?,?,?,?)",
        (pid, brand, slug, weight_g, image_url)
    )
    return pid


def upsert_listing(conn: sqlite3.Connection, platform_id: str,
                   platform_sku_id: str, display_name: str,
                   image_url: str | None, scraped_at: str) -> str:
    row = conn.execute(
        "SELECT id FROM platform_listings WHERE platform_id=? AND platform_sku_id=?",
        (platform_id, platform_sku_id)
    ).fetchone()
    if row:
        conn.execute(
            "UPDATE platform_listings SET last_scraped_at=? WHERE id=?",
            (scraped_at, row['id'])
        )
        return row['id']

    lid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO platform_listings
           (id, platform_id, platform_sku_id, display_name, image_url,
            first_seen_at, last_scraped_at)
           VALUES (?,?,?,?,?,?,?)""",
        (lid, platform_id, platform_sku_id, display_name, image_url,
         scraped_at, scraped_at)
    )
    return lid


def link_product_listing(conn: sqlite3.Connection, product_id: str,
                          listing_id: str, confidence: str = 'high'):
    conn.execute(
        """INSERT OR IGNORE INTO product_listing_map (product_id, listing_id, confidence)
           VALUES (?,?,?)""",
        (product_id, listing_id, confidence)
    )


def insert_price_snapshot(conn: sqlite3.Connection, listing_id: str,
                           scraped_at: str, mrp: int, selling_price: int):
    conn.execute(
        """INSERT INTO price_snapshots (listing_id, scraped_at, mrp, selling_price)
           VALUES (?,?,?,?)""",
        (listing_id, scraped_at, mrp, selling_price)
    )


def insert_availability(conn: sqlite3.Connection, listing_id: str,
                         scraped_at: str, availability: list):
    conn.executemany(
        """INSERT INTO availability_snapshots
           (listing_id, scraped_at, pincode, in_stock, qty)
           VALUES (?,?,?,?,?)""",
        [(listing_id, scraped_at, a['pincode'], a['in_stock'], a['qty'])
         for a in availability]
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def ingest(json_path: str, db_path: str, schema_path: str):
    data = json.loads(Path(json_path).read_text())
    platform_key = detect_platform(data)
    parsed = PARSERS[platform_key](data)

    conn = init_db(db_path, schema_path)

    inserted = 0
    with conn:
        for p in parsed['products']:
            # 1. Get or create canonical product
            product_id = get_or_create_product(
                conn, p['display_name'],
                p['weight_val'], p['weight_unit'],
                p['image_url']
            )

            # 2. Upsert platform listing
            listing_id = upsert_listing(
                conn, parsed['platform_id'],
                p['platform_sku_id'], p['display_name'],
                p['image_url'], p['scraped_at']
            )

            # 3. Link canonical ↔ listing
            link_product_listing(conn, product_id, listing_id)

            # 4. Append price snapshot
            insert_price_snapshot(
                conn, listing_id, p['scraped_at'], p['mrp'], p['selling_price']
            )

            # 5. Append availability snapshot
            if p['availability']:
                insert_availability(conn, listing_id, p['scraped_at'], p['availability'])

            inserted += 1

    print(f"✓ Ingested {inserted} products from {parsed['platform_id']} → {db_path}")
    conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='RevQ ingest')
    parser.add_argument('json_path', help='Path to platform JSON file')
    parser.add_argument('--db', default='revq.db', help='SQLite DB path (default: revq.db)')
    parser.add_argument('--schema', default='../schema.sql', help='Path to schema.sql')
    args = parser.parse_args()

    schema_path = args.schema
    if not Path(schema_path).exists():
        # Try sibling directory
        schema_path = str(Path(__file__).parent.parent / 'schema.sql')
    if not Path(schema_path).exists():
        print(f"Error: schema.sql not found at {args.schema}", file=sys.stderr)
        sys.exit(1)

    ingest(args.json_path, args.db, schema_path)
