# OmniPrice

OmniPrice is a local / remote web app to track product prices across multiple stores.
You add products, configure one or more source URLs with CSS selectors, and scrape prices manually or on a schedule.

## Features

- Product management (create, edit, delete)
- Multiple sources per product
- Source-level scraping with CSS selectors
- Automatic lowest-price and price-delta calculation
- Flexible storage: MongoDB or JSON file database (`data/db.json`)
- Standalone JSON to MongoDB migration script
- Global and per-product charts (Chart.js)
- Manual scrape and scheduled scrape frequency settings

## Tech Stack

- Backend: Node.js + Express
- Frontend: Vanilla JavaScript, HTML, CSS
- Database: MongoDB (via Mongoose) or LowDB (JSON file fallback)
- Scraping: Cheerio + Puppeteer fallback

## Requirements

- Node.js 18+
- npm
- (Optional) MongoDB server if using MongoDB database

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

## Database Configuration

OmniPrice supports both **MongoDB** and **JSON** storage modes.

### Using MongoDB (Recommended)

Set the `MONGO_URI` environment variable (or `DB_TYPE=mongodb`):

```bash
export MONGO_URI="mongodb://localhost:27017/omniprice"
npm start
```

The app will connect to database **`omniprice`** with three collections:
- `products`: Product documents with price history and sources
- `settings`: Global settings (theme, scrape frequency)
- `stores`: Preset boutique selectors

### JSON Mode (Default Fallback)

If no `MONGO_URI` environment variable is defined, OmniPrice falls back to `data/db.json`.

---

## Migrating from JSON to MongoDB

To convert an existing `data/db.json` into MongoDB database `omniprice`, use the included migration script:

```bash
# Basic usage (migrates data/db.json to mongodb://localhost:27017/omniprice)
npm run migrate:mongo

# Custom MongoDB URI and clean destination collections first
node scripts/migrate-json-to-mongo.js --uri "mongodb://172.20.0.5:27017/omniprice" --clean

# Help options
node scripts/migrate-json-to-mongo.js --help
```

---

## Docker & Docker Compose Setup

Example `docker_compose_web.yml` snippet with MongoDB:

```yaml
version: '3.8'

services:
  omniprice-db:
    container_name: omniprice-db
    image: mongo:latest
    restart: unless-stopped
    volumes:
      - omniprice_mongo_data:/data/db
    networks:
      - it-web

  omniprice:
    container_name: omniprice
    build:
      context: /configs/OmniPrice
    ports:
      - "3005:3005"
    environment:
      - MONGO_URI=mongodb://omniprice-db:27017/omniprice
      - DB_TYPE=mongodb
    volumes:
      - /configs/OmniPrice/data:/app/data
      - /configs/OmniPrice/public/images:/app/public/images
    depends_on:
      - omniprice-db
    restart: unless-stopped
    networks:
      - it-web

networks:
  it-web:
    external: true

volumes:
  omniprice_mongo_data:
```

To run data migration inside Docker or directly on the remote server:

```bash
docker exec -it omniprice node scripts/migrate-json-to-mongo.js --uri "mongodb://omniprice-db:27017/omniprice"
```

---

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
- `GET /api/stores`
- `POST /api/stores`
- `PUT /api/stores/:id`
- `DELETE /api/stores/:id`