// Defensive helper: ensure admin price-comparison helpers are exposed on window
// Load this file immediately after static/js/admin.js in admin.html (use defer).
(function () {
    if (typeof window === 'undefined') return;
    try {
        // Only attach if the functions actually exist in the current scope.
        // This avoids creating undefined globals and is safe to include unconditionally.
        if (typeof loadPriceComparisonSettings_v3 === 'function' && typeof window.loadPriceComparisonSettings_v3 !== 'function') {
            window.loadPriceComparisonSettings_v3 = loadPriceComparisonSettings_v3;
        }
        if (typeof savePriceComparisonSettings_v3 === 'function' && typeof window.savePriceComparisonSettings_v3 !== 'function') {
            window.savePriceComparisonSettings_v3 = savePriceComparisonSettings_v3;
        }
        if (typeof createPcRow_v3 === 'function' && typeof window.createPcRow_v3 !== 'function') {
            window.createPcRow_v3 = createPcRow_v3;
        }
        if (typeof collectPcTable_v3 === 'function' && typeof window.collectPcTable_v3 !== 'function') {
            window.collectPcTable_v3 = collectPcTable_v3;
        }
        // Helpful debug message for developers
        if (window.console && typeof window.console.debug === 'function') {
            console.debug('admin-pc-globals: price-comparison helpers attached to window (if present)');
        }
    } catch (e) {
        // non-fatal; do not break admin page
        try { console.warn('admin-pc-globals attach failed', e); } catch (ignore) { /* ignore */ }
    }
})();