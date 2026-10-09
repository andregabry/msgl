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
  query?: string;
  order?: "asc" | "desc";
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
   * Synchronize explicit chat_user_access records for a specific user based on their participation.
   */
  public async syncUserChatAccess(appUserId: string) {
    try {
      const appUser = await prisma.appUser.findUnique({
        where: { id: appUserId },
        select: { id: true, email: true, displayName: true },
      });
      if (!appUser) return;

      const userEmail = appUser.email.toLowerCase();

      // Find all spaces where this user sent messages or is a DM participant
      const authorizedSpaces = await prisma.chatSpace.findMany({
        where: {
          OR: [
            { messages: { some: { senderEmail: { equals: userEmail, mode: "insensitive" } } } },
            { spaceType: "DIRECT_MESSAGE", displayName: { equals: appUser.displayName, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      const spaceIds = authorizedSpaces.map((s) => s.id);

      // Find all messages in those spaces (or sent by this user anywhere)
      const messages = await prisma.chatMessage.findMany({
        where: {
          OR: [
            { senderEmail: { equals: userEmail, mode: "insensitive" } },
            { chatSpaceId: { in: spaceIds } },
          ],
        },
        select: { id: true },
      });

      if (messages.length > 0) {
        await prisma.chatUserAccess.createMany({
          data: messages.map((m) => ({
            chatMessageId: m.id,
            appUserId: appUser.id,
            grantedVia: "PARTICIPANT",
          })),
          skipDuplicates: true,
        });
      }
    } catch (err) {
      console.error("[ChatQueryService] Falha ao sincronizar chat_user_access:", err);
    }
  }

  /**
   * Helper to build Prisma where clause ensuring a ChatSpace belongs to the specified user.
   * Matches spaces from the user's backup archive, where they sent messages, where they are a participant,
   * where userAccess was granted, or direct messages matching their identity.
   */
  public getAuthorizedSpaceWhere(appUserId: string, userEmail: string, displayName: string) {
    return {
      OR: [
        {
          chatArchive: {
            backupRequest: {
              entityEmail: { equals: userEmail, mode: "insensitive" as const },
            },
          },
        },
        {
          messages: {
            some: {
              userAccess: {
                some: { appUserId },
              },
            },
          },
        },
        {
          messages: {
            some: {
              senderEmail: { equals: userEmail, mode: "insensitive" as const },
            },
          },
        },
        {
          messages: {
            some: {
              participants: {
                some: {
                  userEmail: { equals: userEmail, mode: "insensitive" as const },
                },
              },
            },
          },
        },
        {
          spaceType: "DIRECT_MESSAGE",
          displayName: { equals: displayName, mode: "insensitive" as const },
        },
      ],
    };
  }

  /**
   * List spaces where the user has access.
   * STRICT PRIVACY & SECURITY: Under no circumstances can any user (even ADMIN) view chat spaces of other accounts.
   * Access is strictly restricted to the authenticated responsible user account.
   */
  public async getUserSpaces(appUserId: string, _role?: string) {
    const appUser = await prisma.appUser.findUnique({
      where: { id: appUserId },
      select: { id: true, email: true, displayName: true },
    });
    if (!appUser) return [];

    const userEmail = appUser.email.toLowerCase();
    const userName = appUser.displayName.toLowerCase();

    // Trigger sync in background to ensure database records are persistent
    this.syncUserChatAccess(appUserId).catch(() => {});

    // STRICT ISOLATION: Always filter spaces belonging to this user account only
    const authorizedWhere = this.getAuthorizedSpaceWhere(appUserId, userEmail, appUser.displayName);

    const spaces = await prisma.chatSpace.findMany({
      where: authorizedWhere,
      include: {
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { displayName: "asc" },
    });

    // Adapt display name for direct messages:
    // If the DM space displayName is the user's OWN name (e.g. "Ana Rodrigues"),
    // show the name of the OTHER participant in that conversation (e.g. "André Gabry")
    const spacesWithAdjustedName = await Promise.all(
      spaces.map(async (s) => {
        if (s.spaceType === "DIRECT_MESSAGE" && s.displayName?.toLowerCase() === userName) {
          const otherSender = await prisma.chatMessage.findFirst({
            where: {
              chatSpaceId: s.id,
              senderEmail: { not: userEmail, mode: "insensitive" },
              senderName: { not: null },
            },
            select: { senderName: true, senderEmail: true },
          });
          if (otherSender?.senderName) {
            return {
              ...s,
              displayName: otherSender.senderName,
            };
          }
        }
        return s;
      })
    );

    return spacesWithAdjustedName;
  }

  /**
   * Get chronological messages for a conversation space with pagination.
   * STRICT PRIVACY: Verifies that the space belongs to the authenticated user.
   */
  public async getSpaceMessages(params: GetMessagesParams) {
    const { spaceId, appUserId, role, limit = 100, cursor, startDate, endDate, query, order = "asc" } = params;

    const appUser = await prisma.appUser.findUnique({
      where: { id: appUserId },
      select: { id: true, email: true, displayName: true },
    });
    if (!appUser) {
      throw new Error("Utilizador não encontrado.");
    }
    const userEmail = appUser.email.toLowerCase();

    // STRICT ISOLATION: Verify that this specific space belongs to the user
    const authorizedWhere = this.getAuthorizedSpaceWhere(appUserId, userEmail, appUser.displayName);
    const authorizedSpace = await prisma.chatSpace.findFirst({
      where: {
        id: spaceId,
        ...authorizedWhere,
      },
      select: { id: true },
    });

    if (!authorizedSpace) {
      throw new Error("Não tem permissão para aceder a esta conversa arquivada.");
    }

    const whereClause: any = {
      chatSpaceId: spaceId,
    };

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

    const totalCount = await prisma.chatMessage.count({
      where: whereClause,
    });

    const safeLimit = Math.max(1, Math.min(limit, 10000));

    const messages = await prisma.chatMessage.findMany({
      where: whereClause,
      take: safeLimit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { sentAt: order },
      include: {
        participants: true,
        attachments: true,
      },
    });

    let nextCursor: string | undefined = undefined;
    if (messages.length > safeLimit) {
      messages.pop();
      nextCursor = messages[messages.length - 1]?.id;
    }

    return {
      messages,
      nextCursor,
      totalCount,
    };
  }

  /**
   * Full-text search across accessible messages.
   * STRICT PRIVACY: Only searches within spaces belonging to the authenticated user.
   */
  public async searchMessages(params: SearchMessagesParams) {
    const { appUserId, role, query, spaceId, participantEmail, startDate, endDate, limit = 30 } = params;

    const userSpaces = await this.getUserSpaces(appUserId, role);
    const accessibleSpaceIds = userSpaces.map((s) => s.id);
    if (accessibleSpaceIds.length === 0) {
      return [];
    }

    if (spaceId && !accessibleSpaceIds.includes(spaceId)) {
      return [];
    }

    const whereClause: any = {
      chatSpaceId: spaceId ? spaceId : { in: accessibleSpaceIds },
    };

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
