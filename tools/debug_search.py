"""Run the real store search for specific store=query pairs (diagnostics only)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import stock_alert as s
pairs = dict(x.split("=", 1) for x in sys.argv[1].split("|"))
for st in json.loads(s.CONFIG_PATH.read_text())["stores"]:
    if st["name"] in pairs:
        q = pairs[st["name"]]
        try:
            res = s.SEARCHERS[st["platform"]](st["url"].rstrip("/"), q, None)
            print(f'{st["name"]} [{q}] -> {len(res)}:', [(r["title"], r["status"], r.get("price")) for r in res[:4]])
        except Exception as e:
            print(st["name"], "ERR", type(e).__name__, e)
