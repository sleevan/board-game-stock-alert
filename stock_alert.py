#!/usr/bin/env python3
"""
Board game stock alert.

Emails you when a board game is IN STOCK at an online store.
Pre-orders and backorders never trigger an email.

You give it game titles (publisher optional). It searches each store's
catalogue by title, so it finds a game as soon as a store lists it - you
don't need product links. Store search works on Shopify stores, which covers
most Canadian hobby-game shops. Known product links on other stores can be
added under "product_urls" in config.json.

Standard library only - no pip installs needed.

Usage:
    python stock_alert.py add "Thirty Years of Misery" --publisher "VUCA Simulations"
    python stock_alert.py remove "Thirty Years of Misery"
    python stock_alert.py list
    python stock_alert.py              # check once (what the scheduler runs)
    python stock_alert.py --dry-run    # show what it sees; no email, no state saved
    python stock_alert.py --loop 30    # keep running, checking every 30 minutes
    python stock_alert.py --test-email # send a test email to confirm SMTP works
"""
import argparse
import calendar
import html as htmllib
import json
import os
import re
import smtplib
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
STATE_PATH = HERE / "state.json"
ENV_PATH = HERE / ".env"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

IN_STOCK = "in_stock"
PREORDER = "preorder"          # never notifies
OUT_OF_STOCK = "out_of_stock"
NOT_LISTED = "not_listed"      # store searched fine, game just isn't there yet
UNKNOWN = "unknown"            # check failed

LABELS = {
    IN_STOCK: "IN STOCK",
    PREORDER: "pre-order (ignored)",
    OUT_OF_STOCK: "out of stock",
    NOT_LISTED: "not listed yet",
    UNKNOWN: "check failed",
}

PREORDER_RE = re.compile(r"\bpre[\s\-]?order|\bpre[\s\-]?sale|\bback[\s\-]?order|\bcoming soon\b", re.I)


# --------------------------------------------------------------------------
# Fetching
# --------------------------------------------------------------------------
def fetch(url, timeout=25):
    req = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-CA,en;q=0.9",
        # Shopify stores that sell abroad can switch to US dollars by visitor location or language;
        # this cookie (plus currency=CAD on Shopify addresses) keeps prices in Canadian dollars.
        "Cookie": "localization=CA; cart_currency=CAD",
    })
    with urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def fetch_json(url):
    return json.loads(fetch(url))


def normalize(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()  # Trône -> Trone
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


# Words stores add to titles that don't change which game it is (compared after normalize()).
_TITLE_NOISE = re.compile(
    r"\b(?:pre ?orders?|pre ?sales?|back ?orders?|"
    r"en|eng|english|anglais|anglaise|version anglaise|fr|french|francais|version francaise|"
    r"multi|multilingual|multilingue|bilingual|bilingue|"
    r"the board ?game|board ?game|jeu de societe)\b")
# Edition wording: still the same title, but worth asking about.
_TITLE_EDITION = re.compile(
    r"\b(?:(?:\d+(?:st|nd|rd|th)|new|revised|second|third|anniversary|deluxe|collector s|"
    r"standard|retail|kickstarter|ks|limited|special|reprint)\s+)?edition\b|\b\d+(?:st|nd|rd|th) ed\b")


_BRACKETED = re.compile(r"[\(\[\{][^\)\]\}]*[\)\]\}]")


def title_core(title):
    """(core words, had_edition_words) for comparing a listing title with a watched title.
    Anything in brackets - (New Edition), [French], {EN} - is ignored."""
    unbracketed = _BRACKETED.sub(" ", title or "")
    t = normalize(unbracketed) or normalize(title)
    had_edition = bool(_TITLE_EDITION.search(t))
    t = _TITLE_EDITION.sub(" ", t)
    core = re.sub(r"\s+", " ", _TITLE_NOISE.sub(" ", t)).strip()
    return (core or t), had_edition


def excluded_by(title, term):
    """-word exclusions match whole words and words starting with the term: -coin also drops 'Coins'."""
    words = normalize(term).split()
    if not words:
        return False
    pattern = r"\b" + r"\s+".join(re.escape(w) for w in words[:-1]) + (r"\s+" if len(words) > 1 else "") + re.escape(words[-1]) + r"\w*\b"
    return re.search(pattern, normalize(title)) is not None


def title_has_words(title, query):
    """Whole-word containment: 'ito' is in 'Ito (EN)' but not in 'Splito'."""
    return f" {normalize(query)} " in f" {normalize(title)} "


SHORT_TITLE_CHARS = 4   # titles this short use strict matching; longer ones match on containment


def is_short_title(query):
    return len(normalize(query).replace(" ", "")) <= SHORT_TITLE_CHARS


def match_kind(query, title):
    """'exact', 'possible' (ask the user), or None (not this game).
    Longer titles: any listing containing the whole title counts.
    Short titles (4 characters or fewer): only exact titles count; near matches are asked about."""
    if not is_short_title(query):
        return "exact" if title_has_words(title, query) else None
    q, _ = title_core(query)
    c, had_edition = title_core(title)
    if c == q:
        return "possible" if had_edition else "exact"
    if f" {q} " in f" {c} " and len(q.split()) / max(1, len(c.split())) >= 0.5:
        return "possible"
    return None


# --------------------------------------------------------------------------
# Shopify helpers
# --------------------------------------------------------------------------
def cad(url):
    """Add currency=CAD to a Shopify address."""
    return url + ("&" if "?" in url else "?") + "currency=CAD"


def shopify_product(base, handle):
    """Full product data from /products/<handle>.js (public on every Shopify store)."""
    return fetch_json(cad(f"{base}/products/{handle}.js"))


PREORDER_TAG_RE = re.compile(r"(?i)^(?:pre[\s\-_]?orders?|pre[\s\-_]?sales?|pro[\s\-_]pre|pre|preorder[\s\-_]?item|back[\s\-_]?orders?)$|pre[\s\-_]?order")
PLAN_PREORDER_RE = re.compile(r"(?i)pre[\s\-]?order|pre[\s\-]?sale|back[\s\-]?order|ships? (?:upon|on|after|when|later)|release|deposit|pr[ée]commande")


def shopify_is_preorder(product):
    """Shopify has no single pre-order flag. Stores signal it in the title, type or variant names, in tags
    (e.g. "Pre-Order", "PRO-PRE"), or through a pre-order selling plan ("PREORDER: Ships Upon Release")."""
    tags = product.get("tags") or []
    if isinstance(tags, str):
        tags = tags.split(",")
    variant_titles = [v.get("title", "") for v in product.get("variants", [])]
    haystack = " | ".join([product.get("title", ""), product.get("type", ""), *variant_titles])
    if PREORDER_RE.search(haystack):
        return True
    if any(PREORDER_TAG_RE.search(t.strip()) for t in tags):
        return True
    for group in product.get("selling_plan_groups") or []:
        texts = [group.get("name", "")] + [f'{sp.get("name", "")} {sp.get("description", "")}' for sp in group.get("selling_plans", [])]
        if any(PLAN_PREORDER_RE.search(t or "") for t in texts):
            return True
    return False


def shopify_status(product, variant_id=None):
    available = bool(product.get("available"))
    price = product.get("price")
    if variant_id:
        for v in product.get("variants", []):
            if str(v.get("id")) == str(variant_id):
                available = bool(v.get("available"))
                price = v.get("price", price)
                break
    price_str = f"${price / 100:.2f}" if isinstance(price, (int, float)) else None
    if shopify_is_preorder(product):
        return PREORDER, price_str
    return (IN_STOCK if available else OUT_OF_STOCK), price_str


def publisher_words(publisher):
    return [w for w in normalize(publisher).split()
            if w not in ("games", "game", "simulations", "publishing", "inc", "ltd", "llc", "the")]


def text_has_publisher(text, publisher):
    """True if the text names the publisher. `publisher` may be a list: any one of them counts."""
    have = normalize(text).split()
    for pub in (publisher if isinstance(publisher, list) else [publisher]):
        words = publisher_words(pub)
        if words and all(w in have for w in words):
            return True
    return False


def publisher_matches(product, publisher):
    """Loose check that a Shopify product is from the given publisher (vendor, tags, type or description)."""
    tags = product.get("tags") or []
    if isinstance(tags, str):
        tags = tags.split(",")
    return text_has_publisher(" ".join([product.get("vendor", ""), product.get("type", ""), product.get("title", ""),
                                        product.get("description", ""), *tags]), publisher)


# --------------------------------------------------------------------------
# Store search, one function per shop platform.
# Each returns a list of candidates: dict(title, status, price, link, publisher_text)
# publisher_text is None when the platform doesn't expose it in search results.
# --------------------------------------------------------------------------
def search_shopify(base, query, publisher):
    data = fetch_json(cad(f"{base}/search/suggest.json?q={quote(query)}&resources[type]=product&resources[limit]=10"))
    handles, suggested = [], {}
    for p in data["resources"]["results"]["products"]:
        if title_has_words(p.get("title"), query):
            h = p.get("handle") or p.get("url", "").split("/products/")[-1].split("?")[0]
            handles.append(h)
            suggested[h] = p
    if not handles:
        # Some stores' quick search returns unrelated products; fall back to the full search page.
        try:
            html = fetch(cad(f"{base}/search?type=product&q={quote(query)}"))
            for h in re.findall(r'href="(?:https?://[^"/]+)?(?:/[a-z]{2}(?:-[a-z]{2})?)?/products/([a-z0-9\-_%]+)', html, re.I):
                if h not in handles:
                    handles.append(h)
        except (HTTPError, URLError, TimeoutError, OSError):
            pass
        handles = handles[:12]
    out = []
    for handle in handles:
        try:
            product = shopify_product(base, handle)
        except (HTTPError, URLError, ValueError):
            if handle not in suggested:
                continue
            sp = suggested[handle]   # quick-search data has the same key fields
            price = sp.get("price")
            try:
                price = int(round(float(price) * 100)) if isinstance(price, str) else price
            except ValueError:
                price = None
            product = {"title": sp.get("title", ""), "available": sp.get("available"), "price": price,
                       "vendor": sp.get("vendor", ""), "tags": sp.get("tags") or [], "type": sp.get("type", ""),
                       "variants": []}
        title = product.get("title", "")
        if not title_has_words(title, query):
            continue
        if publisher and not publisher_matches(product, publisher):
            out.append({"title": title, "status": "wrong_publisher"})
            continue
        status, price = shopify_status(product)
        out.append({"title": title, "status": status, "price": price, "link": f"{base}/products/{handle}"})
    return out


def search_woocommerce(base, query, publisher):
    items = fetch_json(f"{base}/wp-json/wc/store/v1/products?search={quote(query)}&per_page=20")
    out = []
    for it in items:
        title = htmllib.unescape(re.sub(r"<[^>]+>", "", it.get("name", "")))
        if not title_has_words(title, query):
            continue
        meta = " ".join([it.get("description", ""), it.get("short_description", ""),
                         *[c.get("name", "") for c in it.get("categories", [])],
                         *[t.get("name", "") for t in it.get("tags", [])],
                         *[b.get("name", "") for b in it.get("brands", [])],
                         *[" ".join(t.get("name", "") for t in a.get("terms", [])) for a in it.get("attributes", [])]])
        meta_txt = re.sub(r"<[^>]+>", " ", meta)
        if publisher and not text_has_publisher(meta_txt + " " + title, publisher):
            out.append({"title": title, "status": "wrong_publisher"})
            continue
        avail = (it.get("stock_availability") or {})
        if PREORDER_RE.search(title) or "backorder" in str(avail.get("class", "")) or PREORDER_RE.search(str(avail.get("text", ""))):
            status = PREORDER
        elif it.get("is_in_stock") and it.get("is_purchasable", True):
            status = IN_STOCK
        else:
            status = OUT_OF_STOCK
        prices = it.get("prices") or {}
        price = None
        if prices.get("price"):
            minor = int(prices.get("currency_minor_unit", 2))
            price = f"${int(prices['price']) / 10 ** minor:.2f}"
        out.append({"title": title, "status": status, "price": price, "link": it.get("permalink")})
    return out


def search_lightspeed(base, query, publisher):
    data = fetch_json(f"{base}/search/{quote(query)}/?format=json")
    prods = (data.get("collection") or {}).get("products") or {}
    out = []
    for p in (prods.values() if isinstance(prods, dict) else prods):
        title = p.get("title", "")
        if not title_has_words(title, query):
            continue
        brand = (p.get("brand") or {}).get("title", "") if isinstance(p.get("brand"), dict) else ""
        if publisher and not text_has_publisher(f'{brand} {p.get("fulltitle", "")} {p.get("description", "")}', publisher):
            out.append({"title": title, "status": "wrong_publisher"})
            continue
        if PREORDER_RE.search(title):
            status = PREORDER
        else:
            status = IN_STOCK if p.get("available") else OUT_OF_STOCK
        price = (p.get("price") or {}).get("price")
        out.append({"title": title, "status": status, "price": f"${price:.2f}" if isinstance(price, (int, float)) else None,
                    "link": f'{base}/{p.get("url", "").lstrip("/")}'})
    return out


def _blocks(html, start_marker):
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)  # comments can mention "preorder" etc.
    parts = html.split(start_marker)
    return parts[1:]


def _clean(t):
    return htmllib.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", t or "")).strip())


def search_crystalcommerce(base, query, publisher):
    html = fetch(f"{base}/products/search?q={quote(query)}")
    out = []
    for blk in _blocks(html, 'class="product" itemscope'):
        m = re.search(r'itemprop="name"[^>]*title="([^"]+)"', blk) or re.search(r'itemprop="name"[^>]*>(.*?)<', blk, re.S)
        title = _clean(m.group(1)) if m else ""
        if not title or not title_has_words(title, query):
            continue
        link = re.search(r'href="(/catalog/[^"]+)"', blk)
        if PREORDER_RE.search(title) or re.search(r"pre-?order", blk, re.I):
            status = PREORDER
        elif "variant-row in-stock" in blk:
            status = IN_STOCK
        else:
            status = OUT_OF_STOCK
        pm = (re.search(r'variant-row in-stock.*?itemprop="price"[^>]*>\s*([^<]*\d[^<]*)<', blk, re.S)
              or re.search(r'itemprop="price"[^>]*>\s*([^<]*\d[^<]*)<', blk))
        out.append({"title": title, "status": status, "price": _clean(pm.group(1)).replace("CAD$ ", "$") if pm else None,
                    "link": base + link.group(1) if link else None})
    return out


def search_magento(base, query, publisher):
    html = fetch(f"{base}/en/catalogsearch/result/?q={quote(query)}")
    out = []
    for blk in _blocks(html, '<li class="item product product-item">'):
        m = re.search(r'class="product-item-link"\s+href="([^"]+)"[^>]*>(.*?)</a>', blk, re.S)
        if not m:
            continue
        title, link = _clean(m.group(2)), m.group(1)
        if not title_has_words(title, query):
            continue
        if PREORDER_RE.search(title) or re.search(r"pr[ée]-?commande|pre-?order", blk, re.I):
            status = PREORDER
        elif "tocart-form" in blk and not re.search(r"rupture|out of stock|unavailable", blk, re.I):
            status = IN_STOCK
        else:
            status = OUT_OF_STOCK
        pm = re.search(r'data-price-amount="([\d.]+)"', blk)
        out.append({"title": title, "status": status, "price": f"${float(pm.group(1)):.2f}" if pm else None, "link": link})
    return out


def search_greatboardgames(base, query, publisher):
    html = fetch(f"{base}/search?q={quote(query)}")
    out = []
    for blk in _blocks(html, '<div class="product card'):
        blk = blk.split("<!-- /product-->")[0]
        m = re.search(r'<h3[^>]*>\s*<a href="([^"]+)"[^>]*>(.*?)</a>', blk, re.S)
        if not m:
            continue
        title, link = _clean(m.group(2)), m.group(1)
        if not title_has_words(title, query):
            continue
        if PREORDER_RE.search(title) or re.search(r"pre-?order", blk, re.I):
            status = PREORDER
        elif re.search(r"out of stock|sold out", blk, re.I):
            status = OUT_OF_STOCK
        elif "addToCart" in blk:
            status = IN_STOCK
        else:
            status = OUT_OF_STOCK
        pm = re.search(r"\$\s?([\d,]+\.\d\d)", blk)
        out.append({"title": title, "status": status, "price": f"${pm.group(1)}" if pm else None, "link": link})
    return out


def search_woocommerce_html(base, query, publisher):
    """WooCommerce stores whose product API is closed: read the normal search page (incl. lazy-load templates)."""
    page = fetch(f"{base}/?s={quote(query)}&post_type=product")
    chunks = [page]
    for tpl in re.findall(r'<script type="text/template">(.*?)</script>', page, re.S):
        try:
            chunks.append(json.loads(tpl))
        except ValueError:
            pass
    out, seen = [], set()
    for chunk in chunks:
        for cls, body in re.findall(r'<li[^>]*class="([^"]*\btype-product\b[^"]*)"[^>]*>(.*?)(?=<li[^>]*class="[^"]*\btype-product\b|</ul>)', chunk, re.S):
            m = re.search(r'woocommerce-loop-product__title[^>]*>(.*?)</', body, re.S)
            title = _clean(m.group(1)) if m else ""
            if not title or not title_has_words(title, query) or title in seen:
                continue
            seen.add(title)
            classes = cls.split()
            if PREORDER_RE.search(title) or "onbackorder" in classes:
                status = PREORDER
            elif "instock" in classes and "purchasable" in classes:
                status = IN_STOCK
            else:
                status = OUT_OF_STOCK
            link = re.search(r'href="(https?://[^"]+/product/[^"]+)"', body)
            pm = re.findall(r'<bdi>(?:<span[^>]*>[^<]*</span>)?\s*([\d.,]+)\s*</bdi>', body)
            out.append({"title": title, "status": status, "price": f"${pm[-1]}" if pm else None,
                        "link": link.group(1) if link else None})
    return out


def search_shift4shop(base, query, publisher):
    page = fetch(f"{base}/search.asp?keyword={quote(query)}")
    out = []
    for blk in _blocks(page, '<div class="product-item"'):
        m = re.search(r'<div class="name">\s*<a href="([^"]+)">(.*?)</a>', blk, re.S)
        if not m:
            continue
        title = _clean(m.group(2))
        if not title_has_words(title, query):
            continue
        avail = re.search(r'class="availability"[^>]*>(.*?)</span>', blk, re.S)
        avail = _clean(avail.group(1)) if avail else ""
        if PREORDER_RE.search(title) or PREORDER_RE.search(avail):
            status = PREORDER
        elif re.search(r"\bin stock", avail, re.I) or ("add-to-cart" in blk and not re.search(r"out of stock", avail, re.I)):
            status = IN_STOCK
        else:
            status = OUT_OF_STOCK
        pm = re.search(r'class="regular-price"[^>]*>\s*([^<]+)<', blk)
        out.append({"title": title, "status": status, "price": _clean(pm.group(1)) if pm else None,
                    "link": f'{base}/{m.group(1).lstrip("/")}'})
    return out


def search_opencart(base, query, publisher):
    page = fetch(f"{base}/index.php?route=product/search&search={quote(query)}")
    out, seen = [], set()
    for blk in re.split(r'<div class="product-layout', re.sub(r"<!--.*?-->", "", page, flags=re.S))[1:]:
        m = re.search(r'<div class="name"><a href="([^"]+)">(.*?)</a>', blk, re.S)
        if not m:
            continue
        title, link = _clean(m.group(2)), m.group(1).split("?")[0]
        if not title_has_words(title, query) or link in seen:
            continue
        seen.add(link)
        layout_class = blk.split('"', 1)[0]
        labels = " ".join(_clean(x) for x in re.findall(r'class="product-label[^"]*"[^>]*>(.*?)</span>', blk, re.S))
        if PREORDER_RE.search(title) or PREORDER_RE.search(labels):
            status = PREORDER
        elif "out-of-stock" in layout_class or re.search(r"out of stock", labels, re.I):
            status = OUT_OF_STOCK
        else:
            status = IN_STOCK
        pm = re.search(r'class="price-(?:new|normal)">([^<]+)<', blk)
        out.append({"title": title, "status": status, "price": _clean(pm.group(1)).replace(" CAD", "") if pm else None, "link": link})
    return out


def search_odoo(base, query, publisher):
    page = fetch(f"{base}/shop?search={quote(query)}")
    out = []
    for blk in _blocks(page, '<div class="oe_product_cart"'):
        m = re.search(r'itemprop="name"[^>]*>(.*?)</span>', blk, re.S)
        title = _clean(m.group(1)) if m else ""
        if not title or not title_has_words(title, query):
            continue
        if publisher:
            by = re.search(r'<span>By <span>(.*?)</span>', blk)
            if by and not text_has_publisher(_clean(by.group(1)), publisher):
                out.append({"title": title, "status": "wrong_publisher"})
                continue
        av = re.search(r'itemprop="availability" href="([^"]+)"', blk)
        pre_date = re.search(r'itemprop="preorder_release_date"[^>]*>([^<]+)<', blk)
        avail = classify([av.group(1)]) if av else None
        if PREORDER_RE.search(title) or avail == PREORDER or pre_date:
            status = PREORDER
        else:
            status = avail or OUT_OF_STOCK
        link = re.search(r'href="(/shop/product/[^"?]+)', blk)
        pm = re.search(r'itemprop="price"[^>]*>([\d.]+)<', blk)
        out.append({"title": title, "status": status, "price": f"${float(pm.group(1)):.2f}" if pm else None,
                    "link": base + link.group(1) if link else None})
    return out


_square_ids = {}


def search_square(base, query, publisher):
    """Square Online: the storefront's own product feed; store IDs are read from the homepage."""
    if base not in _square_ids:
        home = fetch(base + "/")
        u = re.search(r"user_id:\s*'(\d+)'", home)
        st = re.search(r"site_id:\s*'(\d+)'", home)
        if not (u and st):
            raise ValueError("Square store IDs not found on homepage")
        _square_ids[base] = (u.group(1), st.group(1))
    user, site = _square_ids[base]
    data = fetch_json(f"{base}/app/store/api/v28/editor/users/{user}/sites/{site}/products?q={quote(query)}&per_page=30")
    out = []
    for p in data.get("data", []):
        title = htmllib.unescape(p.get("name", ""))
        if not title_has_words(title, query) or p.get("visibility") not in (None, "visible"):
            continue
        if publisher and not text_has_publisher(title + " " + re.sub(r"<[^>]+>", " ", p.get("short_description") or ""), publisher):
            out.append({"title": title, "status": "wrong_publisher"})
            continue
        inv = p.get("inventory") or {}
        if PREORDER_RE.search(title) or any((p.get("preordering") or {}).values()):
            status = PREORDER
        elif (p.get("badges") or {}).get("out_of_stock") or inv.get("all_variations_sold_out"):
            status = OUT_OF_STOCK
        else:
            status = IN_STOCK
        out.append({"title": title, "status": status, "price": (p.get("price") or {}).get("low_formatted"),
                    "link": p.get("absolute_site_link")})
    return out


_sitemap_cache = {}


def _sitemap_urls(base):
    """All page addresses from a store's sitemap (follows sitemap indexes). Cached for the run."""
    if base in _sitemap_cache:
        return _sitemap_cache[base]
    urls, todo, seen = [], [f"{base}/sitemap.xml"], set()
    while todo and len(seen) < 30:
        sm = todo.pop(0)
        if sm in seen:
            continue
        seen.add(sm)
        try:
            body = fetch(sm, timeout=90)
        except (TimeoutError, URLError):
            time.sleep(5)
            body = fetch(sm, timeout=90)
        locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body)
        if "<sitemapindex" in body:
            todo += [htmllib.unescape(u) for u in locs]
        else:
            urls += [htmllib.unescape(u) for u in locs]
    _sitemap_cache[base] = urls
    return urls


def _product_from_jsonld(page):
    for block in LD_JSON_RE.findall(page):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        for node in _walk(data):
            if node.get("@type") in ("Product", ["Product"]):
                offers = node.get("offers") or {}
                if isinstance(offers, list):
                    offers = offers[0] if offers else {}
                return node.get("name", ""), str(offers.get("availability", "")), offers.get("price")
    return None


def search_sitemap(base, query, publisher):
    """Stores without a usable search: find product pages by address in the sitemap, then read their product data."""
    words = normalize(query).split()
    hits = []
    for u in _sitemap_urls(base):
        slug = normalize(u.rstrip("/").rsplit("/", 1)[-1])
        if f" {' '.join(words)} " in f" {slug} ":
            hits.append(u)
    out = []
    for u in hits[:8]:
        try:
            info = _product_from_jsonld(fetch(u, timeout=60))
        except (HTTPError, URLError, TimeoutError, OSError):
            continue
        if not info:
            continue
        title, availability, price = info
        title = htmllib.unescape(title or "")
        if not title_has_words(title, query):
            continue
        status = PREORDER if PREORDER_RE.search(title) else (classify([availability]) or OUT_OF_STOCK)
        out.append({"title": title, "status": status,
                    "price": f"${float(price):.2f}" if isinstance(price, (int, float, str)) and str(price).replace(".", "", 1).isdigit() else None,
                    "link": u})
    return out


SEARCHERS = {
    "shopify": search_shopify,
    "woocommerce": search_woocommerce,
    "lightspeed": search_lightspeed,
    "crystalcommerce": search_crystalcommerce,
    "magento": search_magento,
    "greatboardgames": search_greatboardgames,
    "woocommerce_html": search_woocommerce_html,
    "shift4shop": search_shift4shop,
    "opencart": search_opencart,
    "odoo": search_odoo,
    "square": search_square,
    "sitemap": search_sitemap,
}


def price_value(price):
    """'$1,099.00' -> 1099.0; missing or unreadable prices sort last."""
    m = re.search(r"\d+(?:\.\d+)?", str(price or "").replace(",", ""))
    return float(m.group(0)) if m else float("inf")


def check_search(watch):
    """Search one store's catalogue for the title (and publisher, if given)."""
    base = watch["store"].rstrip("/")
    platform = watch.get("platform", "shopify")
    publisher = watch.get("publisher")
    try:
        candidates = SEARCHERS[platform](base, watch["query"], publisher)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        return UNKNOWN, None, None, f"store search failed ({type(exc).__name__}: {str(exc)[:80]})"

    # Skip video-game listings (words from config "exclude_title_words") - unless the watched title itself uses the word as often.
    def word_count(text, w):
        return f" {normalize(text)} ".count(f" {normalize(w)} ")
    words = watch.get("exclude_words", [])
    candidates = [c for c in candidates
                  if not any(word_count(c["title"], w) > word_count(watch["query"], w) for w in words)]
    # Listings you removed on the web page (for this store).
    hidden = set(watch.get("hidden", []))
    candidates = [c for c in candidates if title_core(c["title"])[0] not in hidden]
    # Your own -word exclusions for this game.
    candidates = [c for c in candidates if not any(excluded_by(c["title"], t) for t in watch.get("exclude_terms", []))]
    real = [c for c in candidates if c["status"] != "wrong_publisher"]
    if not real:
        if candidates:
            who = publisher[0] if isinstance(publisher, list) else publisher
            return NOT_LISTED, None, None, f"title found, but not by {who}"
        return NOT_LISTED, None, None, "searched store catalogue"

    # Exact title matches count. Listings with extra words in the title count only once
    # the user has confirmed that listing title on the web page; rejected titles are ignored.
    accepted = {title_core(t)[0] for t in watch.get("accept", [])}
    rejected = {title_core(t)[0] for t in watch.get("reject", [])}
    confirmed, possible = [], []
    for c in real:
        if watch.get("exact"):   # quoted title: exact title only, no "is this the same game?" prompts
            if title_core(c["title"])[0] == title_core(watch["query"])[0]:
                confirmed.append(c)
            continue
        kind = match_kind(watch["query"], c["title"])
        key = title_core(c["title"])[0]
        if key in rejected and normalize(c["title"]) != normalize(watch["query"]):
            continue
        if kind == "exact" or (kind and key in accepted):
            confirmed.append(c)
        elif kind == "possible" and key not in rejected:
            possible.append({**c, "key": key})
    watch["_possible"] = [{"title": c["title"], "key": c["key"], "status": c["status"], "price": c.get("price"),
                           "link": c.get("link")} for c in possible[:6]]
    if not confirmed:
        if possible:
            return NOT_LISTED, None, None, f"{len(possible)} possible match(es) to confirm"
        return NOT_LISTED, None, None, "only titles you ruled out"
    rank = {IN_STOCK: 0, OUT_OF_STOCK: 1, PREORDER: 2, UNKNOWN: 3}
    best = min(confirmed, key=lambda c: (rank.get(c["status"], 9), price_value(c.get("price"))))
    return best["status"], best.get("price"), best.get("link"), f'found "{best["title"]}"'


# --------------------------------------------------------------------------
# Single product page (any store)
# --------------------------------------------------------------------------
def classify(values):
    """Turn schema.org-style availability strings into one status. Pre-order checked first so it can't pass as in stock."""
    vals = [v.lower().replace(" ", "").replace("_", "") for v in values]
    if any(k in v for v in vals for k in ("preorder", "presale", "backorder")):
        return PREORDER
    if any(k in v for v in vals for k in ("instock", "limitedavailability", "onlineonly", "instoreonly")):
        return IN_STOCK
    if any(k in v for v in vals for k in ("outofstock", "soldout", "discontinued")):
        return OUT_OF_STOCK
    return None


LD_JSON_RE = re.compile(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.S | re.I)
META_RE = re.compile(r'<meta[^>]+(?:property|name|itemprop)=["\'][^"\']*availability[^"\']*["\'][^>]*>', re.I)
CONTENT_RE = re.compile(r'(?:content|href)=["\']([^"\']+)["\']', re.I)
# Pre-order wording on a button or label, e.g. <button>Pre-order now</button>
PREORDER_BUTTON_RE = re.compile(r">\s*(?:pre[\s\-]?order|back[\s\-]?order)[^<]{0,20}<", re.I)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)


def _walk(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _walk(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from _walk(item)


def page_looks_like_preorder(html):
    title = TITLE_RE.search(html)
    if title and PREORDER_RE.search(title.group(1)):
        return True
    return bool(PREORDER_BUTTON_RE.search(html))


def status_from_html(html, watch):
    if page_looks_like_preorder(html):
        return PREORDER, None, "page shows pre-order"

    out_text = (watch.get("out_of_stock_text") or "").lower()
    in_text = (watch.get("in_stock_text") or "").lower()
    page = html.lower()
    if out_text or in_text:
        if out_text and out_text in page:
            return OUT_OF_STOCK, None, f'page contains "{watch["out_of_stock_text"]}"'
        if in_text and in_text in page:
            return IN_STOCK, None, f'page contains "{watch["in_stock_text"]}"'
        if out_text and not in_text:
            return IN_STOCK, None, f'"{watch["out_of_stock_text"]}" no longer on page'

    availabilities, price = [], None
    for block in LD_JSON_RE.findall(html):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        for node in _walk(data):
            av = node.get("availability")
            if isinstance(av, str):
                availabilities.append(av)
                if price is None and node.get("price") not in (None, ""):
                    price = f"{node['price']} {node.get('priceCurrency', '')}".strip()
    status = classify(availabilities)
    if status:
        return status, price, "structured product data"

    metas = [m.group(1) for tag in META_RE.findall(html) if (m := CONTENT_RE.search(tag))]
    status = classify(metas)
    if status:
        return status, None, "page meta tags"
    return UNKNOWN, None, "couldn't find stock info - add in_stock_text / out_of_stock_text to config.json"


def check_url(watch):
    url = watch["url"]
    parts = urlsplit(url)
    try:
        if "/products/" in parts.path and not (watch.get("in_stock_text") or watch.get("out_of_stock_text")):
            base = urlunsplit((parts.scheme, parts.netloc, "", "", ""))
            handle = parts.path.split("/products/")[-1].strip("/").removesuffix(".js")
            try:
                product = shopify_product(base, handle)
                if isinstance(product, dict) and "available" in product:
                    variant = parse_qs(parts.query).get("variant", [None])[0]
                    status, price = shopify_status(product, variant)
                    return status, price, url, "Shopify product data"
            except (HTTPError, URLError, ValueError):
                pass  # not Shopify - fall through to reading the page
        status, price, method = status_from_html(fetch(url), watch)
        return status, price, url, method
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        return UNKNOWN, None, url, f"could not load page ({exc})"


def check_watch(watch):
    if watch.get("store") and watch.get("query"):
        return check_search(watch)
    return check_url(watch)


def watch_key(watch):
    if watch.get("store"):
        pub = watch.get("publisher")
        pub = pub[0] if isinstance(pub, list) else pub
        key = f'search:{watch["store"].rstrip("/")}|{normalize(watch["query"])}|{normalize(pub)}'
        key += "|exact" if watch.get("exact") else ""
        return key + ("|-" + ",".join(sorted(normalize(t) for t in watch["exclude_terms"])) if watch.get("exclude_terms") else "")
    return watch["url"]


DEFAULT_EXCLUDE_WORDS = ["xbox", "switch", "ps4", "ps5"]
QUOTES = "\"'\u201c\u201d\u2018\u2019\u00ab\u00bb"


EXCLUDE_TERM_RE = re.compile(r'(?:^|\s)-(?:["\u201c\u201d]([^"\u201c\u201d]+)["\u201c\u201d]|([^\s"\u201c\u201d-][^\s]*))')


def split_excludes(title):
    """'Kingdom Come: Deliverance -Metal -"Gold Coins"' -> ('Kingdom Come: Deliverance', ['Metal', 'Gold Coins']).
    A dash only counts when it follows a space (or starts the text) and is directly followed by the word,
    so 'X-Wing' and 'Blood Rage - Valhalla' are left alone."""
    terms = []
    def grab(m):
        terms.append((m.group(1) or m.group(2)).strip())
        return " "
    rest = EXCLUDE_TERM_RE.sub(grab, title or "")
    return re.sub(r"\s+", " ", rest).strip(), [t for t in terms if t]


def parse_title(title):
    """'"Root" -Riverfolk' -> ('Root', True, ['Riverfolk']). Quotation marks mean exact-title matching;
    -word (or -"two words") excludes listings containing it."""
    t, excludes = split_excludes((title or "").strip())
    if len(t) >= 2 and t[0] in QUOTES and t[-1] in QUOTES:
        return t[1:-1].strip(), True, excludes
    return t, False, excludes


def game_title(game):
    """(clean title, exact?, excluded terms) for a game entry; supports "exact": true / "exclude": [...]
    as well as quotes and -words typed into the title."""
    t, quoted, excludes = parse_title(game.get("title", ""))
    return t, bool(game.get("exact")) or quoted, list(dict.fromkeys(excludes + list(game.get("exclude", []))))


def build_watches(config):
    """Every game is searched at every store; extra product URLs are checked directly."""
    watches = []
    for game in config.get("games", []):
        for store in config.get("stores", []):
            if not store.get("platform") or store.get("enabled") is False:
                continue  # store can't be searched automatically, or switched off
            title, exact, excludes = game_title(game)
            watches.append({
                "game": game["title"],
                "store_name": store["name"],
                "shipping": store.get("shipping"),
                "name": f'{title} @ {store["name"]}',
                "store": store["url"],
                "platform": store["platform"],
                "query": title,
                "exact": exact,
                "exclude_terms": excludes,
                # A publisher you type in filters listings. One looked up automatically is shown on the
                # web page but doesn't filter, because stores often list a distributor instead.
                "publisher": None if game.get("publisher_source") else (game.get("publishers") or game.get("publisher") or None),
                "exclude_words": config.get("exclude_title_words", DEFAULT_EXCLUDE_WORDS),
                "accept": game.get("accept", []),
                "reject": game.get("reject", []),
                "hidden": [title_core(h.get("title", ""))[0] for h in game.get("hidden", []) if h.get("store") == store["name"]],
            })
    for extra in config.get("product_urls", []):
        watches.append({**extra, "game": extra.get("name", extra["url"])})
    return watches


# --------------------------------------------------------------------------
# Config, state, email
# --------------------------------------------------------------------------
def load_env_file():
    """Read a local .env file (for running on your own computer)."""
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_json(path, default):
    if path.exists():
        return json.loads(path.read_text())
    return default


def send_email(subject, body):
    host = os.environ.get("SMTP_HOST") or "smtp.gmail.com"
    port = int(os.environ.get("SMTP_PORT") or 465)
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    to = os.environ.get("EMAIL_TO") or user
    if not user or not password:
        raise SystemExit("SMTP_USER and SMTP_PASSWORD must be set (see README).")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = to
    msg.set_content(body)

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=30) as s:
            s.login(user, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as s:
            s.starttls()
            s.login(user, password)
            s.send_message(msg)
    print(f"Email sent to {to}: {subject}")


# --------------------------------------------------------------------------
# Publisher lookup on Board Game Bliss (Shopify "vendor" = publisher)
# --------------------------------------------------------------------------
BLISS = "https://www.boardgamebliss.com"
LOOKUP_RETRY_HOURS = 24   # a title Bliss doesn't list yet is tried again a day later


def bliss_publisher(title):
    """Publisher of the Board Game Bliss listing that best matches the title, or None."""
    data = fetch_json(f"{BLISS}/search/suggest.json?q={quote(title)}&resources[type]=product&resources[limit]=10")
    want = title_core(title)[0]
    best = None
    for p in data["resources"]["results"]["products"]:
        core = title_core(p.get("title", ""))[0]
        vendor = (p.get("vendor") or "").strip()
        if not vendor or not title_has_words(p.get("title", ""), title):
            continue
        score = 0 if core == want else len(core.split()) - len(want.split())   # exact title first, then closest
        if best is None or score < best[0]:
            best = (score, vendor, p.get("title"))
    return (best[1], best[2]) if best else (None, None)


def fill_missing_publishers(config):
    """Fill in publishers for games added without one. Records the outcome on each game.
    Returns True if config changed."""
    changed = False
    now = time.time()
    for g in config.get("games", []):
        if g.get("publisher"):
            continue
        last = g.get("publisher_checked")
        if last and now - calendar.timegm(time.strptime(last, "%Y-%m-%dT%H:%M:%SZ")) < LOOKUP_RETRY_HOURS * 3600:
            continue
        try:
            vendor, listing = bliss_publisher(game_title(g)[0])   # clean title, without quotes or -words
        except Exception as exc:
            print(f'Board Game Bliss lookup failed for "{g["title"]}": {exc}')
            g.update(publisher_lookup="failed", publisher_checked=now_utc(),
                     publisher_lookup_error=f"Couldn't reach Board Game Bliss ({type(exc).__name__}). Will retry.")
            changed = True
            continue
        if vendor:
            g.update(publisher=vendor, publisher_source="Board Game Bliss", publisher_listing=listing)
            for k in ("publisher_lookup", "publisher_lookup_error", "publisher_checked", "publishers", "bgg_id"):
                g.pop(k, None)
            print(f'Publisher for "{g["title"]}" from Board Game Bliss: {vendor} (listing "{listing}")')
        else:
            g.update(publisher_lookup="not_found", publisher_checked=now_utc())
            g.pop("publisher_lookup_error", None)
            print(f'Board Game Bliss doesn\'t list "{g["title"]}" yet; will try again in {LOOKUP_RETRY_HOURS} hours.')
        changed = True
    return changed


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def run_once(dry_run=False):
    config = load_json(CONFIG_PATH, None)
    if config and not dry_run and fill_missing_publishers(config):
        save_config(config)
    watches = build_watches(config or {})
    if not watches:
        raise SystemExit('Nothing to watch yet. Add a game:  python stock_alert.py add "Game Title" --publisher "Publisher"')
    state = load_json(STATE_PATH, {})
    if "watches" not in state:  # older flat format
        state = {"watches": {k: v for k, v in state.items() if isinstance(v, dict)}}
    old = state["watches"]
    stores_health = state.get("stores", {})

    # Check every game/store pair, several stores at a time.
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(check_watch, watches))

    alerts, alert_games, new_watches, nudges = [], [], {}, []
    store_ok = {}
    for watch, (status, price, link, method) in zip(watches, results):
        key = watch_key(watch)
        name = watch.get("name") or watch.get("query") or watch.get("url")
        prev = old.get(key, {})
        price_note = (f" - {price}" if price else "") + (f" | {watch['shipping']}" if watch.get("shipping") else "")
        print(f"[{LABELS[status]:>20}] {name}{price_note}  ({method})")

        base = {"game": watch["game"], "store": watch.get("store_name") or watch.get("url"),
                "store_url": watch.get("store") or watch.get("url"), "checked": now_utc()}
        if watch.get("store"):
            store_ok.setdefault(watch["store"], {"name": watch.get("store_name"), "ok": True, "error": None})
        if status == UNKNOWN:
            if watch.get("store"):
                store_ok[watch["store"]].update(ok=False, error=method)
            new_watches[key] = {**prev, **base, "status": prev.get("status", UNKNOWN),
                                "failures": prev.get("failures", 0) + 1, "error": method}
            continue

        # Only in-stock ever notifies, and only on the change into in-stock.
        if status == IN_STOCK and prev.get("status") != IN_STOCK:
            alerts.append(f"{name} is IN STOCK{price_note}\n{link}")
            if watch["game"] not in alert_games:
                alert_games.append(watch["game"])
        possible = watch.get("_possible", [])
        known = {p["title"] for p in prev.get("possible", []) if p.get("status") == IN_STOCK}
        for pm in possible:
            if pm["status"] == IN_STOCK and pm["title"] not in known:
                nudges.append(f'{name}: "{pm["title"]}"' + (f' - {pm["price"]}' if pm.get("price") else "")
                              + (f' | {watch["shipping"]}' if watch.get("shipping") else "") + (f'\n{pm["link"]}' if pm.get("link") else ""))
        new_watches[key] = {**base, "status": status, "price": price, "link": link,
                            "detail": method, "failures": 0, "possible": possible,
                            "since": prev.get("since") if prev.get("status") == status else now_utc()}

    for url, info in store_ok.items():
        h = stores_health.get(url, {})
        stores_health[url] = {"name": info["name"], "ok": info["ok"], "error": info["error"],
                              "last_ok": now_utc() if info["ok"] else h.get("last_ok"), "checked": now_utc()}

    if dry_run:
        print("\n(dry run - no email sent, state not saved)")
        return 0

    page = "https://sleevan.github.io/board-game-stock-alert/"
    if alerts or nudges:
        parts = []
        if alerts:
            parts.append("\n\n".join(alerts) + "\n\nGo get it!")
        if nudges:
            parts.append("Possible matches in stock. These titles aren't an exact match, so they don't count "
                         f"until you confirm them on the web page ({page}):\n\n" + "\n\n".join(nudges))
        subject = ("In stock: " + ", ".join(alert_games)) if alerts else "Possible match to confirm"
        send_email(subject, "\n\n----------\n\n".join(parts))

    state = {"updated": now_utc(), "watches": new_watches, "stores": stores_health}
    STATE_PATH.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")
    bad = [i["name"] for i in store_ok.values() if not i["ok"]]
    if bad:
        print(f"\n{len(bad)} store(s) couldn't be checked this time: " + ", ".join(sorted(set(bad))))
    return 0


def save_config(config):
    CONFIG_PATH.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n")


def manage_games(args):
    config = load_json(CONFIG_PATH, {"games": [], "stores": []})
    games = config.setdefault("games", [])
    if args.command == "add":
        title, exact, excludes = parse_title(" ".join(args.title))
        if any(normalize(g["title"]) == normalize(title) for g in games):
            print(f'Already watching "{title}".')
            return 0
        entry = {"title": title, **({"exact": True} if exact else {}), **({"exclude": excludes} if excludes else {})}
        if args.publisher:
            entry["publisher"] = args.publisher
        games.append(entry)
        save_config(config)
        print(f'Now watching "{title}"' + (f" by {args.publisher}" if args.publisher else "")
              + f' at {len(config.get("stores", []))} stores.')
    elif args.command == "remove":
        title = normalize(" ".join(args.title))
        kept = [g for g in games if normalize(g["title"]) != title]
        if len(kept) == len(games):
            print("No game with that title is being watched.")
            return 1
        config["games"] = kept
        save_config(config)
        print("Removed.")
    else:  # list
        if not games:
            print("No games yet.")
        for g in games:
            print(f'- {g["title"]}' + (f'  (publisher: {g["publisher"]})' if g.get("publisher") else ""))
        print("\nStores:")
        for st in config.get("stores", []):
            print(f'- {st["name"]}: {st["url"]}')
    return 0


def main():
    parser = argparse.ArgumentParser(description="Email me when a board game is in stock (pre-orders ignored).")
    sub = parser.add_subparsers(dest="command")
    p_add = sub.add_parser("add", help="start watching a game")
    p_add.add_argument("title", nargs="+", help="game title (required)")
    p_add.add_argument("--publisher", help="publisher, to avoid matching similarly named games (optional)")
    p_rm = sub.add_parser("remove", help="stop watching a game")
    p_rm.add_argument("title", nargs="+")
    sub.add_parser("list", help="show watched games and stores")
    parser.add_argument("--dry-run", action="store_true", help="check and print, but don't email or save state")
    parser.add_argument("--loop", type=float, metavar="MINUTES", help="keep running, checking every N minutes")
    parser.add_argument("--test-email", action="store_true", help="send a test email and exit")
    args = parser.parse_args()

    if args.command:
        return manage_games(args)

    load_env_file()

    if args.test_email:
        send_email("Board game alert: test", "If you're reading this, email alerts are working.")
        return 0

    if args.loop:
        while True:
            try:
                run_once(args.dry_run)
            except Exception as exc:  # keep the loop alive
                print(f"Check failed: {exc}", file=sys.stderr)
            time.sleep(max(args.loop, 5) * 60)

    return run_once(args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
