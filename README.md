# OmniPrice

OmniPrice is a local web app to track product prices across multiple stores.
You add products, configure one or more source URLs with CSS selectors, and scrape prices manually or on a schedule.

## Features

- Product management (create, edit, delete)
- Multiple sources per product
- Source-level scraping with CSS selectors
- Automatic lowest-price and price-delta calculation
- Price history storage in JSON (`data/db.json`)
- Global and per-product charts (Chart.js)
- Manual scrape and scheduled scrape frequency settings

## Tech Stack

- Backend: Node.js + Express
- Frontend: Vanilla JavaScript, HTML, CSS
- Database: LowDB (JSON file)
- Scraping: Cheerio + Puppeteer fallback

## Requirements

- Node.js 18+
- npm

## Installation

1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Open the app in your browser:

```text
http://localhost:3005
```

## How To Use

1. Open the app and go to the Products tab.
2. Click Add Product.
3. Fill in basic fields:
	- Title
	- Reference price
	- Optional description, tags, and image
4. Add at least one price source for the product:
	- URL (product page)
	- CSS Selector (element containing the price)
	- Site name
	- Optional: enable Puppeteer for dynamic pages
5. Save the product.
6. Run scraping:
	- Per source: Scrape Now in product detail
	- All products: Scrape All Now in Settings
7. Check results:
	- Lowest price and delta in product cards/details
	- Price history in charts

## About CSS Selectors

Scraping in OmniPrice depends on correct CSS selectors for each source.
If the selector does not match the price element on the page, scraping fails.

CSS selector reference:
https://www.w3schools.com/cssref/css_selectors.php

Tips:

- Inspect the target page in browser dev tools.
- Start with a specific selector (for example, `.product-price` or `#priceblock_ourprice`).
- Avoid selectors that are generated dynamically and change on each load.

## Scheduling

- The server starts a scheduler at launch.
- Default frequency is every 12 hours (`43200000` ms).
- In Settings you can choose:
  - Every 1 hour
  - Every 12 hours
  - Only at startup

## Data Storage

- Data is stored in `data/db.json`.
- Product images downloaded from URLs are saved under `public/images`.

## API Overview

Main endpoints:

- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `POST /api/scraper/product/:productId/source/:sourceIndex`
- `POST /api/scraper/product/:productId`
- `POST /api/scraper/all`
- `GET /api/settings`
- `PUT /api/settings`

## Notes

- Some websites block simple HTTP scraping. OmniPrice can fall back to Puppeteer for those cases.
- The Alerts tab is currently a placeholder.
- You can clone, copy, edit, do anything you want with this project and code.