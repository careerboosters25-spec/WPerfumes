// Checkout page JS (modularized). This file must be served as a static file (no Jinja here).
// The template injects window.PLACEHOLDER_IMAGE for the placeholder image path.

(function () {
    const API = "/api";

    function toStaticUrl(url) {
        const placeholder = window.PLACEHOLDER_IMAGE || '/static/images/placeholder.jpg';
        if (!url) return placeholder;
        if (typeof url !== 'string') return placeholder;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) return url;
        return `/static/${url}`;
    }

    // FX support
    let fxRateGBPtoUSD = null;
    const FX_CACHE_KEY = 'fx_gbp_usd';
    const FX_TTL_MS = 60 * 60 * 1000; // 1 hour

    async function fetchFX() {
        try {
            const raw = localStorage.getItem(FX_CACHE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.rate && parsed.ts && (Date.now() - parsed.ts < FX_TTL_MS)) {
                    fxRateGBPtoUSD = parsed.rate;
                    return fxRateGBPtoUSD;
                }
            }
            const res = await fetch('https://api.exchangerate.host/latest?base=GBP&symbols=USD');
            if (!res.ok) throw new Error('Failed to fetch FX');
            const js = await res.json();
            const rate = Number(js?.rates?.USD || 0);
            if (rate && rate > 0) {
                fxRateGBPtoUSD = rate;
                localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rate, ts: Date.now() }));
                return rate;
            }
        } catch (e) {
            console.warn('fetchFX failed', e);
            try {
                const raw = localStorage.getItem(FX_CACHE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.rate) fxRateGBPtoUSD = parsed.rate;
                }
            } catch (e) { /* ignore */ }
            if (!fxRateGBPtoUSD) fxRateGBPtoUSD = 1.25;
            return fxRateGBPtoUSD;
        }
    }

    function formatCurrency(value, currency) {
        const n = Number(value) || 0;
        if (currency === 'GBP') {
            try {
                return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
            } catch (e) { return `£${Math.round(n)}`; }
        } else if (currency === 'USD') {
            const rate = fxRateGBPtoUSD || 1.25;
            const converted = n * rate;
            try {
                return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(converted);
            } catch (e) { return `$${Math.round(converted)}`; }
        }
        return String(n);
    }

    function formatPriceInteger(value) {
        return formatCurrency(value, 'GBP');
    }

    function getCart() { return JSON.parse(localStorage.getItem('cart') || '[]'); }
    function saveCart(cart) { localStorage.setItem('cart', JSON.stringify(cart)); }

    let checkoutDiscountPercent = 0;
    async function fetchDiscountPercent() {
        try {
            const r = await fetch(`${API}/settings/checkout_discount`);
            if (!r.ok) {
                checkoutDiscountPercent = 0;
                const div = document.getElementById('discountPercentInfo');
                if (div) div.style.display = 'none';
                return;
            }
            const js = await r.json();
            checkoutDiscountPercent = parseFloat(js.percent) || 0;
            const div = document.getElementById('discountPercentInfo');
            if (div) {
                if (checkoutDiscountPercent > 0) {
                    div.style.display = 'block';
                    div.innerHTML = `🌟 <b>Special Offer:</b> <span style="color:#27ae60">${checkoutDiscountPercent}% OFF</span> applied automatically!`;
                } else {
                    div.style.display = 'none';
                }
            }
        } catch (e) {
            console.warn('Failed to load discount', e);
            checkoutDiscountPercent = 0;
            const div = document.getElementById('discountPercentInfo');
            if (div) div.style.display = 'none';
        }
    }

    let availablePromos = [];
    async function loadActivePromos() {
        const promoSelect = document.getElementById('promo_code_summary');
        try {
            const res = await fetch(`${API}/coupons`);
            if (!res.ok) {
                availablePromos = [];
                if (promoSelect) promoSelect.innerHTML = '<option value="">-- None --</option>';
                return;
            }
            availablePromos = await res.json();
            let options = '<option value="">-- None --</option>';
            availablePromos.forEach(p => {
                let percent = 0;
                if (p.discount_type === 'percent') {
                    percent = parseFloat(p.discount_value || 0) || 0;
                }
                options += `<option value="${p.code}" data-percent="${percent}">${p.code} ${p.description ? '(' + p.description + ')' : ''}</option>`;
            });
            if (promoSelect) promoSelect.innerHTML = options;
        } catch (e) {
            console.warn('Failed to load promos', e);
            availablePromos = [];
            if (promoSelect) promoSelect.innerHTML = '<option value="">-- None --</option>';
        }

        if (promoSelect) {
            promoSelect.addEventListener('change', function () {
                const code = this.value || '';
                const hidden = document.getElementById('promo_code_hidden');
                if (hidden) hidden.value = code;
                const found = availablePromos.find(x => x.code === code);
                const percent = found && found.discount_type === 'percent' ? (parseFloat(found.discount_value) || 0) : 0;
                const promoMsg = document.getElementById('promoMsg');
                if (promoMsg) promoMsg.innerText = percent > 0 ? `Promo will apply ${percent}% off.` : '';
                renderCartSummary();
            });
        }
    }

    // Helper: set button visual & accessibility state
    function setButtonState(btn, enabled, reason) {
        if (!btn) return;
        btn.disabled = !enabled;
        if (enabled) {
            btn.classList.remove('btn-disabled');
            btn.classList.add('btn-active');
            btn.setAttribute('aria-disabled', 'false');
            btn.tabIndex = 0;
            btn.removeAttribute('title');
        } else {
            btn.classList.remove('btn-active');
            btn.classList.add('btn-disabled');
            btn.setAttribute('aria-disabled', 'true');
            btn.tabIndex = -1;
            if (reason) btn.setAttribute('title', reason);
        }
    }

    // Update button enabled/disabled and hint text based on payment selection + cart
    function updatePaymentButtonsStateCheckout() {
        const cart = getCart();
        const cartEmpty = !cart || !cart.length;
        const paymentEl = document.getElementById('paymentSelect');
        if (!paymentEl) return;
        const payment = paymentEl.value || 'Cash on Delivery';
        const placeBtn = document.getElementById('checkoutBtn');
        const buyBtn = document.getElementById('buyNowBtn');
        const hintEl = document.getElementById('paymentHint');

        if (cartEmpty) {
            setButtonState(placeBtn, false, 'Cart is empty');
            setButtonState(buyBtn, false, 'Cart is empty');
            if (hintEl) hintEl.innerText = 'Your cart is empty.';
            return;
        }

        if (payment === 'Cash on Delivery') {
            setButtonState(placeBtn, true);
            setButtonState(buyBtn, false, 'Buy Now requires card payment (Visa/Mastercard).');
            if (hintEl) hintEl.innerText = 'Cash on Delivery selected — use "Place Order".';
        } else {
            setButtonState(placeBtn, false, 'Place Order is disabled for card payments.');
            setButtonState(buyBtn, true);
            if (hintEl) hintEl.innerText = `${payment} selected — use "Buy Now" to pay with card.`;
        }
    }

    function renderCartSummary() {
        const cart = getCart();
        const container = document.getElementById('cartSummarySection');
        if (!container) return;

        if (!cart || !cart.length) {
            container.innerHTML = '<div class="empty-cart">Your cart is empty.</div>';
            updatePaymentButtonsStateCheckout();
            return;
        }

        let html = `<table>
            <thead><tr><th>Product</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Total</th></tr></thead>
            <tbody>`;
        let subtotal = 0;
        cart.forEach(item => {
            const qty = item.quantity || item.qty || 1;
            const price = parseFloat(item.price || 0);
            const itemTotal = price * qty;
            subtotal += itemTotal;
            html += `<tr>
                <td style="padding:8px 6px;">
                    <div style="display:flex;gap:8px;align-items:center;">
                        <img src="${toStaticUrl(item.image || item.image_url || '')}" alt="${item.title || ''}" style="width:56px;height:56px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid #eee;">
                        <div>
                            <div style="font-weight:600">${item.title || item.name || ''}</div>
                            <div class="small-muted" style="font-size:13px">${item.brand || ''}</div>
                        </div>
                    </div>
                </td>
                <td style="text-align:center;">${qty}</td>
                <td style="text-align:right;">${formatCurrency(itemTotal, 'GBP')} <div class="small-muted" style="display:inline-block;margin-left:8px;">≈ ${formatCurrency(itemTotal, 'USD')}</div></td>
            </tr>`;
        });

        // apply global discount and optionally promo percent selected in the summary select
        const promoSelect = document.getElementById('promo_code_summary');
        let promoPercent = 0;
        if (promoSelect) {
            const sel = promoSelect.value;
            const found = availablePromos.find(x => x.code === sel);
            if (found && found.discount_type === 'percent') {
                promoPercent = parseFloat(found.discount_value || 0) || 0;
            }
        }

        const globalPercent = checkoutDiscountPercent || 0;
        let combinedPercent = globalPercent + promoPercent;
        if (combinedPercent > 95) combinedPercent = 95;
        const discountAmount = subtotal * (combinedPercent / 100);
        const discountedTotal = subtotal - discountAmount;

        html += `</tbody>
            <tfoot>
                <tr class="total-row"><td></td><td style="font-weight:700;">Subtotal</td><td style="text-align:right;font-weight:700;">${formatCurrency(subtotal, 'GBP')} (${formatCurrency(subtotal, 'USD')})</td></tr>
                ${globalPercent > 0 ? `<tr class="total-row"><td></td><td style="font-weight:700;color:#b8860b;">Auto Discount (${globalPercent}%)</td><td style="text-align:right;color:#b8860b;">-${formatCurrency(subtotal * (globalPercent / 100), 'GBP')} (${formatCurrency(subtotal * (globalPercent / 100), 'USD')})</td></tr>` : ''}
                ${promoPercent > 0 ? `<tr class="total-row"><td></td><td style="font-weight:700;color:#b8860b;">Promo (${promoPercent}%)</td><td style="text-align:right;color:#b8860b;">-${formatCurrency(subtotal * (promoPercent / 100), 'GBP')} (${formatCurrency(subtotal * (promoPercent / 100), 'USD')})</td></tr>` : ''}
                <tr class="total-row"><td></td><td style="font-weight:700;">Total (after discount)</td><td style="text-align:right;color:#27ae60;font-weight:700;">${formatCurrency(discountedTotal, 'GBP')} (${formatCurrency(discountedTotal, 'USD')})</td></tr>
            </tfoot>
        </table>`;
        container.innerHTML = html;

        updatePaymentButtonsStateCheckout();
    }

    // COUNTRY / CITY logic - top city hubs for requested countries (top 5 each)
    const COUNTRIES_CITY_MAP = {
        "Bahrain": ["Manama", "Muharraq", "Riffa", "Hamad Town", "Isa Town"],
        "Egypt": ["Cairo", "Alexandria", "Giza", "Mansoura", "Suez"],
        "Kuwait": ["Kuwait City", "Hawalli", "Al Ahmadi", "Jahra", "Farwaniya"],
        "Qatar": ["Doha", "Al Rayyan", "Al Wakrah", "Al Khor", "Umm Salal"],
        "Saudi Arabia": ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam"],
        "UAE": ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah"]
    };

    function showManualCountryCity(show, hideCountryInput = false) {
        const manual = document.getElementById('manualCountryCity');
        const cityContainer = document.getElementById('citySelectContainer');
        const citySelect = document.getElementById('citySelect');
        const countryInput = document.getElementById('countryInput');
        if (show) {
            if (manual) manual.style.display = 'block';
            if (countryInput) countryInput.style.display = hideCountryInput ? 'none' : 'block';
            if (cityContainer) { cityContainer.style.display = 'none'; cityContainer.setAttribute('aria-hidden', 'true'); }
            if (citySelect) citySelect.innerHTML = '<option value="">-- Select city --</option>';
        } else {
            if (manual) manual.style.display = 'none';
            if (countryInput) countryInput.style.display = 'block';
        }
    }

    function showCitySelectWith(list) {
        const cityContainer = document.getElementById('citySelectContainer');
        const citySelect = document.getElementById('citySelect');
        if (!cityContainer || !citySelect) return;
        let html = '<option value="">-- Select city --</option>';
        list.forEach(c => { html += `<option value="${c}">${c}</option>`; });
        html += '<option value="OTHER_CITY">Other (enter manually)</option>';
        citySelect.innerHTML = html;
        cityContainer.style.display = 'block';
        cityContainer.setAttribute('aria-hidden', 'false');
        // hide manual inputs when we show select
        const manual = document.getElementById('manualCountryCity');
        if (manual) manual.style.display = 'none';
    }

    function handleCountryChange() {
        const countrySelect = document.getElementById('countrySelect');
        if (!countrySelect) return;
        const val = countrySelect.value || '';
        const countryInput = document.getElementById('countryInput');
        const cityInput = document.getElementById('cityInput');
        const citySelect = document.getElementById('citySelect');

        if (!val || val === 'OTHER') {
            // show manual inputs for both country and city
            showManualCountryCity(true, false);
            if (countryInput) countryInput.value = '';
            if (cityInput) cityInput.value = '';
            return;
        }

        // a listed country was chosen (not OTHER)
        if (countryInput) countryInput.value = ''; // clear manual country

        // If we have pre-defined cities for this country, show select
        if (COUNTRIES_CITY_MAP.hasOwnProperty(val)) {
            showCitySelectWith(COUNTRIES_CITY_MAP[val]);
            return;
        }

        // listed country but no cities in map -> show manual city input only and hide manual country input
        showManualCountryCity(true, true);
    }

    // When city select chosen as OTHER_CITY, show manual city input
    function handleCitySelectChange() {
        const citySelect = document.getElementById('citySelect');
        const manual = document.getElementById('manualCountryCity');
        if (!citySelect || !manual) return;
        if (citySelect.value === 'OTHER_CITY') {
            // show manual city input
            manual.style.display = 'block';
            // because we still know country from select, hide country manual input
            const countryInput = document.getElementById('countryInput');
            if (countryInput) countryInput.style.display = 'none';
        } else {
            // hide manual city input unless country is blank or OTHER
            const countrySelect = document.getElementById('countrySelect');
            if (countrySelect && countrySelect.value && countrySelect.value !== 'OTHER') {
                manual.style.display = 'none';
            }
        }
    }

    function getSelectedCountryAndCity() {
        const countrySelect = document.getElementById('countrySelect');
        const countryInput = document.getElementById('countryInput');
        const citySelect = document.getElementById('citySelect');
        const cityInput = document.getElementById('cityInput');

        let country = '';
        let city = '';

        if (countrySelect && countrySelect.value && countrySelect.value !== 'OTHER') {
            country = countrySelect.value;
        } else if (countryInput && countryInput.value) {
            country = countryInput.value.trim();
        }

        // city: prefer select if visible and not OTHER_CITY
        const cityContainer = document.getElementById('citySelectContainer');
        if (cityContainer && cityContainer.style.display !== 'none' && citySelect && citySelect.value && citySelect.value !== 'OTHER_CITY') {
            city = citySelect.value;
        } else if (cityInput && cityInput.value) {
            city = cityInput.value.trim();
        }

        return { country, city };
    }

    async function submitOrders(customer, email, phone, address, payment_method, promo_code, date) {
        const cart = getCart();
        if (!cart || !cart.length) return { success: false, message: 'Cart empty' };

        const { country, city } = getSelectedCountryAndCity();

        const results = [];
        for (const item of cart) {
            const payload = {
                customer_name: customer,
                customer_email: email,
                customer_phone: phone,
                customer_address: address,
                customer_country: country || '',
                customer_city: city || '',
                product_id: item.id || item.product_id || '',
                product_title: item.title || item.name || '',
                quantity: item.quantity || item.qty || 1,
                status: "Pending",
                payment_method: payment_method || "Cash on Delivery",
                date: date || (new Date().toISOString().slice(0, 19).replace('T', ' '))
            };
            if (promo_code) payload.promo_code = promo_code;

            try {
                const res = await fetch(`${API}/orders`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => res.statusText);
                    results.push({ ok: false, message: text || `HTTP ${res.status}` });
                } else {
                    results.push({ ok: true });
                }
            } catch (e) {
                results.push({ ok: false, message: e.message });
            }
        }
        return results;
    }

    async function logOrderAttemptsForCart(status = 'CheckedOut') {
        const cart = getCart() || [];
        for (const item of cart) {
            try {
                await fetch(`${API}/order-attempts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: "",
                        product: item.title || item.name || "",
                        qty: item.quantity || item.qty || 1,
                        status
                    })
                });
            } catch (e) {
                // ignore
            }
        }
    }

    document.addEventListener('DOMContentLoaded', async function () {
        // Ensure discount + promos + FX loaded before first render so totals reflect them
        await fetchDiscountPercent();
        await loadActivePromos();
        await fetchFX();

        renderCartSummary();
        updatePaymentButtonsStateCheckout();

        // Wire country/city event listeners
        const countrySelect = document.getElementById('countrySelect');
        const citySelect = document.getElementById('citySelect');
        if (countrySelect) countrySelect.addEventListener('change', handleCountryChange);
        if (citySelect) citySelect.addEventListener('change', handleCitySelectChange);

        // Ensure PayPal buttons render if available
        try {
            if (window.paypal && document.querySelector('#paypal-button-container')) {
                const container = document.querySelector('#paypal-button-container');
                if (!container.innerHTML.trim() && typeof renderPayPalButtons === 'function') {
                    renderPayPalButtons('#paypal-button-container', { currency: 'USD', successUrl: '/' });
                }
            }
        } catch (err) {
            console.warn('PayPal render failed on init', err);
        }

        // Wire up form events
        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', async function (e) {
                e.preventDefault();

                const customer = document.getElementById('customer').value || '';
                const email = document.getElementById('email').value || '';
                const phone = document.getElementById('phone').value || '';
                const address = document.getElementById('address').value || '';
                const payment_method = document.getElementById('paymentSelect').value || 'Cash on Delivery';
                const promo_code = document.getElementById('promo_code_summary')?.value || document.getElementById('promo_code_hidden')?.value || null;
                const dateVal = document.getElementById('date').value || new Date().toISOString().slice(0, 19).replace('T', ' ');

                // Basic validation: require country (either selected or manual)
                const { country, city } = getSelectedCountryAndCity();
                const orderMsg = document.getElementById('orderMsg');
                if (!country) {
                    if (orderMsg) orderMsg.innerHTML = '<div style="color:#c44;">Please provide a country for shipping (select or enter manually).</div>';
                    return;
                }

                if (orderMsg) orderMsg.innerHTML = '<span class="small-muted">Placing your order...</span>';
                setButtonState(document.getElementById('checkoutBtn'), false);
                setButtonState(document.getElementById('buyNowBtn'), false);

                await logOrderAttemptsForCart('CheckedOut');

                const results = await submitOrders(customer, email, phone, address, payment_method, promo_code, dateVal);

                const anyFailed = results.some(r => !r.ok);
                if (anyFailed) {
                    if (orderMsg) {
                        orderMsg.innerHTML = '<div style="color:#e74c3c;font-weight:700;">One or more orders failed. See details below.</div>';
                        results.forEach((r, i) => {
                            if (!r.ok) {
                                orderMsg.innerHTML += `<div style="color:#c44;">Item ${i + 1}: ${r.message || 'Failed'}</div>`;
                            }
                        });
                    }
                    updatePaymentButtonsStateCheckout();
                } else {
                    if (orderMsg) orderMsg.innerHTML = `<div style="color:#27ae60;font-weight:700;">Thank you! Your orders were placed successfully.</div>`;
                    localStorage.removeItem('cart');
                    renderCartSummary();
                    setTimeout(() => {
                        window.location.href = "/";
                    }, 2400);
                }
            });
        }

        // Buy Now / card flow
        const buyNowBtn = document.getElementById('buyNowBtn');
        if (buyNowBtn) {
            buyNowBtn.addEventListener('click', async function () {
                // gather same data and store for PayPal return flow
                const customer = document.getElementById('customer').value || '';
                const email = document.getElementById('email').value || '';
                const phone = document.getElementById('phone').value || '';
                const address = document.getElementById('address').value || '';
                const promo_code = document.getElementById('promo_code_summary')?.value || document.getElementById('promo_code_hidden')?.value || null;
                const dateVal = document.getElementById('date').value || new Date().toISOString().slice(0, 19).replace('T', ' ');

                const orderMsg = document.getElementById('orderMsg');
                if (orderMsg) orderMsg.innerHTML = '<span class="small-muted">Processing payment and placing your order...</span>';
                setButtonState(document.getElementById('checkoutBtn'), false);
                setButtonState(document.getElementById('buyNowBtn'), false);

                await logOrderAttemptsForCart('CheckedOut');

                const { country, city } = getSelectedCountryAndCity();
                const customerObj = { name: customer, email: email, phone: phone, address: address, country, city };
                try { localStorage.setItem('paypal_customer', JSON.stringify(customerObj)); } catch (e) { /* ignore */ }

                const cartItems = getCart() || [];
                const itemsForServer = cartItems.map(i => ({
                    id: i.id || i.product_id || '',
                    title: i.title || i.name || '',
                    unit_price: parseFloat(i.price || 0),
                    quantity: parseInt(i.quantity || i.qty || 1, 10),
                    currency: 'USD'
                }));
                try { localStorage.setItem('paypal_items', JSON.stringify(itemsForServer)); } catch (e) { /* ignore */ }

                if (typeof window.initiateCardCheckout === 'function') {
                    try {
                        await window.initiateCardCheckout(itemsForServer, { currency: 'USD', returnUrl: window.location.origin + '/paypal/return' });
                    } catch (err) {
                        console.error('initiateCardCheckout error', err);
                        const detail = (err && err.message) ? err.message : String(err);
                        if (detail.toLowerCase().includes('401') || detail.toLowerCase().includes('unauthorized')) {
                            if (orderMsg) orderMsg.innerHTML = `<div style="color:#e74c3c;font-weight:700;">Payment provider credentials appear missing or invalid on the server.</div>
                            <div style="color:#666;margin-top:8px;">Please ensure PAYPAL_CLIENT_ID and PAYPAL_SECRET are set as environment variables on the server (use sandbox values for development), and restart the application.</div>
                            <div style="color:#666;margin-top:8px;font-size:0.9em;">Server error details: ${detail}</div>`;
                        } else {
                            if (orderMsg) orderMsg.innerHTML = `<div style="color:#e74c3c;font-weight:700;">Failed to start card (PayPal) checkout.</div><div style="color:#666;margin-top:8px;font-size:0.9em;">${detail}</div>`;
                        }
                        setButtonState(document.getElementById('checkoutBtn'), true);
                        setButtonState(document.getElementById('buyNowBtn'), true);
                        updatePaymentButtonsStateCheckout();
                    }
                } else {
                    if (orderMsg) orderMsg.innerHTML = '<div style="color:#e74c3c;font-weight:700;">Card checkout is not available on this page.</div>';
                    updatePaymentButtonsStateCheckout();
                }
            });
        }

        // sync on select change for payment
        const paymentSelect = document.getElementById('paymentSelect');
        if (paymentSelect) paymentSelect.addEventListener('change', updatePaymentButtonsStateCheckout);

        // Periodic refresh (discounts, FX, promos)
        setInterval(async () => {
            const prev = checkoutDiscountPercent;
            await fetchDiscountPercent();
            await loadActivePromos();
            if (prev !== checkoutDiscountPercent) renderCartSummary();
            await fetchFX();
            renderCartSummary();
        }, 30000);
    });

    // expose some utilities for debugging in console (optional)
    window.__checkout = {
        renderCartSummary,
        fetchDiscountPercent,
        loadActivePromos,
        fetchFX,
        getCart,
        getSelectedCountryAndCity,
        COUNTRIES_CITY_MAP
    };

})();