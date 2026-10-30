"""One-off: show what a Shopify store's searches return for a title."""
import json, sys
from pathlib import Path
from urllib.parse import quote
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
base, q = sys.argv[1], sys.argv[2]
out = []
for label, u in [("suggest", s.cad(f"{base}/search/suggest.json?q={quote(q)}&resources[type]=product&resources[limit]=10")),
                 ("suggest lowercase", s.cad(f"{base}/search/suggest.json?q={quote(q.lower())}&resources[type]=product&resources[limit]=10")),
                 ("suggest 'men of iron'", s.cad(f"{base}/search/suggest.json?q={quote('men of iron')}&resources[type]=product&resources[limit]=10")),
                 ("suggest 'tri-pack'", s.cad(f"{base}/search/suggest.json?q={quote('tri-pack')}&resources[type]=product&resources[limit]=10"))]:
    try:
        d = s.fetch_json(u); out.append(f"{label}: " + json.dumps([(p.get('title'), p.get('available'), p.get('handle')) for p in d['resources']['results']['products']]))
    except Exception as e:
        out.append(f"{label}: ERR {e}")
try:
    html = s.fetch(s.cad(f"{base}/search?type=product&q={quote(q)}"))
    import re
    hs = list(dict.fromkeys(re.findall(r'/products/([a-z0-9\-_%]+)', html, re.I)))
    out.append("search page handles: " + ", ".join(hs[:15]))
except Exception as e:
    out.append(f"search page: ERR {e}")
out.append("program result: " + json.dumps(s.search_shopify(base, q, None)))
Path("search-probe.txt").write_text("\n".join(out) + "\n"); print("\n".join(out))
