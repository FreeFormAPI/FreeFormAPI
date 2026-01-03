// tests/types/test-types.ts
export interface SessionData {
  honeypotField: string;
  createdAt: number;
  used: boolean;
  attempts: number;
  lastAccess?: number;
  usedAt?: number;
  ip?: string;
  userAgent?: string;
}

export interface NewSession {
  sessionId: string;
  honeypotField: string;
  expiresIn: number;
  createdAt: string;
}