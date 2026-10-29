"""One-off: test candidate search endpoints for stores not yet covered. Writes probe-out.txt."""
import re, ssl, sys, json
from pathlib import Path
from urllib.request import Request, urlopen
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s

def get(url, legacy_tls=False):
    ctx = None
    if legacy_tls:
        ctx = ssl.create_default_context()
        ctx.set_ciphers("DEFAULT@SECLEVEL=1")
        ctx.minimum_version = ssl.TLSVersion.TLSv1
    req = Request(url, headers={"User-Agent": s.USER_AGENT, "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"})
    with urlopen(req, timeout=25, context=ctx) as r:
        return r.status, r.headers.get("content-type", ""), r.read().decode("utf-8", "replace")

Q = "catan"
tests = [
 ("Le Roi (myshopify suggest)", f"https://tcgandgames.myshopify.com/search/suggest.json?q={Q}&resources[type]=product", {}),
 ("Le Roi (own domain search)", f"https://leroidescartesvalley.com/search?type=product&q={Q}", {}),
 ("J&J search.asp", f"https://shop.jjcards.com/search.asp?keyword={Q}", {}),
 ("BGnMore OpenCart", f"https://www.boardgamesnmore.com/index.php?route=product/search&search={Q}", {}),
 ("Toys On Fire Odoo", f"https://www.toysonfire.ca/shop?search={Q}", {}),
 ("Pe Metawe Square api", f"https://shop.pemetawe.com/app/store/api/v28/editor/users/136979323/sites/725618189563867141/products?q={Q}&per_page=10", {}),
 ("Pe Metawe Square cdn", f"https://cdn5.editmysite.com/app/store/api/v28/editor/users/136979323/sites/725618189563867141/products?q={Q}&per_page=10", {}),
 ("Victory Pints Square", f"https://www.victorypints.ca/app/store/api/v28/editor/users/141724060/sites/520928800308637132/products?q={Q}&per_page=10", {}),
 ("Mission Ecwid search page", f"https://www.boardgames.ca/search?keyword={Q}", {}),
 ("Mission Ecwid jsp catalog", f"https://app.ecwid.com/jsp/122261030/search?keyword={Q}", {}),
 ("Mission Ecwid storefront api", f"https://app.ecwid.com/storefront/api/v1/122261030/products?keyword={Q}", {}),
 ("Magic Stronghold main.js", "https://www.magicstronghold.com/main.js", {}),
 ("Magic Stronghold shared.js", "https://www.magicstronghold.com/shared.js", {}),
 ("Grillons legacy TLS", "https://en.crazycrickets.games/", {"legacy_tls": True}),
 ("Grillons http", "http://en.crazycrickets.games/", {}),
 ("F.G. Bradley's Woo search", f"https://www.fgbradleys.com/?s={Q}&post_type=product", {}),
]
out = []
for name, url, kw in tests:
    try:
        st, ct, body = get(url, **kw)
        out.append(f"##### {name} | {url} | {st} {ct} | {len(body)} bytes")
        if "json" in ct or body.lstrip()[:1] in "[{":
            out.append(body[:3000])
        elif name.startswith("Magic Stronghold"):
            urls = sorted(set(re.findall(r"https?://[a-zA-Z0-9.\-]+(?:/[\w\-./{}$]*)?", body)))
            out.append("URLS: " + "\n".join(u for u in urls if "amazonaws" in u or "api" in u or "execute" in u)[:3000])
            for m in list(re.finditer(r"(search|inventory|product)[A-Za-z]*\s*[:=(]", body))[:12]:
                out.append("…" + re.sub(r"\s+", " ", body[max(0, m.start()-150):m.end()+250]))
        else:
            gen = re.findall(r'<meta[^>]+generator[^>]*>', body, re.I)[:2]
            out.append(f"generator: {gen}")
            body2 = re.sub(r"<!--.*?-->", "", body, flags=re.S)
            hits = [m.start() for m in re.finditer(Q, body2, re.I)]
            # first product-looking chunk around a Catan mention after the header
            for i in hits[len(hits)//3: len(hits)//3 + 2]:
                out.append("…" + re.sub(r"\s+", " ", body2[max(0, i-1500):i+1500]))
            for kwd in ["out of stock", "outofstock", "instock", "in stock", "sold out", "add to cart", "rupture", "unavailable", "pre-order", "preorder"]:
                out.append(f"  count[{kwd}]={len(re.findall(kwd, body2, re.I))}")
    except Exception as e:
        out.append(f"##### {name} | {url} | ERROR {type(e).__name__}: {str(e)[:200]}")
Path("probe-out.txt").write_text("\n".join(out) + "\n")
print("\n".join(l[:200] for l in out if l.startswith("#####")))
