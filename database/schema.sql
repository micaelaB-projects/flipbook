-- ============================================================
--  Flipbook Product Catalogue – MySQL Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS flipbook_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE flipbook_db;

-- ------------------------------------------------------------
-- Table: catalogs
-- Stores each catalogue (PDF-based flipbook)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalogs (
    id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    title        VARCHAR(255)    NOT NULL,
    description  TEXT,
    pdf_path     VARCHAR(500)    NOT NULL,
    cover_image  VARCHAR(500)    DEFAULT NULL,
    is_active    TINYINT(1)      NOT NULL DEFAULT 1,
    created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Table: categories
-- Product categories / sections
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name       VARCHAR(100)  NOT NULL,
    slug       VARCHAR(100)  NOT NULL,
    sort_order TINYINT       NOT NULL DEFAULT 0,
    created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Table: products
-- Products associated with a catalogue page
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    catalog_id   INT UNSIGNED    NOT NULL,
    category_id  INT UNSIGNED    DEFAULT NULL,
    name         VARCHAR(255)    NOT NULL,
    description  TEXT,
    price        DECIMAL(10,2)   DEFAULT NULL,
    image_path   VARCHAR(500)    DEFAULT NULL,
    page_number  SMALLINT        DEFAULT NULL COMMENT 'PDF page where product appears',
    is_featured  TINYINT(1)      NOT NULL DEFAULT 0,
    created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_catalog  (catalog_id),
    KEY idx_category (category_id),
    KEY idx_page     (page_number),
    CONSTRAINT fk_products_catalog
        FOREIGN KEY (catalog_id)  REFERENCES catalogs (id) ON DELETE CASCADE,
    CONSTRAINT fk_products_category
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Table: page_views
-- Tracks which pages were viewed (analytics)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS page_views (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    catalog_id  INT UNSIGNED    NOT NULL,
    page_number SMALLINT        NOT NULL,
    viewed_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pv_catalog (catalog_id),
    KEY idx_pv_page    (page_number),
    CONSTRAINT fk_pv_catalog
        FOREIGN KEY (catalog_id) REFERENCES catalogs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Sample Data
-- ============================================================

INSERT INTO catalogs (title, description, pdf_path, is_active) VALUES
('Andison Product Catalogue',
 'Complete product line-up with prices and specifications.',
 'Andison Product Catalogue.pdf',
 1);

INSERT INTO categories (name, slug, sort_order) VALUES
('Electronics',   'electronics',   1),
('Appliances',    'appliances',    2),
('Accessories',   'accessories',   3),
('New Arrivals',  'new-arrivals',  4);

INSERT INTO products (catalog_id, category_id, name, description, price, page_number, is_featured) VALUES
(1, 1, 'Sample Product A', 'High-quality electronic device.',    1299.00,  3,  1),
(1, 1, 'Sample Product B', 'Compact and portable gadget.',       799.00,   5,  0),
(1, 2, 'Sample Product C', 'Energy-efficient home appliance.',   4599.00,  8,  1),
(1, 3, 'Sample Product D', 'Premium carrying case.',             349.00,  10,  0),
(1, 4, 'Sample Product E', 'Brand new for this season.',        2199.00,  12,  1);
