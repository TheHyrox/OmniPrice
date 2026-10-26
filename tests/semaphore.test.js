const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const Semaphore = require('../server/utils/semaphore');

describe('Semaphore Concurrency Limiter', () => {
    test('enforces maxConcurrency limit', async () => {
        const sem = new Semaphore(1);
        let active = 0;
        let maxActiveObserved = 0;

        const task = async () => {
            return sem.run(async () => {
                active++;
                maxActiveObserved = Math.max(maxActiveObserved, active);
                await new Promise(resolve => setTimeout(resolve, 20));
                active--;
            });
        };

        await Promise.all([task(), task(), task()]);

        assert.equal(maxActiveObserved, 1);
        assert.equal(active, 0);
    });

    test('allows specified concurrency > 1', async () => {
        const sem = new Semaphore(2);
        let active = 0;
        let maxActiveObserved = 0;

        const task = async () => {
            return sem.run(async () => {
                active++;
                maxActiveObserved = Math.max(maxActiveObserved, active);
                await new Promise(resolve => setTimeout(resolve, 20));
                active--;
            });
        };

        await Promise.all([task(), task(), task(), task()]);

        assert.equal(maxActiveObserved, 2);
        assert.equal(active, 0);
    });
});
