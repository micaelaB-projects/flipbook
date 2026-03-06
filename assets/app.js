/* ── PDF.js setup ── */
const { GlobalWorkerOptions, getDocument } = window['pdfjs-dist/build/pdf'];
GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* PDF path & catalogue ID come from the DB via PHP injection */
const PDF_PATH   = (window._CATALOG && window._CATALOG.pdfPath) || 'Andison Product Catalogue.pdf';
const CATALOG_ID = (window._CATALOG && window._CATALOG.id)      || 0;

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
async function renderPage(pdf, n, renderScale) {
    const page = await pdf.getPage(n);
    const vp   = page.getViewport({ scale: renderScale });
    const cv   = document.createElement('canvas');
    cv.width   = vp.width;
    cv.height  = vp.height;
    const ctx2d = cv.getContext('2d');
    ctx2d.fillStyle = '#ffffff';
    ctx2d.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx2d, viewport: vp }).promise;
    /* PNG = lossless, no JPEG artifacts on text edges */
    return cv.toDataURL('image/png');
}

async function init() {
    try {
        const pdf = await getDocument(PDF_PATH).promise;
        total = pdf.numPages;

        /* Portrait on narrow screens, spread on desktop */
        var isNarrow = window.innerWidth < 768;

        /* Calculate best render scale based on viewport */
        const firstPage = await pdf.getPage(1);
        const native    = firstPage.getViewport({ scale: 1 });
        /* Spread fits 2 pages wide; portrait fits 1 page */
        var spreadW = isNarrow
            ? window.innerWidth * 0.99
            : Math.min(window.innerWidth * 0.97, 1700);
        const maxH  = isNarrow
            ? window.innerHeight * 0.74   /* leave room for logo + controls */
            : window.innerHeight * 0.88;
        var pageFit = isNarrow ? spreadW : spreadW / 2;

        /* dpr = physical pixels per CSS pixel on this screen */
        const dpr          = Math.min(window.devicePixelRatio || 1, 3);
        const displayScale = Math.min(pageFit / native.width, maxH / native.height);

        /* Enforce a minimum render quality of 2.5× PDF native scale.
           Without this, a height-constrained viewport gives displayScale < 1.0
           (below 72 DPI!) — the #1 cause of blurry text on desktop screens.
           Max 2200px per page to keep memory under control. */
        const MIN_RENDER  = 2.5;
        const MAX_RENDER_W = 2200;
        const rawRender   = Math.max(displayScale * Math.max(dpr, 1), MIN_RENDER);
        const renderScale = Math.min(rawRender, MAX_RENDER_W / native.width);

        /* CSS layout dimensions */
        const pw  = Math.round(native.width  * displayScale);
        const ph  = Math.round(native.height * displayScale);
        /* Physical (canvas) dimensions — rendered images match canvas 1:1, no interpolation */
        const ppw = Math.round(native.width  * renderScale);
        const pph = Math.round(native.height * renderScale);

        /* Render every page */
        const urls = [];
        for (let i = 1; i <= total; i++) {
            document.getElementById('load-sub').textContent =
                'Page ' + i + ' of ' + total;
            const url = await renderPage(pdf, i, renderScale);
            urls.push(url);
        }

        /* Swap loading → flipbook */
        document.getElementById('loading').style.display   = 'none';
        document.getElementById('book-wrap').style.display = 'block';

        /* Scale book-wrap: canvas is ppw×pph physical pixels, display at pw×ph CSS pixels.
           Ratio displayScale/renderScale is always ≤1 (canvas is always larger than display). */
        document.getElementById('book-wrap').style.zoom = (displayScale / renderScale);

        /* Initialise StPageFlip — width/height in physical pixels so its
           internal canvas buffer matches the screen with no interpolation */
        book = new St.PageFlip(document.getElementById('flipbook'), {
            width:               ppw,
            height:              pph,
            size:                'fixed',
            drawShadow:          true,
            flippingTime:        800,
            usePortrait:         isNarrow,  /* spread on desktop, single on mobile */
            showCover:           true,      /* cover & back cover as single pages */
            autoSize:            false,  /* don't let PageFlip override our canvas dimensions */
            maxShadowOpacity:    0.65,
            mobileScrollSupport: false,
            swipeDistance:       40,
            clickEventForward:   true,
        });

        book.loadFromImages(urls);
        book.on('flip', function(e) {
            updateUI(e.data);
            /* Record page view in the database (fire-and-forget) */
            if (CATALOG_ID > 0) {
                var fd = new FormData();
                fd.append('action',      'view');
                fd.append('catalog_id',  CATALOG_ID);
                fd.append('page_number', e.data + 1);
                fetch('api/catalog.php', { method: 'POST', body: fd }).catch(function() {});
            }
        });

        /* Show spine only in spread mode — height in physical px (inside zoomed context) */
        if (!isNarrow) {
            var spine = document.getElementById('spine');
            spine.style.display = 'block';
            spine.style.height  = pph + 'px';
        }

        document.getElementById('controls').style.display = 'flex';
        updateUI(0);
        _attachSoundTriggers();

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
