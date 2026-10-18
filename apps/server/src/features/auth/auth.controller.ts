import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService, type AuthService } from './auth.service.js';

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  public async getMe(
    request: FastifyRequest<{ Headers: { 'x-user-id'?: string; 'x-device-id'?: string } }>,
    reply: FastifyReply
  ) {
    const userId = request.headers['x-user-id'];
    const deviceId = request.headers['x-device-id'] ?? 'default-device';

    if (!userId) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing user context' },
      });
    }

    const result = await this.service.getSession(userId, deviceId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }
}

export const authController = new AuthController();
