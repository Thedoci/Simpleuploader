import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import multer from "multer";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import dotenv from "dotenv";

dotenv.config();

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const UPLOADS_DIR = path.join(__dirname, "uploads");
const CHUNKS_DIR = path.join(__dirname, "chunks");
const DB_FILE = path.join(__dirname, "db.json");
const JWT_SECRET = process.env.JWT_SECRET || "llnk-super-secret-key";

// Ensure directories exist
fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(CHUNKS_DIR);
if (!fs.existsSync(DB_FILE)) {
  fs.writeJsonSync(DB_FILE, {
    users: [
      {
        id: "admin",
        username: "admin",
        password: bcrypt.hashSync("admin123", 10),
        role: "admin",
      },
    ],
    files: [],
    settings: {
      maxUploadSize: 1024 * 1024 * 1024, // 1GB
    },
  });
}

const db = fs.readJsonSync(DB_FILE);
const saveDb = () => fs.writeJsonSync(DB_FILE, db, { spaces: 2 });

const app = express();
app.use(express.json());

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const isAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  next();
};

// --- API ROUTES ---

// Auth
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find((u: any) => u.username === username);
  if (user && bcrypt.compareSync(password, user.password)) {
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
    res.json({ token, user: { username: user.username, role: user.role } });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

// User Management (Admin Only)
app.post("/api/admin/users", authenticate, isAdmin, async (req, res) => {
  const { username, password } = req.body;
  if (db.users.find((u: any) => u.username === username)) {
    return res.status(400).json({ error: "User already exists" });
  }
  const newUser = {
    id: nanoid(),
    username,
    password: bcrypt.hashSync(password, 10),
    role: "user",
  };
  db.users.push(newUser);
  saveDb();
  res.json({ success: true });
});

app.get("/api/admin/users", authenticate, isAdmin, (req, res) => {
  res.json(db.users.map((u: any) => ({ id: u.id, username: u.username, role: u.role })));
});

// Settings (Admin Only)
app.get("/api/admin/settings", authenticate, isAdmin, (req, res) => {
  res.json(db.settings);
});

app.post("/api/admin/settings", authenticate, isAdmin, (req, res) => {
  db.settings = { ...db.settings, ...req.body };
  saveDb();
  res.json(db.settings);
});

// File Management
app.get("/api/files", authenticate, (req, res) => {
  const userFiles = req.user.role === "admin" 
    ? db.files 
    : db.files.filter((f: any) => f.ownerId === req.user.id);
  res.json(userFiles);
});

app.delete("/api/files/:id", authenticate, async (req, res) => {
  const index = db.files.findIndex((f: any) => f.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "File not found" });
  
  const file = db.files[index];
  if (req.user.role !== "admin" && file.ownerId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    if (fs.existsSync(file.path)) await fs.remove(file.path);
    db.files.splice(index, 1);
    saveDb();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete file" });
  }
});

app.patch("/api/files/:id", authenticate, (req, res) => {
  const file = db.files.find((f: any) => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: "File not found" });
  
  if (req.user.role !== "admin" && file.ownerId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { name, expiryTime, password, customLink } = req.body;
  if (name) file.name = name;
  if (expiryTime) file.expiresAt = new Date(expiryTime).getTime();
  if (password !== undefined) file.password = password ? bcrypt.hashSync(password, 10) : null;
  if (customLink) {
    // Check if unique
    if (db.files.find((f: any) => f.shortId === customLink && f.id !== file.id)) {
      return res.status(400).json({ error: "Custom link already in use" });
    }
    file.shortId = customLink;
  }

  saveDb();
  res.json(file);
});

// Short link redirection helper (metadata only)
app.get("/api/f/:shortId", async (req, res) => {
  const file = db.files.find((f: any) => f.shortId === req.params.shortId);
  if (!file) return res.status(404).json({ error: "File not found" });
  
  if (file.expiresAt < Date.now()) {
    return res.status(410).json({ error: "File expired" });
  }

  res.json({
    id: file.id,
    name: file.name,
    size: file.size,
    hasPassword: !!file.password,
    expiresAt: file.expiresAt,
  });
});

// Download
app.post("/api/download/:id", async (req, res) => {
  const file = db.files.find((f: any) => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: "File not found" });
  
  // Optional authentication check for owner/admin bypass
  let isAuthorized = false;
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      if (decoded.role === "admin" || decoded.id === file.ownerId) {
        isAuthorized = true;
      }
    } catch (err) {}
  }

  if (file.password && !isAuthorized) {
    const { password } = req.body;
    if (!password || !bcrypt.compareSync(password, file.password)) {
      return res.status(401).json({ error: "Invalid password" });
    }
  }

  res.download(file.path, file.name);
});

// --- CHUNKED UPLOAD ---
const upload = multer({ dest: "chunks/" });

app.post("/api/upload/chunk", authenticate, upload.single("chunk"), async (req: any, res) => {
  const { fileName, chunkIndex, totalChunks, uploadId, fileSize } = req.body;
  const chunkPath = req.file.path;
  const chunkDir = path.join(CHUNKS_DIR, uploadId);
  
  await fs.ensureDir(chunkDir);
  const finalChunkPath = path.join(chunkDir, `chunk-${chunkIndex}`);
  await fs.move(chunkPath, finalChunkPath);

  const chunks = await fs.readdir(chunkDir);
  if (chunks.length === parseInt(totalChunks)) {
    const finalPath = path.join(UPLOADS_DIR, `${uploadId}-${fileName}`);
    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < totalChunks; i++) {
        const currentChunkPath = path.join(chunkDir, `chunk-${i}`);
        const buffer = await fs.readFile(currentChunkPath);
        writeStream.write(buffer);
        await fs.remove(currentChunkPath);
    }
    writeStream.end();

    await fs.remove(chunkDir);

    const fileMeta = {
      id: nanoid(),
      shortId: nanoid(8),
      ownerId: req.user.id,
      name: fileName,
      size: parseInt(fileSize),
      path: finalPath,
      uploadedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      password: null,
      isEncrypted: req.body.isEncrypted === 'true',
    };
    db.files.push(fileMeta);
    saveDb();
    res.json({ success: true, file: fileMeta });
  } else {
    res.json({ success: true, progress: Math.round((chunks.length / totalChunks) * 100) });
  }
});

// Periodic Expiry Check
setInterval(async () => {
  const now = Date.now();
  const expiredFiles = db.files.filter((f: any) => f.expiresAt < now);
  for (const file of expiredFiles) {
    if (fs.existsSync(file.path)) await fs.remove(file.path);
  }
  db.files = db.files.filter((f: any) => f.expiresAt >= now);
  saveDb();
}, 60000); // Every minute

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
