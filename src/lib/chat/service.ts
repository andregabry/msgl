import { prisma } from "../prisma";
import { logAudit } from "../audit/audit.service";

export interface GetMessagesParams {
  spaceId: string;
  appUserId: string;
  role: string;
  limit?: number;
  cursor?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface SearchMessagesParams {
  appUserId: string;
  role: string;
  query: string;
  spaceId?: string;
  participantEmail?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export class ChatQueryService {
  /**
   * List spaces where the user has access via chat_user_access (or all if ADMIN/AUDITOR).
   */
  public async getUserSpaces(appUserId: string, role: string) {
    const isGlobalViewer = role === "ADMIN" || role === "AUDITOR";

    if (isGlobalViewer) {
      return prisma.chatSpace.findMany({
        include: {
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { displayName: "asc" },
      });
    }

    // Regular USER: Filter only spaces that contain messages granted in chat_user_access
    return prisma.chatSpace.findMany({
      where: {
        messages: {
          some: {
            userAccess: {
              some: { appUserId },
            },
          },
        },
      },
      include: {
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { displayName: "asc" },
    });
  }

  /**
   * Get chronological messages for a conversation space with pagination.
   */
  public async getSpaceMessages(params: GetMessagesParams) {
    const { spaceId, appUserId, role, limit = 50, cursor, startDate, endDate } = params;
    const isGlobalViewer = role === "ADMIN" || role === "AUDITOR";

    const whereClause: any = {
      chatSpaceId: spaceId,
    };

    if (!isGlobalViewer) {
      whereClause.userAccess = {
        some: { appUserId },
      };
    } else {
      // Audit log when admin views conversations
      await logAudit({
        actorUserId: appUserId,
        action: "CHAT_VIEW_ADMIN",
        entityType: "CHAT",
        entityId: spaceId,
        metadata: { spaceId, viewerRole: role },
      });
    }

    if (startDate || endDate) {
      whereClause.sentAt = {};
      if (startDate) whereClause.sentAt.gte = startDate;
      if (endDate) whereClause.sentAt.lte = endDate;
    }

    const messages = await prisma.chatMessage.findMany({
      where: whereClause,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { sentAt: "asc" },
      include: {
        participants: true,
        attachments: true,
      },
    });

    let nextCursor: string | undefined = undefined;
    if (messages.length > limit) {
      const nextItem = messages.pop();
      nextCursor = nextItem?.id;
    }

    return {
      messages,
      nextCursor,
    };
  }

  /**
   * Full-text search across accessible messages.
   */
  public async searchMessages(params: SearchMessagesParams) {
    const { appUserId, role, query, spaceId, participantEmail, startDate, endDate, limit = 30 } = params;
    const isGlobalViewer = role === "ADMIN" || role === "AUDITOR";

    const whereClause: any = {};

    if (!isGlobalViewer) {
      whereClause.userAccess = {
        some: { appUserId },
      };
    }

    if (spaceId) {
      whereClause.chatSpaceId = spaceId;
    }

    if (participantEmail) {
      whereClause.OR = [
        { senderEmail: { contains: participantEmail, mode: "insensitive" } },
        { participants: { some: { userEmail: { contains: participantEmail, mode: "insensitive" } } } },
      ];
    }

    if (startDate || endDate) {
      whereClause.sentAt = {};
      if (startDate) whereClause.sentAt.gte = startDate;
      if (endDate) whereClause.sentAt.lte = endDate;
    }

    if (query && query.trim() !== "") {
      whereClause.text = {
        contains: query.trim(),
        mode: "insensitive",
      };
    }

    const results = await prisma.chatMessage.findMany({
      where: whereClause,
      take: limit,
      orderBy: { sentAt: "desc" },
      include: {
        chatSpace: { select: { id: true, displayName: true, spaceType: true } },
        attachments: true,
        participants: true,
      },
    });

    return results;
  }
}

export const chatQueryService = new ChatQueryService();
