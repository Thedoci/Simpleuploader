import os
import json
import time
import shutil
import asyncio
import bcrypt
import jwt
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Request, Depends, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from nanoid import generate
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Configuration
PORT = 3000
UPLOADS_DIR = "uploads"
CHUNKS_DIR = "chunks"
DB_FILE = "db.json"
JWT_SECRET = os.getenv("JWT_SECRET", "lnnk-super-secret-key")
JWT_ALGORITHM = "HS256"

# Ensure directories
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(CHUNKS_DIR, exist_ok=True)

# Database Initialization
def get_db():
    if not os.path.exists(DB_FILE):
        initial_db = {
            "users": [
                {
                    "id": "admin",
                    "username": "admin",
                    "password": bcrypt.hashpw("admin123".encode(), bcrypt.gensalt()).decode(),
                    "role": "admin",
                }
            ],
            "files": [],
            "settings": {
                "maxUploadSize": 1024 * 1024 * 1024, # 1GB
            },
        }
        with open(DB_FILE, "w") as f:
            json.dump(initial_db, f, indent=2)
    
    with open(DB_FILE, "r") as f:
        return json.load(f)

def save_db(db):
    with open(DB_FILE, "w") as f:
        json.dump(db, f, indent=2)

# Auth Helpers
def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    token = auth_header.split(" ")[1]
    if token == "null":
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

def is_admin(user = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return user

# API Routes
@app.post("/api/auth/login")
async def login(request: Request):
    data = await request.json()
    username = data.get("username")
    password = data.get("password")
    
    db = get_db()
    user = next((u for u in db["users"] if u["username"] == username), None)
    
    if user and bcrypt.checkpw(password.encode(), user["password"].encode()):
        token = jwt.encode({"id": user["id"], "username": user["username"], "role": user["role"]}, JWT_SECRET, algorithm=JWT_ALGORITHM)
        return {"token": token, "user": {"username": user["username"], "role": user["role"]}}
    
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.get("/api/admin/users")
async def get_users(admin = Depends(is_admin)):
    db = get_db()
    return [{"id": u["id"], "username": u["username"], "role": u["role"]} for u in db["users"]]

@app.post("/api/admin/users")
async def create_user(request: Request, admin = Depends(is_admin)):
    data = await request.json()
    username = data.get("username")
    password = data.get("password")
    
    db = get_db()
    if any(u["username"] == username for u in db["users"]):
        raise HTTPException(status_code=400, detail="User already exists")
    
    new_user = {
        "id": generate(),
        "username": username,
        "password": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        "role": "user",
    }
    db["users"].append(new_user)
    save_db(db)
    return {"success": True}

@app.get("/api/admin/settings")
async def get_settings(admin = Depends(is_admin)):
    db = get_db()
    return db["settings"]

@app.post("/api/admin/settings")
async def update_settings(request: Request, admin = Depends(is_admin)):
    data = await request.json()
    db = get_db()
    db["settings"].update(data)
    save_db(db)
    return db["settings"]

@app.get("/api/files")
async def list_files(user = Depends(get_current_user)):
    db = get_db()
    if user["role"] == "admin":
        return db["files"]
    return [f for f in db["files"] if f["ownerId"] == user["id"]]

@app.delete("/api/files/{file_id}")
async def delete_file(file_id: str, user = Depends(get_current_user)):
    db = get_db()
    f_idx = next((i for i, f in enumerate(db["files"]) if f["id"] == file_id), None)
    if f_idx is None:
        raise HTTPException(status_code=404, detail="File not found")
    
    file = db["files"][f_idx]
    if user["role"] != "admin" and file["ownerId"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    if os.path.exists(file["path"]):
        os.remove(file["path"])
    
    db["files"].pop(f_idx)
    save_db(db)
    return {"success": True}

@app.patch("/api/files/{file_id}")
async def update_file(file_id: str, request: Request, user = Depends(get_current_user)):
    db = get_db()
    file = next((f for f in db["files"] if f["id"] == file_id), None)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    if user["role"] != "admin" and file["ownerId"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    data = await request.json()
    if "name" in data: file["name"] = data["name"]
    if "expiryTime" in data: file["expiresAt"] = int(datetime.fromisoformat(data["expiryTime"].replace("Z", "+00:00")).timestamp() * 1000)
    if "password" in data:
        file["password"] = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt()).decode() if data["password"] else None
    if "customLink" in data:
        if any(f["shortId"] == data["customLink"] and f["id"] != file_id for f in db["files"]):
            raise HTTPException(status_code=400, detail="Custom link already in use")
        file["shortId"] = data["customLink"]
    
    save_db(db)
    return file

@app.get("/api/f/{short_id}")
async def get_file_meta(short_id: str):
    db = get_db()
    file = next((f for f in db["files"] if f["shortId"] == short_id), None)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    if file["expiresAt"] < time.time() * 1000:
        raise HTTPException(status_code=410, detail="File expired")
    
    return {
        "id": file["id"],
        "name": file["name"],
        "size": file["size"],
        "hasPassword": bool(file.get("password")),
        "expiresAt": file["expiresAt"],
    }

@app.post("/api/download/{file_id}")
async def download_file(file_id: str, request: Request):
    db = get_db()
    file = next((f for f in db["files"] if f["id"] == file_id), None)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    is_authorized = False
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload["role"] == "admin" or payload["id"] == file["ownerId"]:
                is_authorized = True
        except:
            pass
            
    if file.get("password") and not is_authorized:
        data = await request.json()
        password = data.get("password")
        if not password or not bcrypt.checkpw(password.encode(), file["password"].encode()):
            raise HTTPException(status_code=401, detail="Invalid password")
            
    return FileResponse(file["path"], filename=file["name"])

@app.post("/api/upload/chunk")
async def upload_chunk(
    request: Request,
    chunk: UploadFile = File(...),
    fileName: str = Form(...),
    chunkIndex: int = Form(...),
    totalChunks: int = Form(...),
    uploadId: str = Form(...),
    fileSize: int = Form(...),
    isEncrypted: str = Form(...)
):
    owner_id = "guest"
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        if token != "null":
            try:
                payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
                owner_id = payload["id"]
            except:
                pass
                
    chunk_dir = os.path.join(CHUNKS_DIR, uploadId)
    os.makedirs(chunk_dir, exist_ok=True)
    
    chunk_path = os.path.join(chunk_dir, f"chunk-{chunkIndex}")
    with open(chunk_path, "wb") as buffer:
        shutil.copyfileobj(chunk.file, buffer)
        
    chunks = os.listdir(chunk_dir)
    if len(chunks) == totalChunks:
        final_path = os.path.join(UPLOADS_DIR, f"{uploadId}-{fileName}")
        
        with open(final_path, "wb") as final_file:
            for i in range(totalChunks):
                chunk_file_path = os.path.join(chunk_dir, f"chunk-{i}")
                with open(chunk_file_path, "rb") as chunk_file:
                    final_file.write(chunk_file.read())
                os.remove(chunk_file_path)
        
        os.rmdir(chunk_dir)
        
        db = get_db()
        file_meta = {
            "id": generate(),
            "shortId": generate(size=8),
            "ownerId": owner_id,
            "name": fileName,
            "size": fileSize,
            "path": final_path,
            "uploadedAt": int(time.time() * 1000),
            "expiresAt": int((time.time() + 86400) * 1000),
            "password": None,
            "isEncrypted": isEncrypted == 'true',
        }
        db["files"].append(file_meta)
        save_db(db)
        return {"success": True, "file": file_meta}
    
    return {"success": True, "progress": round((len(chunks) / totalChunks) * 100)}

# Background Task for Expiry
async def expiry_check_task():
    while True:
        try:
            db = get_db()
            now = time.time() * 1000
            new_files = []
            for f in db["files"]:
                if f["expiresAt"] < now:
                    if os.path.exists(f["path"]):
                        os.remove(f["path"])
                else:
                    new_files.append(f)
            
            if len(new_files) != len(db["files"]):
                db["files"] = new_files
                save_db(db)
        except Exception as e:
            print(f"Expiry Task Error: {e}")
        await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(expiry_check_task())

# Serve Static Files
dist_path = os.path.join(os.getcwd(), "dist")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
