/* brand_detail.js
   Removed all Add-to-Cart and cart-related code per request.
   - Cart/localStorage functions and UI (cart panel, badges, notifications) removed.
   - addProductObjectToCart and attachAddToCartHandlers removed.
   - Suggestion cards no longer include "Add to Cart" buttons (Buy Now still disabled).
   - Kept Likes, product loading, thumbnails, suggestion rendering (without Add-to-Cart).
*/

document.addEventListener('DOMContentLoaded', function () {
    const API = "/api";
    const PLACEHOLDER_IMG = document.body && document.body.dataset && document.body.dataset.placeholder ? document.body.dataset.placeholder : '/static/images/placeholder.jpg';
    const LIKES_KEY = 'likes';

    // Utility: normalize image paths returned by the backend
    function toStaticUrl(url) {
        if (!url) return PLACEHOLDER_IMG;
        if (typeof url !== 'string') return PLACEHOLDER_IMG;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
            return url;
        }
        return `/static/${url}`;
    }

    // --------------------
    // Likes (localStorage)
    // --------------------
    function getLikes() {
        try {
            const raw = localStorage.getItem(LIKES_KEY) || '[]';
            return JSON.parse(raw);
        } catch (e) {
            return [];
        }
    }
    function saveLikes(arr) {
        try {
            localStorage.setItem(LIKES_KEY, JSON.stringify(arr || []));
        } catch (e) { /* ignore */ }
    }
    function findLikeIndexById(arr, id) {
        return arr.findIndex(i => ('' + i.id) === ('' + id));
    }
    function isLiked(id) {
        if (!id) return false;
        const arr = getLikes();
        return findLikeIndexById(arr, id) >= 0;
    }
    function likeObjectForProduct(prod) {
        if (!prod) return null;
        const id = prod.id || prod.product_id || prod._id || prod.title || (new Date().getTime());
        return {
            id: id,
            title: prod.title || prod.name || (document.getElementById('productName') ? document.getElementById('productName').textContent : 'Product'),
            brand: prod.brand || (document.getElementById('brandName') ? document.getElementById('brandName').textContent : ''),
            price: Number(prod.price || prod.unit_price || prod.amount || 0) || 0,
            image: prod.image || prod.image_url || (document.getElementById('productImage') ? document.getElementById('productImage').src : '')
        };
    }
    function toggleLikeProduct(prod) {
        if (!prod) return false;
        const obj = likeObjectForProduct(prod);
        if (!obj) return false;
        const arr = getLikes();
        const idx = findLikeIndexById(arr, obj.id);
        let added = false;
        if (idx >= 0) {
            arr.splice(idx, 1);
            added = false;
        } else {
            arr.unshift(obj);
            added = true;
        }
        saveLikes(arr);
        updateLikesBadge();
        renderLikesPanelContents();
        return added;
    }
    function updateLikesBadge() {
        try {
            const badge = document.getElementById('likesCountBadge');
            if (!badge) return;
            const count = getLikes().length || 0;
            if (count > 0) {
                badge.style.display = 'inline-flex';
                badge.textContent = String(count);
            } else {
                badge.style.display = 'none';
            }
        } catch (e) { /* ignore */ }
    }

    // Renders the likes panel contents (nav dropdown)
    function renderLikesPanelContents() {
        try {
            const likesPanel = document.getElementById('likesPanel');
            if (!likesPanel) return;
            const list = getLikes();
            if (!list || list.length === 0) {
                likesPanel.innerHTML = '<div style="padding:10px;color:#666;">No likes yet.</div>';
                return;
            }
            likesPanel.innerHTML = '';
            list.forEach(item => {
                const row = document.createElement('div');
                row.className = 'like-row';
                const img = document.createElement('img');
                img.src = toStaticUrl(item.image || PLACEHOLDER_IMG);
                img.alt = item.title || 'Liked product';
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

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'btn btn-primary';
                removeBtn.style.minWidth = '56px';
                removeBtn.textContent = 'Remove';
                removeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const arr = getLikes();
                    const idx = findLikeIndexById(arr, item.id);
                    if (idx >= 0) {
                        arr.splice(idx, 1);
                        saveLikes(arr);
                        updateLikesBadge();
                        renderLikesPanelContents();
                        // Update hearts on page
                        document.querySelectorAll('.card-like-btn, .product-like-btn').forEach(el => {
                            const card = el.closest('.product-card');
                            const pid = card ? (card.getAttribute('data-id')) : null;
                            if (pid && pid === item.id) el.classList.remove('liked');
                            if (!pid && el.parentElement) {
                                try {
                                    const tEl = el.parentElement.querySelector('h4') || el.parentElement.querySelector('.product-title');
                                    if (tEl && tEl.textContent.trim() === item.title) el.classList.remove('liked');
                                } catch (err) { /* ignore */ }
                            }
                        });
                    }
                });

                row.appendChild(img);
                row.appendChild(meta);
                row.appendChild(removeBtn);
                likesPanel.appendChild(row);
            });
        } catch (e) { /* ignore */ }
    }

    // --------------------
    // (Removed) Cart-related code
    // --------------------
    // All functions and UI dealing with cart state, cart panel, badges, notifications,
    // and add-to-cart mutation have been removed from this file intentionally.

    // --------------------
    // Suggestions renderer (fallback) — adjusted: no Add-to-Cart buttons
    // --------------------
    async function loadSimilarProducts(productId) {
        try {
            const res = await fetch(`${API}/products/similar?product_id=${encodeURIComponent(productId)}`);
            if (!res.ok) {
                console.warn('similar products request failed', res.status);
                return [];
            }
            return await res.json();
        } catch (err) {
            console.warn('loadSimilarProducts error', err);
            return [];
        }
    }

    function renderSuggestedCardsWithCTAs(containerId, products) {
        const track = document.getElementById(containerId);
        if (!track) return;
        track.innerHTML = '';
        (products || []).forEach(p => {
            const titleSafe = (p.title || p.name || 'Untitled');
            const rawPrice = parseFloat(p.price);
            const priceHtml = isNaN(rawPrice) ? '—' : ('$' + rawPrice.toFixed(2));

            const card = document.createElement('div');
            card.className = 'product-card';
            if (p.brand) card.setAttribute('data-brand', p.brand);
            if (p.id) card.setAttribute('data-id', p.id);

            const mediaLink = document.createElement('a');
            mediaLink.className = 'card-media';
            const href = p.id
                ? `/brand_detail?product_id=${encodeURIComponent(p.id)}`
                : `/brand_detail?brand=${encodeURIComponent(p.brand || '')}&product=${encodeURIComponent((p.title || p.name || '').replace(/ /g, '_'))}`;
            mediaLink.href = href;
            const img = document.createElement('img');
            img.src = toStaticUrl(p.image_url || p.image || '');
            img.alt = titleSafe;
            mediaLink.appendChild(img);

            const body = document.createElement('div');
            body.className = 'card-body';
            const meta = document.createElement('div');
            meta.className = 'meta';
            const h4 = document.createElement('h4');
            h4.textContent = titleSafe;
            meta.appendChild(h4);
            const footer = document.createElement('div');
            footer.className = 'card-footer';
            const priceRow = document.createElement('div');
            priceRow.style.display = 'flex';
            priceRow.style.justifyContent = 'flex-start';
            priceRow.style.alignItems = 'center';
            priceRow.style.gap = '8px';
            const priceEl = document.createElement('div');
            priceEl.style.fontWeight = '700';
            priceEl.style.color = '#cc0000';
            priceEl.style.fontSize = '0.92rem';
            priceEl.textContent = priceHtml;
            priceRow.appendChild(priceEl);
            footer.appendChild(priceRow);

            const ctaRow = document.createElement('div');
            ctaRow.className = 'suggestion-cta-row';
            ctaRow.setAttribute('role', 'group');
            ctaRow.setAttribute('aria-label', 'Suggestion actions');

            // Buy Now: keep disabled (no modal)
            const buyBtn = document.createElement('button');
            buyBtn.className = 'btn btn-buy suggestion-buy';
            buyBtn.type = 'button';
            buyBtn.setAttribute('aria-label', 'Buy Now');
            buyBtn.textContent = 'Buy Now';
            try {
                buyBtn.disabled = true;
                buyBtn.classList.add('btn-disabled');
                buyBtn.title = 'Buy Now disabled on this page';
            } catch (e) { /* ignore */ }
            buyBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                try {
                    const msgEl = card.querySelector('.suggestion-msg');
                    if (msgEl) {
                        msgEl.textContent = 'Buy Now is disabled on this page.';
                        setTimeout(() => { try { msgEl.textContent = ''; } catch (e) { } }, 2500);
                    }
                } catch (e) { /* ignore */ }
            });

            // NOTE: Add-to-Cart removed entirely — do not create addBtn here.
            // If you want a disabled visual instead, uncomment the following block:
            /*
            const addBtn = document.createElement('button');
            addBtn.className = 'btn btn-primary suggestion-add btn-disabled';
            addBtn.type = 'button';
            addBtn.setAttribute('aria-label', 'Add to Cart (disabled)');
            addBtn.disabled = true;
            addBtn.textContent = 'Add to Cart';
            ctaRow.appendChild(addBtn);
            */

            // Ensure there's a suggestion-msg element for user feedback
            const suggestionMsg = document.createElement('div');
            suggestionMsg.className = 'suggestion-msg';
            footer.appendChild(suggestionMsg);

            ctaRow.appendChild(buyBtn);
            footer.appendChild(ctaRow);

            body.appendChild(meta);
            body.appendChild(footer);

            card.appendChild(mediaLink);
            card.appendChild(body);

            const likeBtn = document.createElement('button');
            likeBtn.className = 'card-like-btn';
            likeBtn.type = 'button';
            likeBtn.setAttribute('aria-label', 'Like product');
            likeBtn.title = 'Like';
            const pid = p.id || p.product_id || p.title || (new Date().getTime());
            if (isLiked(pid)) likeBtn.classList.add('liked');
            likeBtn.innerHTML = '<span aria-hidden="true">♡</span>';
            likeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const added = toggleLikeProduct({
                    id: p.id || p.product_id,
                    title: p.title || p.name,
                    brand: p.brand,
                    price: p.price,
                    image: p.image || p.image_url
                });
                likeBtn.classList.toggle('liked', added);
            });

            track.appendChild(card);
            card.appendChild(likeBtn);
        });
    }

    // --------------------
    // Product loader + init
    // --------------------
    function safeParam(name) {
        try {
            return decodeURIComponent(new URLSearchParams(window.location.search).get(name) || '');
        } catch (e) {
            return '';
        }
    }

    async function loadProductByApi(productApiUrl) {
        try {
            const res = await fetch(productApiUrl);
            if (!res.ok) {
                console.warn('Product API returned', res.status);
                return null;
            }
            return await res.json();
        } catch (err) {
            console.warn('Failed to load product', err);
            return null;
        }
    }

    async function initProductPage() {
        updateLikesBadge();

        const queryBrand = safeParam('brand') || '';
        const queryProduct = safeParam('product') || '';
        const queryProductId = safeParam('product_id') || '';

        let rawBrand = queryBrand;
        let rawProduct = queryProduct;
        let rawProductId = queryProductId;

        if (!rawBrand) {
            try {
                const parts = window.location.pathname.split('/').filter(Boolean);
                if (parts.length >= 2 && parts[0] === 'brand') {
                    rawBrand = decodeURIComponent(parts[1] || '');
                    if (parts.length >= 4 && parts[2] === 'product') {
                        rawProduct = decodeURIComponent(parts[3] || '');
                    }
                }
            } catch (e) {
                console.warn('path parsing failed', e);
            }
        }

        const brandForApi = encodeURIComponent((rawBrand || '').replace(/ /g, '_'));
        const productForApi = encodeURIComponent((rawProduct || '').replace(/ /g, '_'));
        const productIdForApi = encodeURIComponent((rawProductId || '').trim());

        let productApiUrl;
        if (productIdForApi) {
            productApiUrl = `${API}/product_by_id?product_id=${productIdForApi}`;
        } else {
            productApiUrl = `${API}/products/${brandForApi}/${productForApi}`;
        }

        const productData = await loadProductByApi(productApiUrl);
        if (!productData) {
            const nameEl = document.getElementById('productTitle') || document.getElementById('productName');
            if (nameEl) nameEl.textContent = 'Product not found';
        } else {
            window.currentProduct = productData;
            const pageTitle = document.getElementById('pageTitle');
            if (pageTitle) pageTitle.textContent = `${productData.title || productData.name} - ${productData.brand || ''}`;
            const pname = document.getElementById('productTitle') || document.getElementById('productName');
            if (pname) pname.textContent = productData.title || productData.name || '';
            const bname = document.getElementById('brandName') || document.getElementById('productBrand');
            if (bname) bname.textContent = productData.brand || '';
            const priceEl = document.getElementById('priceNow') || document.getElementById('productPrice');
            if (priceEl) priceEl.textContent = "$" + (parseFloat(productData.price || 0)).toFixed(2);
            const descEl = document.getElementById('productDescription') || document.getElementById('detailedDescription');
            if (descEl) descEl.textContent = productData.description || '';

            const thumbsCol = document.getElementById('thumbnailsCol') || document.getElementById('thumbsContainer');
            if (thumbsCol) thumbsCol.innerHTML = '';
            const thumbnails = typeof productData.thumbnails === 'string' ? productData.thumbnails.split(',').map(s => s.trim()).filter(Boolean) : (productData.thumbnails || []);
            if (thumbnails.length === 0 && productData.image_url) thumbnails.push(productData.image_url);
            thumbnails.forEach((turl, idx) => {
                const img = document.createElement('img');
                img.src = toStaticUrl(turl);
                img.className = 'thumbnail-img';
                img.alt = `Thumbnail ${idx + 1}`;
                img.addEventListener('click', () => {
                    const mainImgEl = document.getElementById('productImage') || document.getElementById('mainImage');
                    if (mainImgEl) mainImgEl.src = toStaticUrl(turl);
                    document.querySelectorAll('.thumbnail-img').forEach(x => x.classList.remove('selected'));
                    img.classList.add('selected');
                });
                if (thumbsCol) thumbsCol.appendChild(img);
                if (idx === 0) img.classList.add('selected');
            });

            const mainImg = document.getElementById('productImage') || document.getElementById('mainImage');
            const mainSrc = (thumbnails.length > 0) ? thumbnails[0] : (productData.image_url || '');
            if (mainImg && mainSrc) mainImg.src = toStaticUrl(mainSrc);

            injectMainProductLikeButton();
            const productLikeBtn = document.querySelector('.product-like-btn') || document.getElementById('productLikeBtn');
            if (productLikeBtn) {
                const liked = isLiked(productData.id || productData.product_id || productData.title);
                productLikeBtn.classList.toggle('liked', liked);
            }

            // Deactivate page Buy Now (kept disabled earlier)
            try {
                const pageBuy = document.getElementById('buyNowBtnPage') || document.getElementById('buyNowBtn');
                if (pageBuy) {
                    pageBuy.disabled = true;
                    pageBuy.classList.add('btn-disabled');
                    pageBuy.setAttribute('aria-disabled', 'true');
                    pageBuy.title = 'Buy Now disabled on this page';
                    pageBuy.addEventListener('click', function (ev) {
                        ev.preventDefault();
                        const msg = document.getElementById('productActionMsg');
                        if (msg) {
                            msg.textContent = 'Buy Now is disabled on this page.';
                            setTimeout(() => { try { msg.textContent = ''; } catch (e) { } }, 2500);
                        }
                    }, true);
                }
            } catch (e) { /* ignore */ }
        }

        if (typeof window.loadSuggestions === 'function') {
            try {
                await window.loadSuggestions();
            } catch (e) {
                console.warn('page loadSuggestions failed, falling back to internal renderer', e);
                const similar = await loadSimilarProducts(window.currentProduct ? window.currentProduct.id : '');
                renderSuggestedCardsWithCTAs('suggestedTrack', similar);
            }
        } else {
            const similar = await loadSimilarProducts(window.currentProduct ? window.currentProduct.id : '');
            renderSuggestedCardsWithCTAs('suggestedTrack', similar);
        }

        // Attach only non-cart handlers
        attachLikeHandlers();
        // Note: cart panel and add-to-cart handlers intentionally not attached/created.
        updateLikesBadge();
        renderLikesPanelContents();
    }

    function injectMainProductLikeButton() {
        try {
            let container = document.querySelector('.product-image-wrapper') || document.querySelector('.product-gallery') || null;
            if (!container) {
                const imgEl = document.getElementById('productImage') || document.getElementById('mainImage');
                if (imgEl && imgEl.parentElement) container = imgEl.parentElement;
            }
            if (!container) return;
            if (container.querySelector('.product-like-btn')) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'product-like-btn';
            btn.setAttribute('aria-label', 'Like product');
            btn.title = 'Like';
            btn.innerHTML = '<span aria-hidden="true">♡</span>';
            // fixed assignment to set position if not present
            container.style.position = container.style.position || 'relative';
            container.appendChild(btn);
        } catch (e) { /* ignore */ }
    }

    // Attach like handlers only
    function attachLikeHandlers() {
        document.addEventListener('click', function (e) {
            const likeBtn = e.target.closest ? e.target.closest('.card-like-btn, .product-like-btn, [data-action="like"]') : null;
            if (!likeBtn) return;
            e.preventDefault();
            e.stopPropagation();

            let prod = null;
            const card = likeBtn.closest ? likeBtn.closest('.product-card') : null;
            if (card) {
                prod = {
                    id: card.getAttribute('data-id') || undefined,
                    title: (card.querySelector('h4') ? card.querySelector('h4').textContent.trim() : undefined),
                    brand: card.getAttribute('data-brand') || undefined,
                    image: (card.querySelector('img') ? card.querySelector('img').src : undefined)
                };
            } else if (window.currentProduct) {
                prod = window.currentProduct;
            }
            if (!prod) return;
            const added = toggleLikeProduct(prod);
            try {
                likeBtn.classList.toggle('liked', added);
            } catch (err) { /* ignore */ }
        });

        const likesBtn = document.getElementById('likesBtn');
        const likesPanel = document.getElementById('likesPanel');
        if (likesBtn && likesPanel) {
            likesBtn.addEventListener('click', function (e) {
                e.preventDefault();
                const visible = likesPanel.style.display === 'block';
                if (visible) {
                    likesPanel.style.display = 'none';
                    likesPanel.setAttribute('aria-hidden', 'true');
                } else {
                    renderLikesPanelContents();
                    likesPanel.style.display = 'block';
                    likesPanel.setAttribute('aria-hidden', 'false');
                }
            });
            document.addEventListener('click', (ev) => {
                if (!likesPanel) return;
                if (!likesPanel.contains(ev.target) && !likesBtn.contains(ev.target)) {
                    likesPanel.style.display = 'none';
                    likesPanel.setAttribute('aria-hidden', 'true');
                }
            });
        }
    }

    // Initialize
    (async function runInit() {
        try {
            await initProductPage();
        } catch (err) {
            console.error('init error', err);
        }
    })();
});