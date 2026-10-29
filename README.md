# Board Game Stock Alert

Emails you when a board game is **in stock** at a Canadian online store. Pre-orders and backorders never trigger an email.

You don't need product links. Give it a title (publisher optional) and it searches every store's catalogue, so it catches a game as soon as a store lists it. You get one email when a game comes into stock, and another only if it sells out and comes back.

## The web page

**https://sleevan.github.io/board-game-stock-alert/**

- Add a game (title, plus publisher if you want to rule out similarly named games). Leave the publisher blank and it's looked up on Board Game Bliss.
- See, per game, which stores have it in stock, sold out, or on pre-order, with links and prices.
- Stop watching a game.
- Start a check right away with **Check now**.
- Switch stores on or off, remove them, and see which couldn't be checked (the Stores section opens when you click its heading).

Saving changes needs a GitHub token, set up once per browser under **GitHub access** on the page. Make it a fine-grained token with access to only this repository, and these permissions: **Contents: Read and write** and **Actions: Read and write**. The token stays in that browser; it's never stored in the repo.

## How titles are matched

- **Titles in quotation marks** (e.g. `"Root"`): exact title only. A listing counts only if its title is exactly the game, ignoring capitalization, punctuation, anything in brackets, language tags and pre-order tags. Expansions and other titles that merely contain it are left out, and there are no confirmation prompts. In `config.json` this is saved as `"exact": true`.
- **Excluding words:** put `-` in front of a word to drop listings containing it, e.g. `Kingdom Come: Deliverance -Metal`. Use quotes for a phrase (`-"Metal Coins"`), add as many as you like, and combine with quotes (`"Root" -Riverfolk`). Hyphens inside titles like "X-Wing" aren't affected. Saved in `config.json` as `"exclude": [...]`.

- **Titles of 5 or more characters:** any listing that contains the whole title (as whole words) counts, ignoring capitalization, punctuation and anything in brackets, so "YINSH (New Edition)" counts for *Yinsh*. "Blood Rage: Valhalla (EN)" and "Blood Rage: Valhalla – Road to Helheim" both count for *Blood Rage: Valhalla*.
- **Titles of 4 characters or fewer** (like *ito* or *Root*): only exact titles count, ignoring anything in brackets, language tags, pre-order tags and "Board Game". Close titles ("Yuui ito", edition wording) appear on the web page under **Is this the same game?** for you to confirm or ignore; titles mostly made of other words are skipped.
- Titles you ignore on the web page stay ignored for that game.
- Video-game listings are skipped: any title containing **xbox**, **switch**, **ps4** or **ps5** as a whole word (unless your watched title uses that word itself). Change the list under `exclude_title_words` in `config.json`.

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

## Shipping

Each store in `config.json` has a `shipping` line: its published standard shipping rate to the region in `shipping_region` (Ontario). The web page shows a truck icon after each price; hover over it (or tap it) to see the rate. Alert emails show it after the price, as `$95.00 | $9.95 shipping (free over $175)`. Stores that don't publish a flat rate show `No Flat Rate`. These were taken from each store's shipping policy on October 29, 2026, and won't update by themselves if a store changes its rates.

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

## Publisher lookup (Board Game Bliss)

When a game is added without a publisher, the next check looks the title up on Board Game Bliss and saves the publisher from its listing. If Bliss doesn't list the game yet, it tries again every 24 hours. A publisher found this way is shown on the web page but doesn't filter listings, since stores often record a distributor instead. A publisher you type in yourself does filter.

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
