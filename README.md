# PoE Trade Search

A browser-based trade search tool for **Path of Exile 1** and **Path of Exile 2**. Copy an item in-game, paste it here, and search the trade market instantly.

## Setup

### 1. Install Node.js

Download and install [Node.js](https://nodejs.org/) (any recent version works).

### 2. Start the proxy

The app needs a local proxy to talk to the PoE trade API (browsers block direct requests due to CORS). Open a terminal in the project folder and run:

```bash
node proxy.js
```

You should see:

```
PoE Trade CORS proxy running on http://localhost:3456
Proxying to https://www.pathofexile.com/api/trade/*
```

Keep this terminal open while using the app.

### 3. Open the app

Open `index.html` in your browser — double-click the file or drag it into a browser window.

If the proxy is running, the app connects automatically. If not, you'll see a **CORS Blocked** warning banner at the top.

## How to Use

### Searching for an item

1. **Copy an item in-game** — hover over any item in Path of Exile and press `Ctrl+C`. This copies the item's text to your clipboard (you won't see anything happen in-game, but it's copied).

2. **Paste into the app** — click the text area on the left and press `Ctrl+V`. The item text appears in the box.

3. **Parse the item** — click **Parse Item** (or it parses automatically on paste). The left panel shows the item's name, stats, and all its mods with checkboxes.

4. **Adjust filters** — each mod has a checkbox to include/exclude it from the search. You can also set min/max values for numerical mods, item level, DPS, link count, quality, gem level, map tier, and more. Additional filters include:
   - **Pseudo stats** — add aggregate stats like Total Life, Total Resistances via the dropdown
   - **Stat group mode** — switch between AND / COUNT / NOT operators for mod matching
   - **Category filter** — search for any base of an item class (e.g. "any dagger")
   - **Influence filters** — auto-detected for Shaper, Elder, Crusader, Hunter, Redeemer, Warlord, Searing Exarch, and Eater of Worlds items
   - **Misc toggles** — veiled, fractured, enchanted, crafted, corrupted, mirrored, synthesised, unidentified

5. **Search** — click **Search Here** to find listings. Results appear on the right panel sorted by price.

### Bulk exchange

Switch to **Bulk Exchange** mode using the toggle at the top of the left panel. Select the currency you want and the currency you have, then search. Results show exchange offers with ratios and stock.

### Reading results

- Each result card shows the **price**, **item name**, **seller name**, and **online status** (green dot = online)
- Click the **arrow button** on a card to expand and see the item's full mods
- Click **Whisper** to copy the trade whisper message to your clipboard — paste it in-game chat to contact the seller
- Click **Load more** at the bottom to fetch additional results

### Other controls

| Control | What it does |
|---|---|
| **PoE 1 / PoE 2** buttons | Switch between game versions (different APIs and leagues) |
| **League** dropdown | Select which league to search in (auto-populated) |
| **Listing** dropdown | Filter by listing type: Instant Buyout and In Person (default), Instant Buyout, In Person (Online in League), In Person (Online), or Any |
| **Item Search / Bulk Exchange** toggle | Switch between item search and currency exchange modes |
| **Open in Trade Site** button | Opens the same search on the official pathofexile.com trade site |
| **View on trade site** link | Appears after searching — direct link to your search results on the official site |
| **Clear** button | Reset the item input and start fresh |

### Stash price checker (experimental)

> **WARNING — DO NOT USE THIS UNLESS YOU FULLY UNDERSTAND THE RISKS.**
>
> This feature uses your **POESESSID session cookie** to access your stash. This is a **temporary developer-only workaround for testing** and **will be replaced with proper OAuth2 authentication** as soon as the feature is fleshed out.
>
> **Your POESESSID grants full access to your entire account session.** Anyone who has it can trade your items, modify your characters, and act as you. **Never share it.** The app only sends it to the local proxy running on your own machine — it is never stored on disk or sent anywhere else — but you are still trusting this code with your session.
>
> This uses the legacy undocumented `character-window/get-stash-items` endpoint which could break or be removed by GGG at any time. The proper production approach is **OAuth2 Authorization Code Grant** with the `account:stashes` scope via [pathofexile.com/developer](https://www.pathofexile.com/developer).
>
> **TL;DR: This exists for curious developers to test with. Do not use it casually. OAuth2 is coming.**

If you still want to try it:

1. Switch to **Stash Check** mode using the toggle at the top of the left panel
2. **Enter your POESESSID** — this is your session cookie from pathofexile.com (see below how to get it)
3. Click **Connect** — your stash tabs appear in the dropdown
4. Select a tab and click **Load & Price Check** — the app fetches all items and searches the trade API for each one
5. Results appear in a table with item names, types, and lowest listed prices
6. Click any item row to open it in the full Item Search view with all mods and filters

**Getting your POESESSID:**
1. Log in to [pathofexile.com](https://www.pathofexile.com)
2. Open browser DevTools (F12) → Application tab (Chrome/Edge) or Storage tab (Firefox) → Cookies → `https://www.pathofexile.com`
3. Copy the value of the `POESESSID` cookie — it's a long hex string like `a1b2c3d4e5f6...`

## Troubleshooting

| Problem | Fix |
|---|---|
| **CORS Blocked** banner appears | Make sure `node proxy.js` is running in your terminal |
| No leagues in the dropdown | Proxy isn't running or pathofexile.com is down — check the terminal for errors |
| **Rate limited** error | The PoE API has request limits — wait the indicated number of seconds and try again |
| Item doesn't parse correctly | Make sure you copied it with `Ctrl+C` while hovering in-game (not from the trade site) |
| Mods show a red **X** instead of green **check** | The mod couldn't be matched to the stats database — it will be excluded from the search but other mods still work |

## Project Files

```
index.html          — the app (open this in your browser)
style.css           — styling
parser.js           — item parser (shared between browser and tests)
app.js              — UI logic (searching, rendering, stash checker)
proxy.js            — CORS proxy server (run with Node.js)
test-parse.js       — test script for the item parser
example-items.txt   — sample item text for each item class (body armour, weapon, jewel, etc.)
```

## Disclaimer

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
