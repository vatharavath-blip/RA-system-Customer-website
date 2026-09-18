-- PayWay Payment System Database Schema
-- Table: payments

CREATE TABLE IF NOT EXISTS payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bill_number VARCHAR(100) NOT NULL UNIQUE,
    md5 VARCHAR(64) NOT NULL UNIQUE,
    payway_link TEXT,
    amount DECIMAL(18,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    qr_string TEXT,
    download_qr TEXT,
    deeplink_aba TEXT,
    deeplink_bakong TEXT,
    checkout_url TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    expire_date DATETIME NULL,
    transaction_hash VARCHAR(128) NULL,
    description VARCHAR(255) NULL,
    receipt_url TEXT NULL,
    check_count INT NOT NULL DEFAULT 0,
    last_check_at DATETIME NULL,
    paid_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bill_number (bill_number),
    INDEX idx_md5 (md5),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
