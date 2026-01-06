async function fetchJsonWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    options.signal = controller.signal;
    let res;
    try {
        res = await fetch(url, options);
    } catch (err) {
        clearTimeout(id);
        return { ok: false, status: 0, error: err.message || String(err) };
    }
    clearTimeout(id);

    // Try to read text then parse JSON if possible
    let text;
    try {
        text = await res.text();
    } catch (err) {
        return { ok: res.ok, status: res.status, text: '', error: 'Failed to read response text' };
    }

    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (e) {
        // Response was not JSON (could be HTML error page). Keep raw text.
        json = null;
    }

    return {
        ok: res.ok,
        status: res.status,
        json,
        text,
        headers: Object.fromEntries(res.headers.entries())
    };
}

async function fetchCartItems() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    return cart.map(i => ({
        id: i.id || i.product_id || '',
        title: i.title || i.name || '',
        unit_price: parseFloat(i.price || 0),
        quantity: parseInt(i.quantity || i.qty || 1, 10),
        currency: i.currency || 'USD'
    }));
}

function renderPayPalButtons(containerSelector, opts = {}) {
    if (!window.paypal) {
        console.error("PayPal SDK not loaded. Add <script src=\"https://www.paypal.com/sdk/js?client-id=YOUR_CLIENT_ID&currency=USD\"></script>");
        return;
    }
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error("PayPal container not found:", containerSelector);
        return;
    }

    const defaultStyle = opts.style || { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' };

    const buttons = paypal.Buttons({
        style: defaultStyle,
        createOrder: async function (data, actions) {
            const items = await fetchCartItems();
            const payload = { items, currency: opts.currency || 'USD' };

            // Use absolute API path to avoid base-tag/path issues
            const endpoint = window.location.origin + '/paypal/create-paypal-order';

            const res = await fetchJsonWithTimeout(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload)
            }, 15000);

            if (!res.ok) {
                console.error('createOrder: server error', { status: res.status, json: res.json, text: res.text, error: res.error });
                const detail = (res.json && (res.json.error || res.json.detail || res.json.message)) ||
                    (res.text && res.text.slice(0, 100)) ||
                    res.error ||
                    `HTTP ${res.status}`;
                alert('Failed to create PayPal order: ' + detail);
                throw new Error('create order failed: ' + detail);
            }

            const js = res.json;
            if (!js || !js.id) {
                console.error('createOrder: unexpected response', res);
                const detail = (js && JSON.stringify(js)) || (res.text || 'No response body');
                alert('Failed to create PayPal order (invalid response): ' + detail);
                throw new Error('create order returned invalid body');
            }

            return js.id;
        },
        onApprove: async function (data, actions) {
            // gather customer fields if present on page
            const customer = {};
            const nameEl = document.querySelector('#customer') || document.querySelector('#modal_customer');
            const emailEl = document.querySelector('#email') || document.querySelector('#modal_email');
            const phoneEl = document.querySelector('#phone') || document.querySelector('#modal_phone');
            const addressEl = document.querySelector('#address') || document.querySelector('#modal_address');
            if (nameEl) customer.name = nameEl.value || '';
            if (emailEl) customer.email = emailEl.value || '';
            if (phoneEl) customer.phone = phoneEl.value || '';
            if (addressEl) customer.address = addressEl.value || '';

            const items = await fetchCartItems();
            const payload = { orderID: data.orderID, customer, items };

            const endpoint = window.location.origin + '/paypal/capture-paypal-order';
            const res = await fetchJsonWithTimeout(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload)
            }, 15000);

            if (!res.ok) {
                console.error('Capture failed', { status: res.status, json: res.json, text: res.text, error: res.error });
                alert('Payment capture failed. See console for details.');
                return;
            }

            // Clear local cart and redirect to success
            try { localStorage.removeItem('cart'); } catch (e) { /* ignore */ }
            if (opts.successUrl) {
                window.location.href = opts.successUrl;
            } else {
                window.location.href = '/';
            }
        },
        onError: function (err) {
            console.error('PayPal Buttons error', err);
            alert('An error occurred with PayPal: ' + (err && err.message ? err.message : err));
        },
        onCancel: function (data) {
            console.log('PayPal payment cancelled', data);
            alert('Payment cancelled.');
        }
    });

    // render returns a promise; catch errors (e.g., container removed from DOM)
    buttons.render(containerSelector).catch(err => {
        console.error('PayPal Buttons render failed', err);
        // show a user-friendly message only once
        try {
            if (container) {
                const msg = document.createElement('div');
                msg.style.color = 'red';
                msg.style.marginTop = '8px';
                msg.textContent = 'Unable to load PayPal buttons. Please refresh the page.';
                container.appendChild(msg);
            }
        } catch (e) { /* ignore DOM insert errors */ }
    });
}

// New helper: create a PayPal order on the server and redirect buyer to the approval URL.
// items: array of { id, title, unit_price, quantity, currency? }
// opts: { currency, returnUrl, cancelUrl, brand_name }
async function initiateCardCheckout(items, opts = {}) {
    try {
        const payload = {
            items: items || await fetchCartItems(),
            currency: (opts.currency || 'USD'),
            // default returnUrl points to the namespaced /paypal/return
            return_url: opts.returnUrl || (window.location.origin + '/paypal/return'),
            cancel_url: opts.cancelUrl || (window.location.origin + '/paypal/cancel'),
            brand_name: opts.brand_name || document.title || 'Store'
        };
        // Persist items (and possibly customer) so the /paypal/return page can capture and create orders.
        try { localStorage.setItem('paypal_items', JSON.stringify(payload.items)); } catch (e) { /* ignore */ }

        const endpoint = window.location.origin + '/paypal/create-paypal-order';
        const res = await fetchJsonWithTimeout(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload)
        }, 15000);

        if (!res.ok) {
            console.error('initiateCardCheckout: server error', { status: res.status, json: res.json, text: res.text, error: res.error });
            const detail = (res.json && (res.json.error || res.json.detail || res.json.message)) ||
                (res.text && res.text.slice(0, 200)) ||
                res.error ||
                `HTTP ${res.status}`;
            throw new Error('Failed to create PayPal order: ' + detail);
        }

        const js = res.json;
        if (!js || !js.links) {
            console.error('initiateCardCheckout: unexpected response', res);
            throw new Error('PayPal did not return links in the create order response');
        }

        // Find approve link (PayPal v2 uses rel === 'approve' for redirect flow)
        const links = js.links || [];
        const approve = links.find(l => l.rel === 'approve' || l.rel === 'approval_url');
        if (!approve || !approve.href) {
            console.error('No approve link returned by PayPal', js);
            throw new Error('PayPal did not return an approval URL');
        }
        // Redirect buyer to PayPal approval page
        window.location.href = approve.href;
    } catch (err) {
        console.error('initiateCardCheckout error', err);
        alert('Failed to start card (PayPal) checkout: ' + (err && err.message ? err.message : err));
        throw err;
    }
}

// expose helper to global scope so pages can call it
window.renderPayPalButtons = renderPayPalButtons;
window.initiateCardCheckout = initiateCardCheckout;

// Auto initialize for common container IDs
document.addEventListener('DOMContentLoaded', function () {
    if (document.querySelector('#paypal-button-container')) {
        // main checkout page PayPal button: default style
        renderPayPalButtons('#paypal-button-container', { currency: 'USD', successUrl: '/' });
    }
    if (document.querySelector('#modal_paypal_button_container')) {
        // popup modal PayPal button — reduce height to make icon smaller
        const modalStyle = { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 24 };
        renderPayPalButtons('#modal_paypal_button_container', { currency: 'USD', successUrl: '/', style: modalStyle });
    }
});