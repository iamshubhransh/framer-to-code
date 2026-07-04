// appear-shim.js — tiny runtime-free replacement for Framer's scroll/appear behavior.
// Reads window.__FTC_REVEAL__ = [{s: ".framer-xyz", o: targetOpacity, t: 0|1}, ...]
// (generated per-site by strip.mjs from a hydrated-live visibility census).
// - Reveals SSR-hidden elements on first viewport intersection (WAAPI fade, ~600ms).
// - t=1 additionally resets transform to none (only set when the live site ends at
//   identity — never clears layout transforms like translate(-50%,-50%) centering).
// - Leaves [data-framer-appear-id] elements to Framer's own inline animator when the
//   page ships one (window.animator); handles them itself otherwise.
// - Plays/pauses muted background videos on intersection (Framer's runtime did this).
// - prefers-reduced-motion / no-IntersectionObserver -> reveal instantly, no motion.
(function () {
  'use strict';
  var cfg = window.__FTC_REVEAL__ || [];
  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }

  function finalize(el, o, t) {
    el.style.opacity = String(o);
    if (t) el.style.transform = 'none';
  }
  function animateIn(el, o, t) {
    if (reduce || !el.animate) return finalize(el, o, t);
    var cs = getComputedStyle(el);
    var kf = [{ opacity: cs.opacity }, { opacity: String(o) }];
    if (t) { kf[0].transform = cs.transform; kf[1].transform = 'none'; }
    try {
      var a = el.animate(kf, { duration: 600, easing: 'cubic-bezier(0.27,0,0.35,1)', fill: 'forwards' });
      a.onfinish = function () { finalize(el, o, t); try { a.cancel(); } catch (e) { } };
      setTimeout(function () { finalize(el, o, t); }, 900); // belt & braces: persist even if onfinish is dropped
    } catch (e) { finalize(el, o, t); }
  }

  var pending = new Map(); // el -> [targetOpacity, clearTransform]
  function collect() {
    // NB: elements owned by Framer's inline animator are still collected — the animator
    // only animates the FIRST element of a duplicated data-framer-appear-id, so the
    // copies would stay invisible. The IO callback re-checks live opacity at fire time
    // and quietly skips anything the animator already revealed.
    for (var i = 0; i < cfg.length; i++) {
      var c = cfg[i], els = document.querySelectorAll(c.s);
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        if (pending.has(el)) continue;
        var cs = getComputedStyle(el);
        if (+cs.opacity >= c.o - 0.05 && (!c.t || cs.transform === 'none')) continue; // already fine
        pending.set(el, [c.o, c.t]);
      }
    }
    // appear elements not covered by the reveal config (safety net)
    var ap = document.querySelectorAll('[data-framer-appear-id]');
    for (var k = 0; k < ap.length; k++) {
      var e2 = ap[k];
      if (pending.has(e2) || +getComputedStyle(e2).opacity >= 0.9) continue;
      pending.set(e2, [1, 0]);
    }
  }

  function start() {
    collect();
    if (!('IntersectionObserver' in window)) {
      pending.forEach(function (v, el) { finalize(el, v[0], v[1]); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var el = entries[i].target;
          if (!entries[i].isIntersecting || !pending.has(el)) continue;
          var v = pending.get(el); pending.delete(el); io.unobserve(el);
          // the native animator (or an earlier pass) may have revealed it meanwhile
          if (+getComputedStyle(el).opacity >= v[0] - 0.05) { finalize(el, v[0], v[1]); continue; }
          animateIn(el, v[0], v[1]);
        }
      }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
      pending.forEach(function (_v, el) { io.observe(el); });
    }

    // Background videos: Framer's runtime started these; SSR video tags never autoplay.
    var vs = document.querySelectorAll('video[muted], video[autoplay]');
    if (vs.length && 'IntersectionObserver' in window) {
      var vio = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var v = entries[i].target;
          if (entries[i].isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; v.play().catch(function () { }); }
          else v.pause();
        }
      }, { threshold: 0.25 });
      for (var i = 0; i < vs.length; i++) vio.observe(vs[i]);
    } else {
      for (var j = 0; j < vs.length; j++) vs[j].play && vs[j].play().catch(function () { });
    }

    // Safety sweep: nothing above the fold may stay invisible if IO misbehaves.
    setTimeout(function () {
      pending.forEach(function (v, el) {
        var r = el.getBoundingClientRect();
        if (r.top < innerHeight && r.bottom > 0 && +getComputedStyle(el).opacity < 0.1) {
          pending.delete(el); finalize(el, v[0], v[1]);
        }
      });
    }, 3000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
