"""One-off: run the program's real store search for one store/title."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
base, q = sys.argv[1], sys.argv[2]
res = s.search_shopify(base, q, None)
w = {"store": base, "platform": "shopify", "query": q}
s.SEARCHERS["once"] = lambda b, qq, p: res
w["platform"] = "once"
out = ["search results: " + json.dumps(res), "check result: " + json.dumps(s.check_search(w)), "prompts: " + json.dumps(w.get("_possible"))]
Path("search-probe.txt").write_text("\n".join(out) + "\n"); print("\n".join(out))
