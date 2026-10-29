# Board Game Stock Alert

Emails you when a board game is **in stock** at a Canadian online store. Pre-orders and backorders never trigger an email.

You don't need product links. Give it a title (publisher optional) and it searches every store's catalogue, so it catches a game as soon as a store lists it. You get one email when a game comes into stock, and another only if it sells out and comes back.

## The web page

**https://sleevan.github.io/board-game-stock-alert/**

- Add a game (title, plus publisher if you want to rule out similarly named games).
- See, per game, which stores have it in stock, sold out, or on pre-order, with links and prices.
- Stop watching a game.
- Start a check right away with **Check now**.
- See which stores were checked and which couldn't be.

Saving changes needs a GitHub token, set up once per browser under **GitHub access** on the page. Make it a fine-grained token with access to only this repository, and these permissions: **Contents: Read and write** and **Actions: Read and write**. The token stays in that browser; it's never stored in the repo.

## Stores

The store list comes from [Board Game Oracle's Canadian stores](https://www.boardgameoracle.com/en-CA/store), plus Black Knight Games. They live in `config.json` under `"stores"`. Each store has a `platform` that says how its catalogue is searched:

| Platform | Stores |
|---|---|
| `shopify` | 30 stores, including Board Game Bliss, 401 Games, Game Shack, Dragon's Den, Wood For Sheep |
| `woocommerce` | Across The Board, Arctic Board Games, Tadenac Games |
| `lightspeed` | Boutique La Revanche, Owls Hollow |
| `crystalcommerce` | Game Keeper Online, The Connection Games & Hobbies |
| `magento` | Le Valet d'Coeur |
| `greatboardgames` | Great Boardgames |

Stores without a `platform` can't be searched automatically (they block automated checks, or their search only works in a browser). Each has a `note` saying why, and the web page lists them.

To add a store, add `{ "name": "Store Name", "url": "https://store.ca", "platform": "shopify" }`. To pause one, add `"enabled": false`.

To confirm every store's search is working, run the **Test store searches** workflow in the Actions tab. It searches every store for a common game (Catan by default) and sends no email. Results are saved to `store-verify.json`.

For a store that can't be searched, you can watch a single product page once it exists:

```json
"product_urls": [
  { "name": "Thirty Years of Misery @ Some Store", "url": "https://somestore.ca/item/12345" }
]
```

## Email setup (Gmail)

1. Turn on 2-Step Verification for your Google account.
2. Create an App Password at https://myaccount.google.com/apppasswords.
3. In the repo: **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
|---|---|
| `SMTP_USER` | the Gmail address that sends the alert |
| `SMTP_PASSWORD` | that account's App Password |
| `EMAIL_TO` | where alerts go (defaults to `SMTP_USER`) |
| `SMTP_HOST` / `SMTP_PORT` | optional; default `smtp.gmail.com` / `465` |

To test: Actions tab → **Board game stock check** → **Run workflow** → tick **Just send a test email**.

## How it runs

The **Board game stock check** workflow runs every 30 minutes on GitHub Actions. It searches every store for every watched game, emails you about anything that came into stock, and saves results to `state.json`, which the web page reads.

GitHub pauses scheduled workflows in repos with no activity for 60 days. The results commits usually count as activity, but if you get a "workflow disabled" email, re-enable it in the Actions tab.

## Running it on your own computer

Requires Python 3.9+. Copy `.env.example` to `.env` and fill it in.

| Command | What it does |
|---|---|
| `python stock_alert.py add "Title" --publisher "Publisher"` | Watch a game |
| `python stock_alert.py remove "Title"` | Stop watching |
| `python stock_alert.py list` | Show games and stores |
| `python stock_alert.py` | Check once; email if something came into stock |
| `python stock_alert.py --dry-run` | Show what it finds; no email, nothing saved |
| `python stock_alert.py --loop 30` | Keep checking every 30 minutes |
| `python stock_alert.py --test-email` | Send a test email |
