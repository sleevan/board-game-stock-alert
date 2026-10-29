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
import json
import os
import re
import smtplib
import sys
import time
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

# Failed checks in a row before the run exits with an error
# (on GitHub Actions, a failed run sends you GitHub's own failure email).
FAILURES_BEFORE_ALERT = 6

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
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


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


def publisher_matches(product, publisher):
    """Loose check that the product is from the given publisher (vendor, tags, type or description)."""
    words = [w for w in normalize(publisher).split() if w not in ("games", "game", "simulations", "publishing", "inc", "ltd", "llc")]
    if not words:
        return True
    tags = product.get("tags") or []
    if isinstance(tags, str):
        tags = tags.split(",")
    text = normalize(" ".join([product.get("vendor", ""), product.get("type", ""), product.get("title", ""),
                               product.get("description", ""), *tags]))
    return all(w in text.split() for w in words)


def check_search(watch):
    """Search a Shopify store's catalogue for the title (and publisher, if given)."""
    base = watch["store"].rstrip("/")
    query = watch["query"]
    publisher = watch.get("publisher")
    must_match = normalize(query)
    url = f"{base}/search/suggest.json?q={quote(query)}&resources[type]=product&resources[limit]=10"
    try:
        data = fetch_json(url)
        found = data["resources"]["results"]["products"]
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError) as exc:
        return UNKNOWN, None, None, f"store search failed ({exc}) - is it a Shopify store?"

    candidates = [p for p in found if must_match in normalize(p.get("title"))]
    if not candidates:
        return NOT_LISTED, None, None, "searched store catalogue"

    # A store can list several editions; report the best one.
    best = None
    rank = {IN_STOCK: 0, OUT_OF_STOCK: 1, PREORDER: 2, UNKNOWN: 3}
    for p in candidates:
        handle = p.get("handle") or p.get("url", "").split("/products/")[-1].split("?")[0]
        try:
            product = shopify_product(base, handle)
            if publisher and not publisher_matches(product, publisher):
                continue
            status, price = shopify_status(product)
        except (HTTPError, URLError, TimeoutError, OSError, ValueError):
            status, price = UNKNOWN, None
        link = f"{base}/products/{handle}"
        if best is None or rank[status] < rank[best[0]]:
            best = (status, price, link, f'found "{p.get("title")}"')
    return best or (NOT_LISTED, None, None, f"title found, but not by {publisher}")


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
            watches.append({
                "game": game["title"],
                "name": f'{game["title"]} @ {store["name"]}',
                "store": store["url"],
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


def run_once(dry_run=False):
    config = load_json(CONFIG_PATH, None)
    watches = build_watches(config or {})
    if not watches:
        raise SystemExit('Nothing to watch yet. Add a game:  python stock_alert.py add "Game Title" --publisher "Publisher"')
    state = load_json(STATE_PATH, {})

    alerts, alert_games, persistent_failures = [], [], []
    for watch in watches:
        key = watch_key(watch)
        name = watch.get("name") or watch.get("query") or watch.get("url")
        status, price, link, method = check_watch(watch)
        prev = state.get(key, {})

        price_note = f" - {price}" if price else ""
        print(f"[{LABELS[status]:>20}] {name}{price_note}  ({method})")

        if status == UNKNOWN:
            fails = prev.get("failures", 0) + 1
            state[key] = {**prev, "failures": fails}
            if fails >= FAILURES_BEFORE_ALERT:
                persistent_failures.append(f"{name}: {method}")
            continue

        # Only in-stock ever notifies, and only on the change into in-stock.
        if status == IN_STOCK and prev.get("status") != IN_STOCK:
            alerts.append(f"{name} is IN STOCK{price_note}\n{link}")
            if watch["game"] not in alert_games:
                alert_games.append(watch["game"])
        state[key] = {"status": status, "failures": 0, "link": link, "checked": time.strftime("%Y-%m-%d %H:%M")}

    if dry_run:
        print("\n(dry run - no email sent, state not saved)")
        return 0

    if alerts:
        subject = "In stock: " + ", ".join(alert_games)
        send_email(subject, "\n\n".join(alerts) + "\n\nGo get it!")

    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n")

    if persistent_failures:
        print("\nThese checks have failed several times in a row:\n  " + "\n  ".join(persistent_failures))
        return 2
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
