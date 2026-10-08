const express = require('express');
const router = express.Router();
const db = require('../db/adapter');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// GET all products
router.get('/', async (req, res) => {
    try {
        const products = await db.getProducts();
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET single product
router.get('/:id', async (req, res) => {
    try {
        const product = await db.getProductById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST create product
router.post('/', async (req, res) => {
    try {
        const { title, description, referencePrice, tags, image, sources } = req.body;
        
        let imagePath = null;
        if (image) {
            imagePath = await saveImage(image);
        }
        
        const product = await db.createProduct({
            title,
            description,
            referencePrice,
            tags: tags || [],
            image: imagePath,
            sources: sources || []
        });
        
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// PUT update product
router.put('/:id', async (req, res) => {
    try {
        const { title, description, referencePrice, tags, image, sources } = req.body;
        const product = await db.getProductById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        let newImage = product.image;
        if (image && image !== product.image) {
            if (product.image && product.image.startsWith('/images/')) {
                const oldPath = path.join(__dirname, '../../public', product.image);
                try { await fs.unlink(oldPath); } catch (e) {}
            }
            newImage = await saveImage(image);
        } else if (image === null && product.image) {
            if (product.image.startsWith('/images/')) {
                const oldPath = path.join(__dirname, '../../public', product.image);
                try { await fs.unlink(oldPath); } catch (e) {}
            }
            newImage = null;
        }
        
        const updated = await db.updateProduct(req.params.id, {
            title,
            description,
            referencePrice,
            tags: tags || [],
            image: newImage,
            sources: sources || []
        });
        
        res.json(updated);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE product
router.delete('/:id', async (req, res) => {
    try {
        const product = await db.getProductById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        if (product.image && product.image.startsWith('/images/')) {
            const imagePath = path.join(__dirname, '../../public', product.image);
            try { await fs.unlink(imagePath); } catch (e) {}
        }
        
        await db.deleteProduct(req.params.id);
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET all unique tags
router.get('/meta/tags', async (req, res) => {
    try {
        const products = await db.getProducts();
        const allTags = [...new Set(products.flatMap(p => p.tags || []))];
        res.json(allTags);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function saveImage(imageData) {
    const imagesDir = path.join(__dirname, '../../public/images');

    await fs.mkdir(imagesDir, { recursive: true });
    if (imageData.startsWith('http')) {
        try {
            const axios = require('axios');
            const response = await axios.get(imageData, { responseType: 'arraybuffer', timeout: 10000 });
            const ext = getExtFromContentType(response.headers['content-type']) || 'jpg';
            const filename = `${uuidv4()}.${ext}`;
            const filepath = path.join(imagesDir, filename);
            await fs.writeFile(filepath, response.data);
            return `/images/${filename}`;
        } catch (error) {
            console.error('Failed to download image:', error.message);
            return imageData;
        }
    }

    if (imageData.startsWith('data:image')) {
        const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
        if (matches) {
            const ext = matches[1];
            const data = Buffer.from(matches[2], 'base64');
            const filename = `${uuidv4()}.${ext}`;
            const filepath = path.join(imagesDir, filename);
            await fs.writeFile(filepath, data);
            return `/images/${filename}`;
        }
    }

    if (imageData.startsWith('/images/')) {
        return imageData;
    }
    
    return null;
}

function getExtFromContentType(contentType) {
    const types = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp'
    };
    return types[contentType];
}

module.exports = router;
