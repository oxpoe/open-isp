/* =========================================================================
 * OPEN-ISP admin — Global search shortcuts + Reset Filter
 * -------------------------------------------------------------------------
 *  - Tekan "/"      : fokus ke kolom pencarian (baris filter / modal terbuka)
 *  - Tekan "Enter"  : jalankan pencarian (submit form filter)
 *  - Tombol "Reset" : otomatis ditambahkan ke tiap baris filter:
 *        • form filter GET  -> bersihkan & muat ulang tanpa query
 *        • baris filter JS  -> bersihkan & trigger ulang filter (keyup/change)
 * Non-invasif: tidak mengubah view apa pun, dimuat lewat injeksi /admin.
 * ========================================================================= */
(function () {
  'use strict';
  if (window.__adminSearchInit) return;
  window.__adminSearchInit = true;

  var NAME_SEL = 'input[name="search"], input[name="q"], input[name="keyword"], input[type="search"]';
  var FILTER_WRAP = '.srow, .filter-bar';
  var FILTER_EXTRA = 'select[name="status"], select[name="month"], select[name="year"], select[name="area"], select[name="router_id"], select[name="package_id"], select[name="collector_id"]';

  /* ---------- util ---------- */
  function isEditable(el) {
    if (!el) return false;
    var t = (el.tagName || '').toLowerCase();
    if (t === 'textarea' || t === 'select') return true;
    if (t === 'input') {
      var ty = (el.type || 'text').toLowerCase();
      return ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'hidden'].indexOf(ty) === -1;
    }
    return el.isContentEditable === true;
  }

  function isVisible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.offsetParent === null) {
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }
    return true;
  }

  function isSearchLike(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.matches('.sinput input, ' + NAME_SEL)) return true;
    if (el.closest('.sinput')) return true;
    var ph = (el.getAttribute('placeholder') || '').toLowerCase();
    if (/cari|search|telusur|temukan|find/.test(ph)) return true;
    var h = (el.getAttribute('onkeyup') || '') + (el.getAttribute('oninput') || '');
    if (h && /filter|search|cari/i.test(h)) return true;
    return false;
  }

  function openModal() {
    var mods = document.querySelectorAll('.mo.show, .modal.show');
    return mods.length ? mods[mods.length - 1] : null;
  }

  function searchInputs() {
    var nodes = document.querySelectorAll('input');
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (isSearchLike(nodes[i]) && isVisible(nodes[i])) out.push(nodes[i]);
    }
    var modal = openModal();
    out.sort(function (a, b) {
      function score(x) {
        if (modal && modal.contains(x)) return 0;
        if (x.closest(FILTER_WRAP)) return 1;
        if (x.closest('.sinput')) return 2;
        return 3;
      }
      return score(a) - score(b);
    });
    return out;
  }

  function firstSearch() { return searchInputs()[0] || null; }

  function flash(el) {
    var w = el.closest('.sinput') || el.parentElement || el;
    if (!w || !w.classList) return;
    w.classList.add('admin-search-flash');
    setTimeout(function () { w.classList.remove('admin-search-flash'); }, 900);
  }

  function submitForm(form) {
    if (!form) return;
    if (typeof form.requestSubmit === 'function') {
      try { form.requestSubmit(); return; } catch (e) { /* fallback */ }
    }
    form.submit();
  }

  /* ---------- keyboard shortcut ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    var el = document.activeElement;
    var typing = isEditable(el);

    // Enter di kolom pencarian -> jalankan pencarian
    if (e.key === 'Enter' && typing && el && el.tagName === 'INPUT') {
      var isSearch = !!(el.closest('.sinput') || isSearchLike(el));
      var form = el.form || el.closest('form');
      if (isSearch && form) {
        e.preventDefault();
        submitForm(form);
      }
      return;
    }

    // "/" -> fokus kolom pencarian (hanya saat tidak sedang mengetik)
    if ((e.key === '/' || e.key === 'Slash' || e.code === 'Slash') && !typing) {
      var inp = firstSearch();
      if (inp) {
        e.preventDefault();
        inp.focus();
        try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (err) {}
        flash(inp);
      }
    }
  }, true);

  /* ---------- helpers reset ---------- */
  function baseAction(form) {
    var a = form.getAttribute('action') || location.pathname || '/';
    return (a.split('?')[0]) || location.pathname || '/';
  }

  function clearField(el) {
    var ty = (el.type || '').toLowerCase();
    if (ty === 'hidden') return;
    if (ty === 'checkbox' || ty === 'radio') { el.checked = el.defaultChecked; return; }
    if (el.tagName === 'SELECT') {
      var idx = 0;
      for (var o = 0; o < el.options.length; o++) if (el.options[o].defaultSelected) { idx = o; break; }
      el.selectedIndex = idx;
      return;
    }
    el.value = '';
  }

  function fireEvents(el) {
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: '', code: '' })); } catch (e) {}
  }

  function makeResetButton(scope, onClick) {
    var btn = document.createElement('a');
    btn.href = 'javascript:void(0)';
    btn.className = 'btn btn-g btn-sm';
    btn.setAttribute('data-admin-reset', '1');
    btn.setAttribute('title', 'Reset semua filter');
    btn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Reset';
    btn.addEventListener('click', function (ev) { ev.preventDefault(); onClick(); });
    return btn;
  }

  /* ---------- A) form filter GET ---------- */
  function isFilterForm(f) {
    if (!f) return false;
    if (f.closest('.mo, .modal')) return false;               // jangan sentuh form di modal
    if ((f.getAttribute('method') || 'get').toLowerCase() !== 'get') return false;
    if (f.matches(FILTER_WRAP)) return true;
    if (f.querySelector('.sinput, ' + NAME_SEL + ', ' + FILTER_EXTRA)) return true;
    var ins = f.querySelectorAll('input');
    for (var i = 0; i < ins.length; i++) if (isSearchLike(ins[i])) return true;
    return false;
  }

  function hasReset(f) {
    var ctrls = f.querySelectorAll('a, button');
    for (var i = 0; i < ctrls.length; i++) {
      var c = ctrls[i];
      if (c.hasAttribute('data-admin-reset')) continue;
      if (c.tagName === 'BUTTON' && (c.getAttribute('type') || '').toLowerCase() === 'reset') return true;
      if (c.hasAttribute('data-reset')) return true;
      if ((c.textContent || '').toLowerCase().indexOf('reset') !== -1) return true;
    }
    return false;
  }

  function setupFormReset(form) {
    if (form.querySelector('[data-admin-reset]') || hasReset(form)) return;
    form.appendChild(makeResetButton(form, function () {
      var fields = form.querySelectorAll('input, select');
      for (var i = 0; i < fields.length; i++) clearField(fields[i]);
      location.href = baseAction(form);
    }));
  }

  /* ---------- B) baris filter client-side ---------- */
  function clientScope(el) {
    return el.closest(FILTER_WRAP) || el.closest('.sinput') || null;
  }

  function setupClientReset(scope) {
    if (!scope || scope.hasAttribute('data-admin-reset-scope')) return;
    scope.setAttribute('data-admin-reset-scope', '1');
    // jangan dobel bila sudah ada tombol reset di dalam/ sekitar
    var near = scope.querySelector('[data-admin-reset]') ||
      (scope.parentElement && scope.parentElement.querySelector('[data-admin-reset]'));
    if (near || hasReset(scope)) return;

    var btn = makeResetButton(scope, function () {
      var fields = scope.querySelectorAll('input, select');
      for (var i = 0; i < fields.length; i++) { clearField(fields[i]); fireEvents(fields[i]); }
    });

    if (scope.matches(FILTER_WRAP)) {
      scope.appendChild(btn);
    } else if (scope.parentElement) {
      scope.insertAdjacentElement('afterend', btn);
    } else {
      scope.appendChild(btn);
    }
  }

  function setup() {
    // A) form filter GET
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) if (isFilterForm(forms[i])) setupFormReset(forms[i]);

    // B) baris filter client-side (input di luar form)
    var ins = document.querySelectorAll('input');
    for (var j = 0; j < ins.length; j++) {
      var el = ins[j];
      if (!isSearchLike(el)) continue;
      if (el.closest('form')) continue;                 // ditangani bagian A
      if (el.closest('.mo, .modal')) continue;          // jangan di modal
      var sc = clientScope(el);
      if (sc) setupClientReset(sc);
    }

    // hint tooltip
    var inputs = searchInputs();
    for (var k = 0; k < inputs.length; k++) {
      if (!inputs[k].getAttribute('title')) inputs[k].setAttribute('title', 'Tekan "/" untuk fokus, "Enter" untuk mencari');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
