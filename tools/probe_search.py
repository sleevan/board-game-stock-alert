"""One-off: find 401 Games' Fast Simon search settings and try its search."""
import json, re, sys
from pathlib import Path
from urllib.parse import quote
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
base, q = sys.argv[1], sys.argv[2]
out = []
home = s.fetch(base + "/")
for m in list(re.finditer(r"(?i)fast.?simon", home))[:6]:
    out.append("ctx: " + re.sub(r"\s+", " ", home[max(0, m.start()-200):m.end()+300]))
uuids = list(dict.fromkeys(re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", home)))
out.append("uuids: " + str(uuids[:10]))
store_ids = list(dict.fromkeys(re.findall(r"(?i)(?:store_?id|storeId)[\"']?\s*[:=]\s*[\"']?(\d{5,})", home)))
out.append("store ids: " + str(store_ids[:5]))
scripts = [u for u in re.findall(r'src="([^"]+)"', home) if "fast" in u.lower() or "simon" in u.lower() or "instant" in u.lower()]
out.append("fast simon scripts: " + str(scripts[:6]))
shop_id = re.search(r'"shopId"\s*:\s*(\d+)|Shopify\.shop_id\s*=\s*(\d+)|"shop_id"\s*:\s*(\d+)', home)
out.append("shopify shop id: " + str(shop_id.groups() if shop_id else None))
for uuid in uuids[:4]:
    for sid in (store_ids[:2] or [""]) + ([g for g in (shop_id.groups() if shop_id else []) if g][:1]):
        for ep in ("full_text_search", "autocomplete"):
            u = f"https://api.fastsimon.com/{ep}?UUID={uuid}&store_id={sid}&q={quote(q)}&products_per_page=10&page_num=1"
            try:
                d = json.loads(s.fetch(u))
                items = d.get("items") or d.get("products") or []
                out.append(f"OK {ep} uuid={uuid} store={sid}: " + json.dumps([(i.get("l") or i.get("title"), i.get("p") or i.get("price"), i.get("iso") if "iso" in i else i.get("available"), i.get("u") or i.get("url")) for i in items[:5]]))
                out.append("  keys: " + str(sorted(items[0].keys())) if items else "  (no items) keys: " + str(sorted(d.keys())[:20]))
            except Exception as e:
                out.append(f"ERR {ep} uuid={uuid[:8]} store={sid}: {e}")
Path("search-probe.txt").write_text("\n".join(out) + "\n"); print("\n".join(out))
