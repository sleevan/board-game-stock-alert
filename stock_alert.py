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
    })
    with urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def fetch_json(url):
    return json.loads(fetch(url))


def normalize(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()  # Trône -> Trone
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


# --------------------------------------------------------------------------
# Shopify helpers
# --------------------------------------------------------------------------
def shopify_product(base, handle):
    """Full product data from /products/<handle>.js (public on every Shopify store)."""
    return fetch_json(f"{base}/products/{handle}.js")


def shopify_is_preorder(product):
    """Shopify has no built-in pre-order flag; stores signal it in the title, tags, type or variant names."""
    tags = product.get("tags") or []
    if isinstance(tags, str):
        tags = tags.split(",")
    variant_titles = [v.get("title", "") for v in product.get("variants", [])]
    haystack = " | ".join([product.get("title", ""), product.get("type", ""), *tags, *variant_titles])
    return bool(PREORDER_RE.search(haystack))


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
    words = publisher_words(publisher)
    have = normalize(text).split()
    return all(w in have for w in words)


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
    data = fetch_json(f"{base}/search/suggest.json?q={quote(query)}&resources[type]=product&resources[limit]=10")
    handles = []
    for p in data["resources"]["results"]["products"]:
        if normalize(query) in normalize(p.get("title")):
            handles.append(p.get("handle") or p.get("url", "").split("/products/")[-1].split("?")[0])
    if not handles:
        # Some stores' quick search returns unrelated products; fall back to the full search page.
        try:
            html = fetch(f"{base}/search?type=product&q={quote(query)}")
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
            continue
        title = product.get("title", "")
        if normalize(query) not in normalize(title):
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
        if normalize(query) not in normalize(title):
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
        if normalize(query) not in normalize(title):
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
        if not title or normalize(query) not in normalize(title):
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
        if normalize(query) not in normalize(title):
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
        if normalize(query) not in normalize(title):
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


SEARCHERS = {
    "shopify": search_shopify,
    "woocommerce": search_woocommerce,
    "lightspeed": search_lightspeed,
    "crystalcommerce": search_crystalcommerce,
    "magento": search_magento,
    "greatboardgames": search_greatboardgames,
}


def check_search(watch):
    """Search one store's catalogue for the title (and publisher, if given)."""
    base = watch["store"].rstrip("/")
    platform = watch.get("platform", "shopify")
    publisher = watch.get("publisher")
    try:
        candidates = SEARCHERS[platform](base, watch["query"], publisher)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        return UNKNOWN, None, None, f"store search failed ({type(exc).__name__}: {str(exc)[:80]})"

    real = [c for c in candidates if c["status"] != "wrong_publisher"]
    if not real:
        if candidates:
            return NOT_LISTED, None, None, f"title found, but not by {publisher}"
        return NOT_LISTED, None, None, "searched store catalogue"
    rank = {IN_STOCK: 0, OUT_OF_STOCK: 1, PREORDER: 2, UNKNOWN: 3}
    best = min(real, key=lambda c: rank.get(c["status"], 9))
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
        return f'search:{watch["store"].rstrip("/")}|{normalize(watch["query"])}|{normalize(watch.get("publisher"))}'
    return watch["url"]


def build_watches(config):
    """Every game is searched at every store; extra product URLs are checked directly."""
    watches = []
    for game in config.get("games", []):
        for store in config.get("stores", []):
            if not store.get("platform") or store.get("enabled") is False:
                continue  # store can't be searched automatically, or switched off
            watches.append({
                "game": game["title"],
                "store_name": store["name"],
                "name": f'{game["title"]} @ {store["name"]}',
                "store": store["url"],
                "platform": store["platform"],
                "query": game["title"],
                "publisher": game.get("publisher") or None,
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


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def run_once(dry_run=False):
    config = load_json(CONFIG_PATH, None)
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

    alerts, alert_games, new_watches = [], [], {}
    store_ok = {}
    for watch, (status, price, link, method) in zip(watches, results):
        key = watch_key(watch)
        name = watch.get("name") or watch.get("query") or watch.get("url")
        prev = old.get(key, {})
        price_note = f" - {price}" if price else ""
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
        new_watches[key] = {**base, "status": status, "price": price, "link": link,
                            "detail": method, "failures": 0,
                            "since": prev.get("since") if prev.get("status") == status else now_utc()}

    for url, info in store_ok.items():
        h = stores_health.get(url, {})
        stores_health[url] = {"name": info["name"], "ok": info["ok"], "error": info["error"],
                              "last_ok": now_utc() if info["ok"] else h.get("last_ok"), "checked": now_utc()}

    if dry_run:
        print("\n(dry run - no email sent, state not saved)")
        return 0

    if alerts:
        subject = "In stock: " + ", ".join(alert_games)
        send_email(subject, "\n\n".join(alerts) + "\n\nGo get it!")

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
        title = " ".join(args.title).strip()
        if any(normalize(g["title"]) == normalize(title) for g in games):
            print(f'Already watching "{title}".')
            return 0
        entry = {"title": title}
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
