// Assisted registrar check: JS injected into the registrar's page inside our WebView.
// It prefills the IPO + PAN where it can, focuses the CAPTCHA box, and after the user submits it scans the
// page for a result and posts it back. It never attempts to read or solve the CAPTCHA.

export interface AssistedMessage {
  kind: "ready" | "prefilled" | "result" | "snapshot" | "info";
  status?: "allotted" | "not_allotted" | "not_found";
  shares?: number | null;
  applied?: number | null;
  text?: string;
  note?: string;
}

export function buildInjectedScript(opts: { pan: string; ipoName: string }): string {
  const pan = JSON.stringify(opts.pan.toUpperCase());
  const ipo = JSON.stringify(opts.ipoName);
  return `
(function () {
  if (window.__beiporeadyInjected) { return; }
  window.__beiporeadyInjected = true;
  var PAN = ${pan};
  var IPO = ${ipo};
  function post(msg) { try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {} }
  function norm(s) { return String(s || '').toLowerCase().replace(/\\b(limited|ltd|private|pvt|ipo|sme|the|of|india)\\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\\s+/g, ' ').trim(); }
  function score(a, b) {
    var ta = norm(a).split(' ').filter(Boolean), tb = norm(b).split(' ').filter(Boolean);
    if (!ta.length || !tb.length) return 0;
    var hit = 0; for (var i = 0; i < ta.length; i++) if (tb.indexOf(ta[i]) >= 0) hit++;
    return hit / Math.max(ta.length, tb.length);
  }
  function setValue(el, value) {
    if (!el) return false;
    var proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function pickIpo() {
    var selects = Array.prototype.slice.call(document.querySelectorAll('select'));
    var best = null, bestScore = 0, bestSel = null;
    selects.forEach(function (sel) {
      Array.prototype.slice.call(sel.options).forEach(function (o) {
        var s = score(IPO, o.textContent);
        if (s > bestScore) { bestScore = s; best = o; bestSel = sel; }
      });
    });
    if (best && bestScore >= 0.5) { setValue(bestSel, best.value); return best.textContent.trim(); }
    return null;
  }
  function pickPanMode() {
    // radio / select that chooses "PAN" as the query type
    var radios = Array.prototype.slice.call(document.querySelectorAll('input[type=radio]'));
    radios.forEach(function (r) {
      var label = (r.labels && r.labels[0] && r.labels[0].textContent) || r.value || r.id || '';
      if (/pan/i.test(label) && !r.checked) { r.click(); }
    });
    var selects = Array.prototype.slice.call(document.querySelectorAll('select'));
    selects.forEach(function (sel) {
      Array.prototype.slice.call(sel.options).forEach(function (o) {
        if (/^\\s*pan\\b/i.test(o.textContent) && sel.value !== o.value) setValue(sel, o.value);
      });
    });
  }
  function fillPan() {
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input[type=text], input:not([type])'));
    var target = inputs.find(function (i) { return /pan/i.test(i.id + ' ' + i.name + ' ' + i.placeholder + ' ' + (i.getAttribute('aria-label') || '')); });
    if (!target) target = inputs.find(function (i) { return i.maxLength === 10; });
    if (target) { setValue(target, PAN); return true; }
    return false;
  }
  function focusCaptcha() {
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
    var c = inputs.find(function (i) { return /captcha|code|security/i.test(i.id + ' ' + i.name + ' ' + i.placeholder); });
    if (c) { try { c.scrollIntoView({ block: 'center' }); c.focus(); } catch (e) {} return true; }
    return false;
  }
  function textOf(el) { return ((el && (el.innerText || el.textContent)) || '').replace(/\\s+/g, ' ').trim(); }
  function numIn(str) { var m = String(str || '').match(/(\\d[\\d,]*)/); return m ? parseInt(m[1].replace(/,/g, ''), 10) : null; }
  function isVisible(el) { try { var cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; } catch (e) { return true; } }
  // Find label/value pairs: the label element's own text matches the regex; the value is the number in the
  // same element (after the label), its next sibling, its parent's next sibling, or the same column of the next table row.
  function labelValue(re) {
    var nodes = Array.prototype.slice.call(document.querySelectorAll('td, th, dt, dd, span, div, p, label, b, strong, li'));
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]; if (!isVisible(el)) continue;
      var tx = textOf(el); if (!tx || tx.length > 80) continue;
      var m = tx.match(re); if (!m) continue;
      var own = numIn(tx.slice(m.index + m[0].length)); if (own !== null) return own;
      var sib = el.nextElementSibling; if (sib) { var v1 = numIn(textOf(sib)); if (v1 !== null) return v1; }
      var par = el.parentElement;
      if (par && par.nextElementSibling) { var v2 = numIn(textOf(par.nextElementSibling)); if (v2 !== null) return v2; }
      if (el.tagName === 'TH' || el.tagName === 'TD') {
        var row = el.parentElement, idx = row ? Array.prototype.indexOf.call(row.children, el) : -1;
        var table = el.closest ? el.closest('table') : null;
        var next = row && row.nextElementSibling;
        if (!next && table) { var rows = Array.prototype.slice.call(table.querySelectorAll('tr')); var ri = rows.indexOf(row); next = ri >= 0 ? rows[ri + 1] : null; }
        if (next && next.children[idx]) { var v3 = numIn(textOf(next.children[idx])); if (v3 !== null) return v3; }
      }
    }
    return null;
  }
  function scanResult() {
    var body = document.body; if (!body) return null;
    var t = textOf(body); if (!t) return null;
    // 1) structured: "Allotted: 12" (label/value), the most reliable signal on registrar result cards
    var allotted = labelValue(/^(?:shares?\\s*)?allott?ed(?:\\s*(?:shares?|qty|quantity|securities))?\\s*[:\\-]?/i);
    if (allotted === null) { var m = t.match(/(?:shares?\\s*allott?ed|allott?ed\\s*(?:shares?|qty|quantity|securities)?)\\s*[:\\-]?\\s*(\\d[\\d,]*)/i); if (m) allotted = parseInt(m[1].replace(/,/g, ''), 10); }
    if (allotted !== null) {
      var applied = labelValue(/^(?:shares?\\s*)?applied(?:\\s*(?:shares?|qty|quantity))?\\s*[:\\-]?/i);
      return { status: allotted > 0 ? 'allotted' : 'not_allotted', shares: allotted, applied: applied, text: t.slice(0, 400) };
    }
    // 2) phrases, only when no numeric result exists
    if (/not allott?ed|non[\\s-]*allott?ed|unsuccessful|no shares? (?:were|have been|has been) allott?ed|regret to inform/i.test(t)) return { status: 'not_allotted', shares: 0, text: t.slice(0, 400) };
    if (/no record|not found|no data|does not exist|invalid pan|no application|not available/i.test(t)) return { status: 'not_found', text: t.slice(0, 400) };
    if (/congratulations/i.test(t)) return { status: 'allotted', shares: null, text: t.slice(0, 400) };
    return null;
  }
  var reported = false;
  var autoSubmitted = false;
  function clickSubmit() {
    var btns = Array.prototype.slice.call(document.querySelectorAll('button, input[type=submit], input[type=button]'));
    var b = btns.find(function (x) { return /submit|search|check|get status|proceed/i.test((x.textContent || '') + ' ' + (x.value || '') + ' ' + (x.id || '')); });
    if (b) { b.click(); return true; }
    return false;
  }
  function tryPrefill() {
    var ipoPicked = pickIpo();
    pickPanMode();
    var panOk = fillPan();
    var captcha = focusCaptcha();
    var note = (ipoPicked ? 'IPO: ' + ipoPicked + '. ' : 'Select the IPO manually. ') + (panOk ? 'PAN filled. ' : 'Type your PAN. ');
    if (!captcha && ipoPicked && panOk && !autoSubmitted) {
      // No CAPTCHA on this registrar — submit on the user's behalf (their own browser session).
      autoSubmitted = true;
      setTimeout(function () { markSubmitted(); clickSubmit(); }, 600);
      note += 'Checking…';
    } else {
      note += captcha ? 'Enter the CAPTCHA and submit.' : 'Tap Submit.';
    }
    post({ kind: 'prefilled', note: note });
  }
  var attempts = 0; var baseline = null; var submittedAt = 0;
  var timer = setInterval(function () {
    attempts++;
    var snap = textOf(document.body).slice(0, 600);
    if (baseline === null && attempts >= 2) baseline = snap;
    if (!reported) { var r = scanResult(); if (r) { reported = true; post({ kind: 'result', status: r.status, shares: r.shares, applied: r.applied, text: r.text }); } }
    if (attempts === 2) tryPrefill();
    if (!reported && submittedAt && Date.now() - submittedAt > 2500 && snap !== baseline) post({ kind: 'snapshot', text: snap });
    if (attempts > 600) clearInterval(timer);
  }, 1000);
  function markSubmitted() { reported = false; submittedAt = Date.now(); }
  document.addEventListener('submit', markSubmitted, true);
  document.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('button, input[type=submit], input[type=button]') : null; if (b && /submit|search|check|status|proceed/i.test((b.textContent || '') + ' ' + (b.value || ''))) markSubmitted(); }, true);
  post({ kind: 'ready' });
})();
true;`;
}
