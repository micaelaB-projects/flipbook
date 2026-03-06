<?php
require_once __DIR__ . '/config/db.php';

$catalog  = null;
$dbError  = false;

try {
    $pdo  = getDB();
    $stmt = $pdo->prepare(
        'SELECT id, title, description, pdf_path
         FROM   catalogs
         WHERE  is_active = 1
         ORDER  BY created_at DESC
         LIMIT  1'
    );
    $stmt->execute();
    $catalog = $stmt->fetch();
} catch (Exception $e) {
    $dbError = true;
}

$catalogId  = $catalog ? (int)$catalog['id']                               : 0;
$title      = $catalog ? htmlspecialchars($catalog['title'],       ENT_QUOTES, 'UTF-8') : '';
$subtitle   = $catalog ? htmlspecialchars($catalog['description'], ENT_QUOTES, 'UTF-8') : '';
$pdfPath    = $catalog ? $catalog['pdf_path']                              : 'Andison Product Catalogue.pdf';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $title; ?></title>
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>

<?php if ($dbError): ?>
<div style="background:#7f1d1d;color:#fca5a5;text-align:center;padding:10px 16px;font-size:0.82rem;letter-spacing:0.05em;">
    &#9888; Could not connect to the database. Showing default catalogue.
</div>
<?php endif; ?>

<header class="site-header">
    <img src="assets/logo.png" alt="<?php echo $title; ?>" class="logo">
</header>

<div id="loading">
    <div class="ring"></div>
    <span class="loading-label">Loading Catalogue&#8230;</span>
    <span class="loading-sub" id="load-sub"></span>
</div>

<div id="book-wrap">
    <div id="flipbook"></div>
    <div id="spine"></div>
</div>

<div id="controls">
    <button class="cbtn" id="b-first" title="First page">&#171;</button>
    <button class="cbtn" id="b-prev">&#8249; Prev</button>
    <span id="page-num">&#8212;</span>
    <button class="cbtn" id="b-next">Next &#8250;</button>
    <button class="cbtn" id="b-last" title="Last page">&#187;</button>
</div>

<footer class="site-footer">Use &#8592; &#8594; arrow keys or swipe to turn pages</footer>

<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://unpkg.com/page-flip/dist/js/page-flip.browser.js"></script>
<script>
/* Injected by PHP – catalogue data from the database */
window._CATALOG = {
    id:      <?php echo json_encode($catalogId); ?>,
    title:   <?php echo json_encode($title); ?>,
    pdfPath: <?php echo json_encode($pdfPath); ?>
};
</script>
<script src="assets/app.js"></script>

</body>
</html>