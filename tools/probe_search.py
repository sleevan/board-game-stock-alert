"""One-off: find a way to locate a product at a Shopify store whose own search is weak."""
import json, re, sys
from pathlib import Path
from urllib.parse import quote
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
base, q = sys.argv[1], sys.argv[2]
out = []
def sugg(label, query, extra=""):
    try:
        d = s.fetch_json(s.cad(f"{base}/search/suggest.json?q={quote(query)}&resources[type]=product&resources[limit]=10{extra}"))
        out.append(f"{label}: " + json.dumps([p.get('title') for p in d['resources']['results']['products']][:6]))
    except Exception as e:
        out.append(f"{label}: ERR {e}")
sugg('title:"..."', f'title:"{q}"')
sugg('quoted', f'"{q}"')
sugg('no hyphen', q.replace("-", " "))
sugg('fields=title', q, "&resources[options][fields]=title")
sugg('unavailable_products=last', q, "&resources[options][unavailable_products]=last&resources[options][fields]=title,product_type,vendor")
slug = re.sub(r"[^a-z0-9]+", "-", q.lower()).strip("-")
for h in [slug, slug + "-2nd-printing", slug + "-second-edition", slug.replace("tri-pack", "tripack")]:
    try:
        p = s.fetch_json(s.cad(f"{base}/products/{h}.js")); out.append(f"handle {h}: FOUND {p['title']} available={p['available']} price={p['price']}")
    except Exception as e:
        out.append(f"handle {h}: {e}")
try:
    home = s.fetch(base + "/")
    apps = [k for k in ["searchanise", "boost-pfs", "boostcommerce", "fastsimon", "fast-simon", "klevu", "algolia", "searchspring", "findify", "doofinder", "smart-search", "instantsearch", "searchpie", "rapid-search", "binderpos"] if k in home.lower()]
    out.append("search apps on homepage: " + str(apps))
    for m in re.finditer(r"(api_key|apiKey|siteId|site_id|searchanise[^\"']{0,40})[\"']?\s*[:=]\s*[\"']([A-Za-z0-9_\-]{6,})", home):
        out.append(f"  key: {m.group(0)[:100]}")
except Exception as e:
    out.append(f"home: ERR {e}")
Path("search-probe.txt").write_text("\n".join(out) + "\n"); print("\n".join(out))
