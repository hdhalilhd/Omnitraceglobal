import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";

export interface AuthUser {
  id: number;
  email: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwt.secret, { expiresIn: config.jwt.expiresIn } as jwt.SignOptions);
}

export function authRequired(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Yetkilendirme gerekli" });
    return;
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, config.jwt.secret) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: "Geçersiz veya süresi dolmuş token" });
  }
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Bu işlem için yetkiniz yok" });
      return;
    }
    next();
  };
}
