// Checkout page JS (modularized). This file must be served as a static file (no Jinja here).
// The template injects window.PLACEHOLDER_IMAGE for the placeholder image path.
//
// NOTE: This version adds:
// - modal-scoped wiring for country/city controls so they appear and work inside the homepage "Buy Now" modal
// - a compact single-line totals layout for modal (to save vertical space)
// - initCheckoutModal() that initializes delivery providers, wiring and renders the cart inside the modal
// - a click-delegation + mutation-observer approach to ensure modal contents are initialized when opened

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

    // Delivery options (fees in GBP). Provider logos use placeholder unless real assets provided.
    const DELIVERY_OPTIONS = [
        // note: relative paths (no leading slash) will be converted to /static/... by toStaticUrl()
        { id: 'aramex_std', provider: 'Aramex', providerUrl: 'https://www.aramex.com', label: 'Standard (3-5 days)', fee: 3, logo: 'images/logos/aramex.png' },
        { id: 'dhl_express', provider: 'DHL', providerUrl: 'https://www.dhl.com', label: 'Express (1-2 days)', fee: 7, logo: 'images/logos/dhl.png' },
        { id: 'fetchr_priority', provider: 'Fetchr', providerUrl: 'https://www.fetchr.us', label: 'Priority (1 day)', fee: 10, logo: 'images/logos/fetchr.png' },
        { id: 'emirates_economy', provider: 'Emirates Post', providerUrl: 'https://www.emiratespost.ae', label: 'Economy (5-7 days)', fee: 2, logo: 'images/logos/emirates.png' }
    ];

    // persist selected delivery in localStorage
    const DELIVERY_STORAGE_KEY = 'selected_delivery_option';
    let selectedDeliveryId = (localStorage.getItem(DELIVERY_STORAGE_KEY) || (DELIVERY_OPTIONS[0] && DELIVERY_OPTIONS[0].id));

    function getSelectedDeliveryOption() {
        let opt = DELIVERY_OPTIONS.find(o => o.id === selectedDeliveryId);
        if (!opt) {
            opt = DELIVERY_OPTIONS[0] || { id: '', fee: 0, provider: '', providerUrl: '', label: '' };
            selectedDeliveryId = opt.id;
        }
        return opt;
    }

    function setSelectedDeliveryId(id) {
        selectedDeliveryId = id;
        try { localStorage.setItem(DELIVERY_STORAGE_KEY, id); } catch (e) { /* ignore */ }
        // update hidden fields in any context (checkout page + modal)
        const hiddenMain = document.getElementById('selectedDeliveryId');
        if (hiddenMain) hiddenMain.value = id;
        const hiddenModal = document.getElementById('selectedDeliveryIdModal');
        if (hiddenModal) hiddenModal.value = id;

        // toggle active classes across all rendered provider containers
        document.querySelectorAll('.delivery-card').forEach(card => {
            if (card.dataset && card.dataset.id === id) {
                card.classList.add('active');
                const radio = card.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;
            } else {
                card.classList.remove('active');
                const radio = card.querySelector('input[type="radio"]');
                if (radio) radio.checked = false;
            }
        });

        renderCartSummary(); // refresh totals everywhere
    }

    // render into the provided container element; if none provided, default to '#deliveryProviders'
    function renderDeliveryProviders(containerEl) {
        const container = containerEl || document.getElementById('deliveryProviders');
        if (!container) return;
        const placeholder = window.PLACEHOLDER_IMAGE || '/static/images/placeholder.jpg';
        container.innerHTML = '';
        DELIVERY_OPTIONS.forEach(opt => {
            const card = document.createElement('div');
            card.className = 'delivery-card' + (opt.id === selectedDeliveryId ? ' active' : '');
            card.setAttribute('role', 'listitem');
            card.setAttribute('tabindex', '0');
            card.dataset.id = opt.id;

            const chooseWrap = document.createElement('div');
            chooseWrap.className = 'choose';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'delivery_option_select';
            radio.value = opt.id;
            radio.checked = (opt.id === selectedDeliveryId);
            radio.addEventListener('change', function (e) {
                setSelectedDeliveryId(this.value);
            });
            chooseWrap.appendChild(radio);

            const logoImg = document.createElement('img');
            // Use toStaticUrl so relative paths like "images/logos/dhl.png" become "/static/images/logos/dhl.png"
            // toStaticUrl will return the placeholder if opt.logo is falsy
            logoImg.src = toStaticUrl(opt.logo);
            logoImg.alt = opt.provider;

            const providerName = document.createElement('div');
            providerName.className = 'provider-name';
            providerName.innerText = opt.provider;

            const dlabel = document.createElement('div');
            dlabel.className = 'delivery-label';
            dlabel.innerText = opt.label;

            const fee = document.createElement('div');
            fee.className = 'fee';
            fee.innerText = formatCurrency(opt.fee, 'GBP');

            logoImg.addEventListener('click', (ev) => {
                ev.stopPropagation();
                window.open(opt.providerUrl, '_blank', 'noopener');
            });
            providerName.addEventListener('click', (ev) => {
                ev.stopPropagation();
                window.open(opt.providerUrl, '_blank', 'noopener');
            });

            card.addEventListener('click', function (ev) {
                setSelectedDeliveryId(opt.id);
            });

            card.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    setSelectedDeliveryId(opt.id);
                }
            });

            card.appendChild(chooseWrap);
            card.appendChild(logoImg);
            card.appendChild(providerName);
            card.appendChild(dlabel);
            card.appendChild(fee);

            // tag card with id so setSelectedDeliveryId toggles it later across contexts
            card.dataset.id = opt.id;

            container.appendChild(card);
        });

        // ensure hidden fields reflect selection
        const hiddenMain = document.getElementById('selectedDeliveryId');
        if (hiddenMain) hiddenMain.value = selectedDeliveryId || '';
        const hiddenModal = document.getElementById('selectedDeliveryIdModal');
        if (hiddenModal) hiddenModal.value = selectedDeliveryId || '';
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

    // renderCartSummary optionally scoped to a container (page or modal)
    // if containerEl is inside the modal (checkout modal), a compact inline totals row is used
    function renderCartSummary(containerEl) {
        // determine target container for list and totals
        // prefer explicit containerEl, else choose best-known targets
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
            if (isModal) {
                // compact item row for modal: icon + title x qty + small total
                return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <img src="${toStaticUrl(item.image || item.image_url || '')}" alt="${item.title || ''}" style="width:40px;height:40px;object-fit:contain;border-radius:6px;background:#fff;border:1px solid #eee;">
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.95em">${item.title || item.name || ''} <span class="small-muted" style="font-weight:400">x${qty}</span></div>
                    </div>
                    <div style="font-weight:700;text-align:right;">${formatCurrency(itemTotal, 'GBP')}</div>
                </div>`;
            } else {
                return `<tr>
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
            }
        }).join('');

        // compute discounts and delivery
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

        const deliveryOption = getSelectedDeliveryOption();
        const deliveryFee = Number(deliveryOption.fee || 0);
        const finalTotal = discountedTotal + deliveryFee;

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
                    <div class="totals-item"><div class="small-muted">Delivery (${deliveryOption.provider})</div><div style="font-weight:700;color:#27ae60;">${formatCurrency(deliveryFee, 'GBP')}</div></div>
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
                    <tr class="total-row"><td></td><td style="font-weight:700;">Delivery Fee <span class="small-muted" style="font-weight:400;">(${deliveryOption.provider})</span></td><td style="text-align:right;color:#27ae60;font-weight:700;">${formatCurrency(deliveryFee, 'GBP')} (${formatCurrency(deliveryFee, 'USD')})</td></tr>
                    <tr class="total-row"><td></td><td style="font-weight:700;">Total (after discount + delivery)</td><td style="text-align:right;color:#27ae60;font-weight:700;">${formatCurrency(finalTotal, 'GBP')} (${formatCurrency(finalTotal, 'USD')})</td></tr>
                </tfoot>
            </table>`;
            container.innerHTML = html;
        }

        updatePaymentButtonsStateCheckout();
    }

    // COUNTRY / CITY logic (page-global handlers remain). We also provide modal-scoped handlers below.

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

    // Scoped country/city handlers for modal (operate only within provided root)
    function showManualCountryCityScoped(root, show, hideCountryInput = false) {
        const manual = root.querySelector('#manualCountryCity');
        const cityContainer = root.querySelector('#citySelectContainer');
        const citySelect = root.querySelector('#citySelect');
        const countryInput = root.querySelector('#countryInput');
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

    function showCitySelectWithScoped(root, list) {
        const cityContainer = root.querySelector('#citySelectContainer');
        const citySelect = root.querySelector('#citySelect');
        if (!cityContainer || !citySelect) return;
        let html = '<option value="">-- Select city --</option>';
        list.forEach(c => { html += `<option value="${c}">${c}</option>`; });
        html += '<option value="OTHER_CITY">Other (enter manually)</option>';
        citySelect.innerHTML = html;
        cityContainer.style.display = 'block';
        cityContainer.setAttribute('aria-hidden', 'false');
        const manual = root.querySelector('#manualCountryCity');
        if (manual) manual.style.display = 'none';
    }

    function handleCountryChangeScoped(root) {
        const countrySelect = root.querySelector('#countrySelect');
        if (!countrySelect) return;
        const val = countrySelect.value || '';
        const countryInput = root.querySelector('#countryInput');
        const cityInput = root.querySelector('#cityInput');
        const citySelect = root.querySelector('#citySelect');

        if (!val || val === 'OTHER') {
            showManualCountryCityScoped(root, true, false);
            if (countryInput) countryInput.value = '';
            if (cityInput) cityInput.value = '';
            return;
        }

        if (countryInput) countryInput.value = '';

        if (COUNTRIES_CITY_MAP.hasOwnProperty(val)) {
            showCitySelectWithScoped(root, COUNTRIES_CITY_MAP[val]);
            return;
        }

        showManualCountryCityScoped(root, true, true);
    }

    function handleCitySelectChangeScoped(root) {
        const citySelect = root.querySelector('#citySelect');
        const manual = root.querySelector('#manualCountryCity');
        if (!citySelect || !manual) return;
        if (citySelect.value === 'OTHER_CITY') {
            manual.style.display = 'block';
            const countryInput = root.querySelector('#countryInput');
            if (countryInput) countryInput.style.display = 'none';
        } else {
            const countrySelect = root.querySelector('#countrySelect');
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

        const cityContainer = document.getElementById('citySelectContainer');
        if (cityContainer && cityContainer.style.display !== 'none' && citySelect && citySelect.value && citySelect.value !== 'OTHER_CITY') {
            city = citySelect.value;
        } else if (cityInput && cityInput.value) {
            city = cityInput.value.trim();
        }

        return { country, city };
    }

    // getSelectedCountryAndCityScoped for modal root (if present)
    function getSelectedCountryAndCityScoped(root) {
        const countrySelect = root.querySelector('#countrySelect');
        const countryInput = root.querySelector('#countryInput');
        const citySelect = root.querySelector('#citySelect');
        const cityInput = root.querySelector('#cityInput');

        let country = '';
        let city = '';

        if (countrySelect && countrySelect.value && countrySelect.value !== 'OTHER') {
            country = countrySelect.value;
        } else if (countryInput && countryInput.value) {
            country = countryInput.value.trim();
        }

        const cityContainer = root.querySelector('#citySelectContainer');
        if (cityContainer && cityContainer.style.display !== 'none' && citySelect && citySelect.value && citySelect.value !== 'OTHER_CITY') {
            city = citySelect.value;
        } else if (cityInput && cityInput.value) {
            city = cityInput.value.trim();
        }

        return { country, city };
    }

    async function submitOrders(customer, email, phone, address, payment_method, promo_code, date, rootForCountryCity) {
        const cart = getCart();
        if (!cart || !cart.length) return { success: false, message: 'Cart empty' };

        // prefer scoped country/city if root provided (modal)
        let countryCity = { country: '', city: '' };
        if (rootForCountryCity && rootForCountryCity.querySelector) {
            countryCity = getSelectedCountryAndCityScoped(rootForCountryCity);
        } else {
            countryCity = getSelectedCountryAndCity();
        }

        const deliveryOption = getSelectedDeliveryOption();

        const results = [];
        for (const item of cart) {
            const payload = {
                customer_name: customer,
                customer_email: email,
                customer_phone: phone,
                customer_address: address,
                customer_country: countryCity.country || '',
                customer_city: countryCity.city || '',
                product_id: item.id || item.product_id || '',
                product_title: item.title || item.name || '',
                quantity: item.quantity || item.qty || 1,
                status: "Pending",
                payment_method: payment_method || "Cash on Delivery",
                date: date || (new Date().toISOString().slice(0, 19).replace('T', ' '))
            };
            if (promo_code) payload.promo_code = promo_code;

            // include delivery info in payload
            if (deliveryOption && deliveryOption.id) {
                payload.delivery_option_id = deliveryOption.id;
                payload.delivery_provider = deliveryOption.provider;
                payload.delivery_fee = Number(deliveryOption.fee || 0);
            }

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

    // Initialize delivery providers + country/city wiring inside the checkout modal (if present).
    // Accepts either the modal root element or uses document to find known modal areas.
    function initCheckoutModal() {
        try {
            const modalRoot = document.getElementById('checkoutModalContent');
            if (!modalRoot) return;

            // Render providers into the modal container if present
            const modalProviders = modalRoot.querySelector('#deliveryProvidersModal');
            if (modalProviders) renderDeliveryProviders(modalProviders);

            // Wire modal-specific country/city selectors if present (scoped)
            const modalCountry = modalRoot.querySelector('#countrySelect');
            const modalCity = modalRoot.querySelector('#citySelect');
            const modalManual = modalRoot.querySelector('#manualCountryCity');

            if (modalCountry) {
                // remove previous listener safely (if any) then add scoped listener
                modalCountry.removeEventListener('change', modalCountry.__scopedChangeHandler);
                modalCountry.__scopedChangeHandler = function () { handleCountryChangeScoped(modalRoot); };
                modalCountry.addEventListener('change', modalCountry.__scopedChangeHandler);
            }
            if (modalCity) {
                modalCity.removeEventListener('change', modalCity.__scopedChangeHandler);
                modalCity.__scopedChangeHandler = function () { handleCitySelectChangeScoped(modalRoot); };
                modalCity.addEventListener('change', modalCity.__scopedChangeHandler);
            }

            // set initial visibility/state according to current values
            if (modalCountry) handleCountryChangeScoped(modalRoot);
            if (modalCity) handleCitySelectChangeScoped(modalRoot);

            // ensure promo hidden field exists in modal, and selectedDeliveryIdModal is set
            const hiddenModal = modalRoot.querySelector('#selectedDeliveryIdModal');
            if (hiddenModal) hiddenModal.value = selectedDeliveryId || '';

            // update cart summary in modal (renderCartSummary with modal cartSection)
            const cartSection = modalRoot.querySelector('#cartSection');
            if (cartSection) renderCartSummary(cartSection);
            else {
                // fallback: there may be an element with id cartSection at document level used by modal
                const fallback = document.getElementById('cartSection');
                if (fallback) renderCartSummary(fallback);
            }
        } catch (e) {
            // don't let modal init errors break other scripts
            console.warn('initCheckoutModal error', e);
        }
    }

    // Observe for modal insertion (handles dynamic modal markup insertion)
    function observeModalInsertion() {
        try {
            const body = document.body;
            if (!body) return;
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.addedNodes && m.addedNodes.length) {
                        for (const node of m.addedNodes) {
                            if (node && node.querySelector && node.querySelector('#checkoutModalContent')) {
                                // small timeout to allow other handlers to complete
                                setTimeout(initCheckoutModal, 80);
                                return;
                            }
                            // If the checkout modal root itself was added:
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

    document.addEventListener('DOMContentLoaded', async function () {
        // Ensure discount + promos + FX loaded before first render so totals reflect them
        await fetchDiscountPercent();
        await loadActivePromos();
        await fetchFX();

        // Render providers on the checkout page and attempt to render into modal if already present
        renderDeliveryProviders(document.getElementById('deliveryProviders'));
        renderDeliveryProviders(document.getElementById('deliveryProvidersModal'));

        renderCartSummary();
        updatePaymentButtonsStateCheckout();

        // Wire page-global country/city event listeners (checkout page fields)
        const countrySelect = document.getElementById('countrySelect');
        const citySelect = document.getElementById('citySelect');
        if (countrySelect) {
            countrySelect.removeEventListener('change', handleCountryChange);
            countrySelect.addEventListener('change', handleCountryChange);
            // ensure initial state for page
            handleCountryChange();
        }
        if (citySelect) {
            citySelect.removeEventListener('change', handleCitySelectChange);
            citySelect.addEventListener('change', handleCitySelectChange);
        }

        // attempt to initialize modal if already present
        initCheckoutModal();

        // Observe modal insertion so dynamic modal markup is initialized
        observeModalInsertion();

        // Also watch for changes to checkoutModalBg visibility attributes (aria-hidden/style)
        const checkoutBg = document.getElementById('checkoutModalBg');
        if (checkoutBg) {
            try {
                const bgObserver = new MutationObserver(function (mutations) {
                    for (const m of mutations) {
                        if (m.type === 'attributes' && (m.attributeName === 'aria-hidden' || m.attributeName === 'style')) {
                            const hidden = checkoutBg.getAttribute('aria-hidden');
                            const isVisible = (hidden === 'false') || (checkoutBg.style && checkoutBg.style.display && checkoutBg.style.display !== 'none');
                            if (isVisible) {
                                // modal shown
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

        // Fallback: many product "Buy Now" buttons open modal via clicks — add delegated listener so we initialize modal when user clicks such buttons.
        document.addEventListener('click', function (ev) {
            // common selectors used by the app might include data attributes or classes like 'buy-now', 'open-checkout-modal'
            const trigger = ev.target.closest('[data-open-checkout], .buy-now, .open-checkout-modal, [data-action="open-checkout"], .product-buy-now');
            if (trigger) {
                // small timeout to allow other modal-opening handlers to run and insert modal DOM
                setTimeout(initCheckoutModal, 120);
            }
        });

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

        // Wire up form events (works both for page and modal since IDs are reused)
        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', async function (e) {
                e.preventDefault();

                // if the order form is inside the modal we might want to prefer modal-scoped country/city
                const formRoot = orderForm.closest('#checkoutModalContent') || document;

                const customer = formRoot.querySelector('#customer')?.value || document.getElementById('customer')?.value || '';
                const email = formRoot.querySelector('#email')?.value || document.getElementById('email')?.value || '';
                const phone = formRoot.querySelector('#phone')?.value || document.getElementById('phone')?.value || '';
                const address = formRoot.querySelector('#address')?.value || document.getElementById('address')?.value || '';
                const payment_method = formRoot.querySelector('#paymentSelect')?.value || document.getElementById('paymentSelect')?.value || 'Cash on Delivery';
                const promo_code = document.getElementById('promo_code_summary')?.value || document.getElementById('promo_code_hidden')?.value || null;
                const dateVal = formRoot.querySelector('#date')?.value || document.getElementById('date')?.value || new Date().toISOString().slice(0, 19).replace('T', ' ');

                // Basic validation: require country (either selected or manual)
                let countryCity = { country: '', city: '' };
                if (formRoot !== document) {
                    countryCity = getSelectedCountryAndCityScoped(formRoot);
                } else {
                    countryCity = getSelectedCountryAndCity();
                }
                const orderMsg = formRoot.querySelector('#orderMsg') || document.getElementById('orderMsg');
                if (!countryCity.country) {
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

        // Buy Now / card flow
        const buyNowBtn = document.getElementById('buyNowBtn');
        if (buyNowBtn) {
            buyNowBtn.addEventListener('click', async function () {
                // gather same data and store for PayPal return flow
                const formRoot = buyNowBtn.closest('#checkoutModalContent') || document;
                const customer = formRoot.querySelector('#customer')?.value || document.getElementById('customer')?.value || '';
                const email = formRoot.querySelector('#email')?.value || document.getElementById('email')?.value || '';
                const phone = formRoot.querySelector('#phone')?.value || document.getElementById('phone')?.value || '';
                const address = formRoot.querySelector('#address')?.value || document.getElementById('address')?.value || '';
                const promo_code = document.getElementById('promo_code_summary')?.value || document.getElementById('promo_code_hidden')?.value || null;
                const dateVal = formRoot.querySelector('#date')?.value || document.getElementById('date')?.value || new Date().toISOString().slice(0, 19).replace('T', ' ');

                const orderMsg = document.getElementById('orderMsg');
                if (orderMsg) orderMsg.innerHTML = '<span class="small-muted">Processing payment and placing your order...</span>';
                setButtonState(document.getElementById('checkoutBtn'), false);
                setButtonState(document.getElementById('buyNowBtn'), false);

                await logOrderAttemptsForCart('CheckedOut');

                // prefer scoped country/city if modal exists
                const modalRoot = document.getElementById('checkoutModalContent');
                let countryCity = { country: '', city: '' };
                if (modalRoot) countryCity = getSelectedCountryAndCityScoped(modalRoot);
                else countryCity = getSelectedCountryAndCity();
                const customerObj = { name: customer, email: email, phone: phone, address: address, country: countryCity.country, city: countryCity.city };
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
        COUNTRIES_CITY_MAP,
        DELIVERY_OPTIONS,
        getSelectedDeliveryOption,
        initCheckoutModal
    };

})();