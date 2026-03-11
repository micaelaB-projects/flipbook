<?php
/* ── QR Code Proxy / Download ──────────────────────────────────────────────
   ?proxy=1&url=  → same-origin proxy of raw QR PNG (used by JS canvas)
   ?url=          → file download (GD logo overlay if available, else raw)  */

$raw    = isset($_GET['url'])   ? trim($_GET['url'])   : '';
$proxy  = isset($_GET['proxy']);

/* Validate URL */
if (empty($raw) || !filter_var($raw, FILTER_VALIDATE_URL)) {
    http_response_code(400); exit('Invalid URL.');
}
$scheme = strtolower(parse_url($raw, PHP_URL_SCHEME) ?? '');
if (!in_array($scheme, ['http', 'https'], true)) {
    http_response_code(400); exit('Invalid scheme.');
}

/* ── Fetch raw QR from API ── */
$size   = $proxy ? '520x520' : '700x700';
$qrApi  = 'https://api.qrserver.com/v1/create-qr-code/'
        . '?size=' . $size
        . '&margin=20'
        . '&color=1a0096'
        . '&bgcolor=ffffff'
        . '&format=png'
        . '&ecc=H'
        . '&data=' . urlencode($raw);

$ctx    = stream_context_create([
    'http' => ['timeout' => 12, 'ignore_errors' => false],
    'ssl'  => ['verify_peer' => true, 'verify_peer_name' => true],
]);
$qrData = @file_get_contents($qrApi, false, $ctx);
if ($qrData === false || strlen($qrData) < 100) {
    http_response_code(502); exit('Could not reach QR API.');
}

/* ── Proxy mode: just return the raw PNG (JS canvas handles logo overlay) ── */
if ($proxy) {
    header('Content-Type: image/png');
    header('Cache-Control: public, max-age=3600');
    echo $qrData;
    exit;
}

/* ── Download mode: try GD logo overlay, else return raw ── */
if (function_exists('imagecreatefrompng') && function_exists('imagecreatefromstring')) {
    $qrImg = @imagecreatefromstring($qrData);
    if ($qrImg) {
        $qrW = imagesx($qrImg);
        $qrH = imagesy($qrImg);

        /* Prefer andisonqr.jpg (same image used on the web page), fall back to logo.png */
        $overlayImg  = null;
        $badgePath   = __DIR__ . '/assets/andisonqr.jpg';
        $logoPath    = __DIR__ . '/assets/logo.png';
        if (file_exists($badgePath) && function_exists('imagecreatefromjpeg')) {
            $overlayImg = @imagecreatefromjpeg($badgePath);
        }
        if (!$overlayImg && file_exists($logoPath) && function_exists('imagecreatefrompng')) {
            $overlayImg = @imagecreatefrompng($logoPath);
        }
        if ($overlayImg) {
            $oW = imagesx($overlayImg);
            $oH = imagesy($overlayImg);
            /* Badge = 28 % of QR width, square crop */
            $targetSize = (int)($qrW * 0.28);
            $pad  = (int)($targetSize * 0.07);
            $boxX = (int)(($qrW - $targetSize) / 2) - $pad;
            $boxY = (int)(($qrH - $targetSize) / 2) - $pad;
            $boxW = $targetSize + $pad * 2;
            $boxH = $targetSize + $pad * 2;
            $white = imagecolorallocate($qrImg, 255, 255, 255);
            imagefilledrectangle($qrImg, $boxX, $boxY, $boxX + $boxW, $boxY + $boxH, $white);
            imagealphablending($qrImg, true);
            imagecopyresampled($qrImg, $overlayImg,
                $boxX + $pad, $boxY + $pad, 0, 0,
                $targetSize, $targetSize, $oW, $oH);
            imagedestroy($overlayImg);
        }

        header('Content-Type: image/png');
        header('Content-Disposition: attachment; filename="andison-flipbook-qr.png"');
        header('Cache-Control: no-store');
        imagepng($qrImg, null, 6);
        imagedestroy($qrImg);
        exit;
    }
}

/* Fallback: GD not available — serve raw PNG */
header('Content-Type: image/png');
header('Content-Disposition: attachment; filename="andison-flipbook-qr.png"');
header('Cache-Control: no-store');
echo $qrData;
exit;

