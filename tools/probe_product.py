"""One-off: save a product's Shopify data and page for inspecting how pre-orders are shown."""
import sys, json, gzip
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
url = sys.argv[1].rstrip("/")
out = Path("probe"); out.mkdir(exist_ok=True)
for name, u in [("product.js", url + ".js"), ("product.json", url + ".json"), ("page.html", url)]:
    try:
        (out / (name + ".gz")).write_bytes(gzip.compress(s.fetch(u).encode())); print("ok", name)
    except Exception as e:
        print("ERR", name, e)
