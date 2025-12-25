/*
app/static/js/paypal.js

Improved PayPal client integration with stronger idempotency checks to prevent
double-rendering of PayPal buttons (fixes duplicate icons appearing on checkout).

Key changes:
- Every container is explicitly guarded using a data attribute (data-paypal-mounted)
  so repeated calls to render will not create duplicate button sets.
- The script no longer performs "blind" auto-rendering; it still attempts to render
  common containers on DOMContentLoaded but only if the container is not already
  mounted and after the SDK is available.
- All render calls are centralized (paypalIntegration.renderPayPalButtons) and are
  safe to call multiple times.
- Backwards-compatible aliases are preserved.
*/
(function () {
    "use strict";

    const CLIENT_CONFIG_PATH = "/paypal/client-config";
    const DEFAULT_CURRENCY = "USD";
    const RENDER_FLAG = "data-paypal-mounted";

    function _hasMounted(container) {
        return container && container.getAttribute && container.getAttribute(RENDER_FLAG) === "1";
    }
    function _setMounted(container) {
        try { container.setAttribute(RENDER_FLAG, "1"); } catch (e) { /* ignore */ }
    }

    // Load external script once
    function loadScriptOnce(src, attrs = {}) {
        return new Promise(function (resolve, reject) {
            const base = src.split("?")[0];
            const existing = Array.from(document.getElementsByTagName("script")).find(s =>
                s.src && s.src.indexOf(base) === 0
            );
            if (existing) {
                // allow small delay for the SDK to initialize
                return setTimeout(resolve, 50);
            }
            const s = document.createElement("script");
            s.src = src;
            s.async = true;
            Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); });
            s.onload = function () { resolve(); };
            s.onerror = function (e) { reject(new Error("Failed to load script " + src)); };
            document.head.appendChild(s);
        });
    }

    async function fetchClientConfig() {
        try {
            const r = await fetch(CLIENT_CONFIG_PATH, { credentials: 'same-origin' });
            if (!r.ok) {
                console.warn("Failed to fetch PayPal client config:", r.statusText);
                return null;
            }
            return await r.json();
        } catch (e) {
            console.warn("Error fetching PayPal client config:", e);
            return null;
        }
    }

    function getLocalCartItems() {
        try {
            const raw = localStorage.getItem("cart") || "[]";
            const arr = JSON.parse(raw);
            return arr.map(i => ({
                id: i.id || i.product_id || "",
                title: i.title || i.name || "",
                unit_price: Number(i.unit_price || i.price || 0),
                quantity: Number(i.quantity || i.qty || 1),
                currency: i.currency || DEFAULT_CURRENCY,
                image: i.image || i.image_url || ""
            }));
        } catch (e) {
            console.warn("Failed to read cart from localStorage", e);
            return [];
        }
    }

    async function ensureSdkLoaded() {
        if (window.paypal) return;
        const cfg = await fetchClientConfig();
        const clientId = cfg && cfg.client_id ? cfg.client_id : null;
        const currency = (cfg && cfg.currency) ? cfg.currency : DEFAULT_CURRENCY;
        if (!clientId) {
            console.warn("No PayPal client id available from server; ensure PAYPAL_CLIENT_ID is configured or include the SDK script tag in templates.");
            return;
        }
        const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}`;
        await loadScriptOnce(src);
        // Give SDK a moment to initialize
        return new Promise(resolve => setTimeout(resolve, 60));
    }

    // Internal renderer with robust idempotency
    function _renderButtonsInternal(containerSelector, opts = {}) {
        opts = opts || {};
        const style = opts.style || { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' };
        const onSuccessUrl = opts.successUrl || "/";
        const createOrderTimeoutMs = opts.createOrderTimeoutMs || 20000;

        const container = (typeof containerSelector === 'string') ? document.querySelector(containerSelector) : containerSelector;
        if (!container) {
            throw new Error("PayPal container not found: " + containerSelector);
        }

        // If already mounted, do nothing (prevents duplicates)
        if (_hasMounted(container)) return;

        if (!window.paypal) {
            throw new Error("PayPal SDK not loaded");
        }

        // Clear the container before rendering (prevents partial duplicate markup from earlier failed attempts)
        try { container.innerHTML = ""; } catch (e) { /* ignore */ }

        // Create the buttons
        paypal.Buttons({
            style: style,
            createOrder: async function () {
                const items = getLocalCartItems();
                const payload = { items: items, currency: opts.currency || DEFAULT_CURRENCY, brand_name: opts.brand_name || document.title || "" };
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), createOrderTimeoutMs);
                try {
                    const res = await fetch('/paypal/create-paypal-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: controller.signal,
                        credentials: 'same-origin'
                    });
                    clearTimeout(id);
                    if (!res.ok) {
                        const text = await res.text().catch(() => res.statusText);
                        throw new Error("Failed to create PayPal order: " + text);
                    }
                    const js = await res.json();
                    if (!js || !js.id) throw new Error("Invalid PayPal order response");
                    return js.id;
                } catch (err) {
                    clearTimeout(id);
                    console.error("createOrder error", err);
                    throw err;
                }
            },
            onApprove: async function (data) {
                try {
                    const items = getLocalCartItems();
                    const payload = { orderID: data.orderID, items: items };
                    const res = await fetch('/paypal/capture-paypal-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        credentials: 'same-origin'
                    });
                    const js = await res.json().catch(() => null);
                    if (!res.ok) {
                        const msg = js && (js.error || js.detail) ? (js.error + ' - ' + (js.detail || '')) : res.statusText;
                        throw new Error("Capture failed: " + msg);
                    }
                    try { localStorage.removeItem('cart'); } catch (e) { }
                    if (opts.successUrl) {
                        window.location.href = opts.successUrl;
                    } else {
                        window.location.href = '/';
                    }
                } catch (err) {
                    console.error("onApprove capture error", err);
                    alert("Payment succeeded in PayPal but capturing the order on the server failed. Please contact support.");
                }
            },
            onError: function (err) {
                console.error("PayPal Buttons error", err);
                alert("An error occurred with PayPal: " + (err && err.message ? err.message : err));
            },
            onCancel: function () {
                // User cancelled the PayPal window
                // Keep them on checkout modal so they can try another method
                try { if (opts.onCancel) opts.onCancel(); } catch (e) { }
            }
        }).render(container).then(() => {
            _setMounted(container);
        }).catch(err => {
            console.error("Failed to render PayPal Buttons", err);
        });
    }

    // Public API: ensures SDK then renders (idempotent)
    async function renderPayPalButtons(containerSelector, opts) {
        opts = opts || {};
        // If containerSelector points to multiple nodes (e.g., NodeList) handle first only
        const container = (typeof containerSelector === 'string') ? document.querySelector(containerSelector) : containerSelector;
        if (!container) {
            throw new Error("PayPal container not found: " + containerSelector);
        }
        // If already mounted, return early
        if (_hasMounted(container)) return;

        // Ensure SDK available
        await ensureSdkLoaded();
        if (!window.paypal) {
            throw new Error("PayPal SDK not available");
        }
        return _renderButtonsInternal(container, opts);
    }

    // Redirect flow: create order on server and navigate to approval URL
    async function initiateCardCheckout(items, opts = {}) {
        opts = opts || {};
        const payload = {
            items: items || getLocalCartItems(),
            currency: opts.currency || DEFAULT_CURRENCY,
            return_url: opts.returnUrl || (window.location.origin + '/paypal/return'),
            cancel_url: opts.cancelUrl || (window.location.origin + '/paypal/cancel'),
            brand_name: opts.brand_name || document.title || ''
        };
        try {
            const res = await fetch('/paypal/create-paypal-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'same-origin'
            });
            const js = await res.json().catch(() => null);
            if (!res.ok) {
                const msg = js && (js.error || js.detail) ? (js.error + ' - ' + (js.detail || '')) : res.statusText;
                throw new Error("Failed to create PayPal order: " + msg);
            }
            const links = js.links || [];
            const approve = links.find(l => l.rel === 'approve' && l.href);
            if (!approve) {
                throw new Error("PayPal did not return an approval URL");
            }
            window.location.href = approve.href;
            return new Promise(() => { /* navigation will occur */ });
        } catch (err) {
            console.error("initiateCardCheckout error", err);
            throw err;
        }
    }

    const paypalIntegration = {
        ensureSdkLoaded,
        renderPayPalButtons,
        initiateCardCheckout,
        getLocalCartItems
    };

    // Expose integration and backwards-compatible aliases
    window.paypalIntegration = window.paypalIntegration || paypalIntegration;
    window.renderPayPalButtons = window.renderPayPalButtons || function (container, opts) { return window.paypalIntegration.renderPayPalButtons(container, opts); };
    window.initiateCardCheckout = window.initiateCardCheckout || function (items, opts) { return window.paypalIntegration.initiateCardCheckout(items, opts); };

    // Auto-render common containers only if they are present and not already mounted.
    // This makes pages that do not call render explicitly still work, but prevents duplicates.
    document.addEventListener('DOMContentLoaded', function () {
        (async function tryAutoRender() {
            try {
                // Attempt to fetch config and load SDK; if unavailable, skip (templates may include SDK directly)
                await window.paypalIntegration.ensureSdkLoaded().catch(() => { /* continue; SDK may already be included. */ });

                const commonIds = ['#paypal-button-container', '#modal_paypal_button_container', '#product_paypal_button_container'];
                commonIds.forEach(id => {
                    try {
                        const el = document.querySelector(id);
                        if (el && !_hasMounted(el) && typeof window.paypalIntegration.renderPayPalButtons === 'function') {
                            // Best-effort render; errors are caught within renderPayPalButtons
                            window.paypalIntegration.renderPayPalButtons(id, { currency: DEFAULT_CURRENCY, successUrl: '/' }).catch(() => { /* ignore */ });
                        }
                    } catch (e) { /* ignore per-container errors */ }
                });
            } catch (e) {
                // If anything fails, don't block page. Templates that included SDK will still work.
                console.warn("PayPal auto-render skipped:", e && e.message ? e.message : e);
            }
        })();
    });
})();