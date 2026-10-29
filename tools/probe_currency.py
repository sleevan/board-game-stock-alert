"""One-off: find which request details make Shopify answer in USD."""
import json, sys
from pathlib import Path
from urllib.request import Request, urlopen
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
u = "https://hobbiesville.com/products/kingdom-come-deliverance-the-board-game-pre-order.js"
out = []
def get(headers):
    return json.loads(urlopen(Request(u, headers=headers), timeout=25).read().decode())["price"]
out.append(f"stock_alert.fetch (real check): {json.loads(s.fetch(u))['price']}")
out.append(f"UA only: {get({'User-Agent': s.USER_AGENT})}")
out.append(f"UA + Accept-Language en-CA: {get({'User-Agent': s.USER_AGENT, 'Accept-Language': 'en-CA,en;q=0.9'})}")
out.append(f"UA + Accept html/json: {get({'User-Agent': s.USER_AGENT, 'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8'})}")
out.append(f"UA + Accept + cookie CA: {get({'User-Agent': s.USER_AGENT, 'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8', 'Cookie': 'localization=CA; cart_currency=CAD'})}")
out.append(f"real headers + ?currency=CAD: {json.loads(s.fetch(u + '?currency=CAD'))['price']}")
try:
    out.append(f"product.json variant price: {json.loads(s.fetch(u[:-3] + '.json'))['product']['variants'][0]['price']}")
except Exception as e:
    out.append(f"product.json: {e}")
Path("currency-probe.txt").write_text("\n".join(out) + "\n"); print("\n".join(out))
