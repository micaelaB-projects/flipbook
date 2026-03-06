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
    return cv.toDataURL('image/jpeg', 0.95);
}

async function init() {
    try {
        const pdf = await getDocument(PDF_PATH).promise;
        total = pdf.numPages;

        /* Single page on phones only; booklet/spread on tablets + laptops */
        var isNarrow = window.innerWidth < 600;

        /* Calculate best render scale based on viewport */
        const firstPage = await pdf.getPage(1);
        const native    = firstPage.getViewport({ scale: 1 });
        /* Spread = 2 pages wide (tablet/laptop); portrait = 1 page (phone) */
        var spreadW = isNarrow
            ? window.innerWidth * 0.97
            : Math.min(window.innerWidth * 0.97, 1500);
        const maxH  = window.innerHeight * 0.84;
        var pageFit = isNarrow ? spreadW : spreadW / 2;

        /* displayScale = CSS layout size (logical pixels on screen)
           renderScale  = physical pixel resolution (min 3× for sharp text)
           ppw/pph      = physical canvas size passed to StPageFlip
           pw/ph        = CSS display size — zoom on book-wrap scales ppw→pw  */
        const dpr          = Math.min(window.devicePixelRatio || 1, 3);
        const displayScale = Math.min(pageFit / native.width, maxH / native.height);
        const renderScale  = Math.max(displayScale * dpr, 3);

        const pw  = Math.round(native.width  * displayScale);  /* CSS display px */
        const ph  = Math.round(native.height * displayScale);
        const ppw = Math.round(native.width  * renderScale);   /* physical canvas px */
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

        /* Zoom #book-wrap so the ppw×pph physical canvas displays at pw×ph.
           CSS zoom shrinks both the visual size AND the layout footprint,
           so flex centering remains correct. The canvas renders at physical
           screen pixels 1:1 — no browser upscaling, no blur. */
        document.getElementById('book-wrap').style.zoom = String(pw / ppw);

        /* Initialise StPageFlip with PHYSICAL pixel dimensions */
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
            /* Record page view in the database (fire-and-forget) */
            if (CATALOG_ID > 0) {
                var fd = new FormData();
                fd.append('action',      'view');
                fd.append('catalog_id',  CATALOG_ID);
                fd.append('page_number', e.data + 1);
                fetch('api/catalog.php', { method: 'POST', body: fd }).catch(function() {});
            }
        });

        /* Show spine only in spread mode */
        if (!isNarrow) {
            var spine = document.getElementById('spine');
            spine.style.display = 'block';
            spine.style.height  = '100%'; /* fills the zoomed book-wrap */
        }

        /* Cover clip: store both CSS and physical widths for updateUI */
        if (!isNarrow) {
            var clip = document.getElementById('book-clip');
            clip.dataset.pw  = pw;   /* CSS display width — clip boundary */
            clip.dataset.ppw = ppw;  /* physical width   — margin-left compensation */
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
