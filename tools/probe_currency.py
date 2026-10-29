"""One-off: check the currency of Shopify quick-search prices."""
import json, sys
from pathlib import Path
from urllib.request import Request, urlopen
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
base, q = sys.argv[1].split("|")
out = []
for name, u, extra in [
    ("suggest plain", f"{base}/search/suggest.json?q={q}&resources[type]=product&resources[limit]=3", {}),
    ("suggest ?currency=CAD", f"{base}/search/suggest.json?q={q}&resources[type]=product&resources[limit]=3&currency=CAD", {}),
    ("suggest cookie CA", f"{base}/search/suggest.json?q={q}&resources[type]=product&resources[limit]=3", {"Cookie": "localization=CA; cart_currency=CAD"}),
    ("suggest country=CA", f"{base}/search/suggest.json?q={q}&resources[type]=product&resources[limit]=3&country=CA", {}),
]:
    try:
        d = json.loads(urlopen(Request(u, headers={"User-Agent": s.USER_AGENT, **extra}), timeout=25).read().decode())
        out.append(f"{name:24} " + "; ".join(f'{p["title"][:40]} = {p.get("price")} {p.get("price_min", "")}' for p in d["resources"]["results"]["products"]))
    except Exception as e:
        out.append(f"{name:24} ERR {e}")
# how often does the product .js fail when fetched quickly in a row? (rate limiting)
fails = 0
for i in range(12):
    try:
        urlopen(Request(f"{base}/products/kingdom-come-deliverance-the-board-game-pre-order.js", headers={"User-Agent": s.USER_AGENT}), timeout=25).read()
    except Exception as e:
        fails += 1; last = str(e)
out.append(f"rapid .js fetches: {fails}/12 failed" + (f" ({last})" if fails else ""))
Path("currency-probe.txt").write_text("\n".join(out) + "\n"); print("\n".join(out))
