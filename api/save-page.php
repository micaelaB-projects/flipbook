<?php
/**
 * Receives a browser-rendered page image and saves it to the server cache.
 * Once all pages of a catalog are cached, subsequent visitors load images
 * directly — no PDF download or browser rendering required.
 */
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$catalogId = filter_input(INPUT_POST, 'catalog_id', FILTER_VALIDATE_INT);
$pageNum   = filter_input(INPUT_POST, 'page_num',   FILTER_VALIDATE_INT);
$total     = filter_input(INPUT_POST, 'total',      FILTER_VALIDATE_INT);
$pageW     = filter_input(INPUT_POST, 'page_w',     FILTER_VALIDATE_INT);
$pageH     = filter_input(INPUT_POST, 'page_h',     FILTER_VALIDATE_INT);
$data      = $_POST['data'] ?? '';

/* Basic validation */
if (!$catalogId || $catalogId < 1 || !$pageNum || $pageNum < 1 || $pageNum > 9999) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid parameters']);
    exit;
}

/* Only accept JPEG data URIs */
if (!preg_match('/^data:image\/jpeg;base64,[A-Za-z0-9+\/]+=*$/', $data)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid image data']);
    exit;
}

/* Reject suspiciously large payloads (~4MB binary → ~5.5MB base64) */
if (strlen($data) > 5_800_000) {
    http_response_code(413);
    echo json_encode(['error' => 'Payload too large']);
    exit;
}

/* Resolve safe output directory */
$assetsDir = realpath(__DIR__ . '/../assets');
if (!$assetsDir) {
    http_response_code(500);
    echo json_encode(['error' => 'Assets dir missing']);
    exit;
}

$renderedBase = $assetsDir . DIRECTORY_SEPARATOR . 'rendered';
if (!is_dir($renderedBase)) {
    mkdir($renderedBase, 0755, true);
}
$renderedBase = realpath($renderedBase);

$catalogDir = $renderedBase . DIRECTORY_SEPARATOR . (int)$catalogId;
if (!is_dir($catalogDir)) {
    mkdir($catalogDir, 0755, true);
    $catalogDir = realpath($catalogDir);
}

/* Directory traversal guard */
if (!$catalogDir || strpos($catalogDir, $renderedBase) !== 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid path']);
    exit;
}

/* Decode and save the image */
$b64     = substr($data, strpos($data, ',') + 1);
$imgData = base64_decode($b64, true);
if ($imgData === false) {
    http_response_code(400);
    echo json_encode(['error' => 'Bad base64']);
    exit;
}

/* Resize to max 800 px wide using GD so phone-downloaded images stay small */
$MAX_W = 800;
$src = function_exists('imagecreatefromstring') ? @imagecreatefromstring($imgData) : false;
if ($src !== false) {
    $origW = imagesx($src);
    $origH = imagesy($src);
    if ($origW > $MAX_W) {
        $newW  = $MAX_W;
        $newH  = (int)round($origH * $MAX_W / $origW);
        $dst   = imagecreatetruecolor($newW, $newH);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $origW, $origH);
        ob_start();
        imagejpeg($dst, null, 85);
        $imgData = ob_get_clean();
        imagedestroy($dst);
        $pageW = $newW;
        $pageH = $newH;
    } else {
        /* already small enough — update dimensions from actual image */
        $pageW = $origW;
        $pageH = $origH;
    }
    imagedestroy($src);
}

$filePath = $catalogDir . DIRECTORY_SEPARATOR . (int)$pageNum . '.jpg';
if (file_put_contents($filePath, $imgData) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Write failed']);
    exit;
}

/* Always write/update meta.json whenever total is known, using final dimensions */
if ($total > 0 && $pageW > 0 && $pageH > 0) {
    $meta = json_encode([
        'total' => (int)$total,
        'w'     => (int)$pageW,
        'h'     => (int)$pageH,
    ]);
    file_put_contents($catalogDir . DIRECTORY_SEPARATOR . 'meta.json', $meta);
}

echo json_encode(['ok' => true, 'page' => (int)$pageNum]);
