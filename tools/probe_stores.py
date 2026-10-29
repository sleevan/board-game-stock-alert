"""Find out which shop platform each store runs on, so the alert can search it."""
import json, sys, re
from pathlib import Path
from urllib.parse import quote
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s

stores = json.loads((Path(__file__).parent / "stores_bgo.json").read_text())
out = []
for name, url in stores:
    base = url.rstrip("/")
    result = {"name": name, "url": base, "platform": None, "note": ""}
    try:
        d = s.fetch_json(f"{base}/search/suggest.json?q=catan&resources[type]=product&resources[limit]=5")
        n = len(d["resources"]["results"]["products"])
        result.update(platform="shopify", note=f"{n} results for 'catan'")
    except Exception as e:
        result["note"] = f"shopify: {type(e).__name__} {str(e)[:60]}"
    if not result["platform"]:
        try:
            d = s.fetch_json(f"{base}/wp-json/wc/store/v1/products?search=catan&per_page=5")
            if isinstance(d, list):
                result.update(platform="woocommerce", note=f"{len(d)} results for 'catan'")
        except Exception as e:
            result["note"] += f" | woo: {type(e).__name__} {str(e)[:60]}"
    if not result["platform"]:
        try:
            html = s.fetch(base)
            hints = [k for k, pat in {
                "shopify": r"cdn\.shopify|Shopify\.theme", "woocommerce": r"woocommerce",
                "crystalcommerce": r"crystalcommerce", "bigcommerce": r"bigcommerce",
                "wix": r"wixstatic|wix\.com", "squarespace": r"squarespace", "lightspeed": r"lightspeed|ecwid",
                "magento": r"mage/|Magento", "prestashop": r"prestashop"}.items() if re.search(pat, html, re.I)]
            result["note"] += f" | homepage hints: {hints or 'none'}"
        except Exception as e:
            result["note"] += f" | homepage: {type(e).__name__} {str(e)[:60]}"
    print(f'{result["platform"] or "-":12} {name}: {result["note"]}', flush=True)
    out.append(result)
Path("stores-probe.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
