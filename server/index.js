const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./db/adapter');
const productRoutes = require('./routes/products');
const scraperRoutes = require('./routes/scraper');
const settingsRoutes = require('./routes/settings');
const storeRoutes = require('./routes/stores');
const scheduler = require('./jobs/scheduler');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/products', productRoutes);
app.use('/api/scraper', scraperRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stores', storeRoutes);

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const startServer = async () => {
    try {
        await db.init();
        
        app.listen(PORT, () => {
            console.log(`OmniPrice running at http://localhost:${PORT}`);
            scheduler.start();
        });
    } catch (error) {
        console.error('✗ Error starting server:', error.message);
        process.exit(1);
    }
};

startServer();

module.exports = app;
