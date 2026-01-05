// cart_integration.js
// Replaced/updated: removes placeholder deactivation and ensures cart updates sync across tabs/pages.
// - Writes 'cart' into localStorage
// - Also writes 'cart_sync' timestamp to force storage events on some browsers
// - Dispatches 'cart:updated' event for same-tab listeners
// - Enables main Add to Cart button and delegates suggestion Add clicks
// - Renders cart panel and updates badge immediately

document.addEventListener('DOMContentLoaded', function () {
    const CART_KEY = 'cart';
    const SYNC_KEY = 'cart_sync';
    const PLACEHOLDER_IMG = (document.body && document.body.dataset && document.body.dataset.placeholder) ? document.body.dataset.placeholder : '/static/images/placeholder.jpg';

    function debug(...args) { try { console.debug('[cart_integration]', ...args); } catch (e) { } }

    function getCart() {
        try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) { return []; }
    }
    function persistCart(arr) {
        try {
            localStorage.setItem(CART_KEY, JSON.stringify(arr || []));
            // also write a sync timestamp to force storage events if needed
            localStorage.setItem(SYNC_KEY, String(Date.now()));
            // dispatch local event for same-tab listeners
            try { window.dispatchEvent(new Event('cart:updated')); } catch (e) { }
            debug('persistCart saved', arr);
        } catch (e) {
            console.error('persistCart failed', e);
        }
    }

    function findCartIndexById(arr, id) {
        return arr.findIndex(i => ('' + i.id) === ('' + id));
    }

    function toStaticUrl(url) {
        if (!url) return PLACEHOLDER_IMG;
        if (typeof url !== 'string') return PLACEHOLDER_IMG;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) return url;
        return '/static/' + url;
    }

    // Badge & cart button helpers
    function setCartButtonEnabled(enabled) {
        const cartBtn = document.getElementById('cartBtn') || document.querySelector('.cart-btn');
        if (!cartBtn) return;
        if (enabled) {
            cartBtn.classList.remove('btn-disabled');
            cartBtn.removeAttribute('aria-disabled');
            cartBtn.tabIndex = 0;
            try { cartBtn.disabled = false; } catch (e) { }
        } else {
            cartBtn.classList.add('btn-disabled');
            cartBtn.setAttribute('aria-disabled', 'true');
            cartBtn.tabIndex = -1;
            try { cartBtn.disabled = false; } catch (e) { }
        }
    }

    function updateCartBadge() {
        const badge = document.getElementById('cartCountBadge') || document.querySelector('.cart-count-badge');
        if (!badge) return;
        const cart = getCart();
        const totalQty = cart.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        if (totalQty > 0) {
            badge.style.display = 'inline-flex';
            badge.textContent = String(totalQty);
            setCartButtonEnabled(true);
        } else {
            badge.style.display = 'none';
            badge.textContent = '0';
            setCartButtonEnabled(false);
        }
    }

    // Cart panel rendering
    function renderCartPanel() {
        let panel = document.getElementById('cartPanel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'cartPanel';
            panel.className = 'cart-panel';
            panel.style.display = 'none';
            panel.setAttribute('aria-hidden', 'true');
            const navbarRight = document.querySelector('.navbar-right') || document.body;
            navbarRight.appendChild(panel);
        }

        const cart = getCart();
        panel.innerHTML = '';

        if (!cart || !cart.length) {
            panel.innerHTML = '<div style="padding:10px;color:#666;">Cart is empty</div>';
            return;
        }

        cart.forEach(item => {
            const row = document.createElement('div');
            row.className = 'cart-row';
            row.dataset.cartId = item.id;

            const img = document.createElement('img');
            img.src = toStaticUrl(item.image || '');
            img.alt = item.title || 'Cart item';
            img.width = 48;
            img.height = 48;

            const meta = document.createElement('div');
            meta.className = 'meta';
            const t = document.createElement('div');
            t.className = 'title';
            t.textContent = item.title || '';
            const b = document.createElement('div');
            b.className = 'brand';
            b.textContent = item.brand || '';
            meta.appendChild(t);
            meta.appendChild(b);

            const priceEl = document.createElement('div');
            priceEl.className = 'price';
            priceEl.textContent = `$${(Number(item.price) || 0).toFixed(2)}`;

            const qtyCtrl = document.createElement('div');
            qtyCtrl.className = 'qty-control';
            const minus = document.createElement('button');
            minus.type = 'button';
            minus.className = 'qty-minus';
            minus.setAttribute('aria-label', 'Reduce quantity');
            minus.textContent = '−';
            const qtyDisplay = document.createElement('span');
            qtyDisplay.className = 'qty-display';
            qtyDisplay.textContent = String(item.quantity || 1);
            const plus = document.createElement('button');
            plus.type = 'button';
            plus.className = 'qty-plus';
            plus.setAttribute('aria-label', 'Increase quantity');
            plus.textContent = '+';

            minus.addEventListener('click', () => changeCartItemQuantity(item.id, (Number(item.quantity) || 1) - 1));
            plus.addEventListener('click', () => changeCartItemQuantity(item.id, (Number(item.quantity) || 1) + 1));

            qtyCtrl.appendChild(minus);
            qtyCtrl.appendChild(qtyDisplay);
            qtyCtrl.appendChild(plus);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn btn-buy';
            removeBtn.style.minWidth = '56px';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => removeCartItem(item.id));

            row.appendChild(img);
            row.appendChild(meta);
            row.appendChild(priceEl);
            row.appendChild(qtyCtrl);
            row.appendChild(removeBtn);

            panel.appendChild(row);
        });

        const total = cart.reduce((s, it) => s + ((Number(it.price) || 0) * (Number(it.quantity) || 1)), 0);
        const footer = document.createElement('div');
        footer.className = 'cart-footer';
        footer.innerHTML = `
            <div class="cart-total">Total: <strong>$${total.toFixed(2)}</strong></div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <a href="/cart" class="btn btn-primary" style="text-decoration:none;">View Cart</a>
                <a href="/checkout" class="btn btn-buy" style="text-decoration:none;">Checkout</a>
            </div>
        `;
        panel.appendChild(footer);
    }

    function removeCartItem(id) {
        const cart = getCart();
        const idx = findCartIndexById(cart, id);
        if (idx >= 0) {
            cart.splice(idx, 1);
            persistCart(cart);
            updateCartBadge();
            renderCartPanel();
        }
    }

    function changeCartItemQuantity(id, qty) {
        const cart = getCart();
        const idx = findCartIndexById(cart, id);
        if (idx >= 0) {
            if (qty <= 0) {
                cart.splice(idx, 1);
            } else {
                cart[idx].quantity = qty;
            }
            persistCart(cart);
            updateCartBadge();
            renderCartPanel();
        }
    }

    function showCartNotification(product, qty = 1) {
        if (!product) return;
        let notif = document.getElementById('cartNotification');
        if (!notif) {
            notif = document.createElement('div');
            notif.id = 'cartNotification';
            notif.className = 'cart-notification';
            const navbar = document.querySelector('.navbar') || document.body;
            navbar.appendChild(notif);
        }
        const title = product.title || product.name || 'Product';
        const price = Number(product.price || product.unit_price || product.amount || 0) || 0;
        notif.innerHTML = `
            <div class="cn-row">
                <div class="cn-title">Added to cart</div>
                <div class="cn-product"><strong>${String(title)}</strong> · ${qty} × $${price.toFixed(2)}</div>
            </div>
        `;
        notif.classList.add('visible');
        setTimeout(() => notif.classList.remove('visible'), 2600);
    }

    function addProductObjectToCart(prod, qty = 1) {
        if (!prod) { debug('no product'); return; }
        const id = prod.id || prod.product_id || prod._id || prod.title || (new Date().getTime());
        const title = prod.title || prod.name || (document.querySelector('#productTitle') ? document.querySelector('#productTitle').textContent : 'Product');
        const brand = prod.brand || (document.querySelector('#productBrand') ? document.querySelector('#productBrand').textContent : '');
        const price = Number(prod.price || prod.unit_price || prod.amount || 0) || 0;
        const image = prod.image || prod.image_url || (document.querySelector('#productImage, #mainImage') ? (document.querySelector('#productImage, #mainImage').src || '') : '');

        const cart = getCart();
        const idx = findCartIndexById(cart, id);
        if (idx >= 0) {
            cart[idx].quantity = (Number(cart[idx].quantity) || 0) + (Number(qty) || 1);
            cart[idx].price = cart[idx].price || price;
            cart[idx].image = cart[idx].image || toStaticUrl(image);
            cart[idx].title = cart[idx].title || title;
            cart[idx].brand = cart[idx].brand || brand;
        } else {
            cart.push({
                id: id,
                title: title,
                brand: brand,
                price: Number(price) || 0,
                image: image ? toStaticUrl(image) : '',
                quantity: Number(qty) || 1
            });
        }
        persistCart(cart);
        updateCartBadge();
        renderCartPanel();

        // Enable cart button and open panel
        setCartButtonEnabled(true);
        const panel = document.getElementById('cartPanel');
        if (panel) { panel.style.display = 'block'; panel.setAttribute('aria-hidden', 'false'); }

        showCartNotification({ title, price }, qty);
    }

    function extractProductFromElement(el) {
        if (!el) return null;
        const ds = el.dataset || {};
        if (ds.title || ds.id || ds.price) {
            return {
                id: ds.id || ds.productId || ds.product_id || ds.pid,
                title: ds.title || ds.name,
                brand: ds.brand,
                price: ds.price || ds.unitPrice || ds.amount,
                image: ds.image || ds.imageUrl || ds.image_url,
                quantity: ds.qty || ds.quantity || ds.count || 1
            };
        }
        const card = el.closest ? (el.closest('.product-card') || el.closest('.slider-card')) : null;
        if (card) {
            const titleEl = card.querySelector('h3') || card.querySelector('.product-title') || card.querySelector('h4') || card.querySelector('.slider-title');
            const imgEl = card.querySelector('img') || card.querySelector('.product-image-box img');
            const priceEl = card.querySelector('.discounted-price') || card.querySelector('.price') || card.querySelector('.meta .price') || card.querySelector('.muted.small');
            return {
                id: card.getAttribute('data-id') || (titleEl ? titleEl.textContent.trim().replace(/\s+/g, '_') : ''),
                title: titleEl ? titleEl.textContent.trim() : '',
                brand: card.getAttribute('data-brand') || '',
                price: priceEl ? parseFloat((priceEl.textContent || '').replace(/[^0-9.]/g, '')) : 0,
                image: imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : ''
            };
        }
        return null;
    }

    function attachAddToCartHandlers() {
        const mainBtn = document.getElementById('addToCartBtn') || document.getElementById('addCartBtn');
        if (mainBtn) {
            try {
                mainBtn.disabled = false;
                mainBtn.classList.remove('btn-disabled');
                mainBtn.removeAttribute('aria-disabled');
                mainBtn.tabIndex = 0;
            } catch (e) { }
            if (!mainBtn.dataset._cartAttached) {
                mainBtn.dataset._cartAttached = '1';
                mainBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    const qtyEl = document.getElementById('qty');
                    const qty = qtyEl ? (parseInt(qtyEl.value, 10) || 1) : 1;
                    if (window.currentProduct) addProductObjectToCart(window.currentProduct, qty);
                    else {
                        const prod = {
                            id: document.querySelector('#productTitle') ? document.querySelector('#productTitle').textContent.trim().replace(/\s+/g, '_') : (new Date().getTime()),
                            title: document.querySelector('#productTitle') ? document.querySelector('#productTitle').textContent : 'Product',
                            brand: document.querySelector('#productBrand') ? document.querySelector('#productBrand').textContent : '',
                            price: (function () {
                                const pe = document.querySelector('#priceNow, #productPrice');
                                if (!pe) return 0;
                                const txt = (pe.textContent || '').replace(/[^0-9.]/g, '');
                                const n = parseFloat(txt);
                                return isNaN(n) ? 0 : n;
                            })(),
                            image: (document.querySelector('#productImage, #mainImage') ? (document.querySelector('#productImage, #mainImage').src || '') : '')
                        };
                        addProductObjectToCart(prod, qty);
                    }
                });
            }
        }

        // Delegated handler for suggestion Add buttons (no-op handlers removed from HTML)
        document.addEventListener('click', function (e) {
            const btn = e.target.closest ? e.target.closest('.suggestion-add, .btn-add, .add-to-cart, [data-action="add-to-cart"]') : null;
            if (!btn) return;
            e.preventDefault();
            const prod = extractProductFromElement(btn) || window.currentProduct || null;
            if (prod) {
                const qty = prod.quantity || 1;
                addProductObjectToCart(prod, Number(qty) || 1);
            }
        });
    }

    function attachCartPanelToggle() {
        const cartBtn = document.getElementById('cartBtn') || document.querySelector('.cart-btn');
        if (!cartBtn) return;
        cartBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const panel = document.getElementById('cartPanel');
            if (!panel) { renderCartPanel(); return; }
            const visible = panel.style.display === 'block';
            if (visible) {
                panel.style.display = 'none';
                panel.setAttribute('aria-hidden', 'true');
            } else {
                renderCartPanel();
                panel.style.display = 'block';
                panel.setAttribute('aria-hidden', 'false');
            }
        });

        document.addEventListener('click', function (ev) {
            const panel = document.getElementById('cartPanel');
            const cartBtn = document.getElementById('cartBtn') || document.querySelector('.cart-btn');
            if (!panel || !cartBtn) return;
            if (!panel.contains(ev.target) && !cartBtn.contains(ev.target)) {
                panel.style.display = 'none';
                panel.setAttribute('aria-hidden', 'true');
            }
        });
    }

    (function init() {
        renderCartPanel();
        attachAddToCartHandlers();
        attachCartPanelToggle();
        updateCartBadge();

        // Listen for storage events (other tabs)
        window.addEventListener('storage', function (e) {
            if (e.key === CART_KEY || e.key === SYNC_KEY) {
                updateCartBadge();
                renderCartPanel();
            }
        });

        // Also handle same-tab custom event
        window.addEventListener('cart:updated', function () {
            updateCartBadge();
            renderCartPanel();
        });

        debug('cart_integration initialized');
    })();
});