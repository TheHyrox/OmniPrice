# OmniPrice

OmniPrice is a local / remote web app to track product prices across multiple stores.
You add products, configure one or more source URLs with CSS selectors, and scrape prices manually or on a schedule.

## Features

- Product management (create, edit, delete)
- Multiple sources per product
- Source-level scraping with CSS selectors
- Automatic lowest-price and price-delta calculation
- Database storage: MongoDB (via Mongoose)
- Global and per-product charts (Chart.js)
- Manual scrape and scheduled scrape frequency settings

## Tech Stack

- Backend: Node.js + Express
- Frontend: Vanilla JavaScript, HTML, CSS
- Database: MongoDB (via Mongoose)
- Scraping: Cheerio + Puppeteer fallback

## Requirements

- Node.js 18+
- npm
- MongoDB 6+ (standalone or via Docker)

## Installation

1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Start the server (ensure MongoDB is reachable via `MONGO_URI` or `localhost:27017`):

```bash
npm start
```

4. Open the app in your browser:

```text
http://localhost:3005
```

## Database Configuration

OmniPrice requires **MongoDB**.

Set the `MONGO_URI` environment variable (defaults to `mongodb://localhost:27017/omniprice`):

```bash
export MONGO_URI="mongodb://localhost:27017/omniprice"
npm start
```

The app will connect to database **`omniprice`** with four collections:
- `products`: Product documents with price history and sources
- `settings`: Global settings (theme, scrape frequency, Discord webhook)
- `stores`: Preset boutique selectors
- `alerts`: Price drop alerts and notification status

---

## Docker & Docker Compose Setup

An example compose file is provided at [`docker-compose.exemple.yml`](docker-compose.exemple.yml):

```yaml
services:
  omniprice-db:
    container_name: omniprice-db
    image: mongo:latest
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - omniprice_mongo_data:/data/db
    networks:
      - it-web

  omniprice:
    container_name: omniprice
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3005:3005"
    environment:
      - PORT=3005
      - MONGO_URI=mongodb://omniprice-db:27017/omniprice
      - DB_TYPE=mongodb
    volumes:
      - ./data:/app/data
      - ./public/images:/app/public/images
    depends_on:
      - omniprice-db
    restart: unless-stopped
    networks:
      - it-web

networks:
  it-web:
    driver: bridge

volumes:
  omniprice_mongo_data:
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