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
app.js              — all the logic (parsing, searching, rendering)
proxy.js            — CORS proxy server (run with Node.js)
test-parse.js       — test script for the item parser
example-items.txt   — sample item text for each item class (body armour, weapon, jewel, etc.)
```
