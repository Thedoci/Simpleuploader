import React, { useState, useEffect, useCallback } from 'react';
import { 
  Upload, FileText, Trash2, Settings, Users, LogOut, 
  ExternalLink, Clock, Shield, ShieldOff, Check, AlertCircle,
  HardDrive, ChevronRight, Search, Download, Edit2, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, FileMetadata, AppSettings } from './types';

// --- API Service ---
const API = {
  token: localStorage.getItem('token'),
  async req(path: string, options: any = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers
      }
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'API Error');
    }
    return res.json();
  },
  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }
};

// --- Components ---

function FileIcon({ name }: { name: string }) {
  return <FileText className="w-5 h-5 text-zinc-400" />;
}

function ProgressCircle({ progress }: { progress: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90">
        <circle
          cx="24" cy="24" r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="3"
          className="text-zinc-800"
        />
        <circle
          cx="24" cy="24" r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-blue-500 transition-all duration-300"
        />
      </svg>
      <span className="absolute text-[10px] font-mono text-white">{Math.round(progress)}%</span>
    </div>
  );
}

// --- Crypto Helpers (E2EE) ---
const CryptoUtils = {
  async generateKey() {
    return window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  },
  async exportKey(key: CryptoKey) {
    const exported = await window.crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // URL Safe Base64
  },
  async importKey(keyStr: string) {
    const binary = atob(keyStr.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return window.crypto.subtle.importKey(
      'raw', bytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  },
  async encryptBuffer(buffer: ArrayBuffer, key: CryptoKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      buffer
    );
    // Combine IV + Ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return combined;
  },
  async decryptBuffer(combined: ArrayBuffer, key: CryptoKey) {
    const iv = new Uint8Array(combined.slice(0, 12));
    const ciphertext = combined.slice(12);
    return window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'login' | 'dashboard' | 'admin' | 'download'>('login');
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [shortId, setShortId] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check if we are on a download page (e.g. ?f=shortId)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const f = params.get('f');
    if (f) {
      setShortId(f);
      setView('download');
    } else {
      const storedUser = localStorage.getItem('user');
      if (storedUser && API.token) {
        setUser(JSON.parse(storedUser));
        setView('dashboard');
      }
    }
    setLoading(false);
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const data = await API.req('/api/files');
      setFiles(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (user) fetchFiles();
  }, [user, fetchFiles]);

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-white font-mono">LOADING...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-sky-500/30 flex">
      {user && (
        <>
          {/* Desktop/Mobile Sidebar */}
          <aside className={`
            fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-800 bg-slate-900/90 backdrop-blur-xl flex flex-col 
            transition-transform duration-300 md:translate-x-0 md:static md:h-screen
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          `}>
            <div className="p-6 h-full flex flex-col">
              <div 
                className="flex items-center gap-3 text-sky-400 mb-10 cursor-pointer group"
                onClick={() => { setView('dashboard'); setIsMobileMenuOpen(false); }}
              >
                <div className="w-8 h-8 rounded bg-sky-500/20 flex items-center justify-center group-hover:bg-sky-500/30 transition-colors">
                  <Upload className="w-5 h-5" />
                </div>
                <span className="font-bold tracking-tight text-xl font-mono">LLNK.IR</span>
              </div>
              
              <div className="space-y-1">
                <button 
                  onClick={() => { setView('dashboard'); setIsMobileMenuOpen(false); }}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'dashboard' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                >
                  Dashboard
                </button>
                <button 
                  className="w-full text-left text-slate-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 hover:text-slate-200 transition-colors"
                  onClick={() => { alert('History feature coming soon'); setIsMobileMenuOpen(false); }}
                >
                  My History
                </button>
              </div>

              {user.role === 'admin' && (
                <div className="mt-12 mb-4">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-4">Admin Panel</span>
                  <div className="mt-4 space-y-1">
                    <button 
                      onClick={() => { setView('admin'); setIsMobileMenuOpen(false); }}
                      className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${view === 'admin' ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                      User Management
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-auto pt-6">
                <button 
                  onClick={() => {
                    API.setToken(null);
                    setUser(null);
                    setView('login');
                    localStorage.removeItem('user');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-500 hover:text-red-400 transition-colors font-medium"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            </div>
          </aside>

          {/* Overlay for mobile menu */}
          {isMobileMenuOpen && (
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            ></div>
          )}
        </>
      )}
      
      <main className="flex-1 flex flex-col min-h-screen relative">
        {!user && <Navbar user={user} setView={setView} setUser={setUser} />}
        {user && (
          <header className="md:hidden border-b border-slate-800 bg-slate-900/50 p-4 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
             <div className="flex items-center gap-2">
               <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-slate-400">
                  <div className="w-5 h-0.5 bg-current mb-1"></div>
                  <div className="w-5 h-0.5 bg-current mb-1"></div>
                  <div className="w-5 h-0.5 bg-current"></div>
               </button>
               <span className="font-bold tracking-tight text-xl font-mono text-sky-400">LLNK.IR</span>
             </div>
             <button onClick={() => setView('admin')} className="text-slate-400 p-2"><Settings className="w-5 h-5"/></button>
          </header>
        )}
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 py-12">
          <AnimatePresence mode="wait">
            {view === 'login' && <LoginView onSuccess={(u) => { setUser(u); setView('dashboard'); }} />}
            {view === 'dashboard' && <DashboardView files={files} refresh={fetchFiles} user={user!} />}
            {view === 'admin' && <AdminView files={files} refresh={fetchFiles} />}
            {view === 'download' && <DownloadView shortId={shortId} />}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function Navbar({ user, setView, setUser }: any) {
  if (user) return null; // Using sidebar instead
  return (
    <nav className="border-b border-slate-800 backdrop-blur-md sticky top-0 z-50 bg-slate-950/80">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div 
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => setView('login')}
        >
          <div className="w-8 h-8 bg-sky-600 rounded flex items-center justify-center font-bold text-white group-hover:bg-sky-500 transition-colors">
            LL
          </div>
          <span className="font-mono tracking-tighter text-lg font-bold">LLNK.IR</span>
        </div>
      </div>
    </nav>
  );
}

function LoginView({ onSuccess }: { onSuccess: (u: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await API.req('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      API.setToken(res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto"
    >
      <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-2xl backdrop-blur-sm">
        <div className="flex items-center gap-3 text-sky-400 mb-8">
          <div className="w-10 h-10 rounded bg-sky-500/20 flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">ACCESS PORTAL</h2>
            <p className="text-slate-500 text-[10px] font-mono uppercase">Identity Verification</p>
          </div>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 h-11 px-4 rounded-lg outline-none transition-all font-mono text-sm"
              placeholder="operator_id"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Passphrase</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 h-11 px-4 rounded-lg outline-none transition-all font-mono text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-500 text-xs font-mono bg-red-500/10 p-3 rounded border border-red-500/20">{error.toUpperCase()}</p>}

          <button className="w-full bg-sky-600 hover:bg-sky-500 h-11 rounded-lg font-bold transition-all shadow-lg shadow-sky-900/20 uppercase tracking-[0.2em] text-xs">
            Authenticate
          </button>
        </form>
      </div>
    </motion.div>
  );
}

function DashboardView({ files, refresh, user }: { files: FileMetadata[], refresh: () => void, user: User }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState('');
  const [encryptionEnabled, setEncryptionEnabled] = useState(true);

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    setProgress(0);

    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = Math.random().toString(36).substring(7);

    try {
      let key: CryptoKey | null = null;
      let keyStr: string | null = null;

      if (encryptionEnabled) {
        key = await CryptoUtils.generateKey();
        keyStr = await CryptoUtils.exportKey(key);
      }

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);
        let finalChunk: Blob;

        if (encryptionEnabled && key) {
          const chunkBuffer = await chunkBlob.arrayBuffer();
          const encryptedChunk = await CryptoUtils.encryptBuffer(chunkBuffer, key);
          finalChunk = new Blob([encryptedChunk]);
        } else {
          finalChunk = chunkBlob;
        }

        const formData = new FormData();
        formData.append('chunk', finalChunk);
        formData.append('fileName', file.name);
        formData.append('chunkIndex', i.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('uploadId', uploadId);
        formData.append('fileSize', file.size.toString());
        formData.append('isEncrypted', encryptionEnabled.toString());

        const res = await fetch('/api/upload/chunk', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API.token}`
          },
          body: formData
        });

        if (!res.ok) throw new Error('Chunk upload failed');
        const data = await res.json();
        
        if (data.file && encryptionEnabled && keyStr) {
          const keys = JSON.parse(localStorage.getItem('fileKeys') || '{}');
          keys[data.file.id] = keyStr;
          localStorage.setItem('fileKeys', JSON.stringify(keys));
        }

        setProgress(((i + 1) / totalChunks) * 100);
      }

      refresh();
      if (encryptionEnabled) {
        alert(`Upload Encrypted! The encryption key is stored locally and will be included in the share link.`);
      } else {
        alert('Upload completed successfully.');
      }
    } catch (err) {
      console.error(err);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }}
      className="space-y-12 max-w-5xl mx-auto"
    >
      {/* Upload Progress Overlay (Mobile/Global) */}
      <AnimatePresence>
        {uploading && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-0 left-0 right-0 z-[60] bg-slate-900 border-b border-sky-500 shadow-2xl p-4 md:px-8 flex items-center gap-4 backdrop-blur-md"
          >
            <div className="w-12 h-12 shrink-0">
              <ProgressCircle progress={progress} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-sky-400 uppercase tracking-widest truncate">Synchronizing Data...</span>
                <span className="text-xs font-mono text-slate-500">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                   className="h-full bg-sky-500" 
                   initial={{ width: 0 }}
                   animate={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Zone */}
      <section className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 relative group">
          <input 
            type="file" 
            onChange={onFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            disabled={uploading}
          />
          <div className={`
            border-2 border-dashed rounded-3xl p-12 text-center transition-all relative overflow-hidden
            ${uploading ? 'bg-slate-900 border-sky-500/50' : 'border-slate-800 bg-slate-900/30 group-hover:border-slate-700 group-hover:bg-slate-900/50'}
          `}>
             <div className="absolute inset-0 bg-sky-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            {uploading ? (
              <div className="flex flex-col items-center relative z-10">
                <ProgressCircle progress={progress} />
                <p className="mt-4 font-mono text-sm text-slate-400">TRANSFERRING: {Math.round(progress)}%</p>
                <div className="w-48 h-1 bg-slate-800 rounded-full mt-4 overflow-hidden">
                   <div className="bg-sky-500 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center relative z-10">
                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-6 border border-slate-700 shadow-xl group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-sky-400" />
                </div>
                <h3 className="text-xl font-bold mb-2">Drop files to upload</h3>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-wider">Supports large files up to 1GB • Resumable</p>
                <button className="mt-6 bg-sky-600 hover:bg-sky-500 text-white px-8 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-sky-900/20">Browse Files</button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 flex flex-col justify-center">
           <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                 <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Auto Purge</h4>
                 <p className="text-[10px] text-slate-500 font-mono">24H RETENTION POLICY</p>
              </div>
           </div>
           <p className="text-xs text-slate-500 leading-relaxed font-mono italic">
              "Every file uploaded is assigned a unique link and encrypted transmission. Files are automatically deleted from our servers exactly 24 hours after upload."
           </p>

           <div className="mt-8 border-t border-slate-800 pt-6">
              <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2">
                    <Shield className={`w-4 h-4 ${encryptionEnabled ? 'text-sky-400' : 'text-slate-600'}`} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">End-to-End Encryption</span>
                 </div>
                 <button 
                  onClick={() => setEncryptionEnabled(!encryptionEnabled)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${encryptionEnabled ? 'bg-sky-500' : 'bg-slate-800'}`}
                 >
                   <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${encryptionEnabled ? 'right-1' : 'left-1'}`}></div>
                 </button>
              </div>
              <p className="text-[10px] text-slate-600 font-mono leading-relaxed">
                {encryptionEnabled 
                  ? "E2EE: Keys never leave your device. Only recipients with the full link (including the hash) can view the file."
                  : "Standard: Faster upload/download. Basic transport security, but the file is stored unencrypted on the server."}
              </p>
           </div>
        </div>
      </section>

      {/* History */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-3xl backdrop-blur-sm overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-500" />
            RECENT FILES
          </h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter archives..."
              className="bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs font-mono outline-none focus:border-sky-500 transition-colors w-full sm:w-64"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-800/50">
          <AnimatePresence>
            {filteredFiles.map(file => (
              <FileCard key={file.id} file={file} refresh={refresh} showAdminControls={user.role === 'admin'} />
            ))}
          </AnimatePresence>
          {filteredFiles.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-slate-500 font-mono text-sm uppercase tracking-widest">No active links found</p>
            </div>
          )}
        </div>
      </section>
    </motion.div>
  );
}

interface FileCardProps {
  key?: React.Key;
  file: FileMetadata;
  refresh: () => void;
  showAdminControls?: boolean;
}

function FileCard({ file, refresh, showAdminControls }: FileCardProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/download/${file.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API.token}`
        }
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Download failed');
      }

      const fileData = await res.blob();
      let finalBlob = fileData;

      if (file.isEncrypted) {
        const encryptedBuffer = await fileData.arrayBuffer();
        
        // Try to get key from localStorage
        const keys = JSON.parse(localStorage.getItem('fileKeys') || '{}');
        let keyStr = keys[file.id];

        if (!keyStr) {
           // If not in localStorage, maybe it's in the hash of the current URL if we just shared it?
           // But normally uploader should have it.
           keyStr = prompt('Encryption key required for decryption:');
        }

        if (!keyStr) {
          throw new Error('Encryption key required. This file is end-to-end encrypted.');
        }

        const key = await CryptoUtils.importKey(keyStr);
        const results: ArrayBuffer[] = [];
        let offset = 0;
        const CHUNK_SIZE_ENC = (5 * 1024 * 1024) + 28;

        while (offset < encryptedBuffer.byteLength) {
          const blockSize = Math.min(CHUNK_SIZE_ENC, encryptedBuffer.byteLength - offset);
          const block = encryptedBuffer.slice(offset, offset + blockSize);
          const decrypted = await CryptoUtils.decryptBuffer(block, key);
          results.push(decrypted);
          offset += blockSize;
        }
        finalBlob = new Blob(results);
      }

      const url = window.URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const deleteFile = async () => {
    if (!confirm('DELETE THIS FILE PERMANENTLY?')) return;
    try {
      await API.req(`/api/files/${file.id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      alert('Delete failed');
    }
  };

  const copyLink = () => {
    const keys = JSON.parse(localStorage.getItem('fileKeys') || '{}');
    const key = keys[file.id] || '';
    const hash = key ? `#${key}` : '';
    const url = `${window.location.origin}${window.location.pathname}?f=${file.shortId}${hash}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const timeLeft = Math.max(0, file.expiresAt - Date.now());
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const minsLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <motion.div 
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: 20 }}
      className="p-4 sm:p-6 group hover:bg-slate-800/30 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
          <FileIcon name={file.name} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
             <h4 className="font-semibold truncate text-sm">{file.name}</h4>
             {file.hasPassword && <Shield className="w-3 h-3 text-sky-400" />}
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            <span className="text-sky-400">{file.shortId}</span>
            <span>•</span>
            <span>{formatSize(file.size)}</span>
            {file.isEncrypted && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-emerald-500">
                  <Shield className="w-2.5 h-2.5" />
                  E2EE
                </span>
              </>
            )}
            <span>•</span>
            <span className={`flex items-center gap-1.5 ${hoursLeft < 2 ? 'text-amber-500' : ''}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${hoursLeft < 2 ? 'bg-amber-500 animate-pulse' : 'bg-slate-600'}`}></div>
              {hoursLeft}H {minsLeft}M
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <button 
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all bg-slate-950 border-slate-800 hover:border-slate-600 text-slate-400 hover:text-slate-200 disabled:opacity-50"
            title="Download file"
          >
            {downloading ? (
              <div className="w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{downloading ? 'WORKING...' : 'DOWNLOAD'}</span>
          </button>

          <button 
            onClick={copyLink}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${copied ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-slate-950 border-slate-800 hover:border-slate-600 text-slate-400 hover:text-slate-200'}`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'COPIED' : 'COPY'}</span>
          </button>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 transition-colors text-slate-500 hover:text-slate-200"
              title="Settings"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={deleteFile}
              className="p-2 transition-colors text-slate-500 hover:text-red-400"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-6 mt-6 border-t border-slate-800/50 grid sm:grid-cols-2 gap-6 pb-2">
               <FileSettingsForm file={file} refresh={refresh} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FileSettingsForm({ file, refresh }: { file: FileMetadata, refresh: () => void }) {
  const [name, setName] = useState(file.name);
  const [password, setPassword] = useState('');
  const [customLink, setCustomLink] = useState(file.shortId);
  const [loading, setLoading] = useState(false);

  const update = async () => {
    setLoading(true);
    try {
      await API.req(`/api/files/${file.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, password, customLink })
      });
      refresh();
      alert('Settings updated');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-mono text-slate-500 mb-2 uppercase tracking-widest font-bold">Rename File</label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-xs font-mono outline-none focus:border-sky-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono text-slate-500 mb-2 uppercase tracking-widest font-bold">Access Code</label>
          <div className="relative">
            <Shield className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="NO PROTECTION"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs font-mono outline-none focus:border-sky-500"
            />
          </div>
        </div>
      </div>
      <div className="space-y-4 flex flex-col justify-between">
        <div>
          <label className="block text-[10px] font-mono text-slate-500 mb-2 uppercase tracking-widest font-bold">Shortened Alias</label>
          <input 
            type="text" 
            value={customLink}
            onChange={(e) => setCustomLink(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-xs font-mono outline-none focus:border-sky-500"
          />
        </div>
        <button 
          onClick={update}
          disabled={loading}
          className="w-full h-10 bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-sky-900/20"
        >
          {loading ? 'Committing...' : 'Commit Changes'}
        </button>
      </div>
    </>
  );
}

function AdminView({ files, refresh }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const fetchAdminData = async () => {
    const [u, s] = await Promise.all([
      API.req('/api/admin/users'),
      API.req('/api/admin/settings')
    ]);
    setUsers(u);
    setSettings(s);
  };

  useEffect(() => { fetchAdminData(); }, []);

  const createUser = async () => {
    if (!newUsername || !newPassword) return;
    try {
      await API.req('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username: newUsername, password: newPassword })
      });
      setNewUsername('');
      setNewPassword('');
      fetchAdminData();
      alert('User created');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const updateSettings = async (val: number) => {
    try {
      await API.req('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ maxUploadSize: val })
      });
      fetchAdminData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }}
      className="space-y-12 pb-20"
    >
      <div className="grid lg:grid-cols-2 gap-12">
        {/* User Management */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-500" />
            OPERATOR CONTROL
          </h2>
          
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-3xl space-y-6 backdrop-blur-sm">
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="ID / USERNAME"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:border-sky-500"
              />
              <input 
                type="password" 
                placeholder="SECRET KEY"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:border-sky-500"
              />
              <button 
                onClick={createUser}
                className="w-full bg-sky-600 hover:bg-sky-500 text-white h-11 rounded-xl font-bold text-xs uppercase tracking-[0.2em] transition-all shadow-lg shadow-sky-900/20"
              >
                Register New Operator
              </button>
            </div>

            <div className="pt-6 border-t border-slate-800/50 space-y-3">
              <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold mb-2">Authenticated Units</label>
              <div className="grid gap-2">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800/50 rounded-2xl group hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-3">
                       <div className={`w-2 h-2 rounded-full ${u.role === 'admin' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                       <span className="font-mono text-xs">{u.username}</span>
                    </div>
                    <span className="text-[10px] font-mono bg-slate-800 px-3 py-1 rounded-full text-slate-400 border border-slate-700">{u.role.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Global Settings */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-500" />
            SYSTEM PARAMETERS
          </h2>
          
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-3xl space-y-8 backdrop-blur-sm">
            <div>
              <div className="flex justify-between items-center mb-6">
                 <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Network Capacity Threshold</label>
                 <span className="font-mono text-sm text-sky-400 bg-sky-500/10 px-3 py-1 rounded-lg border border-sky-500/20">
                  {settings ? (settings.maxUploadSize / (1024 * 1024)).toFixed(0) : 0} MB
                </span>
              </div>
              <div className="relative pt-1">
                <input 
                  type="range" 
                  min={100 * 1024 * 1024}
                  max={2 * 1024 * 1024 * 1024}
                  step={100 * 1024 * 1024}
                  value={settings?.maxUploadSize || 0}
                  onChange={(e) => updateSettings(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-950/50 border border-slate-800 rounded-2xl space-y-4">
               <div className="flex items-center gap-3 text-amber-500">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Protocol Warning</span>
               </div>
               <p className="text-xs text-slate-500 leading-relaxed font-mono italic">
                  "Manual override of system security parameters may affect network stability. All modifications are logged in the global audit trail."
               </p>
            </div>

            <div className="pt-6 border-t border-slate-800/50">
               <div className="flex items-center gap-3 text-slate-400 mb-4">
                  <HardDrive className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Physical Storage Policy</span>
               </div>
               <p className="text-xs text-slate-500 leading-relaxed font-mono">
                  THE SYSTEM AUTOMATICALLY PURGES ALL TRANSMISSION CACHE 24 HOURS POST-UPLOAD. DATA RECOVERY IS IMPOSSIBLE AFTER THIS THRESHOLD.
               </p>
            </div>
          </div>
        </section>
      </div>

      {/* Global File List */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
           <h2 className="text-xl font-bold flex items-center gap-2">
             <Shield className="w-5 h-5 text-sky-500" />
             CENTRAL REPOSITORY
           </h2>
           <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Monitoring {files.length} active links</span>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl divide-y divide-slate-800/50 overflow-hidden backdrop-blur-sm">
          {files.map((file: any) => (
            <FileCard key={file.id} file={file} refresh={refresh} />
          ))}
          {files.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-slate-500 font-mono text-sm uppercase tracking-widest">Secure vault is empty</p>
            </div>
          )}
        </div>
      </section>
    </motion.div>
  );
}

function DownloadView({ shortId }: { shortId: string }) {
  const [file, setFile] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const data = await API.req(`/api/f/${shortId}`);
        setFile(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchMeta();
  }, [shortId]);

  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/download/${file.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Download failed');
      }

      const fileData = await res.blob();
      let finalBlob = fileData;

      if (file.isEncrypted) {
        const encryptedBuffer = await fileData.arrayBuffer();
        const keyStr = window.location.hash.slice(1);
        if (!keyStr) {
          throw new Error('Encryption key missing in URL. This file is encrypted and requires the original share link (with hash) to decrypt.');
        }

        const key = await CryptoUtils.importKey(keyStr);
        const results: ArrayBuffer[] = [];
        let offset = 0;
        const CHUNK_SIZE_ENC = (5 * 1024 * 1024) + 28; // Original 5MB + 12B IV + 16B Tag

        while (offset < encryptedBuffer.byteLength) {
          const blockSize = Math.min(CHUNK_SIZE_ENC, encryptedBuffer.byteLength - offset);
          const block = encryptedBuffer.slice(offset, offset + blockSize);
          try {
            const decrypted = await CryptoUtils.decryptBuffer(block, key);
            results.push(decrypted);
          } catch (err) {
            console.error('Block decryption failed at offset', offset, err);
            throw new Error('Decryption failed. The key may be incorrect or the file is corrupted.');
          }
          offset += blockSize;
        }
        finalBlob = new Blob(results);
      }

      const url = window.URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-center py-20 font-mono">RETRIEVING METADATA...</div>;
  if (error) return (
    <div className="max-w-md mx-auto text-center py-20">
      <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
      <h2 className="text-2xl font-bold mb-2">FILE NOT FOUND</h2>
      <p className="text-zinc-500 font-mono text-sm uppercase">THE LINK MAY HAVE EXPIRED OR BEEN DELETED</p>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute -top-12 -right-12 p-8 opacity-5 text-sky-400">
           <Download className="w-48 h-48" />
        </div>

        <div className="relative z-10">
          <div className="w-16 h-16 bg-sky-600 rounded-2xl flex items-center justify-center mb-8 shadow-xl shadow-sky-600/20">
            <Download className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-2xl font-bold mb-1 truncate tracking-tight">{file.name}</h2>
          <p className="text-slate-500 font-mono text-[10px] mb-8 uppercase tracking-widest">
            {(file.size / (1024 * 1024)).toFixed(1)} MB • EXPIRES IN {Math.floor((file.expiresAt - Date.now()) / (3600000))}H
          </p>

          {file.hasPassword && (
            <div className="mb-8">
              <label className="block text-[10px] font-mono text-slate-500 mb-2 uppercase tracking-wider">Access Control: Enter Password</label>
              <div className="relative">
                <Shield className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-sky-500 transition-all font-mono"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          <button 
            onClick={handleDownload}
            className="w-full bg-sky-600 hover:bg-sky-500 h-14 rounded-xl font-bold text-sm uppercase tracking-[0.2em] transition-all shadow-lg shadow-sky-900/20 flex items-center justify-center gap-2"
          >
            Retrieve Archive <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
