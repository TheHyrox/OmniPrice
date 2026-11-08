const test = require('node:test');
const assert = require('node:assert/strict');
const scraper = require('../server/services/scraper');

test('Scraper - parsePrice edge cases', async (t) => {
    await t.test('Case 1: Standard integer price without decimals', () => {
        assert.strictEqual(scraper.parsePrice('49 €'), 49);
        assert.strictEqual(scraper.parsePrice('100'), 100);
    });

    await t.test('Case 2: Standard US/UK decimal dot price', () => {
        assert.strictEqual(scraper.parsePrice('$49.99'), 49.99);
        assert.strictEqual(scraper.parsePrice('9.95'), 9.95);
    });

    await t.test('Case 3: European decimal comma price', () => {
        assert.strictEqual(scraper.parsePrice('49,99 €'), 49.99);
        assert.strictEqual(scraper.parsePrice('9,95 €'), 9.95);
    });

    await t.test('Case 4: European format with thousands period and decimal comma', () => {
        assert.strictEqual(scraper.parsePrice('1.249,99 €'), 1249.99);
        assert.strictEqual(scraper.parsePrice('12.450,00 €'), 12450);
    });

    await t.test('Case 5: US/UK format with thousands comma and decimal dot', () => {
        assert.strictEqual(scraper.parsePrice('$1,249.99'), 1249.99);
        assert.strictEqual(scraper.parsePrice('$10,000.50'), 10000.5);
    });

    await t.test('Case 6: Space thousands separator (standard, NBSP, narrow NBSP)', () => {
        assert.strictEqual(scraper.parsePrice('1 299,50 €'), 1299.5);
        assert.strictEqual(scraper.parsePrice('1\u00A0299,50 €'), 1299.5);
        assert.strictEqual(scraper.parsePrice('1\u202F299,50 €'), 1299.5);
    });

    await t.test('Case 7: Surrounding text, words, and VAT labels', () => {
        assert.strictEqual(scraper.parsePrice('Price: £ 199.90 VAT included'), 199.9);
        assert.strictEqual(scraper.parsePrice('Special Offer: 99.90 EUR only'), 99.9);
    });

    await t.test('Case 8: Currencies with no decimals (Japanese Yen, etc.)', () => {
        assert.strictEqual(scraper.parsePrice('¥12,500'), 12500);
        assert.strictEqual(scraper.parsePrice('1,200'), 1200);
    });

    await t.test('Case 9: European shorthand trailing dash', () => {
        assert.strictEqual(scraper.parsePrice('29,- €'), 29);
    });

    await t.test('Case 10: Null, undefined, empty, or whitespace-only inputs', () => {
        assert.strictEqual(scraper.parsePrice(null), null);
        assert.strictEqual(scraper.parsePrice(undefined), null);
        assert.strictEqual(scraper.parsePrice(''), null);
        assert.strictEqual(scraper.parsePrice('   \n\t  '), null);
    });

    await t.test('Case 11: Non-numeric strings and text indicators', () => {
        assert.strictEqual(scraper.parsePrice('Unavailable'), null);
        assert.strictEqual(scraper.parsePrice('Sold Out'), null);
        assert.strictEqual(scraper.parsePrice('FREE'), null);
    });
});

test('Scraper - Multiple CSS Selector Parsing & Fallbacks', async (t) => {
    await t.test('splits newline-separated selectors preserving order', () => {
        const input = `
            span.primary-price
            div.deal-price
            .fallback-price
        `;
        const result = scraper.parseSelectorList(input);
        assert.deepStrictEqual(result, ['span.primary-price', 'div.deal-price', '.fallback-price']);
    });

    await t.test('splits pipe-separated selectors preserving order', () => {
        const input = 'span.current-price | .main-price | #price';
        const result = scraper.parseSelectorList(input);
        assert.deepStrictEqual(result, ['span.current-price', '.main-price', '#price']);
    });

    await t.test('splits comma-separated selectors without breaking pseudo-classes', () => {
        const input = 'span.price:not(.strike, .old), div.final-price';
        const result = scraper.parseSelectorList(input);
        assert.deepStrictEqual(result, ['span.price:not(.strike, .old)', 'div.final-price']);
    });

    await t.test('handles single selector string and empty inputs gracefully', () => {
        assert.deepStrictEqual(scraper.parseSelectorList('span.single-price'), ['span.single-price']);
        assert.deepStrictEqual(scraper.parseSelectorList(''), []);
        assert.deepStrictEqual(scraper.parseSelectorList(null), []);
    });
});
