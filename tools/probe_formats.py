"""Save raw search responses from stores the main search can't handle yet, for inspection."""
import json, sys, re
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s

probe = json.loads(Path("stores-probe.json").read_text())
todo = [p for p in probe if not p["platform"]]
Q = "catan"
paths = [
    "/search/{q}/?format=json", "/en/search/{q}/?format=json",          # Lightspeed eCom
    "/products/search?q={q}",                                          # CrystalCommerce
    "/catalogsearch/result/?q={q}",                                    # Magento
    "/search.php?search_query={q}",                                    # BigCommerce
    "/search?q={q}", "/?s={q}&post_type=product",                      # generic / WordPress
    "/",
]
out = Path("probe"); out.mkdir(exist_ok=True)
summary = []
for p in todo:
    slug = re.sub(r"[^a-z0-9]+", "-", p["name"].lower()).strip("-")
    for path in paths:
        url = p["url"] + path.format(q=Q)
        try:
            body = s.fetch(url)
            ok = "ok"
        except Exception as e:
            body, ok = "", f"{type(e).__name__}: {str(e)[:80]}"
        fname = f'{slug}__{re.sub(r"[^a-z0-9]+", "_", path.split("?")[0].lower()).strip("_") or "home"}{"_json" if "format=json" in path else ""}.txt'
        if body:
            (out / fname).write_text(body[:400000])
        line = f'{p["name"]:32} {path:40} {ok} {len(body)} {"catan" in body.lower()}'
        print(line, flush=True); summary.append(line)
(out / "_summary.txt").write_text("\n".join(summary) + "\n")
