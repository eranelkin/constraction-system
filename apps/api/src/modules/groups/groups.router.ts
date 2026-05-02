import { Router } from 'express';
import type { UpdateGroupDTO } from '@constractor/types';
import type { AppContainer } from '../../container.js';
import { createAuthMiddleware, requireRole } from '../auth/auth.middleware.js';
import { NotFoundError } from '../../shared/errors.js';
import {
  createGroupSchema,
  updateGroupSchema,
  setMembersSchema,
  syncUserMembershipsSchema,
} from './groups.schema.js';

export function createGroupsRouter(container: AppContainer): Router {
  const router = Router();
  const { groupRepository, conversationRepository } = container;
  const authenticate = createAuthMiddleware(container.authProvider);

  router.use(authenticate);

  // GET /groups/mine — all auth users (must be before requireRole)
  router.get('/mine', async (req, res, next) => {
    try {
      const all = await groupRepository.listAll();
      const mine = all.filter((g) => g.members.some((m) => m.userId === req.user!.id));
      res.json({ groups: mine });
    } catch (err) { next(err); }
  });

  router.use(requireRole('admin', 'manager'));

  // GET /groups
  router.get('/', async (_req, res, next) => {
    try {
      const groups = await groupRepository.listAll();
      res.json({ groups });
    } catch (err) { next(err); }
  });

  // GET /groups/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const group = await groupRepository.findById(req.params['id'] as string);
      if (!group) throw new NotFoundError('Group');
      res.json({ group });
    } catch (err) { next(err); }
  });

  // POST /groups — create + auto-create group conversation
  router.post('/', async (req, res, next) => {
    try {
      const data = createGroupSchema.parse(req.body);
      const actor = req.user!;

      const group = await groupRepository.create({
        name: data.name,
        ...(data.description && { description: data.description }),
        ...(data.color && { color: data.color }),
        ...(data.emoji && { emoji: data.emoji }),
        createdBy: actor.id,
      });

      if (data.memberIds.length > 0) {
        await groupRepository.setMembers(group.id, data.memberIds);
      }

      const allMemberIds = [...new Set([actor.id, ...data.memberIds])];
      const conversation = await conversationRepository.createGroupConversation(
        allMemberIds,
        data.name,
      );
      await groupRepository.setConversationId(group.id, conversation.id);

      const full = await groupRepository.findById(group.id);
      res.status(201).json({ group: full });
    } catch (err) { next(err); }
  });

  // PATCH /groups/:id
  router.patch('/:id', async (req, res, next) => {
    try {
      const id = req.params['id'] as string;
      const data = updateGroupSchema.parse(req.body);

      const updateData: UpdateGroupDTO = {};
      if (data.name !== undefined)        updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.color !== undefined)       updateData.color = data.color;
      if (data.emoji !== undefined)       updateData.emoji = data.emoji;

      const updated = await groupRepository.update(id, updateData);
      if (!updated) throw new NotFoundError('Group');

      // Sync group conversation name if name changed
      if (data.name !== undefined) {
        const full = await groupRepository.findById(id);
        if (full?.conversationId) {
          await conversationRepository.renameGroupConversation(full.conversationId, data.name);
        }
      }

      const full = await groupRepository.findById(id);
      res.json({ group: full });
    } catch (err) { next(err); }
  });

  // DELETE /groups/:id
  router.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params['id'] as string;
      const group = await groupRepository.findById(id);
      if (!group) throw new NotFoundError('Group');
      await groupRepository.delete(id);
      res.status(204).send();
    } catch (err) { next(err); }
  });

  // PUT /groups/:id/members/set — replace full member list (from groups edit form)
  router.put('/:id/members/set', async (req, res, next) => {
    try {
      const id = req.params['id'] as string;
      const { userIds } = setMembersSchema.parse(req.body);

      const group = await groupRepository.findById(id);
      if (!group) throw new NotFoundError('Group');

      const beforeIds = new Set(group.members.map((m) => m.userId));
      const afterIds = new Set(userIds);

      await groupRepository.setMembers(id, userIds);

      if (group.conversationId) {
        for (const uid of afterIds) {
          if (!beforeIds.has(uid)) {
            await conversationRepository.addParticipant(group.conversationId, uid);
          }
        }
        for (const uid of beforeIds) {
          if (!afterIds.has(uid)) {
            await conversationRepository.removeParticipant(group.conversationId, uid);
          }
        }
      }

      const full = await groupRepository.findById(id);
      res.json({ group: full });
    } catch (err) { next(err); }
  });

  // POST /groups/:id/members — add a single member
  router.post('/:id/members', async (req, res, next) => {
    try {
      const id = req.params['id'] as string;
      const { userId } = req.body as { userId?: string };
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      await groupRepository.addMember(id, userId);

      const group = await groupRepository.findById(id);
      if (!group) throw new NotFoundError('Group');

      if (group.conversationId) {
        await conversationRepository.addParticipant(group.conversationId, userId);
      }

      res.json({ group });
    } catch (err) { next(err); }
  });

  // DELETE /groups/:id/members/:userId — remove a member
  router.delete('/:id/members/:userId', async (req, res, next) => {
    try {
      const { id, userId } = req.params as { id: string; userId: string };
      await groupRepository.removeMember(id, userId);

      const group = await groupRepository.findById(id);
      if (!group) throw new NotFoundError('Group');

      if (group.conversationId) {
        await conversationRepository.removeParticipant(group.conversationId, userId);
      }

      res.json({ group });
    } catch (err) { next(err); }
  });

  // PUT /groups/user/:userId/memberships — set all group memberships for a user (from user form)
  router.put('/user/:userId/memberships', async (req, res, next) => {
    try {
      const { userId } = req.params as { userId: string };
      const { groupIds } = syncUserMembershipsSchema.parse(req.body);

      // Sync conversation participants too
      const before = await groupRepository.listByUserId(userId);
      const beforeIds = new Set(before.map((g) => g.id));
      const afterIds = new Set(groupIds);

      await groupRepository.syncUserMemberships(userId, groupIds);

      // Add user to newly joined group conversations
      for (const gid of afterIds) {
        if (!beforeIds.has(gid)) {
          const g = await groupRepository.findById(gid);
          if (g?.conversationId) {
            await conversationRepository.addParticipant(g.conversationId, userId);
          }
        }
      }
      // Remove user from left group conversations
      for (const gid of beforeIds) {
        if (!afterIds.has(gid)) {
          const g = await groupRepository.findById(gid);
          if (g?.conversationId) {
            await conversationRepository.removeParticipant(g.conversationId, userId);
          }
        }
      }

      res.status(204).send();
    } catch (err) { next(err); }
  });

  return router;
}
