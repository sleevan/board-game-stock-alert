# Board Game Stock Alert

Emails you when a board game is **in stock** at a Canadian online store. Pre-orders and backorders never trigger an email.

You don't need product links. Give it a title (publisher optional) and it searches every store's catalogue, so it catches a game as soon as a store lists it. You get one email when a game comes into stock, and another only if it sells out and comes back.

## The web page

**https://sleevan.github.io/board-game-stock-alert/**

- Add a game (title, plus publisher if you want to rule out similarly named games). Leave the publisher blank and it's looked up on BoardGameGeek.
- See, per game, which stores have it in stock, sold out, or on pre-order, with links and prices.
- Stop watching a game.
- Start a check right away with **Check now**.
- Switch stores on or off, and see which couldn't be checked.

Saving changes needs a GitHub token, set up once per browser under **GitHub access** on the page. Make it a fine-grained token with access to only this repository, and these permissions: **Contents: Read and write** and **Actions: Read and write**. The token stays in that browser; it's never stored in the repo.

## Stores

The store list comes from [Board Game Oracle's Canadian stores](https://www.boardgameoracle.com/en-CA/store), plus Black Knight Games. They live in `config.json` under `"stores"`. Each store has a `platform` that says how its catalogue is searched:

| Platform | How it's read | Stores |
|---|---|---|
| `shopify` | store search data | 31, incl. Board Game Bliss, 401 Games, Game Shack, Le Roi des Cartes |
| `woocommerce` | WooCommerce product data | Across The Board, Arctic Board Games, Tadenac Games |
| `woocommerce_html` | WooCommerce search page | F.G. Bradley's |
| `lightspeed` | Lightspeed search data | Boutique La Revanche, Owls Hollow |
| `crystalcommerce` | search page | Game Keeper Online, The Connection |
| `magento` | search page | Le Valet d'Coeur |
| `shift4shop` | search page | J&J Cards & Collectibles |
| `opencart` | search page | Board Games N More |
| `odoo` | shop search page | Toys On Fire |
| `square` | Square Online product data | Pe Metawe Games, Victory Pints |
| `sitemap` | sitemap + product pages | Mission: Fun & Games |
| `greatboardgames` | search page | Great Boardgames |

Seven stores can't be searched automatically. Amazon, Imaginaire, Amazing Stories and Geek Stop Games block automated checks. Magic Stronghold's catalogue only answers its own website. Les Jeux Grillons Givrés' site isn't working, and Meeples and Milkshakes' online store is offline. Each has a `note`, and the web page lists them. Samko and Miko has closed and was removed.

To switch a store off, use its switch on the web page (or add `"enabled": false`).

To add a store, add `{ "name": "Store Name", "url": "https://store.ca", "platform": "shopify" }`.

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
| `BGG_TOKEN` | BoardGameGeek API token, for publisher lookups (optional) |

To test: Actions tab → **Board game stock check** → **Run workflow** → tick **Just send a test email**.

## Publisher lookup (BoardGameGeek)

When a game is added without a publisher, the next check looks the title up with BoardGameGeek's official XML API and saves its publishers to `config.json`. A store listing from any of them counts as a match, since many games have regional publishers. If BGG has no match, the game matches any publisher.

BGG requires a registered application for API access:
1. Sign in to BoardGameGeek and register a non-commercial application at https://boardgamegeek.com/applications. Approval can take a week or more.
2. Once approved, create a token there and add it as the `BGG_TOKEN` secret.

Until then, games without a publisher are matched by title alone.

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
