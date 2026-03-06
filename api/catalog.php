<?php
// ── API: catalog.php ─────────────────────────────────────────
// Returns the active catalogue + its products as JSON.
// GET  /api/catalog.php             → active catalogue
// POST /api/catalog.php  action=view  → record a page view
// ─────────────────────────────────────────────────────────────

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/../config/db.php';

/* ── POST: record page view ── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action     = $_POST['action']      ?? '';
    $catalogId  = (int)($_POST['catalog_id']  ?? 0);
    $pageNumber = (int)($_POST['page_number'] ?? 0);

    if ($action === 'view' && $catalogId > 0 && $pageNumber > 0) {
        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'INSERT INTO page_views (catalog_id, page_number) VALUES (:cid, :page)'
            );
            $stmt->execute([':cid' => $catalogId, ':page' => $pageNumber]);
            echo json_encode(['ok' => true]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database error']);
        }
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid request']);
    }
    exit;
}

/* ── GET: fetch active catalogue ── */
try {
    $pdo = getDB();

    // Active catalogue
    $stmt = $pdo->prepare(
        'SELECT id, title, description, pdf_path, cover_image
         FROM   catalogs
         WHERE  is_active = 1
         ORDER  BY created_at DESC
         LIMIT  1'
    );
    $stmt->execute();
    $catalog = $stmt->fetch();

    if (!$catalog) {
        http_response_code(404);
        echo json_encode(['error' => 'No active catalogue found']);
        exit;
    }

    // Products for this catalogue
    $stmt = $pdo->prepare(
        'SELECT p.id, p.name, p.description, p.price,
                p.image_path, p.page_number, p.is_featured,
                c.name AS category_name
         FROM   products   p
         LEFT   JOIN categories c ON c.id = p.category_id
         WHERE  p.catalog_id = :cid
         ORDER  BY p.page_number ASC, p.name ASC'
    );
    $stmt->execute([':cid' => $catalog['id']]);
    $catalog['products'] = $stmt->fetchAll();

    echo json_encode($catalog);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error']);
}
