import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "../prisma";
import { storageProvider } from "../storage/backup-storage.provider";

export interface ParsedChatMessage {
  providerMessageId?: string;
  spaceName: string;
  spaceType: "DIRECT_MESSAGE" | "GROUP_CHAT" | "SPACE";
  threadId?: string;
  senderName: string;
  senderEmail: string;
  text: string;
  formattedText?: string;
  sentAt: Date;
  rawMetadata?: any;
  participants: Array<{ email: string; name?: string; role?: string }>;
  attachments?: Array<{ filename: string; relativePath: string; bytes: number; mimeType?: string }>;
}

export class GoogleChatArchiveService {
  /**
   * Generates a deterministic hash for deduplication across multiple user backups
   */
  public generateMessageHash(msg: ParsedChatMessage): string {
    if (msg.providerMessageId && msg.providerMessageId.trim() !== "") {
      return crypto.createHash("sha256").update(`id:${msg.providerMessageId}`).digest("hex");
    }

    const payload = `${msg.spaceName}|${msg.threadId || ""}|${msg.sentAt.toISOString()}|${msg.senderEmail.toLowerCase()}|${msg.text.trim()}`;
    return crypto.createHash("sha256").update(payload).digest("hex");
  }

  /**
   * Process and index an extracted Google Chat backup artifact.
   * Tolerant to individual message failures.
   */
  public async processChatArchive(
    backupRequestId: string,
    extractedMessages: ParsedChatMessage[],
    ownerAppUserId?: string
  ): Promise<{ totalProcessed: number; duplicates: number; errors: number }> {
    let totalProcessed = 0;
    let duplicates = 0;
    let errors = 0;

    const chatArchive = await prisma.chatArchive.create({
      data: {
        backupRequestId,
        status: "PROCESSING",
      },
    });

    const spaceCache = new Map<string, string>(); // spaceName -> spaceId

    for (const msg of extractedMessages) {
      try {
        // Resolve or create Space
        let spaceId = spaceCache.get(msg.spaceName);
        if (!spaceId) {
          let space = await prisma.chatSpace.findFirst({
            where: { displayName: msg.spaceName },
          });

          if (!space) {
            space = await prisma.chatSpace.create({
              data: {
                chatArchiveId: chatArchive.id,
                displayName: msg.spaceName,
                spaceType: msg.spaceType,
                rawMetadata: msg.rawMetadata || {},
              },
            });
          }
          spaceId = space.id;
          spaceCache.set(msg.spaceName, spaceId);
        }

        // Deduplication Check
        const sourceHash = this.generateMessageHash(msg);
        let chatMessage = await prisma.chatMessage.findUnique({
          where: { sourceHash },
        });

        if (chatMessage) {
          duplicates++;
        } else {
          // Resolve thread
          let threadId: string | null = null;
          if (msg.threadId) {
            const thread = await prisma.chatThread.upsert({
              where: {
                id: crypto.createHash("md5").update(`${spaceId}:${msg.threadId}`).digest("hex").substring(0, 32),
              },
              create: {
                id: crypto.createHash("md5").update(`${spaceId}:${msg.threadId}`).digest("hex").substring(0, 32),
                chatSpaceId: spaceId,
                providerThreadId: msg.threadId,
              },
              update: {},
            });
            threadId = thread.id;
          }

          chatMessage = await prisma.chatMessage.create({
            data: {
              chatSpaceId: spaceId,
              chatThreadId: threadId,
              providerMessageId: msg.providerMessageId || null,
              sourceHash,
              senderName: msg.senderName,
              senderEmail: msg.senderEmail.toLowerCase(),
              text: msg.text,
              formattedText: msg.formattedText || msg.text,
              sentAt: msg.sentAt,
              rawMetadata: msg.rawMetadata || {},
            },
          });

          // Insert participants
          for (const p of msg.participants) {
            await prisma.chatMessageParticipant.create({
              data: {
                chatMessageId: chatMessage.id,
                userEmail: p.email.toLowerCase(),
                displayName: p.name || p.email,
                role: p.role || "PARTICIPANT",
              },
            });
          }

          // Insert attachments if present
          if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
              await prisma.chatAttachment.create({
                data: {
                  chatMessageId: chatMessage.id,
                  filename: att.filename,
                  relativePath: att.relativePath,
                  bytes: BigInt(att.bytes),
                  mimeType: att.mimeType || "application/octet-stream",
                  scanStatus: "CLEAN",
                },
              });
            }
          }
        }

        // Assign ACL in chat_user_access for the owner or participants
        if (ownerAppUserId) {
          await prisma.chatUserAccess.upsert({
            where: {
              chatMessageId_appUserId: {
                chatMessageId: chatMessage.id,
                appUserId: ownerAppUserId,
              },
            },
            create: {
              chatMessageId: chatMessage.id,
              appUserId: ownerAppUserId,
              grantedVia: "PARTICIPANT",
            },
            update: {},
          });
        }

        // Also grant ACL to any app_user whose email matches a participant
        for (const p of msg.participants) {
          const matchedAppUser = await prisma.appUser.findUnique({
            where: { email: p.email.toLowerCase() },
            select: { id: true },
          });
          if (matchedAppUser) {
            await prisma.chatUserAccess.upsert({
              where: {
                chatMessageId_appUserId: {
                  chatMessageId: chatMessage.id,
                  appUserId: matchedAppUser.id,
                },
              },
              create: {
                chatMessageId: chatMessage.id,
                appUserId: matchedAppUser.id,
                grantedVia: p.email.toLowerCase() === msg.senderEmail.toLowerCase() ? "SENDER" : "PARTICIPANT",
              },
              update: {},
            });
          }
        }

        totalProcessed++;
      } catch (itemErr) {
        errors++;
        console.error(`[CHAT ARCHIVE PARSER] Erro na mensagem de ${msg.senderEmail}:`, itemErr);
      }
    }

    await prisma.chatArchive.update({
      where: { id: chatArchive.id },
      data: {
        totalMessages: totalProcessed,
        totalSpaces: spaceCache.size,
        status: errors > 0 ? "PARTIAL" : "READY",
        processedAt: new Date(),
      },
    });

    return { totalProcessed, duplicates, errors };
  }
}

export const googleChatArchiveService = new GoogleChatArchiveService();
