<?php
/* ── Standalone QR Code page ────────────────────────────────────────────── */
$reqHost  = $_SERVER['HTTP_HOST'] ?? 'localhost';
$bareHost = strtolower(explode(':', $reqHost)[0]);
$isLocal  = in_array($bareHost, ['localhost', '127.0.0.1', '::1']);
if ($isLocal) {
    $lanIp     = gethostbyname(gethostname());
    $port      = $_SERVER['SERVER_PORT'] ?? 80;
    $portStr   = ($port == 80 || $port == 443) ? '' : ':' . $port;
    $shareHost = $lanIp . $portStr;
} else {
    $shareHost = $reqHost;
}
$scheme   = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$flipUrl  = $scheme . '://' . $shareHost . '/flipbook/product-catalog.php';

$logoFile    = __DIR__ . '/assets/logo.png';
$logoDataUri = file_exists($logoFile)
    ? 'data:image/png;base64,' . base64_encode(file_get_contents($logoFile))
    : '';

$qrLogoFile    = __DIR__ . '/assets/andisonqr.jpg';
$qrLogoDataUri = file_exists($qrLogoFile)
    ? 'data:image/jpeg;base64,' . base64_encode(file_get_contents($qrLogoFile))
    : $logoDataUri;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Andison Flipbook – QR Code</title>
    <style>
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        body {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 24px;
            font-family: 'Segoe UI', system-ui, sans-serif;
            color: #f0f0f0;
            background-color: #0d1b2a;
            background-image:
                repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(255,255,255,0.012) 40px, rgba(255,255,255,0.012) 41px),
                radial-gradient(ellipse 110% 55% at 50% -10%, rgba(41,98,178,0.55) 0%, rgba(15,40,80,0.4) 45%, transparent 70%),
                linear-gradient(160deg, #0d1b2a 0%, #10243a 50%, #0a1520 100%);
            padding: 32px 16px;
        }
        .logo-img {
            height: 48px;
            width: auto;
            filter: brightness(0) invert(1) drop-shadow(0 2px 12px rgba(100,160,255,0.25));
        }
        h1 {
            font-size: 1rem;
            letter-spacing: 0.1em;
            color: #c8ddf8;
            text-align: center;
        }
        #qr-canvas {
            border-radius: 14px;
            background: #fff;
            display: block;
            box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(100,170,255,0.1);
        }
        #qr-wrap {
            position: relative;
            display: inline-block;
            line-height: 0;
        }
        #qr-logo-badge {
            display: none;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            line-height: 0;
            background: #ffffff;
            padding: 6px;
            border-radius: 8px;
        }
        #qr-logo-badge img {
            width: 95px;
            height: auto;
            display: block;
        }
        .hint {
            font-size: 0.72rem;
            color: rgba(180,210,255,0.38);
            letter-spacing: 0.1em;
            text-transform: uppercase;
            text-align: center;
        }
        .url-label {
            font-size: 0.72rem;
            color: rgba(180,210,255,0.5);
            letter-spacing: 0.06em;
            word-break: break-all;
            text-align: center;
            max-width: 340px;
        }
        .dl-btn {
            background: transparent;
            border: 1px solid rgba(100,170,255,0.25);
            color: #a8c8f0;
            padding: 8px 24px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 0.82rem;
            letter-spacing: 0.05em;
            text-decoration: none;
            transition: background 0.18s, border-color 0.18s;
        }
        .dl-btn:hover {
            background: rgba(100,170,255,0.1);
            border-color: #6ab0ff;
            color: #ddefff;
        }
        #status {
            font-size: 0.8rem;
            color: rgba(180,210,255,0.5);
            letter-spacing: 0.05em;
        }
    </style>
</head>
<body>

    <img class="logo-img" src="assets/logo.png" alt="Andison Industrial">
    <h1>Scan to open the Product Catalog</h1>

    <div id="qr-wrap">
    <canvas id="qr-canvas" width="300" height="300"></canvas>
    <div id="qr-logo-badge"><img src="<?php echo $qrLogoDataUri; ?>" alt="Andison Industrial"></div>
    </div>
    <span id="status">Generating QR…</span>

    <p class="hint">Works on Android &amp; iOS &mdash; same Wi-Fi required</p>
    <p class="url-label" id="url-display"></p>

    <a class="dl-btn" id="dl-btn" href="#" download="andison-flipbook-qr.png">&#8595; Download PNG</a>

<script>
(function () {
    var FLIP_URL  = <?php echo json_encode($flipUrl); ?>;
    var LOGO_URI     = <?php echo json_encode($logoDataUri); ?>;
    var ANDISONQR_URI = <?php echo json_encode($qrLogoDataUri); ?>;
    var cv        = document.getElementById('qr-canvas');
    var status    = document.getElementById('status');
    var dlBtn     = document.getElementById('dl-btn');
    var urlDisp   = document.getElementById('url-display');
    var QR_SIZE   = 300;   /* QR display canvas size */

    urlDisp.textContent = FLIP_URL;

    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, QR_SIZE, QR_SIZE);

    var encoded  = encodeURIComponent(FLIP_URL);
    var proxyUrl = 'qr-download.php?proxy=1&url=' + encoded;

    var qrImg = new Image();
    qrImg.onload = function () {
        /* Draw QR on the visible canvas */
        ctx.drawImage(qrImg, 0, 0, QR_SIZE, QR_SIZE);
        status.textContent = 'Ready to scan!';

        /* Show the HTML logo badge over the canvas */
        document.getElementById('qr-logo-badge').style.display = 'block';

        /* ── Build branded card for download ── */
        var logo = new Image();
        logo.onload = function () {
            /* Card dimensions */
            var CARD_W   = 520;
            var PAD      = 40;
            var LOGO_H   = 60;
            var LOGO_W   = logo.naturalWidth * (LOGO_H / logo.naturalHeight);
            var TITLE_H  = 48;
            var QR_W     = 400;
            var QR_Y     = PAD + LOGO_H + 24 + TITLE_H + 20;
            var CARD_H   = QR_Y + QR_W + PAD;

            var card    = document.createElement('canvas');
            card.width  = CARD_W;
            card.height = CARD_H;
            var c = card.getContext('2d');

            /* Navy gradient background */
            var grad = c.createLinearGradient(0, 0, 0, CARD_H);
            grad.addColorStop(0,   '#0f2033');
            grad.addColorStop(1,   '#0a1520');
            c.fillStyle = grad;
            c.fillRect(0, 0, CARD_W, CARD_H);

            /* Subtle top glow */
            var glow = c.createRadialGradient(CARD_W/2, 0, 0, CARD_W/2, 0, CARD_W * 0.7);
            glow.addColorStop(0,   'rgba(41,98,178,0.45)');
            glow.addColorStop(1,   'rgba(41,98,178,0)');
            c.fillStyle = glow;
            c.fillRect(0, 0, CARD_W, CARD_H);

            /* Logo (white: draw navy rect, composite white via filter not available in canvas.
               Instead draw logo normally — it's already white/inverted by CSS on webpage,
               but the actual PNG is the blue version, so we tint it white via globalCompositeOperation) */
            /* Draw logo tinted white: first draw it, then overlay white with 'source-atop' */
            var offL = document.createElement('canvas');
            offL.width  = Math.round(LOGO_W);
            offL.height = LOGO_H;
            var lc = offL.getContext('2d');
            lc.drawImage(logo, 0, 0, Math.round(LOGO_W), LOGO_H);
            lc.globalCompositeOperation = 'source-atop';
            lc.fillStyle = '#ffffff';
            lc.fillRect(0, 0, Math.round(LOGO_W), LOGO_H);

            var lx = (CARD_W - Math.round(LOGO_W)) / 2;
            c.drawImage(offL, lx, PAD);

            /* Title text */
            c.fillStyle = '#c8ddf8';
            c.font      = 'bold 22px "Segoe UI", system-ui, sans-serif';
            c.textAlign = 'center';
            c.letterSpacing = '2px';
            c.fillText('Scan to open the Flipbook', CARD_W / 2, PAD + LOGO_H + 24 + 28);

            /* White QR box */
            var qrBoxPad = 12;
            var qrBoxX   = (CARD_W - QR_W) / 2 - qrBoxPad;
            var qrBoxY   = QR_Y - qrBoxPad;
            var qrBoxW   = QR_W + qrBoxPad * 2;
            var qrBoxH   = QR_W + qrBoxPad * 2;
            var r        = 16;
            c.beginPath();
            c.moveTo(qrBoxX + r, qrBoxY);
            c.arcTo(qrBoxX + qrBoxW, qrBoxY,     qrBoxX + qrBoxW, qrBoxY + qrBoxH, r);
            c.arcTo(qrBoxX + qrBoxW, qrBoxY + qrBoxH, qrBoxX,     qrBoxY + qrBoxH, r);
            c.arcTo(qrBoxX,          qrBoxY + qrBoxH, qrBoxX,     qrBoxY,          r);
            c.arcTo(qrBoxX,          qrBoxY,          qrBoxX + qrBoxW, qrBoxY,     r);
            c.closePath();
            c.fillStyle = '#ffffff';
            c.fill();

            /* QR image */
            var qrX = (CARD_W - QR_W) / 2;
            c.drawImage(qrImg, qrX, QR_Y, QR_W, QR_W);

            /* ── Overlay logo in centre of card's QR ── */
            (function () {
                /* andisonqr.jpg is 677×677 → square */
                var BADGE_H = Math.round(QR_W * 0.38);
                var BADGE_W = BADGE_H; /* square */
                var cx = CARD_W / 2, cy = QR_Y + QR_W / 2;
                c.drawImage(logo, cx - BADGE_W / 2, cy - BADGE_H / 2, BADGE_W, BADGE_H);
            }());

            dlBtn.href = card.toDataURL('image/png');
        };
        logo.onerror = function () {
            /* fallback: just use plain QR */
            dlBtn.href = cv.toDataURL('image/png');
        };
        logo.src = ANDISONQR_URI;
    };
    qrImg.onerror = function () {
        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Failed to load QR.', QR_SIZE / 2, QR_SIZE / 2 - 8);
        ctx.fillText('Check internet connection.', QR_SIZE / 2, QR_SIZE / 2 + 12);
        status.textContent = 'Error';
    };
    qrImg.src = proxyUrl;
})();
</script>

</body>
</html>
