/* Real network progress overlay for ALL loading entry points.
   Phase 1 "engine": declared scripts/css/fonts of the document (resource timing).
   Phase 2 "data": fetch/XHR streaming bytes (game assets).
   Shows a D2-styled bar whenever either phase (or fonts) is loading. */
(function () {
  if (window.__d2sProgress) return;
  window.__d2sProgress = true;

  var t0 = performance.now();
  /* fetch-phase state */
  var started = 0, completed = 0, announced = 0, fLoaded = 0, inFlight = 0;
  /* resource-timing state (non-fetch resources: script/css/img/font/...) */
  var roBytes = 0, roDone = 0;
  var declared = null, declaredDone = 0;
  var lastTs = t0, lastBytes = 0, speed = 0;
  var windowLoaded = false;
  var hasTS = typeof TransformStream !== 'undefined';
  var hasPO = typeof PerformanceObserver !== 'undefined';

  function isSelf(u) { return typeof u === 'string' && u.indexOf('progress-overlay') !== -1; }
  function mb(n) { return (n / 1048576).toFixed(1); }

  /* ---- resource timing (engine phase + fonts + imgs) ---- */
  function countEntry(e) {
    if (e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest') return;
    roBytes += e.transferSize || e.encodedBodySize || e.decodedBodySize || 0;
    roDone++;
    if (declared && declared.has(e.name)) declaredDone++;
  }
  if (hasPO) {
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(countEntry);
      }).observe({ type: 'resource', buffered: true });
    } catch (e) {}
  }
  function collectDeclared() {
    if (declared) return;
    declared = new Set();
    document.querySelectorAll('script[src],link[rel~="stylesheet"],link[rel~="modulepreload"],link[rel~="preload"]').forEach(function (el) {
      var u = el.src || el.href;
      if (u) declared.add(u);
    });
    performance.getEntriesByType('resource').forEach(function (e) {
      if (declared.has(e.name)) declaredDone++;
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', collectDeclared);
  } else collectDeclared();
  window.addEventListener('load', function () { windowLoaded = true; });

  /* ---- fetch ---- */
  function begin() { started++; inFlight++; }
  function end() { completed++; inFlight--; }
  var of = window.fetch;
  window.fetch = function (input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (isSelf(url)) return of.apply(this, arguments);
    begin();
    return of.apply(this, arguments).then(function (res) {
      var cl = parseInt((res.headers && res.headers.get('content-length')) || '0', 10) || 0;
      if (cl > 0) announced += cl;
      var got = 0, done = false;
      function finish() {
        if (done) return;
        done = true;
        if (cl <= 0) announced += got;
        end();
      }
      if (!res.body || !hasTS) { finish(); return res; }
      var t = new TransformStream({
        transform: function (chunk, ctrl) {
          var n = chunk.byteLength || chunk.length || 0;
          got += n; fLoaded += n; ctrl.enqueue(chunk);
        },
        flush: finish
      });
      var wrapped;
      try { wrapped = res.body.pipeThrough(t); } catch (e) { finish(); return res; }
      return new Response(wrapped, { status: res.status, statusText: res.statusText, headers: res.headers });
    }, function (err) { end(); throw err; });
  };

  /* ---- XHR ---- */
  var ox = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return ox.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    if (isSelf(x.__u)) return os.apply(this, arguments);
    begin();
    x.addEventListener('progress', function (e) {
      if (e.loaded) { fLoaded += e.loaded - (x.__l || 0); x.__l = e.loaded; }
      if (e.lengthComputable && !x.__ann) { x.__ann = true; announced += e.total; }
    });
    x.addEventListener('loadend', function () { if (!x.__ann) announced += x.__l || 0; end(); });
    return os.apply(this, arguments);
  };

  /* ---- UI ---- */
  var box = null, bar = null, txt = null;
  function ensureUi() {
    if (box || !document.body) return;
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;bottom:6%;transform:translateX(-50%);width:min(72vw,520px);z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .25s;font:12px/1.6 Georgia,"Times New Roman",serif;color:#d8c48a;text-align:center;text-shadow:0 1px 2px #000,0 0 4px #000;';
    box.innerHTML = '<div style="height:10px;border:1px solid #6b5a3f;background:#1a140c;box-shadow:inset 0 0 6px #000;">' +
      '<div id="d2s-prog-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#8a6a1f,#e8c56a);transition:width .2s;"></div></div>' +
      '<div id="d2s-prog-txt" style="margin-top:4px;letter-spacing:1px;"></div>';
    document.body.appendChild(box);
    bar = document.getElementById('d2s-prog-bar');
    txt = document.getElementById('d2s-prog-txt');
  }

  var activeSince = 0, idleSince = 0, visible = false, fetchBusySince = 0;
  setInterval(function () {
    var now = performance.now();
    var totalBytes = roBytes + fLoaded;
    speed = (totalBytes - lastBytes) / Math.max((now - lastTs) / 1000, 0.001);
    lastTs = now; lastBytes = totalBytes;
    ensureUi();
    if (!box) return;

    var busyDoc = !windowLoaded && declared && declaredDone < declared.size;
    var busyFetch = inFlight > 0;
    var busyFont = !!(document.fonts && document.fonts.status === 'loading');
    if (busyFetch) { if (!fetchBusySince) fetchBusySince = now; } else fetchBusySince = 0;
    var busy = busyDoc || busyFetch || busyFont;
    if (busy) { if (!activeSince) activeSince = now; idleSince = 0; }
    else { if (!idleSince) idleSince = now; activeSince = 0; }
    var should = (busy && now - activeSince > 400) || (visible && !(idleSince && now - idleSince > 800));
    if (should && !visible) { visible = true; box.style.opacity = '1'; }
    else if (!should && visible) { visible = false; box.style.opacity = '0'; }
    if (!visible) return;

    var pct, label, detail;
    if (busyFetch || (announced > 0 && fetchBusySince)) {
      pct = announced > 0 ? Math.min(fLoaded / announced, 1) : (started ? completed / started : 0);
      if (busyFetch && pct > 0.99) pct = 0.99;
      label = '资源';
      detail = mb(fLoaded) + ' / ' + mb(announced) + ' MB · ' + completed + '/' + started + ' 个文件';
    } else if (busyDoc && declared && declared.size) {
      pct = Math.min(declaredDone / declared.size, 0.99);
      label = '引擎';
      detail = declaredDone + '/' + declared.size + ' 个文件 · ' + mb(roBytes) + ' MB';
    } else {
      pct = 1;
      label = '完成';
      detail = mb(totalBytes) + ' MB';
    }
    if (!busyFetch && !busyDoc && busyFont && pct < 1) pct = 0.99;
    bar.style.width = (pct * 100).toFixed(1) + '%';
    txt.textContent = label + ' ' + Math.round(pct * 100) + '% · ' + detail + ' · ' + mb(speed) + ' MB/s';
  }, 200);
})();
