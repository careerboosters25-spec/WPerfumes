/**
 * static/js/announcements.js
 *
 * Announcement scroller (clone-first-item + interval) — deterministic, idempotent.
 * - Each item visible for DEFAULT_DELAY (3s).
 * - Smooth CSS transition animates between positions.
 * - Clone-first-item pattern provides seamless wrap: when the clone is reached we
 *   reset transform to 0 (no transition) so loop appears continuous.
 * - Pauses on hover/focus/page hidden/offscreen. Recomputes on resize and mutation.
 */

(function () {
    'use strict';

    const DEFAULT_DELAY = 3000;
    const DEFAULT_TRANSITION = 'transform 0.45s cubic-bezier(.2,.9,.2,1)';

    function debounce(fn, wait) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function Scroller(listEl) {
        this.listEl = listEl;
        this.items = Array.from(listEl.children).filter(n => n.nodeType === 1);
        this.currentIndex = 0;
        this.intervalId = null;
        this.paused = false;
        this.itemHeight = 0;
        this.delay = parseInt(listEl.getAttribute('data-delay'), 10) || DEFAULT_DELAY;

        this._clonedNode = null;
        this._onTransitionEnd = null;
        this._mouseenterHandler = null;
        this._mouseleaveHandler = null;
        this._onResize = null;
        this._mutationObserver = null;
        this._intersectionObserver = null;
        this._onVisibilityChange = null;

        this.init();
    }

    Scroller.prototype.init = function () {
        // Idempotent init guard
        try {
            if (this.listEl.dataset && this.listEl.dataset.announcementInitialized === '1') return;
            if (this.listEl.dataset) this.listEl.dataset.announcementInitialized = '1';
        } catch (e) { /* ignore */ }

        this.items = Array.from(this.listEl.children).filter(n => n.nodeType === 1);
        if (!this.listEl || this.items.length < 2) {
            // Nothing to animate
            this.listEl.style.transition = '';
            this.listEl.style.transform = '';
            return;
        }

        try { this.listEl.style.transition = this.listEl.style.transition || DEFAULT_TRANSITION; } catch (e) { }

        this.computeItemHeight();

        // append clone of first item for seamless wrap
        try {
            const first = this.items[0];
            this._clonedNode = first.cloneNode(true);
            this._clonedNode.setAttribute('data-ann-clone', '1');
            this.listEl.appendChild(this._clonedNode);
            this.items = Array.from(this.listEl.children).filter(n => n.nodeType === 1);
        } catch (e) { /* ignore clone errors */ }

        // hover pause/resume
        this._mouseenterHandler = () => this.pause('hover');
        this._mouseleaveHandler = () => this.resume('hover');
        this.listEl.addEventListener('mouseenter', this._mouseenterHandler);
        this.listEl.addEventListener('mouseleave', this._mouseleaveHandler);

        // focus/blur pause on each item (keyboard accessibility)
        this.items.forEach((it) => {
            if (!it.hasAttribute('tabindex')) it.setAttribute('tabindex', '0');
            const focusHandler = () => this.pause('focus');
            const blurHandler = () => this.resume('focus');
            it.__announcement_focus_handler = focusHandler;
            it.__announcement_blur_handler = blurHandler;
            it.addEventListener('focus', focusHandler);
            it.addEventListener('blur', blurHandler);
        });

        // resize handling
        this._onResize = debounce(() => {
            this.computeItemHeight();
            this.applyTransform();
        }, 120);
        window.addEventListener('resize', this._onResize);

        // mutation observer — handle dynamic changes to the list
        if ('MutationObserver' in window) {
            this._mutationObserver = new MutationObserver(() => {
                setTimeout(() => {
                    // cleanup per-item handlers
                    this.items.forEach(it => {
                        try {
                            if (it.__announcement_focus_handler) it.removeEventListener('focus', it.__announcement_focus_handler);
                            if (it.__announcement_blur_handler) it.removeEventListener('blur', it.__announcement_blur_handler);
                        } catch (e) { }
                        delete it.__announcement_focus_handler;
                        delete it.__announcement_blur_handler;
                    });

                    // rebuild items and re-add clone if needed
                    this.items = Array.from(this.listEl.children).filter(n => n.nodeType === 1);
                    // remove previous clones we might have added
                    this.items.forEach(node => {
                        if (node.getAttribute && node.getAttribute('data-ann-clone') === '1') {
                            try { node.remove(); } catch (e) { }
                        }
                    });
                    this.items = Array.from(this.listEl.children).filter(n => n.nodeType === 1);
                    if (this.items.length > 1) {
                        try {
                            this._clonedNode = this.items[0].cloneNode(true);
                            this._clonedNode.setAttribute('data-ann-clone', '1');
                            this.listEl.appendChild(this._clonedNode);
                        } catch (e) { }
                    }
                    this.items = Array.from(this.listEl.children).filter(n => n.nodeType === 1);

                    // reattach per-item handlers
                    this.items.forEach((it) => {
                        if (!it.hasAttribute('tabindex')) it.setAttribute('tabindex', '0');
                        const focusHandler = () => this.pause('focus');
                        const blurHandler = () => this.resume('focus');
                        it.__announcement_focus_handler = focusHandler;
                        it.__announcement_blur_handler = blurHandler;
                        it.addEventListener('focus', focusHandler);
                        it.addEventListener('blur', blurHandler);
                    });

                    this.computeItemHeight();
                    if (this.currentIndex >= this.items.length) this.currentIndex = 0;
                    this.applyTransform();
                }, 60);
            });
            this._mutationObserver.observe(this.listEl, { childList: true, subtree: false });
        }

        // pause when offscreen
        if ('IntersectionObserver' in window) {
            this._intersectionObserver = new IntersectionObserver(entries => {
                entries.forEach(ent => {
                    if (!ent) return;
                    if (ent.isIntersecting) this.resume('offscreen');
                    else this.pause('offscreen');
                });
            }, { threshold: 0.01 });
            this._intersectionObserver.observe(this.listEl);
        }

        // page visibility
        this._onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') this.pause('hidden');
            else this.resume('hidden');
        };
        document.addEventListener('visibilitychange', this._onVisibilityChange);

        // transitionend: detect landing on clone and reset instantly to 0
        this._onTransitionEnd = (ev) => {
            if (!ev || ev.propertyName !== 'transform') return;
            const originalCount = this._clonedNode ? (this.items.length - 1) : this.items.length;
            if (this.currentIndex === originalCount && this._clonedNode) {
                try {
                    const prev = this.listEl.style.transition || '';
                    this.listEl.style.transition = 'none';
                    this.currentIndex = 0;
                    this.applyTransform();
                    // force reflow
                    // eslint-disable-next-line no-unused-expressions
                    this.listEl.offsetHeight;
                    this.listEl.style.transition = prev || DEFAULT_TRANSITION;
                } catch (e) { }
            }
        };
        this.listEl.addEventListener('transitionend', this._onTransitionEnd);

        // small startup delay then start the interval
        setTimeout(() => this.start(), 120);
    };

    Scroller.prototype.computeItemHeight = function () {
        if (this.items && this.items.length) {
            const r = this.items[0].getBoundingClientRect();
            this.itemHeight = Math.max(1, Math.round(r.height));
        } else {
            this.itemHeight = 22;
        }
    };

    Scroller.prototype.start = function () {
        if (this.intervalId) return;
        if (!this.items || this.items.length < 2) return;

        // start deterministic interval
        this.intervalId = setInterval(() => {
            if (this.paused) return;
            this.showNext();
        }, this.delay);
    };

    Scroller.prototype.showNext = function () {
        if (!this.items || this.items.length < 2) return;

        const originalCount = this._clonedNode ? (this.items.length - 1) : this.items.length;

        // advance to next index (allow landing on clone index === originalCount)
        this.currentIndex = (this.currentIndex + 1);

        this.applyTransform();

        // defensive: if we exceed originalCount (rare), wrap
        if (this.currentIndex > originalCount) {
            this.currentIndex = 0;
            this.applyTransform();
        }
    };

    Scroller.prototype.applyTransform = function () {
        if (!this.itemHeight) this.computeItemHeight();
        const translateY = -this.currentIndex * this.itemHeight;
        try { this.listEl.style.transform = `translateY(${translateY}px)`; } catch (e) { }
    };

    Scroller.prototype.pause = function (reason = '') {
        this.paused = true;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    };

    Scroller.prototype.resume = function (reason = '') {
        if (!this.paused) return;
        this.paused = false;
        this.start();
    };

    Scroller.prototype.destroy = function () {
        try {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            if (this._onTransitionEnd) this.listEl.removeEventListener('transitionend', this._onTransitionEnd);
            if (this._mouseenterHandler) this.listEl.removeEventListener('mouseenter', this._mouseenterHandler);
            if (this._mouseleaveHandler) this.listEl.removeEventListener('mouseleave', this._mouseleaveHandler);
            if (this._onResize) window.removeEventListener('resize', this._onResize);
            if (this._mutationObserver) this._mutationObserver.disconnect();
            if (this._intersectionObserver) this._intersectionObserver.disconnect();
            if (this._onVisibilityChange) document.removeEventListener('visibilitychange', this._onVisibilityChange);

            this.items.forEach((it) => {
                try {
                    if (it.__announcement_focus_handler) it.removeEventListener('focus', it.__announcement_focus_handler);
                    if (it.__announcement_blur_handler) it.removeEventListener('blur', it.__announcement_blur_handler);
                } catch (e) { }
                delete it.__announcement_focus_handler;
                delete it.__announcement_blur_handler;
            });

            if (this._clonedNode && this._clonedNode.parentNode === this.listEl) {
                try { this._clonedNode.remove(); } catch (e) { }
            }

            try { delete this.listEl.dataset.announcementInitialized; } catch (e) { }
        } catch (e) { }
    };

    // Initialize all lists on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        const lists = Array.from(document.querySelectorAll('.announcement-list'));
        if (!lists.length) return;

        const scrollers = lists.map(list => new Scroller(list));

        try {
            Object.defineProperty(window, '__announcementScollers', {
                value: scrollers,
                writable: false,
                configurable: true,
                enumerable: false
            });
        } catch (e) { }

        window.addEventListener('beforeunload', () => {
            scrollers.forEach(s => s.destroy && s.destroy());
        });
    });
})();