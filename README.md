# Board Game Stock Alert

Emails you when a board game is **in stock** at a Canadian online store. Pre-orders and backorders are ignored.

You don't need product links. You give it a title (publisher optional), and it searches each store's catalogue, so it catches the game the moment a store lists it. You get one email when a game becomes in stock, and another only if it sells out and comes back.

## Watching games

```
python stock_alert.py add "Thirty Years of Misery" --publisher "VUCA Simulations"
python stock_alert.py add "Some Other Game"        # publisher is optional
python stock_alert.py list
python stock_alert.py remove "Some Other Game"
```

The publisher stops it matching a different game with a similar name. If a store might list the title differently (e.g. "30 Years of Misery"), add that spelling too.

## Stores

Stores live in `config.json` under `"stores"`. Store search works on **Shopify** stores, which most Canadian hobby-game shops use. The starter list:

| Store | URL |
|---|---|
| Board Game Bliss (Toronto) | https://www.boardgamebliss.com |
| 401 Games (Toronto) | https://store.401games.ca |
| Black Knight Games | https://blackknightgames.ca |
| Game Shack | https://www.gameshack.ca |

To add a store, add a line like `{ "name": "Store Name", "url": "https://store-website.ca" }`.

**First run, check the list:** `python stock_alert.py --dry-run`. Any store that shows *"store search failed – is it a Shopify store?"* can't be searched; remove it. For a non-Shopify store, you can still watch a specific product page once it exists:

```json
"product_urls": [
  { "name": "Thirty Years of Misery @ Some Store", "url": "https://somestore.ca/item/12345" }
]
```

If it can't read the stock status on that page, add `"out_of_stock_text": "Sold Out"` (whatever the page says when unavailable).

## Email setup (Gmail)

1. Turn on 2-Step Verification for your Google account.
2. Create an App Password at https://myaccount.google.com/apppasswords (a 16-character code).
3. Use these values (in `.env` locally, or as GitHub secrets below):

| Name | Value |
|---|---|
| `SMTP_USER` | your Gmail address |
| `SMTP_PASSWORD` | the App Password |
| `EMAIL_TO` | where alerts go (defaults to `SMTP_USER`) |
| `SMTP_HOST` / `SMTP_PORT` | optional; default `smtp.gmail.com` / `465` |

Test with `python stock_alert.py --test-email`.

## Running it automatically

### Option A: GitHub Actions (free, no computer needs to stay on)

1. Create a **private** GitHub repository and upload these files, keeping `.github/workflows/stock-check.yml` at that path. Don't upload `.env`.
2. In the repo: **Settings → Secrets and variables → Actions → New repository secret**, add `SMTP_PASSWORD` (the Gmail App Password). The sending and receiving address is set to you@gmail.com in the workflow file; add `SMTP_USER` / `EMAIL_TO` secrets only to change it.
3. **Actions** tab → *Board game stock check* → **Run workflow** to try it.

It then checks every 30 minutes. If checks keep failing, the run fails and GitHub emails you. To add a game later, edit `config.json` in GitHub's web editor (copy the format of the existing entry).

Note: GitHub pauses scheduled workflows in repos with no activity for 60 days. The bot's state commits usually count as activity, but if you get a "workflow disabled" email, just re-enable it in the Actions tab.

### Option B: your own computer

Requires Python 3.9+. Copy `.env.example` to `.env`, fill it in, then:

```
python stock_alert.py --loop 30
```

Or schedule `python stock_alert.py` with Task Scheduler (Windows) or cron (Mac/Linux).

## Commands

| Command | What it does |
|---|---|
| `python stock_alert.py` | Check once; email if something came into stock |
| `--dry-run` | Show what it finds; no email, nothing saved |
| `--loop 30` | Keep checking every 30 minutes |
| `--test-email` | Send a test email |
