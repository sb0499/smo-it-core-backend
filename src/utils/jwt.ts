import jwt from 'jsonwebtoken';
import { config } from '../core/config';

export interface TokenPayload {
  sub: string; // usually user email or id
  id: number;
  rol: string;
}

export const createAccessToken = (
  data: TokenPayload,
  expiresDeltaMin: number = config.ACCESS_TOKEN_EXPIRE_MINUTES
): string => {
  const expiresIn = expiresDeltaMin * 60; // seconds
  
  return jwt.sign(data, config.JWT_SECRET, {
    algorithm: config.ALGORITHM as jwt.Algorithm,
    expiresIn
  });
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: [config.ALGORITHM as jwt.Algorithm]
    });
    return decoded as TokenPayload;
  } catch (error) {
    return null;
  }
};
