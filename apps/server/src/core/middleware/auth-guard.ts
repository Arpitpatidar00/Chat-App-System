import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt } from '@chat/crypto';
import { env } from '../../config/env.js';
import { getRedisClient } from '../redis/redis-client.js';
import { prisma } from '@chat/database';
import type { UserSessionPayload } from '@chat/types';

// Augment FastifyRequest to include authenticated user session
declare module 'fastify' {
  interface FastifyRequest {
    user?: UserSessionPayload;
  }
}

/**
 * P1-T01 & P1-T02: Authenticated Identity & Eligibility Gate Middleware.
 * 1. Extracts & verifies JWT token signature and expiry.
 * 2. Checks Redis revocation blocklist for suspended/deactivated accounts.
 * 3. Enforces eligibility: rejects PENDING, SUSPENDED, DELETED states with 403.
 * 4. Contextually binds claims strictly to request.user to prevent impersonation.
 */
export async function authenticateAndCheckEligibility(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header. Expected Bearer <token>.',
      },
    });
  }

  const token = authHeader.slice(7).trim();
  const claims = verifyJwt(token, env.JWT_SECRET);

  if (!claims) {
    return reply.status(401).send({
      error: {
        code: 'INVALID_TOKEN',
        message: 'JWT token is invalid, signature mismatch, or expired.',
      },
    });
  }

  // Check Redis revocation kill-switch (P1-T06) with database fallback
  let isRevoked = false;
  try {
    const redis = getRedisClient();
    const result = await redis.get(`blacklist:user:${claims.userId}`);
    if (result) {
      isRevoked = true;
    }
  } catch {
    // If Redis is offline or unreachable, fall back to checking PostgreSQL status directly
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { status: true },
    });
    if (user && (user.status === 'SUSPENDED' || user.status === 'DELETED')) {
      isRevoked = true;
    }
  }

  if (isRevoked) {
    return reply.status(403).send({
      error: {
        code: 'ACCOUNT_SUSPENDED',
        message: 'This account has been suspended or revoked.',
      },
    });
  }

  // P1-T02 Eligibility Gate: Only VERIFIED or APPROVED accounts can participate in chat
  if (claims.status !== 'VERIFIED' && claims.status !== 'APPROVED') {
    return reply.status(403).send({
      error: {
        code: 'ELIGIBILITY_REQUIRED',
        message: `Account status is '${claims.status}'. Only VERIFIED or APPROVED users may access chat services.`,
      },
    });
  }

  // Contextually bind verified claims
  request.user = {
    userId: claims.userId,
    deviceId: claims.deviceId,
    username: claims.username,
    status: claims.status,
    platform: claims.platform,
  };
}

export const requireAuth = authenticateAndCheckEligibility;
