"""One-off: collect shipping-policy text from each store, for setting each store's standard shipping."""
import json, re, sys, html
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
paths = ["/policies/shipping-policy", "/pages/shipping", "/pages/shipping-policy", "/pages/shipping-information", "/pages/shipping-info",
         "/pages/shipping-returns", "/pages/livraison", "/shipping", "/shipping-policy", "/shipping-information", "/shipping-returns",
         "/livraison", "/en/shipping", "/service/shipping-returns/", "/pages/faq", "/faq"]
KEY = re.compile(r"(ship|livraison|deliver|free|gratuit|flat|canada post|rate|tarif)", re.I)
def text_of(page):
    page = re.sub(r"(?is)<(script|style|noscript|svg|header|nav|footer)[^>]*>.*?</\1>", " ", page)
    t = html.unescape(re.sub(r"<[^>]+>", " ", page))
    return re.sub(r"\s+", " ", t)
def one(st):
    base = st["url"].rstrip("/")
    found = []
    try:   # follow the store's own shipping / delivery / FAQ links first
        home = s.fetch(base + "/", timeout=20)
        links = re.findall(r'href="([^"#]*(?:ship|livraison|deliver|expedition|faq|policies)[^"#]*)"', home, re.I)
        own = []
        for l in links:
            l = html.unescape(l)
            if l.startswith("//"): l = "https:" + l
            if l.startswith("/"): l = base + l
            if l.startswith(base.split("://")[1].split("/")[0]) or l.startswith(base) and l not in own:
                own.append(l)
    except Exception:
        own = []
    for pth in own[:4] + [base + x for x in paths]:
        pth = pth[len(base):] if pth.startswith(base) else pth
        try:
            t = text_of(s.fetch(base + pth if pth.startswith("/") else pth, timeout=20))
        except Exception:
            continue
        sents = [x.strip() for x in re.split(r"(?<=[.!?])\s+", t) if "$" in x and KEY.search(x) and len(x) < 400]
        if sents:
            found.append({"path": pth, "lines": list(dict.fromkeys(sents))[:12]})
        if len(found) >= 2:
            break
    return {"name": st["name"], "url": base, "found": found}
stores = [x for x in json.loads(s.CONFIG_PATH.read_text())["stores"] if x.get("platform")]
with ThreadPoolExecutor(8) as pool:
    res = list(pool.map(one, stores))
Path("shipping-probe.json").write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n")
print(sum(1 for r in res if r["found"]), "of", len(res), "stores had shipping text")
