/* ── PDF.js setup ── */
const { GlobalWorkerOptions, getDocument } = window['pdfjs-dist/build/pdf'];
GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* PDF path & catalogue ID come from the DB via PHP injection */
const PDF_PATH   = (window._CATALOG && window._CATALOG.pdfPath) || 'Andison Product Catalogue.pdf';
const CATALOG_ID = (window._CATALOG && window._CATALOG.id)      || 0;

/* ── Page image cache (localStorage) ────────────────────────────────────────
   Rendered pages are stored per-catalog so re-opening is instant.
   Old catalogs are purged automatically when a new catalog ID is detected. */
var _CACHE_VER = 'ac_' + CATALOG_ID + '_v1_';

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

/* Render a single PDF page – renders at physical pixel resolution for sharpness */
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
        /* Shared layout variables — assigned in fast-path OR normal path below */
        var pw, ph, ppw, pph, isNarrow, isMobile;
        isNarrow = window.innerWidth < 600;
        isMobile = isNarrow || ('ontouchstart' in window && window.innerWidth < 1024);

        /* ── INSTANT PATH: server already has all pre-rendered page images ───────────
           No PDF download, no browser rendering — just load JPEGs directly. */
        var serverUrls = window._CATALOG && window._CATALOG.pageUrls;
        var serverMeta = window._CATALOG && window._CATALOG.pageMeta;
        if (serverUrls && serverUrls.length > 0 && serverMeta) {
            total     = serverUrls.length;
            ppw       = serverMeta.w;
            pph       = serverMeta.h;
            var _sw   = isNarrow ? window.innerWidth * 0.97 : Math.min(window.innerWidth * 0.97, 1500);
            var _mh   = window.innerHeight * 0.84;
            var _pf   = isNarrow ? _sw : _sw / 2;
            pw = Math.round(Math.min(_pf, _mh * ppw / pph));
            ph = Math.round(pw * pph / ppw);
            launchFlipbook(serverUrls);
            return;
        }

        /* ── NORMAL PATH: render from PDF (saves pages to server in background) ─ */
        const pdf = await getDocument(PDF_PATH).promise;
        total = pdf.numPages;

        /* Calculate best render scale based on viewport */
        const firstPage = await pdf.getPage(1);
        const native    = firstPage.getViewport({ scale: 1 });
        var spreadW = isNarrow
            ? window.innerWidth * 0.97
            : Math.min(window.innerWidth * 0.97, 1500);
        const maxH  = window.innerHeight * 0.84;
        var pageFit = isNarrow ? spreadW : spreadW / 2;

        /* displayScale = CSS layout size (logical pixels on screen)
           renderScale  = physical pixel resolution (min 3× for sharp text)
           ppw/pph      = physical canvas size passed to StPageFlip
           pw/ph        = CSS display size — zoom on book-wrap scales ppw→pw  */
        const dpr          = Math.min(window.devicePixelRatio || 1, 2);
        const displayScale = Math.min(pageFit / native.width, maxH / native.height);
        const renderScale  = Math.max(displayScale * dpr, isMobile ? 1.5 : 2);
        const jpegQuality  = isMobile ? 0.65 : 0.82;

        pw  = Math.round(native.width  * displayScale);  /* CSS display px */
        ph  = Math.round(native.height * displayScale);
        ppw = Math.round(native.width  * renderScale);   /* physical canvas px */
        pph = Math.round(native.height * renderScale);

        /* ── Check if all pages are already cached → show instantly ── */
        var _allCached = true;
        var _cachedUrls = [];
        for (var _ci = 1; _ci <= total; _ci++) {
            var _hit = _cacheGet(_ci);
            if (!_hit) { _allCached = false; break; }
            _cachedUrls.push(_hit);
        }

        /* placeholder transparent 1×1 for pages not yet rendered */
        var PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAI=';

        /* ── Helper: launch flipbook with provided urls array ── */
        function launchFlipbook(urls) {
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
            if (!isNarrow) {
                var clip = document.getElementById('book-clip');
                clip.dataset.pw  = pw;
                clip.dataset.ppw = ppw;
            }

            document.getElementById('controls').style.display = 'flex';
            updateUI(0);
            _attachSoundTriggers();
        }

        if (_allCached) {
            /* All pages cached — instant launch, no spinner at all */
            launchFlipbook(_cachedUrls);
            /* Server may be missing pages (e.g. browser closed mid-render on first visit).
               Push any absent pages to the server silently in background. */
            if (!window._CATALOG.pageUrls && CATALOG_ID > 0) {
                (async function() {
                    for (var _si = 1; _si <= total; _si++) {
                        _savePageToServer(_si, total, _cachedUrls[_si - 1], ppw, pph);
                        await new Promise(function(r) { setTimeout(r, 300); });
                    }
                }());
            }
            return; /* nothing more to do */
        }

        /* ── Not fully cached: render page 1, launch immediately, stream rest ── */
        var _p1cached = _cacheGet(1);
        const firstUrl = _p1cached ? _p1cached : await renderPage(pdf, 1, renderScale, jpegQuality);
        if (!_p1cached) {
            _cacheSet(1, firstUrl);
            _savePageToServer(1, total, firstUrl, ppw, pph);
        }

        /* Pre-fill urls array with placeholders so PageFlip knows total count */
        var urls = [firstUrl];
        for (var _pi = 2; _pi <= total; _pi++) {
            urls.push(_cacheGet(_pi) || PLACEHOLDER);
        }

        /* Launch flipbook NOW — user can start reading page 1 */
        launchFlipbook(urls);

        /* Stream remaining pages in background, hot-swap into already-running book */
        (async function () {
            var BATCH = 6;
            for (var i = 2; i <= total; i += BATCH) {
                var end   = Math.min(i + BATCH - 1, total);
                var batch = [];
                var idxs  = [];
                for (var j = i; j <= end; j++) {
                    if (urls[j - 1] === PLACEHOLDER) {
                        idxs.push(j);
                        batch.push(renderPage(pdf, j, renderScale, jpegQuality));
                    }
                }
                if (!batch.length) continue;
                var results = await Promise.all(batch);
                results.forEach(function(url, k) {
                    var pn = idxs[k];
                    _cacheSet(pn, url);
                    _savePageToServer(pn, total, url, ppw, pph);
                    urls[pn - 1] = url;
                    /* Hot-swap placeholder with real image in PageFlip */
                    try {
                        var pages = book.getPageCollection ? book.getPageCollection().pages : null;
                        if (pages && pages[pn - 1]) {
                            pages[pn - 1].setImage(url);
                        }
                    } catch(e) {}
                });
            }
        }());

    } catch (err) {
        var msg = err && err.message ? err.message : 'Unknown error';
        document.getElementById('loading').innerHTML =
            '<p style="color:#f87171;text-align:center;line-height:1.7">' +
            '<b>Could not load the PDF.</b><br>' +
            '<small style="opacity:0.6">' + msg + '</small></p>';
        console.error(err);
    }
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
            clip.style.width      = pw + 'px';
            clip.style.overflow   = 'hidden';
            /* margin-left is in book-wrap's pre-zoom coordinate space:
               -ppw × zoom(pw/ppw) = -pw effective shift to hide blank left page */
            document.getElementById('book-wrap').style.marginLeft = '-' + ppw + 'px';
        } else {
            clip.style.width      = '';
            clip.style.overflow   = '';
            clip.style.marginLeft = '';
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
