/* ── PDF.js setup ── */
if (window['pdfjs-dist/build/pdf']) {
    const { GlobalWorkerOptions } = window['pdfjs-dist/build/pdf'];
    GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* PDF path & catalogue ID come from the DB via PHP injection */
const PDF_PATH   = (window._CATALOG && window._CATALOG.pdfPath) || 'Andison Product Catalogue.pdf';
const CATALOG_ID = (window._CATALOG && window._CATALOG.id)      || 0;

/* ── Page image cache (localStorage) ────────────────────────────────────────
   Rendered pages are stored per-catalog so re-opening is instant.
   Old catalogs are purged automatically when a new catalog ID is detected. */
var _CACHE_VER = 'ac_' + CATALOG_ID + '_v3_';

function _cacheGet(n) {
    try { return localStorage.getItem(_CACHE_VER + n); } catch(e) { return null; }
}
function _cacheSet(n, dataUrl) {
    try { localStorage.setItem(_CACHE_VER + n, dataUrl); } catch(e) {}
}
function _cachePurgeOld() {
    try {
        var keys = Object.keys(localStorage);
        keys.forEach(function(k) {
            if (k.startsWith('ac_') && !k.startsWith(_CACHE_VER)) {
                localStorage.removeItem(k);
            }
        });
    } catch(e) {}
}
_cachePurgeOld();

/* Save a rendered page image to the server so future visitors skip the PDF */
function _savePageToServer(pageNum, total, dataUrl, pageW, pageH) {
    if (!CATALOG_ID) return;
    try {
        var fd = new FormData();
        fd.append('catalog_id', CATALOG_ID);
        fd.append('page_num',   pageNum);
        fd.append('total',      total);
        fd.append('data',       dataUrl);
        fd.append('page_w',     pageW);
        fd.append('page_h',     pageH);
        fetch('api/save-page.php', { method: 'POST', body: fd }).catch(function() {});
    } catch(e) {}
}

/* ── Flip Sound ── */
/* AudioContext creation + decodeAudioData do NOT need a user gesture.
   We start decoding immediately so the buffer is ready before first flip. */
var _audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
var _flipBuffer = null;

fetch('assets/0306.MP3')
    .then(function(r) { return r.arrayBuffer(); })
    .then(function(ab) { return _audioCtx.decodeAudioData(ab); })
    .then(function(buf) { _flipBuffer = buf; })
    .catch(function() {});

/* Resume AudioContext on the very first touch anywhere on the page –
   well before the user reaches the book to flip. */
document.addEventListener('pointerdown', function unlock() {
    _audioCtx.resume();
    document.removeEventListener('pointerdown', unlock);
}, { once: true });

function playFlipSound() {
    if (!_flipBuffer) return;
    try {
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        var src  = _audioCtx.createBufferSource();
        src.buffer = _flipBuffer;
        var gain = _audioCtx.createGain();
        gain.gain.value = 0.9;
        src.connect(gain);
        gain.connect(_audioCtx.destination);
        src.start(0);
    } catch(e) {}
}

let book, total = 0;

/* Render a single PDF page */
async function renderPage(pdf, n, renderScale, quality) {
    quality = quality || 0.82;
    const page = await pdf.getPage(n);
    const vp   = page.getViewport({ scale: renderScale });
    const cv   = document.createElement('canvas');
    cv.width   = vp.width;
    cv.height  = vp.height;
    const ctx2d = cv.getContext('2d');
    ctx2d.fillStyle = '#ffffff';
    ctx2d.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx2d, viewport: vp }).promise;
    return cv.toDataURL('image/jpeg', quality);
}

async function init() {
    try {
        var isNarrow = window.innerWidth < 600;
        var isMobile = isNarrow || ('ontouchstart' in window && window.innerWidth < 1024);

        /* ── INSTANT PATH: server has all pre-rendered JPEGs ─────────────────────
           PHP injects pageUrls + pageMeta when assets/rendered/{id}/ is complete.
           No PDF download, no browser rendering — just load tiny JPEGs directly. */
        var serverUrls = window._CATALOG && window._CATALOG.pageUrls;
        var serverMeta = window._CATALOG && window._CATALOG.pageMeta;
        if (serverUrls && serverUrls.length > 0 && serverMeta) {
            total = serverUrls.length;
            var _ppw = serverMeta.w;
            var _pph = serverMeta.h;
            var _sw  = isNarrow ? window.innerWidth * 0.97 : Math.min(window.innerWidth * 0.97, 1500);
            var _mh  = window.innerHeight * 0.84;
            var _pf  = isNarrow ? _sw : _sw / 2;
            var _pw  = Math.round(Math.min(_pf, _mh * _ppw / _pph));
            /* expose for updateUI cover-clip */
            var _clip = document.getElementById('book-clip');
            if (_clip && !isNarrow) { _clip.dataset.pw = _pw; _clip.dataset.ppw = _ppw; }
            _launchFlipbook(serverUrls, _ppw, _pph, _pw, isNarrow);
            return;
        }

        /* ── NORMAL PATH: render from PDF ────────────────────────────────────── */
        const { getDocument } = window['pdfjs-dist/build/pdf'];
        const pdf = await getDocument(PDF_PATH).promise;
        total = pdf.numPages;

        const firstPage    = await pdf.getPage(1);
        const native       = firstPage.getViewport({ scale: 1 });
        var spreadW = isNarrow
            ? window.innerWidth * 0.97
            : Math.min(window.innerWidth * 0.97, 1500);
        const maxH  = window.innerHeight * 0.84;
        var pageFit = isNarrow ? spreadW : spreadW / 2;

        const dpr          = Math.min(window.devicePixelRatio || 1, 2);
        const displayScale = Math.min(pageFit / native.width, maxH / native.height);
        const renderScale  = Math.max(displayScale * dpr, isMobile ? 1.5 : 2);
        const jpegQuality  = isMobile ? 0.65 : 0.82;

        const pw  = Math.round(native.width  * displayScale);
        const ph  = Math.round(native.height * displayScale);
        const ppw = Math.round(native.width  * renderScale);
        const pph = Math.round(native.height * renderScale);

        /* Store for updateUI cover-clip */
        if (!isNarrow) {
            var clip = document.getElementById('book-clip');
            clip.dataset.pw  = pw;
            clip.dataset.ppw = ppw;
        }

        /* Render page 1 → show cover preview while rest load */
        var _p1 = _cacheGet(1);
        if (!_p1) {
            _p1 = await renderPage(pdf, 1, renderScale, jpegQuality);
            _cacheSet(1, _p1);
            _savePageToServer(1, total, _p1, ppw, pph);
        }
        /* Show cover preview during loading */
        (function() {
            var ld   = document.getElementById('loading');
            var ring = ld.querySelector('.ring');
            var lbl  = ld.querySelector('.loading-label');
            if (ring) ring.style.display = 'none';
            if (lbl)  lbl.style.display  = 'none';
            var img = document.createElement('img');
            img.src = _p1;
            img.style.cssText = 'width:' + pw + 'px;max-width:96vw;height:auto;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.5);display:block;margin:0 auto 10px;';
            ld.insertBefore(img, ld.firstChild);
        }());

        /* Render remaining pages in parallel batches */
        var urls  = [_p1];
        var BATCH = 6;
        for (var i = 2; i <= total; i += BATCH) {
            var end   = Math.min(i + BATCH - 1, total);
            document.getElementById('load-sub').textContent =
                'Page ' + i + (end > i ? '–' + end : '') + ' of ' + total;
            var batch = [], idxs = [];
            for (var j = i; j <= end; j++) {
                var cached = _cacheGet(j);
                if (cached) { urls.push(cached); }
                else        { idxs.push(j); batch.push(renderPage(pdf, j, renderScale, jpegQuality)); }
            }
            if (batch.length) {
                var results = await Promise.all(batch);
                results.forEach(function(url, k) {
                    var pn = idxs[k];
                    _cacheSet(pn, url);
                    _savePageToServer(pn, total, url, ppw, pph);
                    urls.push(url);
                });
            }
        }

        _launchFlipbook(urls, ppw, pph, pw, isNarrow);

    } catch (err) {
        var msg = err && err.message ? err.message : 'Unknown error';
        document.getElementById('loading').innerHTML =
            '<p style="color:#f87171;text-align:center;line-height:1.7">' +
            '<b>Could not load the PDF.</b><br>' +
            '<small style="opacity:0.6">' + msg + '</small></p>';
        console.error(err);
    }
}

function _launchFlipbook(urls, ppw, pph, pw, isNarrow) {
    document.getElementById('loading').style.display   = 'none';
    document.getElementById('book-wrap').style.display = 'block';
    document.getElementById('book-wrap').style.zoom    = String(pw / ppw);

    book = new St.PageFlip(document.getElementById('flipbook'), {
        width:               ppw,
        height:              pph,
        size:                'fixed',
        drawShadow:          true,
        flippingTime:        800,
        usePortrait:         isNarrow,
        showCover:           true,
        autoSize:            false,
        maxShadowOpacity:    0.65,
        mobileScrollSupport: false,
        swipeDistance:       40,
        clickEventForward:   true,
    });

    book.loadFromImages(urls);
    book.on('flip', function(e) {
        updateUI(e.data);
        if (CATALOG_ID > 0) {
            var fd = new FormData();
            fd.append('action',      'view');
            fd.append('catalog_id',  CATALOG_ID);
            fd.append('page_number', e.data + 1);
            fetch('api/catalog.php', { method: 'POST', body: fd }).catch(function() {});
        }
    });

    if (!isNarrow) {
        var spine = document.getElementById('spine');
        spine.style.display = 'block';
        spine.style.height  = '100%';
    }

    document.getElementById('controls').style.display = 'flex';
    updateUI(0);
    _attachSoundTriggers();
}

function updateUI(idx) {
    document.getElementById('page-num').textContent =
        'Page ' + (idx + 1) + ' of ' + total;
    document.getElementById('b-first').disabled = (idx === 0);
    document.getElementById('b-prev').disabled  = (idx === 0);
    document.getElementById('b-next').disabled  = (idx >= total - 1);
    document.getElementById('b-last').disabled  = (idx >= total - 1);
    /* On the cover page, clip book-clip to one page wide so the blank
       left half is outside the visible area entirely — not just painted over. */
    var clip = document.getElementById('book-clip');
    if (clip && clip.dataset.pw) {
        var pw  = parseInt(clip.dataset.pw,  10);
        var ppw = parseInt(clip.dataset.ppw, 10);
        if (idx === 0) {
            clip.style.width          = pw + 'px';
            clip.style.overflow       = 'hidden';
            clip.style.justifyContent = '';   /* keep center for cover (marginLeft handles position) */
            /* margin-left is in book-wrap's pre-zoom coordinate space:
               -ppw × zoom(pw/ppw) = -pw effective shift to hide blank left page */
            document.getElementById('book-wrap').style.marginLeft = '-' + ppw + 'px';
        } else if (idx >= total - 1) {
            /* Last page: content is on the left half — left-align the book so the
               blank right half overflows (hidden) outside the clipped container. */
            clip.style.width          = pw + 'px';
            clip.style.overflow       = 'hidden';
            clip.style.justifyContent = 'flex-start';
            document.getElementById('book-wrap').style.marginLeft = '';
        } else {
            clip.style.width          = '';
            clip.style.overflow       = '';
            clip.style.justifyContent = '';
            clip.style.marginLeft     = '';
            document.getElementById('book-wrap').style.marginLeft = '';
        }
    }
}

/* ── Wire navigation + sound to DIRECT user gestures ─────────────────────────
   Web Audio can only start from a real user-gesture call stack.
   PageFlip's 'flip' event fires too deep inside the library — browsers block it.
   So we hook pointerdown on the book and buttons, and keydown for keyboard. */
function _attachSoundTriggers() {
    var wrap = document.getElementById('book-wrap');

    wrap.addEventListener('pointerdown', function() {
        playFlipSound();
    });

    /* Control buttons */
    document.getElementById('b-first').addEventListener('pointerdown', function() { playFlipSound(); book.flip(0); });
    document.getElementById('b-prev').addEventListener('pointerdown',  function() { playFlipSound(); book.flipPrev(); });
    document.getElementById('b-next').addEventListener('pointerdown',  function() { playFlipSound(); book.flipNext(); });
    document.getElementById('b-last').addEventListener('pointerdown',  function() { playFlipSound(); book.flip(total - 1); });

    /* Arrow / Home / End keys */
    document.addEventListener('keydown', function(e) {
        if (!book) return;
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { playFlipSound(); book.flipPrev(); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  { playFlipSound(); book.flipNext(); }
        if (e.key === 'Home') { playFlipSound(); book.flip(0); }
        if (e.key === 'End')  { playFlipSound(); book.flip(total - 1); }
    });
}

init();
