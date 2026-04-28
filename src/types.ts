export interface User {
  username: string;
  role: 'admin' | 'user';
}

export interface FileMetadata {
  id: string;
  shortId: string;
  name: string;
  size: number;
  uploadedAt: number;
  expiresAt: number;
  password?: string | null;
  hasPassword?: boolean;
  isEncrypted?: boolean;
}

export interface AppSettings {
  maxUploadSize: number;
}
