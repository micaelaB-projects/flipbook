<?php
require_once __DIR__ . '/config/db.php';

$catalog = null;
try {
    $pdo  = getDB();
    $stmt = $pdo->prepare(
        'SELECT id, title, pdf_path FROM catalogs WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
    );
    $stmt->execute();
    $catalog = $stmt->fetch();
} catch (Exception $e) {}

$catalogId = $catalog ? (int)$catalog['id']       : 0;
$title     = $catalog ? htmlspecialchars($catalog['title'], ENT_QUOTES, 'UTF-8') : 'No catalog';
$pdfPath   = $catalog ? $catalog['pdf_path']       : '';

/* Count already-rendered pages */
$existingCount = 0;
$totalPages    = 0;
if ($catalogId > 0) {
    $rDir = __DIR__ . '/assets/rendered/' . $catalogId;
    $meta = @json_decode(@file_get_contents($rDir . '/meta.json'), true);
    if ($meta && !empty($meta['total'])) $totalPages = (int)$meta['total'];
    for ($i = 1; $i <= $totalPages; $i++) {
        if (file_exists($rDir . '/' . $i . '.jpg')) $existingCount++;
    }
}
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pre-render Catalog — <?php echo $title; ?></title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               background: #f3f4f6; min-height: 100vh; display: flex; align-items: center;
               justify-content: center; padding: 24px; }
        .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.1);
                max-width: 540px; width: 100%; padding: 32px; }
        h1 { font-size: 1.3rem; color: #111827; margin-bottom: 6px; }
        .sub { color: #6b7280; font-size: 0.88rem; margin-bottom: 24px; }
        .info-row { display: flex; gap: 16px; margin-bottom: 20px; }
        .info-box { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
                    padding: 12px; text-align: center; }
        .info-box .val { font-size: 1.6rem; font-weight: 700; color: #2563eb; }
        .info-box .lbl { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }
        .bar-wrap { background: #e5e7eb; border-radius: 99px; height: 12px; overflow: hidden; margin-bottom: 10px; }
        .bar      { background: linear-gradient(90deg,#2563eb,#3b82f6); height: 100%;
                    width: 0; border-radius: 99px; transition: width 0.4s ease; }
        #status   { font-size: 0.85rem; color: #374151; min-height: 1.4em; margin-bottom: 16px; }
        .btn      { display: block; width: 100%; padding: 13px; background: #2563eb; color: #fff;
                    border: none; border-radius: 8px; font-size: 1rem; font-weight: 600;
                    cursor: pointer; transition: background .2s; }
        .btn:hover  { background: #1d4ed8; }
        .btn:disabled { background: #93c5fd; cursor: default; }
        .done-msg { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px;
                    padding: 16px; text-align: center; display: none; }
        .done-msg .icon  { font-size: 2.2rem; }
        .done-msg strong { display: block; color: #15803d; font-size: 1.05rem; margin: 6px 0 4px; }
        .done-msg span   { color: #166534; font-size: 0.83rem; }
        .warn { background: #fefce8; border: 1px solid #fde047; border-radius: 8px;
                padding: 12px 14px; font-size: 0.82rem; color: #713f12; margin-bottom: 20px; }
        .log  { font-size: 0.75rem; color: #9ca3af; margin-top: 8px; max-height: 80px;
                overflow-y: auto; font-family: monospace; }
    </style>
</head>
<body>
<div class="card">
    <h1>Pre-render Catalog Pages</h1>
    <p class="sub">Run this once so every phone scan loads the catalog <strong>instantly</strong> — no PDF download needed.</p>

    <?php if (!$catalogId): ?>
    <div class="warn">⚠ No active catalog found in the database.</div>
    <?php else: ?>

    <div class="info-row">
        <div class="info-box">
            <div class="val" id="box-done"><?php echo $existingCount; ?></div>
            <div class="lbl">Pages cached</div>
        </div>
        <div class="info-box">
            <div class="val" id="box-total"><?php echo $totalPages ?: '—'; ?></div>
            <div class="lbl">Total pages</div>
        </div>
        <div class="info-box">
            <div class="val" id="box-kb">—</div>
            <div class="lbl">Avg size (KB)</div>
        </div>
    </div>

    <div class="bar-wrap"><div class="bar" id="bar"></div></div>
    <div id="status">Ready. Press the button to start.</div>

    <button class="btn" id="btn-start">▶  Start Pre-rendering</button>

    <div class="done-msg" id="done-msg">
        <div class="icon">✅</div>
        <strong id="done-title">All pages cached!</strong>
        <span id="done-sub">Phone QR scans will now load instantly.</span>
    </div>

    <div class="log" id="log"></div>
    <?php endif; ?>
</div>

<?php if ($catalogId): ?>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
const { GlobalWorkerOptions, getDocument } = window['pdfjs-dist/build/pdf'];
GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const PDF_PATH   = <?php echo json_encode($pdfPath); ?>;
const CATALOG_ID = <?php echo json_encode($catalogId); ?>;
const TARGET_W   = 800;   /* Render at 800 px wide — sharp on phones, keeps files small */

const statusEl = document.getElementById('status');
const barEl    = document.getElementById('bar');
const logEl    = document.getElementById('log');
const boxDone  = document.getElementById('box-done');
const boxTotal = document.getElementById('box-total');
const boxKb    = document.getElementById('box-kb');
const doneMsg  = document.getElementById('done-msg');
const btn      = document.getElementById('btn-start');

function log(msg) {
    var p = document.createElement('div');
    p.textContent = msg;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
}

btn.addEventListener('click', async function () {
    btn.disabled = true;
    btn.textContent = '⏳ Rendering…';
    doneMsg.style.display = 'none';

    try {
        statusEl.textContent = 'Loading PDF…';
        const pdf   = await getDocument(PDF_PATH).promise;
        const total = pdf.numPages;
        boxTotal.textContent = total;
        log('PDF loaded — ' + total + ' pages');

        var totalKb = 0;

        for (var i = 1; i <= total; i++) {
            statusEl.textContent = 'Rendering page ' + i + ' of ' + total + '…';
            barEl.style.width = Math.round((i - 1) / total * 100) + '%';

            const page = await pdf.getPage(i);
            const vp0  = page.getViewport({ scale: 1 });
            const scale = TARGET_W / vp0.width;
            const vp    = page.getViewport({ scale: scale });

            const cv    = document.createElement('canvas');
            cv.width    = Math.round(vp.width);
            cv.height   = Math.round(vp.height);
            const ctx   = cv.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, cv.width, cv.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;

            const dataUrl = cv.toDataURL('image/jpeg', 0.82);
            const sizeKb  = Math.round(dataUrl.length * 0.75 / 1024);
            totalKb += sizeKb;
            boxKb.textContent = Math.round(totalKb / i);

            /* Upload to server */
            const fd = new FormData();
            fd.append('catalog_id', CATALOG_ID);
            fd.append('page_num',   i);
            fd.append('total',      total);
            fd.append('data',       dataUrl);
            fd.append('page_w',     cv.width);
            fd.append('page_h',     cv.height);

            const resp = await fetch('api/save-page.php', { method: 'POST', body: fd });
            if (!resp.ok) {
                var txt = await resp.text();
                throw new Error('Server error on page ' + i + ': ' + txt);
            }
            const json = await resp.json();
            if (!json.ok) throw new Error('Save failed for page ' + i);

            boxDone.textContent = i;
            log('Page ' + i + ' saved (' + sizeKb + ' KB)');
        }

        barEl.style.width = '100%';
        statusEl.textContent = 'Done!';
        btn.style.display = 'none';

        document.getElementById('done-title').textContent =
            'All ' + total + ' pages cached!';
        document.getElementById('done-sub').textContent =
            'Avg ' + Math.round(totalKb / total) + ' KB/page · ' +
            Math.round(totalKb / 1024 * 10) / 10 + ' MB total · ' +
            'QR scans will now load instantly.';
        doneMsg.style.display = 'block';

    } catch (err) {
        statusEl.innerHTML = '<span style="color:#dc2626">Error: ' + err.message + '</span>';
        btn.disabled = false;
        btn.textContent = '↺  Retry';
        log('ERROR: ' + err.message);
        console.error(err);
    }
});
</script>
<?php endif; ?>
</body>
</html>
