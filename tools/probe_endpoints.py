"""One-off: save full responses for stores not yet covered, for parser development."""
import sys, gzip
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
Q = "catan"
grab = {
 "bgnmore.html": f"https://www.boardgamesnmore.com/index.php?route=product/search&search={Q}",
 "toysonfire.html": f"https://www.toysonfire.ca/shop?search={Q}",
 "fgbradleys.html": f"https://www.fgbradleys.com/?s={Q}&post_type=product",
 "jj.html": f"https://shop.jjcards.com/search.asp?keyword={Q}",
 "victorypints.json": f"https://www.victorypints.ca/app/store/api/v28/editor/users/141724060/sites/520928800308637132/products?q={Q}&per_page=10",
 "magic-main.js": "https://www.magicstronghold.com/main.js",
 "magic-shared.js": "https://www.magicstronghold.com/shared.js",
 "magic-robots.txt": "https://www.magicstronghold.com/robots.txt",
 "mission-robots.txt": "https://www.boardgames.ca/robots.txt",
 "mission-sitemap.xml": "https://www.boardgames.ca/sitemap.xml",
 "mission-product.html": "https://boardgames.ca/products/catan",
}
out = Path("probe"); out.mkdir(exist_ok=True)
for name, url in grab.items():
    try:
        body = s.fetch(url)
        (out / (name + ".gz")).write_bytes(gzip.compress(body.encode()))
        print("ok ", name, len(body))
    except Exception as e:
        (out / (name + ".err")).write_text(f"{type(e).__name__}: {e}")
        print("ERR", name, e)
