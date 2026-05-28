import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  sub: string;          // platform user id
  sid: string;          // session id (for server-side revocation + device cap)
  mobile: string;
  tenantId: string;
  schemaName: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF';
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as SignOptions);
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
