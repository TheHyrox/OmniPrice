const test = require('node:test');
const assert = require('node:assert/strict');
const scheduler = require('../server/jobs/scheduler');
const { updateSettingsSchema } = require('../server/schemas');
const MongoDatabase = require('../server/db/mongo-database');

test('Scheduler - scrapeTime and Schedule Calculation', async (t) => {
    await t.test('Daily 24h: schedules for today when fromTime is before scrapeTime', () => {
        const from = new Date(2026, 4, 15, 2, 0, 0, 0); // 02:00
        const next = scheduler.getNextScheduledTime(86400000, '04:30', from);

        assert.ok(next instanceof Date);
        assert.equal(next.getFullYear(), 2026);
        assert.equal(next.getMonth(), 4);
        assert.equal(next.getDate(), 15);
        assert.equal(next.getHours(), 4);
        assert.equal(next.getMinutes(), 30);
    });

    await t.test('Daily 24h: schedules for tomorrow when fromTime is after scrapeTime', () => {
        const from = new Date(2026, 4, 15, 10, 0, 0, 0); // 10:00
        const next = scheduler.getNextScheduledTime(86400000, '04:30', from);

        assert.ok(next instanceof Date);
        assert.equal(next.getFullYear(), 2026);
        assert.equal(next.getMonth(), 4);
        assert.equal(next.getDate(), 16);
        assert.equal(next.getHours(), 4);
        assert.equal(next.getMinutes(), 30);
    });

    await t.test('12h interval: aligns cycles with chosen scrapeTime', () => {
        const fromMorning = new Date(2026, 4, 15, 6, 0, 0, 0); // 06:00
        const nextMorning = scheduler.getNextScheduledTime(43200000, '04:30', fromMorning);
        assert.equal(nextMorning.getHours(), 16);
        assert.equal(nextMorning.getMinutes(), 30);
        assert.equal(nextMorning.getDate(), 15);

        const fromEvening = new Date(2026, 4, 15, 18, 0, 0, 0); // 18:00
        const nextEvening = scheduler.getNextScheduledTime(43200000, '04:30', fromEvening);
        assert.equal(nextEvening.getHours(), 4);
        assert.equal(nextEvening.getMinutes(), 30);
        assert.equal(nextEvening.getDate(), 16);
    });

    await t.test('1h interval: aligns minute with scrapeTime minute', () => {
        const from = new Date(2026, 4, 15, 14, 10, 0, 0); // 14:10
        const next = scheduler.getNextScheduledTime(3600000, '08:45', from);
        assert.equal(next.getHours(), 14);
        assert.equal(next.getMinutes(), 45);

        const fromPastMinute = new Date(2026, 4, 15, 14, 50, 0, 0); // 14:50
        const nextPastMinute = scheduler.getNextScheduledTime(3600000, '08:45', fromPastMinute);
        assert.equal(nextPastMinute.getHours(), 15);
        assert.equal(nextPastMinute.getMinutes(), 45);
    });

    await t.test('Returns null when frequency is zero or negative', () => {
        assert.equal(scheduler.getNextScheduledTime(0, '04:00'), null);
        assert.equal(scheduler.getNextScheduledTime(-1, '04:00'), null);
    });

    await t.test('Falls back gracefully to 00:00 when scrapeTime is invalid or empty', () => {
        const from = new Date(2026, 4, 15, 10, 0, 0, 0);
        const next = scheduler.getNextScheduledTime(86400000, '', from);
        assert.equal(next.getHours(), 0);
        assert.equal(next.getMinutes(), 0);
        assert.equal(next.getDate(), 16);
    });
});

test('Schema - updateSettingsSchema scrapeTime validation', async (t) => {
    await t.test('accepts valid hh:mm format', () => {
        const res1 = updateSettingsSchema.safeParse({ scrapeTime: '04:30' });
        assert.equal(res1.success, true);
        assert.equal(res1.data.scrapeTime, '04:30');

        const res2 = updateSettingsSchema.safeParse({ scrapeTime: '23:59' });
        assert.equal(res2.success, true);
        assert.equal(res2.data.scrapeTime, '23:59');

        const res3 = updateSettingsSchema.safeParse({ scrapeTime: '00:00' });
        assert.equal(res3.success, true);
        assert.equal(res3.data.scrapeTime, '00:00');
    });

    await t.test('normalizes single digit hour (h:mm) to (hh:mm)', () => {
        const res = updateSettingsSchema.safeParse({ scrapeTime: '4:30' });
        assert.equal(res.success, true);
        assert.equal(res.data.scrapeTime, '04:30');
    });

    await t.test('accepts empty string or null for optional clearing', () => {
        const resEmpty = updateSettingsSchema.safeParse({ scrapeTime: '' });
        assert.equal(resEmpty.success, true);

        const resNull = updateSettingsSchema.safeParse({ scrapeTime: null });
        assert.equal(resNull.success, true);
    });

    await t.test('rejects invalid hours or minutes', () => {
        assert.equal(updateSettingsSchema.safeParse({ scrapeTime: '24:00' }).success, false);
        assert.equal(updateSettingsSchema.safeParse({ scrapeTime: '25:30' }).success, false);
        assert.equal(updateSettingsSchema.safeParse({ scrapeTime: '12:60' }).success, false);
        assert.equal(updateSettingsSchema.safeParse({ scrapeTime: '12:99' }).success, false);
        assert.equal(updateSettingsSchema.safeParse({ scrapeTime: 'invalid' }).success, false);
    });
});
