const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('Configuration Validator', () => {
    test('loads default values safely', () => {
        const config = require('../server/config');
        assert.ok(typeof config.PORT === 'number');
        assert.ok(config.MONGO_URI);
        assert.equal(config.PUPPETEER_CONCURRENCY >= 1, true);
    });
});
