import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  conversationsService,
  type ConversationsService,
} from './conversations.service.js';
import type { CreateDirectConversationDTO } from '@chat/types';

export class ConversationsController {
  constructor(private readonly service: ConversationsService = conversationsService) {}

  public async list(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.listUserConversations(userId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }

  public async getOne(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.getConversation(request.params.id, userId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }

  public async createDirect(
    request: FastifyRequest<{ Body: CreateDirectConversationDTO }>,
    reply: FastifyReply
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const { peerUserId } = request.body;
    if (!peerUserId) {
      return reply.status(422).send({ error: { code: 'VALIDATION_FAILED', message: 'peerUserId is required' } });
    }

    const result = await this.service.createDirectConversation(userId, peerUserId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(201).send({ data: result.data });
  }

  public async createGroup(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const { title, memberIds } = request.body as { title: string; memberIds: string[] };
    if (!title || !Array.isArray(memberIds)) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: 'title and memberIds array are required' },
      });
    }

    const result = await this.service.createGroupConversation(userId, { title, memberIds });
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(201).send({ data: result.data });
  }

  public async addMember(
    request: FastifyRequest<{ Params: { id: string }; Body: { userId: string } }>,
    reply: FastifyReply
  ) {
    const actorUserId = request.user?.userId;
    if (!actorUserId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const { userId: targetUserId } = request.body;
    if (!targetUserId) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: 'userId is required' },
      });
    }

    const result = await this.service.addGroupMember(actorUserId, request.params.id, targetUserId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }

  public async removeMember(
    request: FastifyRequest<{ Params: { id: string; userId: string } }>,
    reply: FastifyReply
  ) {
    const actorUserId = request.user?.userId;
    if (!actorUserId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const { id: conversationId, userId: targetUserId } = request.params;
    const result = await this.service.removeGroupMember(actorUserId, conversationId, targetUserId);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }

  public async uploadHistoryPackage(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { recipientUserId: string; fromSeqId: string; toSeqId: string; encryptedHistoryKeyBundle: string };
    }>,
    reply: FastifyReply
  ) {
    const actorUserId = request.user?.userId;
    if (!actorUserId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.uploadHistoryPackage(
      actorUserId,
      request.params.id,
      request.body
    );
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(201).send({ data: result.data });
  }

  public async getHistoryPackage(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const recipientUserId = request.user?.userId;
    if (!recipientUserId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing user context' } });
    }

    const result = await this.service.getHistoryPackage(recipientUserId, request.params.id);
    if (!result.success) {
      return reply.status(result.error.statusCode).send({
        error: { code: result.error.errorCode, message: result.error.message },
      });
    }

    return reply.status(200).send({ data: result.data });
  }
}

export const conversationsController = new ConversationsController();

