import { Router } from 'express';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware } from '../auth/auth.middleware.js';
import { ForbiddenError, AppError } from '../../shared/errors.js';
import { startConversationSchema, sendMessageSchema, messagesQuerySchema } from './messaging.schema.js';

export function createMessagingRouter(container: AppContainer): Router {
  const router = Router();
  const { authProvider, conversationRepository, messageRepository, realtimeProvider } = container;
  const authenticate = createAuthMiddleware(authProvider);

  router.use(authenticate);

  router.get('/conversations', async (req, res, next) => {
    try {
      const conversations = await conversationRepository.findByUserId(req.user!.id);
      res.json({ conversations });
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations', async (req, res, next) => {
    try {
      const { participantId } = startConversationSchema.parse(req.body);
      const conversation = await conversationRepository.findOrCreate([req.user!.id, participantId]);
      // Return as summary format: find it via findByUserId to get last message etc.
      const summaries = await conversationRepository.findByUserId(req.user!.id);
      const summary = summaries.find(s => s.id === conversation.id) ?? {
        id: conversation.id,
        updatedAt: conversation.updatedAt,
        participants: conversation.participants.map(p => ({
          userId: p.userId,
          displayName: p.displayName,
          lastReadAt: p.lastReadAt,
        })),
        lastMessage: null,
        unreadCount: 0,
      };
      res.status(201).json({ conversation: summary });
    } catch (err) {
      next(err);
    }
  });

  router.get('/conversations/:id/messages', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const allowed = await conversationRepository.isParticipant(id, req.user!.id);
      if (!allowed) throw new ForbiddenError();

      const { after, before, limit } = messagesQuerySchema.parse(req.query);
      const messages = await messageRepository.list(id, {
        ...(after !== undefined && { afterId: after }),
        ...(before !== undefined && { beforeId: before }),
        ...(limit !== undefined && { limit }),
        language: req.user!.language,
      });
      res.json({ messages });
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/:id/messages', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const allowed = await conversationRepository.isParticipant(id, req.user!.id);
      if (!allowed) throw new ForbiddenError();

      const { body, audioUrl, videoUrl } = sendMessageSchema.parse(req.body);

      if (audioUrl !== undefined && !req.user!.canSendVoice) {
        throw new AppError('No permission to send voice messages', 403);
      }
      if (videoUrl !== undefined && !req.user!.canSendVideo) {
        throw new AppError('No permission to send video messages', 403);
      }

      const createOptions: { audioUrl?: string; videoUrl?: string } = {};
      if (audioUrl !== undefined) createOptions.audioUrl = audioUrl;
      if (videoUrl !== undefined) createOptions.videoUrl = videoUrl;

      const message = await messageRepository.create(id, req.user!.id, body, createOptions);
      res.status(201).json({ message });

      const conversation = await conversationRepository.findById(id);
      if (conversation) {
        const lastMessage = { body: message.body, createdAt: message.createdAt };
        void realtimeProvider.emit(`conversation:${id}`, 'new_message', { message });
        for (const p of conversation.participants) {
          void realtimeProvider.emit(`user:${p.userId}`, 'conversation_updated', {
            conversationId: id,
            lastMessage,
          });
        }
      }
    } catch (err) {
      next(err);
    }
  });

  router.post('/conversations/:id/read', async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const allowed = await conversationRepository.isParticipant(id, req.user!.id);
      if (!allowed) throw new ForbiddenError();

      await conversationRepository.markRead(id, req.user!.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
