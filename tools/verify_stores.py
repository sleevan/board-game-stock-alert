"""Search every store for a common game to prove each store's search works. Sends no email."""
import json, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s

query = sys.argv[1] if len(sys.argv) > 1 else "Catan"
stores = [st for st in json.loads(s.CONFIG_PATH.read_text())["stores"] if st.get("platform")]

def one(st):
    try:
        res = s.SEARCHERS[st["platform"]](st["url"].rstrip("/"), query, None)
        return {"name": st["name"], "platform": st["platform"], "ok": True, "matches": len(res),
                "statuses": dict(Counter(r["status"] for r in res)),
                "example": res[0] if res else None}
    except Exception as e:
        return {"name": st["name"], "platform": st["platform"], "ok": False, "error": f"{type(e).__name__}: {str(e)[:120]}"}

with ThreadPoolExecutor(8) as pool:
    results = list(pool.map(one, stores))
for r in results:
    print(f'{"OK " if r["ok"] else "ERR"} {r["platform"]:15} {r["name"]:32} {r.get("matches", "")} {r.get("statuses", r.get("error"))}')
Path("store-verify.json").write_text(json.dumps(results, indent=1, ensure_ascii=False) + "\n")
