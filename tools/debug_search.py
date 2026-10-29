"""Print raw search results for a few stores (diagnostics only)."""
import json, sys
from pathlib import Path
from urllib.parse import quote
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
q = sys.argv[1]
names = sys.argv[2].split("|")
for st in json.loads(s.CONFIG_PATH.read_text())["stores"]:
    if st["name"] not in names: continue
    b = st["url"].rstrip("/")
    try:
        if st["platform"] == "shopify":
            d = s.fetch_json(f"{b}/search/suggest.json?q={quote(q)}&resources[type]=product&resources[limit]=10")
            print(st["name"], "SUGGEST:", [p.get("title") for p in d["resources"]["results"]["products"]])
            try:
                d2 = s.fetch_json(f"{b}/search/suggest.json?q={quote(q.lower())}&resources[type]=product&resources[limit]=10")
                print("   lower:", [p.get("title") for p in d2["resources"]["results"]["products"]])
            except Exception as e: print("   lower err", e)
        else:
            d = s.fetch_json(f"{b}/wp-json/wc/store/v1/products?search={quote(q)}&per_page=10")
            print(st["name"], "WOO:", [p.get("name") for p in d])
    except Exception as e:
        print(st["name"], "ERR", type(e).__name__, e)
