import { prisma } from "../prisma";
import { getGoogleAuthClient, isGoogleConfigured } from "../google/auth";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { logAudit } from "../audit/audit.service";

export interface AttachmentResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  bytes: number;
}

export function detectMimeType(filename: string, existingMime?: string): string {
  if (
    existingMime &&
    existingMime !== "application/octet-stream" &&
    existingMime !== "binary/octet-stream"
  ) {
    return existingMime;
  }
  const ext = path.extname(filename || "").toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".bmp":
      return "image/bmp";
    case ".ico":
      return "image/x-icon";
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv; charset=utf-8";
    case ".zip":
      return "application/zip";
    case ".tar":
      return "application/x-tar";
    case ".gz":
      return "application/gzip";
    case ".mp4":
      return "video/mp4";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".xlsb":
      return "application/vnd.ms-excel.sheet.binary.macroEnabled.12";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return existingMime || "application/octet-stream";
  }
}

export class ChatAttachmentService {
  public async getAttachment(attachmentId: string, actorUserId?: string): Promise<AttachmentResult> {
    const attachment = await prisma.chatAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        chatMessage: {
          include: {
            chatSpace: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new Error("Anexo não encontrado.");
    }

    // PRIVACY & ACCESS CONTROL:
    if (actorUserId) {
      const appUser = await prisma.appUser.findUnique({
        where: { id: actorUserId },
        select: { id: true, email: true, displayName: true, role: true },
      });
      if (!appUser) {
        throw new Error("Utilizador não autenticado.");
      }

      // Admins and Managers have global administrative access
      if (appUser.role !== "ADMIN" && appUser.role !== "GESTOR") {
        const userEmail = appUser.email.toLowerCase();
        const space = (attachment.chatMessage as any)?.chatSpace;
        const isTeamSpace = space?.spaceType === "SPACE";

        if (!isTeamSpace) {
          const authorizedSpace = await prisma.chatSpace.findFirst({
            where: {
              id: attachment.chatMessage.chatSpaceId,
              OR: [
                {
                  chatArchive: {
                    backupRequest: {
                      entityEmail: { equals: userEmail, mode: "insensitive" },
                    },
                  },
                },
                {
                  messages: {
                    some: {
                      OR: [
                        { userAccess: { some: { appUserId: actorUserId } } },
                        { senderEmail: { equals: userEmail, mode: "insensitive" } },
                        { participants: { some: { userEmail: { equals: userEmail, mode: "insensitive" } } } },
                      ],
                    },
                  },
                },
                {
                  spaceType: "DIRECT_MESSAGE",
                  displayName: { equals: appUser.displayName, mode: "insensitive" },
                },
              ],
            },
            select: { id: true },
          });

          if (!authorizedSpace) {
            throw new Error("Não tem permissão para aceder a este anexo.");
          }
        }
      }
    }

    const baseStorage =
      process.env.BACKUP_STORAGE_ROOT ||
      process.env.STORAGE_LOCAL_ROOT ||
      "/data/backups";
    const cacheDir = path.join(baseStorage, "chat_attachments");
    if (!fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch (e) {}
    }

    const safeFilename = (attachment.filename || "anexo").replace(/[/\\?%*:|"<>]/g, "_");
    const cachedFilePath = path.join(cacheDir, `${attachment.id}_${safeFilename}`);

    let fileBuffer: Buffer | null = null;
    let mimeType = detectMimeType(attachment.filename, attachment.mimeType || undefined);

    // 1. Cached file on disk
    if (fs.existsSync(cachedFilePath)) {
      try {
        fileBuffer = fs.readFileSync(cachedFilePath);
      } catch (err) {
        console.warn("Error reading cached attachment:", err);
      }
    }

    // 2. Relative path on disk (if not HTTP)
    if (!fileBuffer && attachment.relativePath && !attachment.relativePath.startsWith("http")) {
      const candidates = [
        attachment.relativePath,
        path.join(baseStorage, attachment.relativePath),
        path.resolve(process.cwd(), attachment.relativePath),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          try {
            fileBuffer = fs.readFileSync(cand);
            break;
          } catch (e) {}
        }
      }
    }

    // 3. Google Workspace Cloud retrieval
    const rawMsg: any = attachment.chatMessage?.rawMetadata || {};
    const rawAttachments: any[] = rawMsg.attachment || [];
    const matchingRaw =
      rawAttachments.find(
        (a: any) =>
          (a.contentName || a.name || "").toLowerCase() ===
          attachment.filename.toLowerCase()
      ) || rawAttachments[0];

    const senderEmail =
      attachment.chatMessage?.senderEmail ||
      rawMsg.sender?.email ||
      process.env.GOOGLE_IMPERSONATED_ADMIN;

    if (!fileBuffer && isGoogleConfigured()) {
      // Case A: UPLOADED_CONTENT (chat.media.download with resourceName)
      const resourceName =
        matchingRaw?.attachmentDataRef?.resourceName ||
        matchingRaw?.name;

      if (resourceName) {
        try {
          // In Google Chat API, media.download requires impersonation of user via Domain-Wide Delegation
          const auth = getGoogleAuthClient(senderEmail || undefined);
          const chat = google.chat({ version: "v1", auth });
          const res = await chat.media.download(
            { resourceName, alt: "media" },
            { responseType: "arraybuffer" }
          );

          if (res.data) {
            fileBuffer = Buffer.from(res.data as ArrayBuffer);
            if (res.headers && res.headers["content-type"]) {
              mimeType = detectMimeType(attachment.filename, res.headers["content-type"]);
            }
          }
        } catch (apiErr: any) {
          console.warn("Google Chat media download error:", apiErr.message);
          // Fallback with admin auth
          try {
            const adminAuth = getGoogleAuthClient();
            const chatAdmin = google.chat({ version: "v1", auth: adminAuth });
            const resAdmin = await chatAdmin.media.download(
              { resourceName, alt: "media" },
              { responseType: "arraybuffer" }
            );
            if (resAdmin.data) {
              fileBuffer = Buffer.from(resAdmin.data as ArrayBuffer);
              if (resAdmin.headers && resAdmin.headers["content-type"]) {
                mimeType = detectMimeType(attachment.filename, resAdmin.headers["content-type"]);
              }
            }
          } catch (e2) {}
        }
      }

      // Case B: DRIVE_FILE (drive.files.get with driveFileId, impersonating sender)
      const driveFileId = matchingRaw?.driveDataRef?.driveFileId;
      if (!fileBuffer && driveFileId) {
        try {
          const auth = getGoogleAuthClient(senderEmail || undefined);
          const drive = google.drive({ version: "v3", auth });
          const res = await drive.files.get(
            { fileId: driveFileId, alt: "media", supportsAllDrives: true },
            { responseType: "arraybuffer" }
          );

          if (res.data) {
            fileBuffer = Buffer.from(res.data as ArrayBuffer);
            if (res.headers && res.headers["content-type"]) {
              mimeType = detectMimeType(attachment.filename, res.headers["content-type"]);
            }
          }
        } catch (driveErr: any) {
          console.warn("Google Drive download error:", driveErr.message);
          try {
            const adminAuth = getGoogleAuthClient();
            const driveAdmin = google.drive({ version: "v3", auth: adminAuth });
            const resAdmin = await driveAdmin.files.get(
              { fileId: driveFileId, alt: "media", supportsAllDrives: true },
              { responseType: "arraybuffer" }
            );
            if (resAdmin.data) {
              fileBuffer = Buffer.from(resAdmin.data as ArrayBuffer);
            }
          } catch (e2) {}
        }
      }
    }

    // 4. HTTP URL fetch fallback (downloadUri, thumbnailUri or relativePath)
    if (!fileBuffer) {
      const urlsToTry = [
        attachment.relativePath,
        matchingRaw?.downloadUri,
        matchingRaw?.thumbnailUri,
      ].filter((u): u is string => Boolean(u && typeof u === "string" && u.startsWith("http")));

      for (const targetUrl of urlsToTry) {
        try {
          const fetchRes = await fetch(targetUrl);
          if (fetchRes.ok) {
            const arrayBuf = await fetchRes.arrayBuffer();
            const buf = Buffer.from(arrayBuf);
            const ct = fetchRes.headers.get("content-type") || "";
            // Verify it didn't return an HTML Google login redirection page
            if (!ct.includes("text/html") || buf.length < 50000) {
              fileBuffer = buf;
              if (ct) mimeType = detectMimeType(attachment.filename, ct);
              break;
            }
          }
        } catch (fetchErr: any) {
          console.warn("Direct fetch error:", fetchErr.message);
        }
      }
    }

    if (!fileBuffer) {
      throw new Error("Não foi possível transferir o ficheiro do Google Chat nem do arquivo local.");
    }

    // Ensure final mimeType is accurate for inline browser rendering
    mimeType = detectMimeType(attachment.filename, mimeType);

    // Cache file locally on disk for fast subsequent accesses
    try {
      fs.writeFileSync(cachedFilePath, fileBuffer);
    } catch (writeErr) {
      console.warn("Could not write cache file:", writeErr);
    }

    // Update bytes and mimeType in DB if missing or updated
    if (attachment.bytes === BigInt(0) && fileBuffer.length > 0) {
      await prisma.chatAttachment
        .update({
          where: { id: attachment.id },
          data: { bytes: BigInt(fileBuffer.length), mimeType },
        })
        .catch(() => {});
    }

    // Audit log
    await logAudit({
      actorUserId,
      action: "CHAT_ATTACHMENT_DOWNLOAD",
      entityType: "CHAT",
      entityId: attachment.id,
      metadata: {
        filename: attachment.filename,
        bytes: fileBuffer.length,
        chatMessageId: attachment.chatMessageId,
      },
    }).catch(() => {});

    return {
      buffer: fileBuffer,
      filename: attachment.filename || "anexo",
      mimeType,
      bytes: fileBuffer.length,
    };
  }
}

export const chatAttachmentService = new ChatAttachmentService();
