"""One-off: compare a Shopify product's price as fetched plainly vs. with Canada/CAD requested."""
import json, sys
from pathlib import Path
from urllib.request import Request, urlopen
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
url = sys.argv[1]
out = []
variants = [
    ("plain", url + ".js", {}),
    ("?currency=CAD", url + ".js?currency=CAD", {}),
    ("cookie localization=CA", url + ".js", {"Cookie": "localization=CA; cart_currency=CAD"}),
    ("/en-ca/ path", url.replace("/products/", "/en-ca/products/") + ".js", {}),
    ("country=CA param", url + ".js?country=CA", {}),
]
for name, u, extra in variants:
    try:
        req = Request(u, headers={"User-Agent": s.USER_AGENT, "Accept": "application/json", **extra})
        with urlopen(req, timeout=25) as r:
            d = json.loads(r.read().decode())
        out.append(f"{name:28} price={d.get('price')} variants={[v.get('price') for v in d.get('variants', [])][:3]}")
    except Exception as e:
        out.append(f"{name:28} ERR {type(e).__name__} {e}")
for name, u in [("cart.js plain", url.split('/products/')[0] + "/cart.js"), ("cart.js ?currency=CAD", url.split('/products/')[0] + "/cart.js?currency=CAD")]:
    try:
        req = Request(u, headers={"User-Agent": s.USER_AGENT}); d = json.loads(urlopen(req, timeout=25).read().decode())
        out.append(f"{name:28} currency={d.get('currency')}")
    except Exception as e:
        out.append(f"{name:28} ERR {e}")
Path("currency-probe.txt").write_text("\n".join(out) + "\n"); print("\n".join(out))
