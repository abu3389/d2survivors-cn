/* Unified real-progress loading UI (v3).
   - Landing/entry pages: opaque screen = framed art (d2/frontend/loading.webp) + bar under it.
   - Play page: bar placed directly under the game's own framed art element.
   - In-game lazy loads (no art on screen): slim bar at viewport bottom.
   All numbers are real: fetch/XHR streaming bytes + resource timing. */
(function () {
  if (window.__d2sProgress) return;
  window.__d2sProgress = true;

  var t0 = performance.now();
  var started = 0, completed = 0, announced = 0, fLoaded = 0, inFlight = 0;
  var roBytes = 0, roDone = 0, declared = null, declaredDone = 0;
  var lastTs = t0, lastBytes = 0, speed = 0;
  var windowLoaded = false, firstIdleDone = false;
  var hasTS = typeof TransformStream !== 'undefined';
  var hasPO = typeof PerformanceObserver !== 'undefined';
  var ART = 'd2/frontend/loading.webp';
  var root = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/assets\/progress-overlay\.js.*$/, '') : './';
  })();
  var isPlay = location.pathname.indexOf('/play') !== -1;

  function isSelf(u) { return typeof u === 'string' && u.indexOf('progress-overlay') !== -1; }
  function mb(n) { return (n / 1048576).toFixed(1); }

  /* ---- resource timing ---- */
  function countEntry(e) {
    if (e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest') return;
    roBytes += e.transferSize || e.encodedBodySize || e.decodedBodySize || 0;
    roDone++;
    if (declared && declared.has(e.name)) declaredDone++;
  }
  if (hasPO) {
    try {
      new PerformanceObserver(function (list) { list.getEntries().forEach(countEntry); })
        .observe({ type: 'resource', buffered: true });
    } catch (e) {}
  }
  function collectDeclared() {
    if (declared) return;
    declared = new Set();
    document.querySelectorAll('script[src],link[rel~="stylesheet"],link[rel~="modulepreload"],link[rel~="preload"]').forEach(function (el) {
      var u = el.src || el.href;
      if (u) declared.add(u);
    });
    performance.getEntriesByType('resource').forEach(function (e) { if (declared.has(e.name)) declaredDone++; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', collectDeclared);
  else collectDeclared();
  window.addEventListener('load', function () { windowLoaded = true; });

  /* ---- fetch / XHR byte tracking ---- */
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
      function finish() { if (done) return; done = true; if (cl <= 0) announced += got; end(); }
      if (!res.body || !hasTS) { finish(); return res; }
      var t = new TransformStream({
        transform: function (chunk, ctrl) { var n = chunk.byteLength || chunk.length || 0; got += n; fLoaded += n; ctrl.enqueue(chunk); },
        flush: finish
      });
      var wrapped;
      try { wrapped = res.body.pipeThrough(t); } catch (e) { finish(); return res; }
      return new Response(wrapped, { status: res.status, statusText: res.statusText, headers: res.headers });
    }, function (err) { end(); throw err; });
  };
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
  var BAR_CSS = 'height:10px;border:1px solid #6b5a3f;background:#1a140c;box-shadow:inset 0 0 6px #000;';
  var FILL_CSS = 'height:100%;width:0%;background:linear-gradient(90deg,#8a6a1f,#e8c56a);transition:width .2s;';
  var TXT_CSS = 'margin-top:6px;font:12px/1.6 Georgia,"Times New Roman",serif;color:#d8c48a;text-align:center;letter-spacing:1px;text-shadow:0 1px 2px #000,0 0 4px #000;';

  /* full-screen unified loader (landing / entry) */
  var cover = document.createElement('div');
  cover.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s;';
  cover.innerHTML = '<img src="' + root + ART + '" alt="" style="width:min(86vw,52vh);image-rendering:auto;user-select:none;">' +
    '<div style="width:min(86vw,52vh);margin-top:14px;' + BAR_CSS + '"><div id="d2s-c-bar" style="' + FILL_CSS + '"></div></div>' +
    '<div id="d2s-c-txt" style="' + TXT_CSS + '"></div>';
  /* bar under the game's own art (play page) */
  var under = document.createElement('div');
  under.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;opacity:0;transition:opacity .25s;';
  under.innerHTML = '<div style="' + BAR_CSS + '"><div id="d2s-u-bar" style="' + FILL_CSS + '"></div></div><div id="d2s-u-txt" style="' + TXT_CSS + '"></div>';
  /* slim bottom bar (in-game lazy loads) */
  var slim = document.createElement('div');
  slim.style.cssText = 'position:fixed;left:50%;bottom:4%;transform:translateX(-50%);width:min(72vw,520px);z-index:2147483646;pointer-events:none;opacity:0;transition:opacity .25s;';
  slim.innerHTML = '<div style="' + BAR_CSS + '"><div id="d2s-s-bar" style="' + FILL_CSS + '"></div></div><div id="d2s-s-txt" style="' + TXT_CSS + '"></div>';

  var mounted = false;
  function mount() {
    if (mounted || !document.body) return;
    mounted = true;
    document.body.appendChild(cover);
    document.body.appendChild(under);
    document.body.appendChild(slim);
  }

  function artEl() {
    return document.querySelector('img[src*="loading.webp"],[style*="loading.webp"]');
  }
  function setBar(barEl, txtEl, pct, text) {
    barEl.style.width = (pct * 100).toFixed(1) + '%';
    txtEl.textContent = text;
  }
  function hideAll() { cover.style.opacity = '0'; cover.style.pointerEvents = 'none'; under.style.opacity = '0'; slim.style.opacity = '0'; }

  var activeSince = 0, idleSince = 0, visible = false, idleTimer = 0;
  setInterval(function () {
    var now = performance.now();
    var totalBytes = roBytes + fLoaded;
    speed = (totalBytes - lastBytes) / Math.max((now - lastTs) / 1000, 0.001);
    lastTs = now; lastBytes = totalBytes;
    mount();
    if (!mounted) return;

    var busyDoc = !windowLoaded && declared && declaredDone < declared.size;
    var busyFetch = inFlight > 0;
    var busyFont = !!(document.fonts && document.fonts.status === 'loading');
    var busy = busyDoc || busyFetch || busyFont;
    if (!busyFetch && started > 0 && !firstIdleDone) { idleTimer += 200; if (idleTimer > 1500) firstIdleDone = true; }
    else if (busyFetch) idleTimer = 0;

    if (busy) { if (!activeSince) activeSince = now; idleSince = 0; }
    else { if (!idleSince) idleSince = now; activeSince = 0; }
    var should = (busy && now - activeSince > 400) || (visible && !(idleSince && now - idleSince > 800));
    if (!should) { if (visible) { visible = false; hideAll(); } return; }
    visible = true;

    if (announced < fLoaded) announced = fLoaded;
    var pct, text;
    if (busyFetch || announced > 0) {
      pct = announced > 0 ? Math.min(fLoaded / announced, 1) : (started ? completed / started : 0);
      if (busyFetch && pct > 0.99) pct = 0.99;
      text = Math.round(pct * 100) + '% · ' + mb(fLoaded) + ' / ' + mb(announced) + ' MB · ' + completed + '/' + started + ' 个文件 · ' + mb(speed) + ' MB/s';
    } else if (busyDoc && declared && declared.size) {
      pct = Math.min(declaredDone / declared.size, 0.99);
      text = Math.round(pct * 100) + '% · ' + declaredDone + '/' + declared.size + ' 个文件 · ' + mb(roBytes) + ' MB · ' + mb(speed) + ' MB/s';
    } else { pct = 1; text = '100% · ' + mb(totalBytes) + ' MB'; }
    if (!busyFetch && !busyDoc && busyFont && pct < 1) pct = 0.99;

    var mode;
    if (!isPlay) mode = 'cover';
    else if (artEl()) mode = 'under';
    else if (!firstIdleDone) mode = 'cover';
    else mode = 'slim';

    cover.style.opacity = mode === 'cover' ? '1' : '0';
    cover.style.pointerEvents = mode === 'cover' ? 'auto' : 'none';
    under.style.opacity = mode === 'under' ? '1' : '0';
    slim.style.opacity = mode === 'slim' ? '1' : '0';

    if (mode === 'cover') {
      setBar(cover.querySelector('#d2s-c-bar'), cover.querySelector('#d2s-c-txt'), pct, text);
    } else if (mode === 'under') {
      var r = artEl().getBoundingClientRect();
      under.style.left = r.left + 'px';
      under.style.top = (r.bottom + 10) + 'px';
      under.style.width = r.width + 'px';
      setBar(under.querySelector('#d2s-u-bar'), under.querySelector('#d2s-u-txt'), pct, text);
    } else {
      setBar(slim.querySelector('#d2s-s-bar'), slim.querySelector('#d2s-s-txt'), pct, text);
    }
  }, 200);
})();
