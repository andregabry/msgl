import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { google } from "googleapis";
import { getGoogleAuthClient } from "./auth";
import { prisma } from "../prisma";
import { logAudit } from "../audit/audit.service";
import { APP_STORAGE_ROOT } from "../backups/backup-download.service";

export interface ChatSyncResult {
  success: boolean;
  totalSpaces: number;
  totalMessages: number;
  totalAttachments: number;
  message: string;
}

export class GoogleChatSyncService {
  /**
   * Sync and index all Google Chat spaces and messages for a specific user.
   */
  public async syncUserChat(targetEmail: string, actorUserId?: string): Promise<ChatSyncResult> {
    const normalizedEmail = targetEmail.toLowerCase().trim();
    console.log(`[GoogleChatSyncService] Iniciando sincronização para: ${normalizedEmail}`);

    // 1. Get or create BackupRequest
    let backupReq = await prisma.backupRequest.findFirst({
      where: {
        entityEmail: normalizedEmail,
        serviceType: "GOOGLE_CHAT",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!backupReq) {
      backupReq = await prisma.backupRequest.create({
        data: {
          entityEmail: normalizedEmail,
          entityType: "GOOGLE_USER",
          serviceType: "GOOGLE_CHAT",
          format: "ZIP",
          status: "PROCESSING",
          requestedBy: actorUserId || normalizedEmail,
        },
      });
    } else {
      backupReq = await prisma.backupRequest.update({
        where: { id: backupReq.id },
        data: { status: "PROCESSING" },
      });
    }

    await prisma.backupEvent.create({
      data: {
        backupRequestId: backupReq.id,
        toStatus: "PROCESSING",
        message: `A descarregar conversas diretamente da Google Chat API para ${normalizedEmail}...`,
      },
    });

    // 2. Resolve AppUser and GoogleUser
    const googleUser = await prisma.googleUser.findUnique({
      where: { primaryEmail: normalizedEmail },
    });
    const appUser = await prisma.appUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (googleUser && appUser) {
      await prisma.identityLink.upsert({
        where: {
          googleUserId_appUserId: {
            googleUserId: googleUser.id,
            appUserId: appUser.id,
          },
        },
        create: {
          googleUserId: googleUser.id,
          appUserId: appUser.id,
          linkType: "AUTO_EMAIL",
          confidence: "EXACT",
        },
        update: {},
      });
    }

    // 3. Authenticate with Google Chat API impersonating the user
    const auth = getGoogleAuthClient(normalizedEmail);
    const chat = google.chat({ version: "v1", auth });

    // 4. List all spaces for the user
    const spaces: any[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const res: any = await chat.spaces.list({
        pageSize: 1000,
        pageToken,
      });
      if (res.data.spaces) {
        spaces.push(...res.data.spaces);
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    console.log(`[GoogleChatSyncService] ${spaces.length} espaços encontrados para ${normalizedEmail}`);

    // 5. Setup storage directories
    const userStorageDir = path.join(APP_STORAGE_ROOT, "google_chat", normalizedEmail);
    if (!fs.existsSync(userStorageDir)) {
      fs.mkdirSync(userStorageDir, { recursive: true });
    }

    // 6. Get or create ChatArchive
    let chatArchive = await prisma.chatArchive.findFirst({
      where: { backupRequestId: backupReq.id },
    });

    if (!chatArchive) {
      chatArchive = await prisma.chatArchive.create({
        data: {
          backupRequestId: backupReq.id,
          status: "PROCESSING",
        },
      });
    } else {
      chatArchive = await prisma.chatArchive.update({
        where: { id: chatArchive.id },
        data: { status: "PROCESSING" },
      });
    }

    // 7. Map known Google users for display names
    const allGoogleUsers = await prisma.googleUser.findMany();
    const userMap = new Map<string, { email: string; name: string }>();
    allGoogleUsers.forEach((u) => {
      const entry = { email: u.primaryEmail, name: u.fullName || u.name || u.primaryEmail };
      userMap.set(u.providerId, entry);
      userMap.set(`users/${u.providerId}`, entry);
    });

    let totalMessagesInserted = 0;
    let totalAttachmentsInserted = 0;

    // Helper for clean strings
    const cleanText = (val: any): string => {
      if (typeof val !== "string") return "";
      return val.replace(/\0/g, "");
    };

    // 8. Process each space and messages
    for (let i = 0; i < spaces.length; i++) {
      const s = spaces[i];
      const providerSpaceId = s.name; // e.g. "spaces/AAAA..."
      let displayName = s.displayName;
      let spaceType: "DIRECT_MESSAGE" | "GROUP_CHAT" | "SPACE" = "SPACE";

      if (s.spaceType === "DIRECT_MESSAGE") {
        spaceType = "DIRECT_MESSAGE";
      } else if (s.spaceType === "GROUP_CHAT") {
        spaceType = "GROUP_CHAT";
      }

      // Fetch messages for this space
      const messages: any[] = [];
      let msgPageToken: string | undefined = undefined;

      try {
        do {
          const mRes: any = await chat.spaces.messages.list({
            parent: providerSpaceId,
            pageSize: 1000,
            pageToken: msgPageToken,
            showDeleted: true,
          });
          if (mRes.data.messages) {
            messages.push(...mRes.data.messages);
          }
          msgPageToken = mRes.data.nextPageToken || undefined;
        } while (msgPageToken);
      } catch (err: any) {
        console.warn(`[GoogleChatSyncService] Erro ao listar mensagens de ${providerSpaceId}:`, err.message);
      }

      // Resolve display name for direct messages or groups if missing
      if (!displayName) {
        if (spaceType === "DIRECT_MESSAGE") {
          const senders = Array.from(new Set(messages.map((m) => m.sender?.displayName).filter(Boolean)));
          const otherSenders = senders.filter((name) => name !== (googleUser?.fullName || normalizedEmail));
          displayName = otherSenders.length > 0 ? otherSenders[0] : "Conversa Direta";
        } else if (spaceType === "GROUP_CHAT") {
          displayName = "Grupo de Chat";
        } else {
          displayName = s.name.replace(/^spaces\//, "Espaço ");
        }
      }

      // Upsert ChatSpace
      let chatSpace = await prisma.chatSpace.findFirst({
        where: { providerSpaceId },
      });

      if (!chatSpace) {
        chatSpace = await prisma.chatSpace.create({
          data: {
            chatArchiveId: chatArchive.id,
            providerSpaceId,
            displayName,
            spaceType,
            rawMetadata: s,
          },
        });
      } else {
        chatSpace = await prisma.chatSpace.update({
          where: { id: chatSpace.id },
          data: {
            chatArchiveId: chatArchive.id,
            displayName,
            spaceType,
            rawMetadata: s,
          },
        });
      }

      // Insert Messages
      for (const m of messages) {
        const sourceHash = crypto
          .createHash("sha256")
          .update(`${providerSpaceId}_${m.name}`)
          .digest("hex");

        const senderId = m.sender?.name || null;
        let senderEmail: string | null = null;
        if (senderId && userMap.has(senderId)) {
          senderEmail = userMap.get(senderId)!.email;
        }

        const senderName = m.sender?.displayName || (senderId && userMap.has(senderId) ? userMap.get(senderId)!.name : "Utilizador Google");
        const sentAt = m.createTime ? new Date(m.createTime) : new Date();

        const chatMessage = await prisma.chatMessage.upsert({
          where: { sourceHash },
          create: {
            chatSpaceId: chatSpace.id,
            providerMessageId: m.name,
            sourceHash,
            senderId,
            senderName,
            senderEmail,
            text: cleanText(m.text || ""),
            formattedText: cleanText(m.formattedText || m.text || ""),
            sentAt,
            rawMetadata: m,
          },
          update: {
            text: cleanText(m.text || ""),
            rawMetadata: m,
          },
        });

        totalMessagesInserted++;

        // Attachments
        if (m.attachment && Array.isArray(m.attachment)) {
          for (const att of m.attachment) {
            const attFilename = att.contentName || att.name || "anexo";
            await prisma.chatAttachment.create({
              data: {
                chatMessageId: chatMessage.id,
                filename: attFilename,
                relativePath: att.downloadUri || "",
                mimeType: att.contentType || "application/octet-stream",
              },
            }).catch(() => {});
            totalAttachmentsInserted++;
          }
        }

        // Grant ChatUserAccess to appUser
        if (appUser) {
          await prisma.chatUserAccess.upsert({
            where: {
              chatMessageId_appUserId: {
                chatMessageId: chatMessage.id,
                appUserId: appUser.id,
              },
            },
            create: {
              chatMessageId: chatMessage.id,
              appUserId: appUser.id,
              grantedVia: "PARTICIPANT",
            },
            update: {},
          });
        }
      }
    }

    // 9. Save JSON dump to disk
    const exportFile = path.join(userStorageDir, `google-chat-${normalizedEmail}-export.json`);
    await fsp.writeFile(exportFile, JSON.stringify({ spaces, syncedAt: new Date().toISOString() }, null, 2));

    const stat = await fsp.stat(exportFile);

    // 10. Create or update BackupArtifact
    let artifact = await prisma.backupArtifact.findFirst({
      where: { backupRequestId: backupReq.id },
    });

    const filename = path.basename(exportFile);
    if (!artifact) {
      artifact = await prisma.backupArtifact.create({
        data: {
          backupRequestId: backupReq.id,
          relativePath: path.relative(APP_STORAGE_ROOT, exportFile).replace(/\\/g, "/"),
          originalFilename: filename,
          storedFilename: filename,
          bytes: BigInt(stat.size),
          sha256: crypto.createHash("sha256").update(fs.readFileSync(exportFile)).digest("hex"),
          mimeType: "application/json",
          origin: "GOOGLE_CHAT_API",
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
    } else {
      artifact = await prisma.backupArtifact.update({
        where: { id: artifact.id },
        data: {
          relativePath: path.relative(APP_STORAGE_ROOT, exportFile).replace(/\\/g, "/"),
          bytes: BigInt(stat.size),
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
    }

    // 11. Update ChatArchive & BackupRequest to READY
    await prisma.chatArchive.update({
      where: { id: chatArchive.id },
      data: {
        totalSpaces: spaces.length,
        totalMessages: totalMessagesInserted,
        totalAttachments: totalAttachmentsInserted,
        status: "READY",
        processedAt: new Date(),
      },
    });

    await prisma.backupRequest.update({
      where: { id: backupReq.id },
      data: {
        status: "READY",
        format: "ZIP",
      },
    });

    await prisma.backupEvent.create({
      data: {
        backupRequestId: backupReq.id,
        fromStatus: "PROCESSING",
        toStatus: "READY",
        message: `Sincronização do Google Chat concluída. ${spaces.length} espaços e ${totalMessagesInserted} mensagens montadas no sistema.`,
      },
    });

    await logAudit({
      actorUserId,
      action: "BACKUP_DOWNLOADED",
      entityType: "BACKUP",
      entityId: backupReq.id,
      metadata: {
        operation: "GOOGLE_CHAT_API_SYNC",
        userEmail: normalizedEmail,
        totalSpaces: spaces.length,
        totalMessages: totalMessagesInserted,
      },
    });

    console.log(`[GoogleChatSyncService] Concluído com sucesso para ${normalizedEmail}: ${spaces.length} espaços, ${totalMessagesInserted} mensagens.`);

    return {
      success: true,
      totalSpaces: spaces.length,
      totalMessages: totalMessagesInserted,
      totalAttachments: totalAttachmentsInserted,
      message: `Google Chat sincronizado e montado com sucesso! ${spaces.length} espaços e ${totalMessagesInserted} mensagens indexadas.`,
    };
  }
}

export const googleChatSyncService = new GoogleChatSyncService();
