<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LNNK.IR - Secure File Uploader</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/lucide/0.344.0/lucide.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #020617; color: #f8fafc; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        .custom-glass { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(51, 65, 85, 0.4); }
    </style>
</head>
<body class="min-h-screen">
    <div id="app" class="max-w-4xl mx-auto px-4 py-8">
        <!-- Navigation -->
        <nav class="flex items-center justify-between mb-12">
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded bg-sky-500/20 flex items-center justify-center">
                    <span class="text-sky-400 font-bold">LN</span>
                </div>
                <span class="font-bold tracking-tight text-xl font-mono text-sky-400">LNNK.IR</span>
            </div>
            <div id="nav-actions"></div>
        </nav>

        <main id="main-content">
            <!-- Loading State -->
            <div class="flex flex-col items-center justify-center py-20">
                <div class="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="mt-4 text-slate-400 font-bold">INITIALIZING...</p>
            </div>
        </main>
    </div>

    <!-- Scripts Area -->
    <script>
        // --- Core Application State ---
        const state = {
            view: 'upload', // 'upload', 'files', 'login', 'share'
            user: JSON.parse(localStorage.getItem('user') || 'null'),
            token: localStorage.getItem('token'),
            uploading: false,
            uploadProgress: 0,
            files: []
        };

        const API = {
            async request(endpoint, options = {}) {
                const headers = { ...options.headers };
                if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
                
                const res = await fetch(`api.php?endpoint=${endpoint}`, { ...options, headers });
                if (res.status === 401 && state.token) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.reload();
                }
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: 'API Error' }));
                    throw new Error(err.error || 'API Error');
                }
                return res.json();
            }
        };

        // --- Crypto Utils (E2EE) ---
        const CryptoUtils = {
            async generateKey() {
                const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
                const exported = await window.crypto.subtle.exportKey("raw", key);
                return btoa(String.fromCharCode(...new Uint8Array(exported)));
            },
            async importKey(str) {
                const raw = new Uint8Array(atob(str).split("").map(c => c.charCodeAt(0)));
                return window.crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
            },
            async encryptBuffer(buffer, key) {
                const iv = window.crypto.getRandomValues(new Uint8Array(12));
                const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buffer);
                const combined = new Uint8Array(iv.length + encrypted.byteLength);
                combined.set(iv);
                combined.set(new Uint8Array(encrypted), iv.length);
                return combined.buffer;
            }
        };

        // --- Views ---

        function renderNav() {
            const container = document.getElementById('nav-actions');
            if (state.user) {
                container.innerHTML = `
                    <div class="flex items-center gap-4">
                        <button onclick="setView('files')" class="text-sm font-bold text-slate-400 hover:text-white transition-colors">MY FILES</button>
                        <button onclick="setView('upload')" class="text-sm font-bold text-slate-400 hover:text-white transition-colors">UPLOAD</button>
                        <button onclick="logout()" class="px-4 py-2 rounded-lg bg-slate-800 text-sm font-bold hover:bg-slate-700 transition-all">LOGOUT</button>
                    </div>
                `;
            } else {
                container.innerHTML = `<button onclick="setView('login')" class="text-sm font-bold text-slate-400 hover:text-white transition-colors">LOGIN</button>`;
            }
        }

        async function setView(view, params = {}) {
            state.view = view;
            renderNav();
            const main = document.getElementById('main-content');
            
            if (view === 'upload') {
                main.innerHTML = `
                    <div class="custom-glass rounded-2xl p-8 text-center border-dashed border-2 border-slate-700 hover:border-sky-500/50 transition-all" id="drop-zone">
                        <div class="py-12">
                            <input type="file" id="file-input" class="hidden">
                            <div class="w-20 h-20 bg-sky-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg class="w-10 h-10 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            </div>
                            <h2 class="text-2xl font-bold mb-2">Ready to secure?</h2>
                            <p class="text-slate-400 mb-8 max-w-sm mx-auto">Upload large files with resumable technology and end-to-end encryption.</p>
                            <label for="file-input" class="inline-block px-8 py-4 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl cursor-pointer transition-all active:scale-95 shadow-lg shadow-sky-500/20">SELECT FILE</label>
                            
                            <div class="mt-8 flex items-center justify-center gap-6 text-sm">
                                <label class="flex items-center gap-2 text-slate-400 cursor-pointer">
                                    <input type="checkbox" id="e2ee-toggle" checked class="w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-500">
                                    <span>End-to-End Encryption</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div id="upload-status" class="hidden mt-8 custom-glass rounded-2xl p-6">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-sky-500/10 rounded-lg flex items-center justify-center">
                                    <svg class="w-5 h-5 text-sky-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
                                </div>
                                <div>
                                    <p class="font-bold text-sm" id="up-filename">filename.zip</p>
                                    <p class="text-[10px] text-slate-400 font-mono tracking-wider" id="up-details">PREPARING CHUNKS...</p>
                                </div>
                            </div>
                            <span class="font-mono text-xs font-bold text-sky-400" id="up-perc">0%</span>
                        </div>
                        <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div id="up-bar" class="h-full bg-sky-500 w-[0%] transition-all duration-300"></div>
                        </div>
                    </div>
                `;

                document.getElementById('file-input').onchange = (e) => handleUpload(e.target.files[0]);
            } else if (view === 'login') {
                main.innerHTML = `
                    <div class="max-w-md mx-auto custom-glass rounded-2xl p-8 border border-slate-800">
                        <h2 class="text-2xl font-bold mb-6 text-center">Admin Console</h2>
                        <form id="login-form" class="space-y-4">
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Username</label>
                                <input type="text" id="ln-user" class="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
                                <input type="password" id="ln-pass" class="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all">
                            </div>
                            <button type="submit" class="w-full bg-sky-600 py-3 rounded-lg font-bold hover:bg-sky-500 transition-all active:scale-95">CONTINUE</button>
                        </form>
                    </div>
                `;
                document.getElementById('login-form').onsubmit = handleLogin;
            } else if (view === 'files') {
                main.innerHTML = `<div class="flex items-center justify-center py-20"><div class="animate-spin rounded-full h-8 w-8 border-4 border-sky-500 border-t-transparent"></div></div>`;
                try {
                    const data = await API.request('files');
                    main.innerHTML = `
                        <div class="flex items-center justify-between mb-8">
                            <h2 class="text-2xl font-bold">Your Assets</h2>
                            <span class="bg-sky-500/10 text-sky-400 text-[10px] font-bold px-2 py-1 rounded border border-sky-500/20">${data.length} FILES</span>
                        </div>
                        <div class="grid gap-4" id="files-list"></div>
                    `;
                    const list = document.getElementById('files-list');
                    if (data.length === 0) {
                        list.innerHTML = `<div class="text-center py-20 text-slate-500 font-bold border-2 border-dashed border-slate-800 rounded-2xl">NO FILES UPLOADED YET</div>`;
                    } else {
                        data.forEach(f => {
                            const card = document.createElement('div');
                            card.className = 'custom-glass rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-800/50 hover:border-slate-600 transition-all';
                            card.innerHTML = `
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 bg-sky-500/10 rounded flex items-center justify-center"><svg class="w-5 h-5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
                                    <div>
                                        <p class="font-bold text-sm truncate max-w-[200px]">${f.name}</p>
                                        <p class="text-[10px] text-slate-500 font-mono uppercase">${(f.size/1024/1024).toFixed(2)} MB • ${f.isEncrypted ? 'ENCRYPTED' : 'STANDARD'}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button class="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white" onclick="copyLink('${f.shortId}')">COPY LINK</button>
                                    <button class="bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold text-red-400 hover:bg-red-500/20" onclick="deleteFile('${f.id}')">DELETE</button>
                                </div>
                            `;
                            list.appendChild(card);
                        });
                    }
                } catch (err) {
                    main.innerHTML = `<p class="text-red-500 font-bold text-center">Failed to load files: ${err.message}</p>`;
                }
            }
        }

        async function handleLogin(e) {
            e.preventDefault();
            const user = document.getElementById('ln-user').value;
            const pass = document.getElementById('ln-pass').value;
            try {
                const res = await API.request('auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ username: user, password: pass })
                });
                state.token = res.token;
                state.user = res.user;
                localStorage.setItem('token', res.token);
                localStorage.setItem('user', JSON.stringify(res.user));
                setView('files');
            } catch (err) {
                alert(err.message);
            }
        }

        async function handleUpload(file) {
            if (!file) return;
            const upStatus = document.getElementById('upload-status');
            const upBar = document.getElementById('up-bar');
            const upPerc = document.getElementById('up-perc');
            const upFilename = document.getElementById('up-filename');
            const upDetails = document.getElementById('up-details');
            const encrypted = document.getElementById('e2ee-toggle').checked;

            upStatus.classList.remove('hidden');
            upFilename.textContent = file.name;
            state.uploading = true;

            const uploadId = Math.random().toString(36).substring(7);
            const CHUNK_SIZE = 5 * 1024 * 1024;
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            
            let keyStr = null;
            let key = null;
            if (encrypted) {
                keyStr = await CryptoUtils.generateKey();
                key = await CryptoUtils.importKey(keyStr);
                upDetails.textContent = 'ENCRYPTING & FRAGMENTING...';
            }

            for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(file.size, start + CHUNK_SIZE);
                let chunk = file.slice(start, end);
                
                if (encrypted) {
                    const chunkBuffer = await chunk.arrayBuffer();
                    const encryptedBuffer = await CryptoUtils.encryptBuffer(chunkBuffer, key);
                    chunk = new Blob([encryptedBuffer]);
                }

                const fd = new FormData();
                fd.append('chunk', chunk);
                fd.append('fileName', file.name);
                fd.append('chunkIndex', i);
                fd.append('totalChunks', totalChunks);
                fd.append('uploadId', uploadId);
                fd.append('fileSize', file.size);
                fd.append('isEncrypted', encrypted ? 'true' : 'false');

                const res = await API.request('upload/chunk', {
                    method: 'POST',
                    body: fd
                });

                const perc = Math.round(((i + 1) / totalChunks) * 100);
                upBar.style.width = perc + '%';
                upPerc.textContent = perc + '%';
                upDetails.textContent = `SENDING SEGMENT ${i+1}/${totalChunks}...`;

                if (res.file) {
                    const shareUrl = window.location.origin + window.location.pathname + '#/f/' + res.file.shortId + (keyStr ? '#' + keyStr : '');
                    prompt('Upload complete! Here is your secure URL:', shareUrl);
                    if (state.user) setView('files');
                    else setView('upload');
                }
            }
        }

        function copyLink(id) {
            const url = window.location.origin + window.location.pathname + '#/f/' + id;
            navigator.clipboard.writeText(url);
            alert('Link copied to clipboard!');
        }

        async function deleteFile(id) {
            if (!confirm('Permanently delete this?')) return;
            await API.request(`files/${id}`, { method: 'DELETE' });
            setView('files');
        }

        function logout() {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.reload();
        }

        // --- Download Logic ---
        async function renderDownloadView(shortId, key) {
            const main = document.getElementById('main-content');
            try {
                const f = await API.request(`f/${shortId}`);
                main.innerHTML = `
                    <div class="max-w-xl mx-auto custom-glass rounded-2xl p-8 text-center">
                        <div class="w-16 h-16 bg-sky-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <svg class="w-8 h-8 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <h2 class="text-xl font-bold mb-2">${f.name}</h2>
                        <p class="text-xs text-slate-400 font-mono uppercase mb-8">${(f.size/1024/1024).toFixed(2)} MB • EXPIRES IN ${Math.round((f.expiresAt - Date.now())/3600000)}H</p>
                        
                        ${f.hasPassword ? `
                            <input type="password" id="dl-pass" placeholder="ENTER PASSWORD" class="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm mb-4 text-center">
                        ` : ''}

                        <button id="dl-btn" class="w-full bg-sky-600 py-4 rounded-xl font-bold hover:bg-sky-500 transition-all active:scale-95 shadow-lg shadow-sky-500/20">
                            ${f.isEncrypted ? 'DECRYPT & DOWNLOAD' : 'DOWNLOAD NOW'}
                        </button>
                    </div>
                `;

                document.getElementById('dl-btn').onclick = async () => {
                    const passInput = document.getElementById('dl-pass');
                    const password = passInput ? passInput.value : null;
                    const btn = document.getElementById('dl-btn');
                    btn.disabled = true;
                    btn.textContent = 'DOWNLOADING...';

                    try {
                        const response = await fetch(`api.php?endpoint=download/${f.id}`, {
                            method: 'POST',
                            body: JSON.stringify({ password })
                        });

                        if (!response.ok) throw new Error('Download failed');

                        let blob = await response.blob();
                        
                        if (f.isEncrypted && key) {
                            btn.textContent = 'DECRYPTING...';
                            const cryptoKey = await CryptoUtils.importKey(key);
                            const buffer = await blob.arrayBuffer();
                            const iv = new Uint8Array(buffer.slice(0, 12));
                            const data = buffer.slice(12);
                            const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, data);
                            blob = new Blob([decrypted]);
                        }

                        const url = window.location.origin + window.location.pathname + '#/f/' + id;
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = f.name;
                        a.click();
                        btn.textContent = 'COMPLETED';
                    } catch (err) {
                        alert(err.message);
                        btn.disabled = false;
                        btn.textContent = 'TRY AGAIN';
                    }
                };
            } catch (err) {
                main.innerHTML = `<div class="text-center py-20 text-red-400 font-bold">${err.message}</div>`;
            }
        }

        // Initialize App
        window.onload = () => {
            const hash = window.location.hash;
            if (hash.startsWith('#/f/')) {
                const parts = hash.split('/');
                const subParts = parts[2].split('#');
                const shortId = subParts[0];
                const key = subParts[1] || null;
                renderDownloadView(shortId, key);
            } else {
                setView('upload');
            }
        };
    </script>
</body>
</html>
