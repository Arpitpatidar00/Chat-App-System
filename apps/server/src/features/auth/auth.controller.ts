import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService, type AuthService } from './auth.service.js';

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  public async getMe(request: FastifyRequest, reply: FastifyReply) {
    const session = request.user;
    if (!session) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing authenticated session' },
      });
    }

    const result = await this.service.getSession(session.userId, session.deviceId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }

  public async verifySession(request: FastifyRequest, reply: FastifyReply) {
    const session = request.user;
    if (!session) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing authenticated session' },
      });
    }

    const result = await this.service.verifySession(session.userId, session.deviceId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }

  public async suspendUser(
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply
  ) {
    const { userId } = request.params;
    const result = await this.service.suspendUser(userId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }
}

export const authController = new AuthController();
