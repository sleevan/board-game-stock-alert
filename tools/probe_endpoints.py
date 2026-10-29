"""One-off: test Magic Stronghold (Conduct Commerce) and Mission (Ecwid) data."""
import sys, gzip, json, re
from pathlib import Path
from urllib.request import Request, urlopen
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
out = Path("probe"); out.mkdir(exist_ok=True)
log = []
def save(name, body): (out / (name + ".gz")).write_bytes(gzip.compress(body.encode()))
# Magic Stronghold: same call the store's own page makes
for variant, headers in [("plain", {}), ("origin", {"Origin": "https://www.magicstronghold.com", "Referer": "https://www.magicstronghold.com/"})]:
    try:
        req = Request("https://api.conductcommerce.com/v1/getProductListings",
                      data=json.dumps({"search": "catan", "reqID": "probe-1"}).encode(),
                      headers={"User-Agent": s.USER_AGENT, "Content-Type": "text/plain", **headers}, method="POST")
        with urlopen(req, timeout=25) as r:
            body = r.read().decode("utf-8", "replace")
        save(f"magic-{variant}.json", body); log.append(f"magic {variant}: ok {len(body)}")
    except Exception as e:
        log.append(f"magic {variant}: ERR {type(e).__name__} {str(e)[:150]}")
# Mission: sitemaps, then one Catan product page
try:
    urls = []
    for sm in ["https://boardgames.ca/sitemap1.xml", "https://boardgames.ca/sitemap2.xml"]:
        body = s.fetch(sm); save(sm.rsplit("/", 1)[1], body)
        urls += re.findall(r"<loc>([^<]+)</loc>", body)
    log.append(f"mission sitemap urls: {len(urls)}")
    cat = [u for u in urls if "catan" in u.lower()]
    log.append("mission catan urls: " + " ".join(cat[:15]))
    for i, u in enumerate(cat[:3]):
        body = s.fetch(u); save(f"mission-prod{i}.html", body); log.append(f"saved {u} {len(body)}")
except Exception as e:
    log.append(f"mission: ERR {type(e).__name__} {str(e)[:150]}")
(out / "log.txt").write_text("\n".join(log) + "\n"); print("\n".join(log))
