// Lightweight search client that prefers /api/search (server-side) and falls back to /api/products.
// Non-invasive and defensive: does not throw at top level.
(function () {
    'use strict';

    const API = '/api';
    const MAX_RESULTS = 10;
    const DEBOUNCE_MS = 250;
    let debounceTimer = null;

    // Try server-side search first
    async function serverSearch(q, limit = 10) {
        try {
            const url = `${API}/search?q=${encodeURIComponent(q)}&limit=${limit}`;
            const res = await fetch(url);
            if (!res.ok) {
                // non-200 -> indicate failure so caller can fallback
                return { ok: false };
            }
            const js = await res.json();
            // expect { items: [...], total, page, limit }
            return { ok: true, items: js.items || [] };
        } catch (err) {
            return { ok: false };
        }
    }

    async function fallbackClientSearch(q) {
        try {
            const res = await fetch(`${API}/products`);
            if (!res.ok) return [];
            const all = await res.json();
            const ql = q.toLowerCase();
            return all.filter(p => {
                if (!p) return false;
                const fields = [
                    p.title, p.brand, p.id,
                    Array.isArray(p.keyNotes) ? p.keyNotes.join(' ') : p.keyNotes,
                    p.tags, p.description
                ];
                for (const f of fields) {
                    if (!f) continue;
                    if (String(f).toLowerCase().indexOf(ql) !== -1) return true;
                }
                return false;
            }).slice(0, MAX_RESULTS);
        } catch (err) {
            return [];
        }
    }

    function createDropdown() {
        let dd = document.getElementById('siteSearchResultsDropdown');
        if (dd) return dd;
        dd = document.createElement('div');
        dd.id = 'siteSearchResultsDropdown';
        dd.className = 'site-search-dropdown';
        dd.style.display = 'none';
        document.body.appendChild(dd);
        return dd;
    }

    function positionDropdownUnder(inputEl, dropdownEl) {
        try {
            const rect = inputEl.getBoundingClientRect();
            const left = rect.left + window.pageXOffset;
            const top = rect.bottom + window.pageYOffset + 6;
            dropdownEl.style.position = 'absolute';
            dropdownEl.style.left = `${left}px`;
            dropdownEl.style.top = `${top}px`;
            dropdownEl.style.minWidth = `${rect.width}px`;
        } catch (e) { /* ignore */ }
    }

    function buildItemNode(prod) {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.style.padding = '8px';
        item.style.display = 'flex';
        item.style.gap = '8px';
        item.style.alignItems = 'center';
        item.style.cursor = 'pointer';
        item.style.borderBottom = '1px solid rgba(0,0,0,0.06)';

        const img = document.createElement('img');
        img.src = prod.image_url || window.DEFAULT_PRODUCT_IMG || window.PLACEHOLDER_IMG || '';
        img.alt = prod.title || '';
        img.style.width = '44px';
        img.style.height = '44px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';

        const info = document.createElement('div');
        info.style.flex = '1';
        info.innerHTML = `<div style="font-weight:600;font-size:0.95em;">${prod.title || ''}</div>
                          <div style="font-size:0.85em;color:#666;">${prod.brand || ''}${prod.price ? ' • $' + (Number(prod.price || 0).toFixed ? Number(prod.price).toFixed(2) : prod.price) : ''}</div>`;

        item.appendChild(img);
        item.appendChild(info);

        item.dataset.productId = prod.id || '';
        item.dataset.productBrand = prod.brand || '';
        item.dataset.productTitle = prod.title || '';

        item.addEventListener('click', function () {
            const brandParam = encodeURIComponent(String(item.dataset.productBrand || '').replace(/\s+/g, '_'));
            const productSlug = encodeURIComponent(String(item.dataset.productTitle || '').replace(/\s+/g, '_'));
            const idPart = item.dataset.productId ? `&product_id=${encodeURIComponent(item.dataset.productId)}` : '';
            window.location.href = `/brand_detail?brand=${brandParam}&product=${productSlug}${idPart}`;
        });

        return item;
    }

    function showResults(inputEl, results) {
        const dd = createDropdown();
        dd.innerHTML = '';
        if (!results || results.length === 0) {
            dd.style.display = 'none';
            return;
        }
        const frag = document.createDocumentFragment();
        results.slice(0, MAX_RESULTS).forEach(r => frag.appendChild(buildItemNode(r)));
        dd.appendChild(frag);
        positionDropdownUnder(inputEl, dd);
        dd.style.display = 'block';
        setTimeout(() => {
            window.addEventListener('click', onWindowClickForSearch);
            window.addEventListener('resize', onWindowResizeForSearch);
            window.addEventListener('keydown', onKeyDownForSearch);
        }, 0);
    }

    function hideResults() {
        const dd = document.getElementById('siteSearchResultsDropdown');
        if (dd) dd.style.display = 'none';
        window.removeEventListener('click', onWindowClickForSearch);
        window.removeEventListener('resize', onWindowResizeForSearch);
        window.removeEventListener('keydown', onKeyDownForSearch);
    }

    function onWindowClickForSearch(e) {
        const dd = document.getElementById('siteSearchResultsDropdown');
        const input = document.getElementById('siteSearchInput');
        if (!dd || !input) return;
        if (e.target === input || dd.contains(e.target)) return;
        hideResults();
    }
    function onWindowResizeForSearch() {
        const input = document.getElementById('siteSearchInput');
        const dd = document.getElementById('siteSearchResultsDropdown');
        if (dd && input) positionDropdownUnder(input, dd);
    }
    function onKeyDownForSearch(e) {
        if (e.key === 'Escape') hideResults();
        if (e.key === 'Enter') {
            const dd = document.getElementById('siteSearchResultsDropdown');
            if (!dd) return;
            const items = dd.querySelectorAll('.search-result-item');
            if (items.length === 1) items[0].click();
        }
    }

    async function doSearch(inputEl, q) {
        if (!q) { hideResults(); return; }
        // try server-side search first
        const srv = await serverSearch(q, MAX_RESULTS);
        if (srv.ok) {
            showResults(inputEl, srv.items || []);
            return;
        }
        // fallback
        const clientRes = await fallbackClientSearch(q);
        showResults(inputEl, clientRes);
    }

    async function init() {
        try {
            const inputEl = document.getElementById('siteSearchInput');
            if (!inputEl) return;

            inputEl.addEventListener('input', function (ev) {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    const q = (ev.target.value || '').trim();
                    doSearch(inputEl, q);
                }, DEBOUNCE_MS);
            });

            inputEl.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    const q = (inputEl.value || '').trim();
                    if (!q) return;
                    // attempt server-side id lookup quickly, otherwise fallback to full search flow
                    serverSearch(q, 1).then(res => {
                        if (res.ok && res.items && res.items.length === 1) {
                            const found = res.items[0];
                            const brandParam = encodeURIComponent(String(found.brand || '').replace(/\s+/g, '_'));
                            const productSlug = encodeURIComponent(String(found.title || '').replace(/\s+/g, '_'));
                            const idPart = found.id ? `&product_id=${encodeURIComponent(found.id)}` : '';
                            window.location.href = `/brand_detail?brand=${brandParam}&product=${productSlug}${idPart}`;
                        } else {
                            // nothing to do; allow Enter handler above to handle dropdown if present
                        }
                    }).catch(() => { /* ignore */ });
                }
            });
        } catch (err) {
            console.warn('search init failed', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }
})();