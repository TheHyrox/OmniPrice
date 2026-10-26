/**
 * Simple FIFO Semaphore to throttle concurrent asynchronous operations.
 * Essential for constraining memory-intensive processes like Puppeteer.
 */
class Semaphore {
    /**
     * @param {number} maxConcurrency - Maximum allowed concurrent operations (default 1)
     */
    constructor(maxConcurrency = 1) {
        this.maxConcurrency = Math.max(1, maxConcurrency);
        this.currentRunning = 0;
        this.queue = [];
    }

    async acquire() {
        if (this.currentRunning < this.maxConcurrency) {
            this.currentRunning++;
            return;
        }

        return new Promise(resolve => this.queue.push(resolve));
    }

    release() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        } else {
            this.currentRunning = Math.max(0, this.currentRunning - 1);
        }
    }

    /**
     * Runs an async function within the semaphore's concurrency budget.
     * @param {Function} fn
     * @returns {Promise<any>}
     */
    async run(fn) {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    get activeCount() {
        return this.currentRunning;
    }

    get waitingCount() {
        return this.queue.length;
    }
}

module.exports = Semaphore;
