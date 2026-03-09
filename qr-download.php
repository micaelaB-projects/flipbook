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

        $logoPath = __DIR__ . '/assets/logo.png';
        if (file_exists($logoPath)) {
            $logo = @imagecreatefrompng($logoPath);
            if ($logo) {
                $lW = imagesx($logo); $lH = imagesy($logo);
                $targetW = (int)($qrW * 0.27);
                $targetH = (int)($targetW * $lH / $lW);
                $pad  = (int)($targetW * 0.14);
                $boxW = $targetW + $pad * 2;
                $boxH = $targetH + $pad * 2;
                $boxX = (int)(($qrW - $boxW) / 2);
                $boxY = (int)(($qrH - $boxH) / 2);

                $white   = imagecolorallocate($qrImg, 255, 255, 255);
                imagefilledrectangle($qrImg, $boxX, $boxY, $boxX + $boxW, $boxY + $boxH, $white);

                $resized = imagecreatetruecolor($targetW, $targetH);
                imagealphablending($resized, false);
                imagesavealpha($resized, true);
                imagefill($resized, 0, 0, imagecolorallocatealpha($resized, 0, 0, 0, 127));
                imagecopyresampled($resized, $logo, 0, 0, 0, 0, $targetW, $targetH, $lW, $lH);
                imagealphablending($qrImg, true);
                imagecopy($qrImg, $resized, $boxX + $pad, $boxY + $pad, 0, 0, $targetW, $targetH);
                imagedestroy($logo);
                imagedestroy($resized);
            }
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

$raw    = isset($_GET['url'])    ? trim($_GET['url'])    : '';
$inline = isset($_GET['inline']);                         /* true = browser preview, false = download */

/* Validate: must be a proper http/https URL */
if (empty($raw) || !filter_var($raw, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    exit('Invalid URL.');
}
$parsed = parse_url($raw);
$scheme = strtolower($parsed['scheme'] ?? '');
if (!in_array($scheme, ['http', 'https'], true)) {
    http_response_code(400);
    exit('Invalid URL scheme.');
}

/* ── 1. Fetch QR image from API ──────────────────────────────────────────── */
/* ECC=H (30 % recovery) is required when a logo covers part of the modules. */
$qrApi = 'https://api.qrserver.com/v1/create-qr-code/'
       . '?size=500x500'
       . '&margin=20'
       . '&color=1a0096'   /* Andison brand deep blue-purple */
       . '&bgcolor=ffffff'
       . '&format=png'
       . '&ecc=H'
       . '&data=' . urlencode($raw);

$ctx = stream_context_create([
    'http' => ['timeout' => 12, 'ignore_errors' => false],
    'ssl'  => ['verify_peer' => true, 'verify_peer_name' => true],
]);

$qrData = @file_get_contents($qrApi, false, $ctx);
if ($qrData === false || strlen($qrData) < 100) {
    http_response_code(502);
    exit('Could not generate QR code. Check internet connection.');
}

$qrImg = @imagecreatefromstring($qrData);
if (!$qrImg) {
    http_response_code(500);
    exit('Failed to process QR image.');
}

$qrW = imagesx($qrImg);
$qrH = imagesy($qrImg);

/* ── 2. Overlay logo in the centre ──────────────────────────────────────── */
$logoPath = __DIR__ . '/assets/logo.png';
if (file_exists($logoPath) && function_exists('imagecreatefrompng')) {
    $logo = @imagecreatefrompng($logoPath);
    if ($logo) {
        $lW = imagesx($logo);
        $lH = imagesy($logo);

        /* Logo occupies ~27 % of QR width */
        $targetW = (int)($qrW * 0.27);
        $targetH = (int)($targetW * $lH / $lW);

        /* White rounded background padding */
        $pad  = (int)($targetW * 0.12);
        $boxW = $targetW + $pad * 2;
        $boxH = $targetH + $pad * 2;
        $boxX = (int)(($qrW - $boxW) / 2);
        $boxY = (int)(($qrH - $boxH) / 2);

        /* Draw white rectangle behind logo */
        $white = imagecolorallocate($qrImg, 255, 255, 255);
        imagefilledrectangle($qrImg, $boxX, $boxY, $boxX + $boxW, $boxY + $boxH, $white);

        /* Resize logo into a true-colour buffer preserving alpha */
        $resized = imagecreatetruecolor($targetW, $targetH);
        imagealphablending($resized, false);
        imagesavealpha($resized, true);
        $trans = imagecolorallocatealpha($resized, 0, 0, 0, 127);
        imagefill($resized, 0, 0, $trans);
        imagecopyresampled($resized, $logo, 0, 0, 0, 0, $targetW, $targetH, $lW, $lH);

        /* Copy logo onto QR */
        imagealphablending($qrImg, true);
        imagecopy($qrImg, $resized, $boxX + $pad, $boxY + $pad, 0, 0, $targetW, $targetH);

        imagedestroy($logo);
        imagedestroy($resized);
    }
}

/* ── 3. Output ───────────────────────────────────────────────────────────── */
header('Content-Type: image/png');
if (!$inline) {
    header('Content-Disposition: attachment; filename="andison-flipbook-qr.png"');
}
header('Cache-Control: no-store');
imagepng($qrImg, null, 6); /* compression 6 = good balance of size vs quality */
imagedestroy($qrImg);

