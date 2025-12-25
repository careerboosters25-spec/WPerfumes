// Simple Payments Admin front-end script
// Expects the server to protect endpoints under /payments-admin with strong auth
// Optionally set PAYMENTS_ADMIN_TOKEN in environment and include it as X-ADMIN-TOKEN header

(function () {
  function el(id) { return document.getElementById(id); }
  function q(sel) { return document.querySelector(sel); }
  function escapeHtml(s){ if (s===null||s===undefined) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  const tableBody = q('#paymentsTable tbody');
  const pager = el('paymentsPager');
  const pageInput = el('paymentsPage');
  const perPageSelect = el('paymentsPerPage');
  const loadBtn = el('loadPaymentsBtn');

  // Provide token if available (set via server-side rendering or kept in an admin-only secret)
  // For local testing you can set window.PAYMENTS_ADMIN_TOKEN before loading this script,
  // but in production this should not be exposed to the browser. Ideally the browser uses HTTP Basic.
  const ADMIN_TOKEN = window.PAYMENTS_ADMIN_TOKEN || '';

  function apiFetch(url, opts) {
    opts = opts || {};
    opts.credentials = 'include';
    opts.headers = opts.headers || {};
    if (ADMIN_TOKEN) opts.headers['X-ADMIN-TOKEN'] = ADMIN_TOKEN;
    return fetch(url, opts);
  }

  async function loadPayments(page = 1, perPage = 25) {
    tableBody.innerHTML = '<tr><td colspan="10" style="padding:12px;color:#666">Loading…</td></tr>';
    pager.textContent = '';
    try {
      const res = await apiFetch(`/payments-admin/api/payments?page=${page}&per_page=${perPage}`);
      if (!res.ok) {
        const txt = await res.text().catch(()=>res.statusText);
        tableBody.innerHTML = `<tr><td colspan="10" style="padding:12px;color:#c00">Load failed: ${escapeHtml(txt)}</td></tr>`;
        return;
      }
      const js = await res.json();
      if (!js.items || js.items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" style="padding:12px;color:#666">No payments found.</td></tr>';
      } else {
        tableBody.innerHTML = '';
        js.items.forEach(p => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${escapeHtml(p.id)}</td>
            <td>${escapeHtml(p.provider)}</td>
            <td>${escapeHtml(p.provider_order_id||'')}</td>
            <td>${escapeHtml(p.provider_capture_id||'')}</td>
            <td>${escapeHtml(p.amount||'')} ${escapeHtml(p.currency||'')}</td>
            <td>${escapeHtml(p.status||'')}</td>
            <td>${escapeHtml(p.payer_name||'')}</td>
            <td>${escapeHtml(p.payer_email||'')}</td>
            <td>${escapeHtml(p.created_at||'')}</td>
            <td><button class="btn view" data-id="${encodeURIComponent(p.id)}">View</button></td>
          `;
          tableBody.appendChild(tr);
        });
        // wire view buttons
        Array.from(tableBody.querySelectorAll('button.view')).forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const id = decodeURIComponent(btn.dataset.id);
            await showPaymentDetail(id);
          });
        });
      }
      pager.textContent = `Page ${js.page} of ${js.pages} — total ${js.total}`;
    } catch (err) {
      console.error(err);
      tableBody.innerHTML = '<tr><td colspan="10" style="padding:12px;color:#c00">Error loading payments</td></tr>';
    }
  }

  async function showPaymentDetail(id) {
    const modal = el('paymentsModal');
    const body = el('paymentsModalBody');
    const title = el('paymentsModalTitle');
    const closeBtn = el('closeBtn');
    const closeX = el('paymentsModalClose');
    const refundBtn = el('refundBtn');
    const msg = el('paymentsModalMsg');
    body.textContent = 'Loading…';
    title.textContent = `Payment ${id}`;
    msg.textContent = '';

    modal.style.display = 'flex';
    try {
      const res = await apiFetch(`/payments-admin/api/payments/${id}`);
      if (!res.ok) {
        const txt = await res.text().catch(()=>res.statusText);
        body.textContent = `Failed to load: ${txt}`;
        return;
      }
      const p = await res.json();
      body.textContent = JSON.stringify(p, null, 2);

      // wire refund
      refundBtn.onclick = async function () {
        if (!confirm('Initiate refund for this payment? This action will contact PayPal and mark the payment as refunded in the local DB.')) return;
        msg.textContent = 'Initiating refund…';
        try {
          const r = await apiFetch(`/payments-admin/api/payments/${id}/refund`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({}) });
          if (!r.ok) {
            const txt = await r.text().catch(()=>r.statusText);
            msg.textContent = 'Refund failed: ' + txt;
            return;
          }
          const j = await r.json();
          msg.textContent = 'Refund initiated';
          // refresh listing
          loadPayments(Number(pageInput.value||1), Number(perPageSelect.value||25));
          // reload detail
          body.textContent = JSON.stringify(j, null, 2);
        } catch (err) {
          console.error(err);
          msg.textContent = 'Refund error';
        }
      };
    } catch (err) {
      console.error(err);
      body.textContent = 'Error loading payment detail';
    }

    function close() {
      modal.style.display = 'none';
      msg.textContent = '';
      refundBtn.onclick = null;
    }

    closeBtn.onclick = close;
    closeX.onclick = close;
    modal.onclick = function (e) { if (e.target === modal) close(); };
  }

  // wire actions
  loadBtn.addEventListener('click', function () {
    const p = Number(pageInput.value || 1) || 1;
    const per = Number(perPageSelect.value || 25) || 25;
    loadPayments(p, per);
  });

  // initial load
  loadPayments(Number(pageInput.value||1), Number(perPageSelect.value||25));

  // expose for debugging (only works for consoles with token set)
  window.__paymentsAdmin = { loadPayments };
})();
