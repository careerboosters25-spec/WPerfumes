// Checkout page JS (modularized). This file must be served as a static file (no Jinja here).
// Phase 0: client-side security & UX improvements implemented.
// Phase 1: UI + delivery fee + quantity controls
//  - reads /static/data/countries.json (global list)
//  - quantity +/- controls (green +, red -) with event delegation
//  - delivery fee = $3 (USD) shown as GBP primary and USD in brackets
//  - totals calculated in GBP as primary currency; USD shown in brackets like subtotal/total

(function () {
    const API = "/api";
    const DELIVERY_FEE_USD = 3.00;

    // utilities
    function toStaticUrl(url) {
        const placeholder = window.PLACEHOLDER_IMAGE || '/static/images/placeholder.jpg';
        if (!url) return placeholder;
        if (typeof url !== 'string') return placeholder;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) return url;
        return `/static/${url}`;
    }

    function getCsrfToken() {
        return document.querySelector('meta[name="csrf-token"]')?.content || '';
    }

    function getIdempotencyKey() {
        try {
            let key = sessionStorage.getItem('order_idempotency_key');
            if (!key) {
                if (typeof crypto !== 'undefined' && crypto.randomUUID) key = crypto.randomUUID();
                else key = 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
                sessionStorage.setItem('order_idempotency_key', key);
            }
            return key;
        } catch (e) {
            // fallback
            return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
        }
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
                return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(n);
            } catch (e) { return `£${(Math.round(n * 100) / 100).toFixed(2)}`; }
        } else if (currency === 'USD') {
            const rate = fxRateGBPtoUSD || 1.25;
            const converted = n * rate;
            try {
                return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(converted);
            } catch (e) { return `$${(Math.round(converted * 100) / 100).toFixed(2)}`; }
        }
        return String(n);
    }

    function getCart() { return JSON.parse(localStorage.getItem('cart') || '[]'); }
    function saveCart(cart) { localStorage.setItem('cart', JSON.stringify(cart)); }

    // discount & promos
    let checkoutDiscountPercent = 0;
    let availablePromos = [];

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

    // --- Country population helpers (supports page & modal selectors) ---
    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, function (m) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
        });
    }

    async function loadCountryListIntoSelects() {
        // supports both page and modal selectors
        const selectorList = ['#countrySelect', '#modal_countrySelect'];
        const selects = selectorList.flatMap(sel => Array.from(document.querySelectorAll(sel)));
        if (!selects.length) return;

        let countries = [];

        // try local file first (user provided countries.json expected at /static/data/countries.json)
        try {
            const resLocal = await fetch('/static/data/countries.json', { cache: 'no-cache' });
            if (resLocal && resLocal.ok) {
                const js = await resLocal.json();
                if (Array.isArray(js) && js.length) {
                    countries = js.map(c => ({ name: c.name || c.label || '', code: c.code || c.iso || '' }))
                        .filter(c => c.name)
                        .sort((a, b) => a.name.localeCompare(b.name));
                }
            }
        } catch (e) {
            console.warn('Local countries.json fetch failed', e);
        }

        // fallback to restcountries if local not available
        if (!countries.length) {
            try {
                const res = await fetch('https://restcountries.com/v3.1/all');
                if (res && res.ok) {
                    const data = await res.json();
                    countries = data.map(c => {
                        const name = c && c.name && (c.name.common || c.name.official) ? (c.name.common || c.name.official) : '';
                        return { name: name || '', code: c.cca2 || c.cca3 || '' };
                    }).filter(c => c.name).sort((a, b) => a.name.localeCompare(b.name));
                }
            } catch (e) {
                console.warn('restcountries fetch failed', e);
            }
        }

        let optionsHtml = '<option value="">-- Select country --</option>';
        if (countries.length) {
            for (const c of countries) {
                const label = escapeHtml(c.name);
                optionsHtml += `<option value="${label}">${label}</option>`;
            }
        }
        optionsHtml += '<option value="OTHER">Other (enter manually)</option>';

        selects.forEach(s => {
            const prev = s.value || '';
            s.innerHTML = optionsHtml;
            if (prev) {
                try { s.value = prev; } catch (e) { /* ignore */ }
            }
            // set modal manual visibility if needed
            if (s.id === 'modal_countrySelect') {
                const manual = document.getElementById('modal_manualCountry');
                if (manual) manual.style.display = (s.value === 'OTHER') ? 'block' : 'none';
            } else {
                const manual = document.getElementById('manualCountry');
                if (manual) manual.style.display = (s.value === 'OTHER') ? 'block' : 'none';
            }
        });
    }

    function wireCountrySelectToggle() {
        document.addEventListener('change', function (ev) {
            const t = ev.target;
            if (!t) return;
            if (t.id === 'countrySelect' || t.id === 'modal_countrySelect') {
                if (t.id === 'modal_countrySelect') {
                    const manual = document.getElementById('modal_manualCountry');
                    if (!manual) return;
                    manual.style.display = (t.value === 'OTHER') ? 'block' : 'none';
                } else {
                    const manual = document.getElementById('manualCountry');
                    if (!manual) return;
                    manual.style.display = (t.value === 'OTHER') ? 'block' : 'none';
                }
            }
        }, { capture: true });
    }

    function getSelectedCountry(root) {
        // root may be modal root; support modal_* ids inside root
        const ctx = root && root.querySelector ? root : document;
        const modalSelect = ctx.querySelector('#modal_countrySelect');
        const modalInput = ctx.querySelector('#modal_countryInput');
        if (modalSelect) {
            if (modalSelect.value && modalSelect.value !== 'OTHER') return modalSelect.value;
            if (modalInput && modalInput.value) return modalInput.value.trim();
        }
        const pageSelect = ctx.querySelector('#countrySelect');
        const pageInput = ctx.querySelector('#countryInput');
        if (pageSelect) {
            if (pageSelect.value && pageSelect.value !== 'OTHER') return pageSelect.value;
            if (pageInput && pageInput.value) return pageInput.value.trim();
        }
        return '';
    }

    // --- Shipping autofill from stored payment details (sessionStorage) ---
    function parseStoredPaymentCustomer() {
        try {
            const raw = sessionStorage.getItem('paypal_customer');
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj || typeof obj !== 'object') return null;
            return obj;
        } catch (e) {
            return null;
        }
    }

    function fillFormWithStoredPayment(root) {
        const ctx = root && root.querySelector ? root : document;
        const stored = parseStoredPaymentCustomer();
        if (!stored) return false;
        try {
            // prefer modal fields inside provided root, fall back to page fields
            const nameEl = ctx.querySelector('#modal_customer') || ctx.querySelector('#customer') || document.querySelector('#customer');
            const emailEl = ctx.querySelector('#modal_email') || ctx.querySelector('#email') || document.querySelector('#email');
            const phoneEl = ctx.querySelector('#modal_phone') || ctx.querySelector('#phone') || document.querySelector('#phone');
            const addressEl = ctx.querySelector('#modal_address') || ctx.querySelector('#address') || document.querySelector('#address');

            if (stored.name && nameEl) nameEl.value = stored.name;
            if (stored.email && emailEl) emailEl.value = stored.email;
            if (stored.phone && phoneEl) phoneEl.value = stored.phone;
            if (stored.address && addressEl) addressEl.value = stored.address;

            // country handling: prefer modal select/input
            const mSelect = ctx.querySelector('#modal_countrySelect');
            const mInput = ctx.querySelector('#modal_countryInput');
            const pSelect = ctx.querySelector('#countrySelect');
            const pInput = ctx.querySelector('#countryInput');

            const countryVal = stored.country || '';
            if (mSelect) {
                const found = Array.from(mSelect.options).find(o => o.value.toLowerCase() === countryVal.toLowerCase());
                if (found) {
                    mSelect.value = found.value;
                    const manual = document.getElementById('modal_manualCountry');
                    if (manual) manual.style.display = 'none';
                } else if (mInput) {
                    mSelect.value = 'OTHER';
                    mInput.value = countryVal;
                    const manual = document.getElementById('modal_manualCountry');
                    if (manual) manual.style.display = 'block';
                }
            } else if (pSelect) {
                const found = Array.from(pSelect.options).find(o => o.value.toLowerCase() === countryVal.toLowerCase());
                if (found) {
                    pSelect.value = found.value;
                    const manual = document.getElementById('manualCountry');
                    if (manual) manual.style.display = 'none';
                } else if (pInput) {
                    pSelect.value = 'OTHER';
                    pInput.value = countryVal;
                    const manual = document.getElementById('manualCountry');
                    if (manual) manual.style.display = 'block';
                }
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function wireUsePaymentAddressToggle() {
        document.addEventListener('change', function (ev) {
            const t = ev.target;
            if (!t) return;
            if (t.id === 'usePaymentAddress') {
                const formRoot = t.closest('form') || (document.getElementById('checkoutModalContent') || document);
                if (t.checked) {
                    const ok = fillFormWithStoredPayment(formRoot);
                    if (!ok) {
                        const hint = formRoot.querySelector('#orderMsg') || document.getElementById('orderMsg');
                        if (hint) hint.innerHTML = '<div style="color:#c44;">No stored payment details found to auto-fill. Please enter address manually.</div>';
                        setTimeout(() => { try { t.checked = false; } catch (e) { } }, 80);
                    } else {
                        const hint = formRoot.querySelector('#orderMsg') || document.getElementById('orderMsg');
                        if (hint) hint.innerHTML = '<div style="color:#27ae60;">Shipping address filled from last payment details. Edit if necessary.</div>';
                    }
                } else {
                    const hint = formRoot.querySelector('#orderMsg') || document.getElementById('orderMsg');
                    if (hint) hint.innerHTML = '';
                }
            }
        }, { capture: true });
    }

    // --- Button state helper ---
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

    // Modify cart quantity helper (used by +/- buttons)
    function modifyCartQty(productId, delta) {
        try {
            const cart = getCart() || [];
            let changed = false;
            for (let i = 0; i < cart.length; i++) {
                const it = cart[i];
                const id = it.id || it.product_id || String(it.id || '');
                if (String(id) === String(productId)) {
                    let qty = parseInt(it.quantity || it.qty || 1, 10) || 1;
                    qty += delta;
                    if (qty <= 0) {
                        // remove item
                        cart.splice(i, 1);
                    } else {
                        it.quantity = qty;
                    }
                    changed = true;
                    break;
                }
            }
            if (changed) {
                saveCart(cart);
                renderCartSummary();
                updatePaymentButtonsStateCheckout();
            }
        } catch (e) {
            console.warn('modifyCartQty error', e);
        }
    }

    // delegate +/- clicks
    document.addEventListener('click', function (ev) {
        const plus = ev.target.closest && ev.target.closest('.qty-plus');
        if (plus) {
            const id = plus.getAttribute('data-id');
            modifyCartQty(id, +1);
            ev.preventDefault();
            return;
        }
        const minus = ev.target.closest && ev.target.closest('.qty-minus');
        if (minus) {
            const id = minus.getAttribute('data-id');
            modifyCartQty(id, -1);
            ev.preventDefault();
            return;
        }
    }, true);

    // renderCartSummary (now includes qty +/- controls and delivery fee)
    function renderCartSummary(containerEl) {
        let container = containerEl;
        if (!container) {
            container = document.getElementById('cartSummarySection') || document.getElementById('cartSection') || document.getElementById('cartModal') || document.getElementById('cartSummarySection');
        }

        if (!container) return;

        const isModal = !!container.closest && !!container.closest('#checkoutModalContent');

        const cart = getCart();
        if (!cart || !cart.length) {
            container.innerHTML = '<div class="empty-cart">Your cart is empty.</div>';
            updatePaymentButtonsStateCheckout();
            return;
        }

        // Build items list (for modal keep it short; for page use full table)
        let subtotal = 0;
        const itemsHtml = cart.map(item => {
            const qty = item.quantity || item.qty || 1;
            const price = parseFloat(item.price || 0);
            const itemTotal = price * qty;
            subtotal += itemTotal;

            const pid = (item.id || item.product_id || item.sku || item.code || '').toString();

            // plus (green) and minus (red) buttons: inline styles to avoid needing extra CSS files
            const minusBtn = `<button type="button" class="qty-minus" data-id="${escapeHtml(pid)}" aria-label="Decrease quantity" title="Decrease" style="background:#e74c3c;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-weight:700;margin-right:6px;">−</button>`;
            const plusBtn = `<button type="button" class="qty-plus" data-id="${escapeHtml(pid)}" aria-label="Increase quantity" title="Increase" style="background:#27ae60;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-weight:700;margin-left:6px;">+</button>`;

            if (isModal) {
                return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <img src="${toStaticUrl(item.image || item.image_url || '')}" alt="${escapeHtml(item.title || item.name || '')}" style="width:40px;height:40px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid #eee;">
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.95em">${escapeHtml(item.title || item.name || '')} <span class="small-muted" style="font-weight:400">x${qty}</span></div>
                        <div style="margin-top:6px;"><span>${minusBtn}<span style="font-weight:700;padding:0 6px;">${qty}</span>${plusBtn}</span></div>
                    </div>
                    <div style="font-weight:700;text-align:right;">${formatCurrency(itemTotal, 'GBP')}</div>
                </div>`;
            } else {
                return `<tr>
                    <td style="padding:8px 6px;">
                        <div style="display:flex;gap:8px;align-items:center;">
                            <img src="${toStaticUrl(item.image || item.image_url || '')}" alt="${escapeHtml(item.title || item.name || '')}" style="width:56px;height:56px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid #eee;">
                            <div>
                                <div style="font-weight:600">${escapeHtml(item.title || item.name || '')}</div>
                                <div class="small-muted" style="font-size:13px">${escapeHtml(item.brand || '')}</div>
                                <div style="margin-top:6px;">${minusBtn}<span style="font-weight:700;padding:0 6px;">${qty}</span>${plusBtn}</div>
                            </div>
                        </div>
                    </td>
                    <td style="text-align:center;">${qty}</td>
                    <td style="text-align:right;">${formatCurrency(itemTotal, 'GBP')} <div class="small-muted" style="display:inline-block;margin-left:8px;">(${formatCurrency(itemTotal, 'USD')})</div></td>
                </tr>`;
            }
        }).join('');

        // compute discounts
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

        // delivery fee: defined as USD (DELIVERY_FEE_USD); compute GBP equivalent (primary display)
        const rate = fxRateGBPtoUSD || 1.25;
        const deliveryFeeGBP = parseFloat((DELIVERY_FEE_USD / rate).toFixed(2));
        const deliveryFee = deliveryFeeGBP; // in GBP for totals
        const finalTotal = parseFloat((discountedTotal + deliveryFee).toFixed(2));

        // Render differently for modal vs page
        if (isModal) {
            // compact modal layout
            const html = `
                <div style="max-height:220px; overflow:auto; padding-bottom:6px;">${itemsHtml}</div>

                <!-- inline totals row: subtotal / discount / delivery / total all on a single horizontal line -->
                <div class="totals-inline" style="display:flex;gap:8px;align-items:center;margin-top:8px;overflow-x:auto;padding-top:6px;border-top:1px dashed #eee;">
                    <div class="totals-item"><div class="small-muted">Subtotal</div><div style="font-weight:700;">${formatCurrency(subtotal, 'GBP')}<span class="small-muted" style="display:block;font-weight:400">(${formatCurrency(subtotal, 'USD')})</span></div></div>
                    ${globalPercent > 0 ? `<div class="totals-item"><div class="small-muted">Auto Discount (${globalPercent}%)</div><div style="font-weight:700;color:#b8860b;">-${formatCurrency(subtotal * (globalPercent / 100), 'GBP')}</div></div>` : ''}
                    ${promoPercent > 0 ? `<div class="totals-item"><div class="small-muted">Promo (${promoPercent}%)</div><div style="font-weight:700;color:#b8860b;">-${formatCurrency(subtotal * (promoPercent / 100), 'GBP')}</div></div>` : ''}
                    <div class="totals-item"><div class="small-muted">Delivery</div><div style="font-weight:700;color:#27ae60;">${formatCurrency(deliveryFee, 'GBP')} <span class="small-muted" style="display:block;font-weight:400">(${formatCurrency(deliveryFee, 'USD')})</span></div></div>
                    <div class="totals-item total" style="margin-left:8px;border-left:1px solid #eee;padding-left:8px;"><div class="small-muted">Total</div><div style="font-weight:900;color:#27ae60;">${formatCurrency(finalTotal, 'GBP')} <span class="small-muted" style="display:block;font-weight:400">(${formatCurrency(finalTotal, 'USD')})</span></div></div>
                </div>
            `;
            container.innerHTML = html;
        } else {
            // full page table style
            let rows = itemsHtml;
            const html = `<table>
                <thead><tr><th>Product</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Total</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr class="total-row"><td></td><td style="font-weight:700;">Subtotal</td><td style="text-align:right;font-weight:700;">${formatCurrency(subtotal, 'GBP')} (${formatCurrency(subtotal, 'USD')})</td></tr>
                    ${globalPercent > 0 ? `<tr class="total-row"><td></td><td style="font-weight:700;color:#b8860b;">Auto Discount (${globalPercent}%)</td><td style="text-align:right;color:#b8860b;">-${formatCurrency(subtotal * (globalPercent / 100), 'GBP')} (${formatCurrency(subtotal * (globalPercent / 100), 'USD')})</td></tr>` : ''}
                    ${promoPercent > 0 ? `<tr class="total-row"><td></td><td style="font-weight:700;color:#b8860b;">Promo (${promoPercent}%)</td><td style="text-align:right;color:#b8860b;">-${formatCurrency(subtotal * (promoPercent / 100), 'GBP')} (${formatCurrency(subtotal * (promoPercent / 100), 'USD')})</td></tr>` : ''}
                    <tr class="total-row"><td></td><td style="font-weight:700;">Delivery Fee</td><td style="text-align:right;color:#27ae60;font-weight:700;">${formatCurrency(deliveryFee, 'GBP')} (${formatCurrency(deliveryFee, 'USD')})</td></tr>
                    <tr class="total-row"><td></td><td style="font-weight:700;">Total (after discount + delivery)</td><td style="text-align:right;color:#27ae60;font-weight:700;">${formatCurrency(finalTotal, 'GBP')} (${formatCurrency(finalTotal, 'USD')})</td></tr>
                </tfoot>
            </table>`;
            container.innerHTML = html;
        }

        updatePaymentButtonsStateCheckout();
    }

    // submitOrders uses CSRF & idempotency headers, and supports modal-scoped country selection
    async function submitOrders(customer, email, phone, address, payment_method, promo_code, date, rootForCountry) {
        const cart = getCart();
        if (!cart || !cart.length) return { success: false, message: 'Cart empty' };

        let country = '';
        if (rootForCountry && rootForCountry.querySelector) {
            country = getSelectedCountry(rootForCountry);
        } else {
            country = getSelectedCountry();
        }

        const csrf = getCsrfToken();
        const idemp = getIdempotencyKey();

        const results = [];
        for (const item of cart) {
            const payload = {
                customer_name: customer,
                customer_email: email,
                customer_phone: phone,
                customer_address: address,
                customer_country: country || '',
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
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": csrf,
                        "X-Idempotency-Key": idemp
                    },
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
        const csrf = getCsrfToken();
        for (const item of cart) {
            try {
                await fetch(`${API}/order-attempts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
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

    // Initialize modal-specific wiring
    function initCheckoutModal() {
        try {
            const modalRoot = document.getElementById('checkoutModalContent');
            if (!modalRoot) return;

            // set manual country visibility for modal
            const modalCountry = modalRoot.querySelector('#modal_countrySelect');
            if (modalCountry) {
                const manual = modalRoot.querySelector('#modal_manualCountry') || document.getElementById('modal_manualCountry');
                if (manual) manual.style.display = (modalCountry.value === 'OTHER') ? 'block' : 'none';
            }

            // render cart in modal
            const cartSection = modalRoot.querySelector('#cartSection');
            if (cartSection) renderCartSummary(cartSection);
            else {
                const fallback = document.getElementById('cartSection');
                if (fallback) renderCartSummary(fallback);
            }
        } catch (e) {
            console.warn('initCheckoutModal error', e);
        }
    }

    function observeModalInsertion() {
        try {
            const body = document.body;
            if (!body) return;
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.addedNodes && m.addedNodes.length) {
                        for (const node of m.addedNodes) {
                            if (node && node.querySelector && node.querySelector('#checkoutModalContent')) {
                                setTimeout(initCheckoutModal, 80);
                                return;
                            }
                            if (node && node.id === 'checkoutModalContent') {
                                setTimeout(initCheckoutModal, 80);
                                return;
                            }
                        }
                    }
                }
            });
            observer.observe(body, { childList: true, subtree: true });
        } catch (e) {
            // ignore
        }
    }

    // DOMContentLoaded init
    document.addEventListener('DOMContentLoaded', async function () {
        await fetchFX();
        await fetchDiscountPercent();
        await loadActivePromos();

        // Countries (page + modal)
        try { await loadCountryListIntoSelects(); } catch (e) { /* ignore */ }
        wireCountrySelectToggle();
        wireUsePaymentAddressToggle();

        renderCartSummary();
        updatePaymentButtonsStateCheckout();

        initCheckoutModal();
        observeModalInsertion();

        // watch for modal visibility changes
        const checkoutBg = document.getElementById('checkoutModalBg');
        if (checkoutBg) {
            try {
                const bgObserver = new MutationObserver(function (mutations) {
                    for (const m of mutations) {
                        if (m.type === 'attributes' && (m.attributeName === 'aria-hidden' || m.attributeName === 'style')) {
                            const hidden = checkoutBg.getAttribute('aria-hidden');
                            const isVisible = (hidden === 'false') || (checkoutBg.style && checkoutBg.style.display && checkoutBg.style.display !== 'none');
                            if (isVisible) {
                                setTimeout(initCheckoutModal, 80);
                            }
                        }
                    }
                });
                bgObserver.observe(checkoutBg, { attributes: true, attributeFilter: ['aria-hidden', 'style'] });
            } catch (e) {
                // graceful fallback
            }
        }

        // delegate to init modal when buy buttons open it
        document.addEventListener('click', function (ev) {
            const trigger = ev.target.closest && ev.target.closest('[data-open-checkout], .buy-now, .open-checkout-modal, [data-action="open-checkout"], .product-buy-now');
            if (trigger) {
                setTimeout(initCheckoutModal, 120);
            }
        });

        // PayPal buttons rendering for page & modal
        try {
            if (window.paypal && document.querySelector('#paypal-button-container')) {
                const container = document.querySelector('#paypal-button-container');
                if (!container.innerHTML.trim() && typeof renderPayPalButtons === 'function') {
                    renderPayPalButtons('#paypal-button-container', { currency: 'USD', successUrl: '/' });
                }
            }
            if (window.paypal && document.querySelector('#modal_paypal_button_container')) {
                const container = document.querySelector('#modal_paypal_button_container');
                if (!container.innerHTML.trim() && typeof renderPayPalButtons === 'function') {
                    renderPayPalButtons('#modal_paypal_button_container', { currency: 'USD', successUrl: '/' });
                }
            }
        } catch (err) {
            console.warn('PayPal render failed on init', err);
        }

        // Form wiring (handles page + modal since we use root scoping)
        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', async function (e) {
                e.preventDefault();

                // find which form context (modal or page)
                const formRoot = orderForm.closest('#checkoutModalContent') || document;

                // prefer modal_* fields inside modal context
                const customer = (formRoot.querySelector('#modal_customer')?.value || formRoot.querySelector('#customer')?.value || document.getElementById('customer')?.value || '');
                const email = (formRoot.querySelector('#modal_email')?.value || formRoot.querySelector('#email')?.value || document.getElementById('email')?.value || '');
                const phone = (formRoot.querySelector('#modal_phone')?.value || formRoot.querySelector('#phone')?.value || document.getElementById('phone')?.value || '');
                const address = (formRoot.querySelector('#modal_address')?.value || formRoot.querySelector('#address')?.value || document.getElementById('address')?.value || '');
                const payment_method = formRoot.querySelector('#paymentSelect')?.value || document.getElementById('paymentSelect')?.value || 'Cash on Delivery';
                const promo_code = document.getElementById('promo_code_summary')?.value || document.getElementById('promo_code_hidden')?.value || null;
                const dateVal = formRoot.querySelector('#date')?.value || document.getElementById('date')?.value || new Date().toISOString().slice(0, 19).replace('T', ' ');

                // Basic validation: require country
                let country = getSelectedCountry(formRoot !== document ? formRoot : null);
                const orderMsg = formRoot.querySelector('#orderMsg') || document.getElementById('orderMsg');
                if (!country) {
                    if (orderMsg) orderMsg.innerHTML = '<div style="color:#c44;">Please provide a country for shipping (select or enter manually).</div>';
                    return;
                }

                if (orderMsg) orderMsg.innerHTML = '<span class="small-muted">Placing your order...</span>';
                setButtonState(document.getElementById('checkoutBtn'), false);
                setButtonState(document.getElementById('buyNowBtn'), false);

                await logOrderAttemptsForCart('CheckedOut');

                const results = await submitOrders(customer, email, phone, address, payment_method, promo_code, dateVal, formRoot !== document ? formRoot : null);

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

        // Buy Now / card flow wiring
        const buyNowBtn = document.getElementById('buyNowBtn');
        if (buyNowBtn) {
            buyNowBtn.addEventListener('click', async function () {
                const formRoot = buyNowBtn.closest('#checkoutModalContent') || document;
                const customer = formRoot.querySelector('#modal_customer')?.value || formRoot.querySelector('#customer')?.value || document.getElementById('customer')?.value || '';
                const email = formRoot.querySelector('#modal_email')?.value || formRoot.querySelector('#email')?.value || document.getElementById('email')?.value || '';
                const phone = formRoot.querySelector('#modal_phone')?.value || formRoot.querySelector('#phone')?.value || document.getElementById('phone')?.value || '';
                const address = formRoot.querySelector('#modal_address')?.value || formRoot.querySelector('#address')?.value || document.getElementById('address')?.value || '';
                const promo_code = document.getElementById('promo_code_summary')?.value || document.getElementById('promo_code_hidden')?.value || null;
                const dateVal = formRoot.querySelector('#date')?.value || document.getElementById('date')?.value || new Date().toISOString().slice(0, 19).replace('T', ' ');

                const orderMsg = document.getElementById('orderMsg');
                if (orderMsg) orderMsg.innerHTML = '<span class="small-muted">Processing payment and placing your order...</span>';
                setButtonState(document.getElementById('checkoutBtn'), false);
                setButtonState(document.getElementById('buyNowBtn'), false);

                await logOrderAttemptsForCart('CheckedOut');

                // prefer modal-scoped country
                const modalRoot = document.getElementById('checkoutModalContent');
                let country = '';
                if (modalRoot) country = getSelectedCountry(modalRoot);
                else country = getSelectedCountry();
                const customerObj = { name: customer, email: email, phone: phone, address: address, country: country };
                try { sessionStorage.setItem('paypal_customer', JSON.stringify(customerObj)); } catch (e) { /* ignore */ }

                const cartItems = getCart() || [];
                const itemsForServer = cartItems.map(i => ({
                    id: i.id || i.product_id || '',
                    title: i.title || i.name || '',
                    unit_price: parseFloat(i.price || 0),
                    quantity: parseInt(i.quantity || i.qty || 1, 10),
                    currency: 'USD'
                }));
                try { sessionStorage.setItem('paypal_items', JSON.stringify(itemsForServer)); } catch (e) { /* ignore */ }

                if (typeof window.initiateCardCheckout === 'function') {
                    try {
                        await window.initiateCardCheckout(itemsForServer, { currency: 'USD', returnUrl: window.location.origin + '/paypal/return' });
                    } catch (err) {
                        console.error('initiateCardCheckout error', err);
                        const detail = (err && err.message) ? err.message : String(err);
                        if (detail.toLowerCase().includes('401') || detail.toLowerCase().includes('unauthorized')) {
                            if (orderMsg) orderMsg.innerHTML = `<div style="color:#e74c3c;font-weight:700;">Payment provider credentials appear missing or invalid on the server.</div>
                            <div style="color:#666;margin-top:8px;">Please ensure PAYPAL_CLIENT_ID and PAYPAL_SECRET are set as environment variables on the server (use sandbox values for development), and restart the application.</div>
                            <div style="color:#666;margin-top:8px;font-size:0.9em;">Server error details: ${escapeHtml(detail)}</div>`;
                        } else {
                            if (orderMsg) orderMsg.innerHTML = `<div style="color:#e74c3c;font-weight:700;">Failed to start card (PayPal) checkout.</div><div style="color:#666;margin-top:8px;font-size:0.9em;">${escapeHtml(detail)}</div>`;
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

        // payment select change binding
        const paymentSelect = document.getElementById('paymentSelect');
        if (paymentSelect) paymentSelect.addEventListener('change', updatePaymentButtonsStateCheckout);

        // periodic refresh
        setInterval(async () => {
            const prev = checkoutDiscountPercent;
            await fetchDiscountPercent();
            await loadActivePromos();
            if (prev !== checkoutDiscountPercent) renderCartSummary();
            await fetchFX();
            renderCartSummary();
        }, 30000);
    });

    // expose utilities
    window.__checkout = {
        renderCartSummary,
        fetchDiscountPercent,
        loadActivePromos,
        fetchFX,
        getCart,
        getSelectedCountry,
        fillFormWithStoredPayment,
        initCheckoutModal
    };

})();