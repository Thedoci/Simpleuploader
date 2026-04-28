<?php
/**
 * LNNK.IR - PHP Backend API
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$DB_FILE = __DIR__ . '/data/db.json';
$UPLOADS_DIR = __DIR__ . '/uploads/';
$CHUNKS_DIR = __DIR__ . '/chunks/';
$JWT_SECRET = 'lnnk-php-secret-key-123'; // Change this in production

// Helper: Get Database
function get_db($file) {
    if (!file_exists($file)) {
        $initial = [
            'users' => [
                [
                    'id' => 'admin',
                    'username' => 'admin',
                    'password' => password_hash('admin123', PASSWORD_BCRYPT),
                    'role' => 'admin'
                ]
            ],
            'files' => [],
            'settings' => ['maxUploadSize' => 1073741824] // 1GB
        ];
        file_put_contents($file, json_encode($initial, JSON_PRETTY_PRINT));
    }
    return json_decode(file_get_contents($file), true);
}

// Helper: Save Database
function save_db($file, $db) {
    file_put_contents($file, json_encode($db, JSON_PRETTY_PRINT));
}

// Helper: JWT-like Auth (Simple for cPanel compat)
function authenticate($secret) {
    $headers = getallheaders();
    $auth = isset($headers['Authorization']) ? $headers['Authorization'] : '';
    
    if (strpos($auth, 'Bearer ') === 0) {
        $token = substr($auth, 7);
        if ($token === 'null' || !$token) return null;
        
        $parts = explode('.', $token);
        if (count($parts) != 3) return null;
        
        list($head, $payload, $sig) = $parts;
        $decoded_payload = json_decode(base64_decode($payload), true);
        
        // Verify signature (Simplified for this script)
        if (hash_hmac('sha256', "$head.$payload", $secret) === $sig) {
            return $decoded_payload;
        }
    }
    return null;
}

function create_token($user, $secret) {
    $head = base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64_encode(json_encode([
        'id' => $user['id'],
        'username' => $user['username'],
        'role' => $user['role'],
        'exp' => time() + (24 * 60 * 60)
    ]));
    $sig = hash_hmac('sha256', "$head.$payload", $secret);
    return "$head.$payload.$sig";
}

$db = get_db($DB_FILE);
$user = authenticate($JWT_SECRET);
$path = isset($_GET['endpoint']) ? $_GET['endpoint'] : '';

// --- ROUTING ---

// LOGIN
if ($path === 'auth/login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    foreach ($db['users'] as $u) {
        if ($u['username'] === $data['username'] && password_verify($data['password'], $u['password'])) {
            $token = create_token($u, $JWT_SECRET);
            echo json_encode([
                'token' => $token,
                'user' => ['username' => $u['username'], 'role' => $u['role']]
            ]);
            exit;
        }
    }
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials']);
    exit;
}

// PUBLIC FILE META
if (preg_match('/^f\/(.+)$/', $path, $matches)) {
    $shortId = $matches[1];
    foreach ($db['files'] as $f) {
        if ($f['shortId'] === $shortId) {
            if ($f['expiresAt'] < time() * 1000) {
                http_response_code(410);
                echo json_encode(['error' => 'File expired']);
                exit;
            }
            echo json_encode([
                'id' => $f['id'],
                'name' => $f['name'],
                'size' => $f['size'],
                'hasPassword' => !empty($f['password']),
                'expiresAt' => $f['expiresAt'],
                'isEncrypted' => isset($f['isEncrypted']) ? $f['isEncrypted'] : false
            ]);
            exit;
        }
    }
    http_response_code(404);
    echo json_encode(['error' => 'File not found']);
    exit;
}

// CHUNK UPLOAD
if ($path === 'upload/chunk' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $fileName = $_POST['fileName'];
    $chunkIndex = (int)$_POST['chunkIndex'];
    $totalChunks = (int)$_POST['totalChunks'];
    $uploadId = $_POST['uploadId'];
    $fileSize = (int)$_POST['fileSize'];
    $isEncrypted = $_POST['isEncrypted'] === 'true';

    $ownerId = $user ? $user['id'] : 'guest';

    $chunkDir = $CHUNKS_DIR . $uploadId . '/';
    if (!is_dir($chunkDir)) mkdir($chunkDir, 0777, true);

    $tempPath = $_FILES['chunk']['tmp_name'];
    move_uploaded_file($tempPath, $chunkDir . 'chunk-' . $chunkIndex);

    $chunks = glob($chunkDir . 'chunk-*');
    if (count($chunks) === $totalChunks) {
        $finalFilename = $uploadId . '-' . $fileName;
        $finalPath = $UPLOADS_DIR . $finalFilename;
        
        $out = fopen($finalPath, 'wb');
        for ($i = 0; $i < $totalChunks; $i++) {
            $chunkFile = $chunkDir . 'chunk-' . $i;
            $in = fopen($chunkFile, 'rb');
            while ($buff = fread($in, 4096)) {
                fwrite($out, $buff);
            }
            fclose($in);
            unlink($chunkFile);
        }
        fclose($out);
        rmdir($chunkDir);

        $fileMeta = [
            'id' => uniqid(),
            'shortId' => substr(md5(uniqid()), 0, 8),
            'ownerId' => $ownerId,
            'name' => $fileName,
            'size' => $fileSize,
            'path' => $finalPath,
            'uploadedAt' => time() * 1000,
            'expiresAt' => (time() + 86400) * 1000,
            'password' => null,
            'isEncrypted' => $isEncrypted
        ];
        $db['files'][] = $fileMeta;
        save_db($DB_FILE, $db);
        echo json_encode(['success' => true, 'file' => $fileMeta]);
    } else {
        echo json_encode(['success' => true, 'progress' => round((count($chunks) / $totalChunks) * 100)]);
    }
    exit;
}

// PROTECTED ROUTES REQUIRE AUTH
if (!$user) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// LIST FILES
if ($path === 'files' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = [];
    foreach ($db['files'] as $f) {
        if ($user['role'] === 'admin' || $f['ownerId'] === $user['id']) {
            $result[] = $f;
        }
    }
    echo json_encode($result);
    exit;
}

// DELETE FILE
if (preg_match('/^files\/(.+)$/', $path, $matches) && $_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = $matches[1];
    foreach ($db['files'] as $i => $f) {
        if ($f['id'] === $id) {
            if ($user['role'] === 'admin' || $f['ownerId'] === $user['id']) {
                if (file_exists($f['path'])) unlink($f['path']);
                unset($db['files'][$i]);
                $db['files'] = array_values($db['files']);
                save_db($DB_FILE, $db);
                echo json_encode(['success' => true]);
                exit;
            }
        }
    }
    http_response_code(404);
    exit;
}

// DOWNLOAD FILE
if (preg_match('/^download\/(.+)$/', $path, $matches) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = $matches[1];
    $data = json_decode(file_get_contents('php://input'), true);
    
    foreach ($db['files'] as $f) {
        if ($f['id'] === $id) {
            // Check if user is owner/admin or authorized
            $is_authorized = false;
            if ($user && ($user['role'] === 'admin' || $f['ownerId'] === $user['id'])) {
                $is_authorized = true;
            }

            // Check password if not authorized by account
            if (!$is_authorized && !empty($f['password'])) {
                if (!isset($data['password']) || !password_verify($data['password'], $f['password'])) {
                    http_response_code(401);
                    echo json_encode(['error' => 'Invalid password']);
                    exit;
                }
            }

            if (file_exists($f['path'])) {
                header('Content-Description: File Transfer');
                header('Content-Type: application/octet-stream');
                header('Content-Disposition: attachment; filename="' . basename($f['name']) . '"');
                header('Expires: 0');
                header('Cache-Control: must-revalidate');
                header('Pragma: public');
                header('Content-Length: ' . filesize($f['path']));
                readfile($f['path']);
                exit;
            }
        }
    }
    http_response_code(404);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Endpoint not found: ' . $path]);
