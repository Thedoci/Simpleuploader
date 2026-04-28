<?php
/**
 * LNNK.IR - Cleanup Task
 * Run this via Cron Job in cPanel (e.g., every hour)
 * Command: php /home/yourusername/public_html/cleanup.php
 */

$DB_FILE = __DIR__ . '/data/db.json';
if (!file_exists($DB_FILE)) exit;

$db = json_decode(file_get_contents($DB_FILE), true);
$now = time() * 1000;
$new_files = [];
$deleted_count = 0;

foreach ($db['files'] as $f) {
    if ($f['expiresAt'] < $now) {
        if (file_exists($f['path'])) {
            unlink($f['path']);
        }
        $deleted_count++;
    } else {
        $new_files[] = $f;
    }
}

if ($deleted_count > 0) {
    $db['files'] = $new_files;
    file_put_contents($DB_FILE, json_encode($db, JSON_PRETTY_PRINT));
}

// Also cleanup old empty chunk directories
$chunks = glob(__DIR__ . '/chunks/*', GLOB_ONLYDIR);
foreach ($chunks as $dir) {
    if (time() - filemtime($dir) > 86400) { // Older than 24h
        // Helper to delete non-empty dir
        array_map('unlink', glob("$dir/*.*"));
        rmdir($dir);
    }
}

echo "Cleanup complete. Deleted $deleted_count expired files.\n";
