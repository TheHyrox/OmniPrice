/**
 * OmniPrice Client Error Telemetry
 * Captures uncaught frontend errors and reports them to the OmniPrice admin telemetry
 */
(function () {
    const REPORT_ENDPOINT = '/api/client-errors';
    let lastReportTime = 0;
    const ERROR_THROTTLE_MS = 1000; // prevent flood

    function sendError(data) {
        const now = Date.now();
        if (now - lastReportTime < ERROR_THROTTLE_MS) return;
        lastReportTime = now;

        const payload = {
            message: data.message || 'Unknown browser error',
            stack: data.stack || '',
            source: data.source || window.location.href,
            lineno: data.lineno || null,
            colno: data.colno || null,
            url: window.location.href,
            userAgent: navigator.userAgent,
            type: data.type || 'error',
            timestamp: new Date().toISOString()
        };

        try {
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                navigator.sendBeacon(REPORT_ENDPOINT, blob);
            } else {
                fetch(REPORT_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    keepalive: true
                }).catch(() => {});
            }
        } catch (_) {}
    }

    // Global JS Exception Handler
    window.addEventListener('error', function (event) {
        if (!event) return;
        // Ignore cross-origin script error noise
        if (event.message === 'Script error.' && !event.filename) return;

        sendError({
            message: event.message || (event.error && event.error.message) || 'Uncaught error',
            source: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error ? event.error.stack : '',
            type: 'uncaught_exception'
        });
    });

    // Unhandled Promise Rejections (e.g. failed fetch or async errors)
    window.addEventListener('unhandledrejection', function (event) {
        if (!event) return;
        const reason = event.reason;
        sendError({
            message: (reason && reason.message) ? reason.message : String(reason),
            stack: reason && reason.stack ? reason.stack : '',
            type: 'unhandled_promise_rejection'
        });
    });

    // Optional: Expose manual reporter on window
    window.reportOmniError = function (errorOrMsg, customType) {
        if (errorOrMsg instanceof Error) {
            sendError({
                message: errorOrMsg.message,
                stack: errorOrMsg.stack,
                type: customType || 'manual'
            });
        } else {
            sendError({
                message: String(errorOrMsg),
                type: customType || 'manual'
            });
        }
    };
})();
