const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Help / Arguments parsing
const args = process.argv.slice(2);
const helpRequested = args.includes('--help') || args.includes('-h');

if (helpRequested) {
    console.log(`
OmniPrice - JSON to MongoDB Migration Tool

Usage:
  node scripts/migrate-json-to-mongo.js [options]

Options:
  --file <path>     Path to JSON database file (default: ./data/db.json)
  --uri <mongoUri>  MongoDB Connection URI (default: mongodb://localhost:27017/omniprice or MONGO_URI env)
  --clean           Clear target collections before importing
  -h, --help        Show this help message
`);
    process.exit(0);
}

function getArgValue(flag) {
    const index = args.indexOf(flag);
    if (index !== -1 && index + 1 < args.length) {
        return args[index + 1];
    }
    return null;
}

const jsonFilePath = getArgValue('--file') || path.join(__dirname, '../data/db.json');
const mongoUri = getArgValue('--uri') || process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/omniprice';
const shouldClean = args.includes('--clean');

const productSchema = new mongoose.Schema({
    _id: String,
    title: String,
    description: String,
    referencePrice: Number,
    tags: [String],
    image: String,
    sources: Array,
    createdAt: String,
    updatedAt: String,
    priceHistory: Array,
    lowestPrice: Number,
    lowestPriceSource: mongoose.Schema.Types.Mixed,
    priceDelta: Number
}, { versionKey: false, collection: 'products' });

const storeSchema = new mongoose.Schema({
    _id: String,
    name: String,
    cssSelector: String,
    defaultUrl: String
}, { versionKey: false, collection: 'stores' });

const settingsSchema = new mongoose.Schema({
    _id: String,
    theme: String,
    scrapeFrequency: Number
}, { versionKey: false, collection: 'settings' });

const Product = mongoose.model('Product', productSchema);
const Store = mongoose.model('Store', storeSchema);
const Setting = mongoose.model('Setting', settingsSchema);

async function migrate() {
    console.log('--- OmniPrice JSON to MongoDB Migration ---');
    console.log(`JSON File: ${jsonFilePath}`);
    console.log(`MongoDB URI: ${mongoUri}`);
    console.log(`Clean target collections: ${shouldClean ? 'YES' : 'NO'}`);

    if (!fs.existsSync(jsonFilePath)) {
        console.error(`Error: JSON file not found at ${jsonFilePath}`);
        process.exit(1);
    }

    const rawData = fs.readFileSync(jsonFilePath, 'utf-8');
    let jsonData;
    try {
        jsonData = JSON.parse(rawData);
    } catch (err) {
        console.error(`Error parsing JSON file: ${err.message}`);
        process.exit(1);
    }

    console.log('Connecting to MongoDB database omniprice...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');

    try {
        if (shouldClean) {
            console.log('Cleaning existing collections...');
            await Product.deleteMany({});
            await Store.deleteMany({});
            await Setting.deleteMany({});
            console.log('✓ Collections cleaned');
        }

        // 1. Migrate Products
        const products = jsonData.products || [];
        let migratedProducts = 0;
        for (const prod of products) {
            await Product.replaceOne({ _id: prod._id }, prod, { upsert: true });
            migratedProducts++;
        }
        console.log(`✓ Migrated ${migratedProducts} products into 'products' collection`);

        // 2. Migrate Stores
        const stores = jsonData.stores || [];
        let migratedStores = 0;
        for (const store of stores) {
            await Store.replaceOne({ _id: store._id }, store, { upsert: true });
            migratedStores++;
        }
        console.log(`✓ Migrated ${migratedStores} stores into 'stores' collection`);

        // 3. Migrate Settings
        if (jsonData.settings) {
            const settingsData = {
                _id: 'default_settings',
                ...jsonData.settings
            };
            await Setting.replaceOne({ _id: 'default_settings' }, settingsData, { upsert: true });
            console.log("✓ Migrated settings into 'settings' collection");
        }

        console.log('\n✅ Migration completed successfully!');
    } catch (err) {
        console.error(`❌ Migration failed: ${err.message}`);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

migrate();
