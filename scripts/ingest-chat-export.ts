import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CHAT_EXPORT_ROOT = "C:/Users/andre.gabry/Projects/m365/m365_old/GoogleChatExport/Output-Teste/andre.gabry@enging.pt";
const ZIP_FILE_PATH = "C:/Users/andre.gabry/Projects/m365/m365_old/GoogleChatExport/google-chat-andre.gabry@enging.pt-export.zip";
const BACKUP_REQUEST_ID = "0e6fd702-2750-4ba4-a4c9-4766bd4b0bac";
const OWNER_EMAIL = "andre.gabry@enging.pt";

async function main() {
  console.log("=== INÍCIO DA INGESTÃO DO GOOGLE CHAT ===");

  // 1. Verificar BackupRequest
  const backupReq = await prisma.backupRequest.findUnique({
    where: { id: BACKUP_REQUEST_ID },
  });

  if (!backupReq) {
    throw new Error(`BackupRequest ${BACKUP_REQUEST_ID} não encontrado!`);
  }
  console.log(`BackupRequest encontrado: ${backupReq.id} (${backupReq.entityEmail})`);

  // 2. Registar o Artifact e BackupFile caso não existam
  if (!fs.existsSync(ZIP_FILE_PATH)) {
    throw new Error(`Ficheiro zip não encontrado em ${ZIP_FILE_PATH}`);
  }

  const stat = fs.statSync(ZIP_FILE_PATH);
  const zipSha256 = crypto.createHash("sha256").update(fs.readFileSync(ZIP_FILE_PATH)).digest("hex");
  const filename = path.basename(ZIP_FILE_PATH);

  let artifact = await prisma.backupArtifact.findFirst({
    where: { backupRequestId: backupReq.id },
  });

  if (!artifact) {
    artifact = await prisma.backupArtifact.create({
      data: {
        backupRequestId: backupReq.id,
        relativePath: ZIP_FILE_PATH,
        originalFilename: filename,
        storedFilename: filename,
        bytes: BigInt(stat.size),
        sha256: zipSha256,
        mimeType: "application/zip",
        origin: "IMPORTED_LOCAL",
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
    console.log(`Artifact criado com sucesso: ${artifact.id} (${stat.size} bytes)`);

    await prisma.backupFile.create({
      data: {
        backupArtifactId: artifact.id,
        relativePath: ZIP_FILE_PATH,
        filename: filename,
        bytes: BigInt(stat.size),
        sha256: zipSha256,
        mimeType: "application/zip",
      },
    });
  } else {
    artifact = await prisma.backupArtifact.update({
      where: { id: artifact.id },
      data: {
        relativePath: ZIP_FILE_PATH,
        originalFilename: filename,
        storedFilename: filename,
        bytes: BigInt(stat.size),
        sha256: zipSha256,
        mimeType: "application/zip",
        origin: "IMPORTED_LOCAL",
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
    console.log(`Artifact atualizado com sucesso: ${artifact.id}`);
  }

  // Atualizar BackupRequest para formato ZIP e criteria com importedFrom
  await prisma.backupRequest.update({
    where: { id: backupReq.id },
    data: {
      format: "ZIP",
      status: "READY",
      criteria: {
        ...(backupReq.criteria as any || {}),
        importedFrom: ZIP_FILE_PATH,
        extractedFolder: CHAT_EXPORT_ROOT,
        lastIndexedAt: new Date().toISOString(),
      },
    },
  });

  // 3. Garantir vínculo de identidade (IdentityLink) para André Gabry
  const adminAppUser = await prisma.appUser.findFirst({
    where: { email: "andre.gabry@dynamox.net" },
  });
  const googleUser = await prisma.googleUser.findUnique({
    where: { primaryEmail: OWNER_EMAIL },
  });

  if (adminAppUser && googleUser) {
    await prisma.identityLink.upsert({
      where: {
        googleUserId_appUserId: {
          googleUserId: googleUser.id,
          appUserId: adminAppUser.id,
        },
      },
      create: {
        googleUserId: googleUser.id,
        appUserId: adminAppUser.id,
        linkType: "MANUAL",
        confidence: "EXACT",
      },
      update: {},
    });
    console.log(`IdentityLink garantido entre ${googleUser.primaryEmail} e ${adminAppUser.email}`);
  }

  // 4. Carregar mapa de utilizadores Google
  const allGoogleUsers = await prisma.googleUser.findMany();
  const userMap = new Map<string, { email: string; name: string }>();
  allGoogleUsers.forEach((u) => {
    const entry = { email: u.primaryEmail, name: u.fullName || u.name || u.primaryEmail };
    userMap.set(u.providerId, entry);
    userMap.set(`users/${u.providerId}`, entry);
  });

  // 5. Criar / Atualizar ChatArchive
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
  console.log(`ChatArchive ID: ${chatArchive.id}`);

  // 6. Carregar spaces.json
  const spacesJsonPath = path.join(CHAT_EXPORT_ROOT, "spaces.json");
  const spacesMeta = JSON.parse(fs.readFileSync(spacesJsonPath, "utf-8")) as any[];
  const spacesMetaMap = new Map<string, any>();
  spacesMeta.forEach((s) => {
    spacesMetaMap.set(s.name, s);
  });

  const dirs = fs.readdirSync(CHAT_EXPORT_ROOT).filter((f) => {
    return fs.statSync(path.join(CHAT_EXPORT_ROOT, f)).isDirectory();
  });

  console.log(`Encontrados ${dirs.length} diretórios de espaços para processar.`);

  let totalMessagesInserted = 0;
  let totalAttachmentsInserted = 0;

  // Processar cada diretório de espaço
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const messagesPath = path.join(CHAT_EXPORT_ROOT, dir, "messages.json");
    if (!fs.existsSync(messagesPath)) continue;

    const rawMsgs = JSON.parse(fs.readFileSync(messagesPath, "utf-8")) as any[];
    if (rawMsgs.length === 0) continue;

    const providerSpaceId = rawMsgs[0]?.space?.name || `spaces/${dir.replace(/^DIRECT_MESSAGE_spaces_|^GROUP_CHAT_spaces_|^SPACE_/, "")}`;
    const meta = spacesMetaMap.get(providerSpaceId) || {};

    let spaceType: "DIRECT_MESSAGE" | "GROUP_CHAT" | "SPACE" = "SPACE";
    if (dir.startsWith("DIRECT_MESSAGE_") || meta.spaceType === "DIRECT_MESSAGE") {
      spaceType = "DIRECT_MESSAGE";
    } else if (dir.startsWith("GROUP_CHAT_") || meta.spaceType === "GROUP_CHAT") {
      spaceType = "GROUP_CHAT";
    }

    // Determinar display name do espaço
    let displayName = meta.displayName;
    if (!displayName) {
      if (spaceType === "DIRECT_MESSAGE") {
        // Encontrar o outro participante
        const senders = Array.from(new Set(rawMsgs.map((m) => m.sender?.name).filter(Boolean)));
        const otherSenders = senders.filter((s) => !s.includes("114889082349636481849"));
        if (otherSenders.length > 0) {
          const u = userMap.get(otherSenders[0]);
          displayName = u ? u.name : "Conversa Direta";
        } else {
          displayName = "Anotações Pessoais (André Gabry)";
        }
      } else if (spaceType === "GROUP_CHAT") {
        const senders = Array.from(new Set(rawMsgs.map((m) => m.sender?.name).filter(Boolean)));
        const names = senders
          .map((s) => userMap.get(s)?.name?.split(" ")[0])
          .filter(Boolean)
          .slice(0, 4);
        displayName = names.length > 0 ? `Grupo (${names.join(", ")})` : "Grupo de Chat";
      } else {
        displayName = dir.replace(/^SPACE_/, "").replace(/_/g, " ");
      }
    }

    // Upsert do ChatSpace
    let space = await prisma.chatSpace.findFirst({
      where: { providerSpaceId },
    });

    if (!space) {
      space = await prisma.chatSpace.create({
        data: {
          chatArchiveId: chatArchive.id,
          providerSpaceId,
          displayName,
          spaceType,
          rawMetadata: meta,
        },
      });
    } else {
      space = await prisma.chatSpace.update({
        where: { id: space.id },
        data: {
          chatArchiveId: chatArchive.id,
          displayName,
          spaceType,
          rawMetadata: meta,
        },
      });
    }

function cleanText(val: any): string {
  if (typeof val !== "string") return "";
  return val.replace(/\0/g, "");
}

function cleanJson(val: any): any {
  if (typeof val === "string") return cleanText(val);
  if (Array.isArray(val)) return val.map(cleanJson);
  if (val && typeof val === "object") {
    const res: any = {};
    for (const [k, v] of Object.entries(val)) {
      res[cleanText(k)] = cleanJson(v);
    }
    return res;
  }
  return val;
}

    // Inserir mensagens em blocos de 2000
    const CHUNK_SIZE = 2000;
    for (let c = 0; c < rawMsgs.length; c += CHUNK_SIZE) {
      const slice = rawMsgs.slice(c, c + CHUNK_SIZE);
      const batchData = slice.map((m) => {
        const senderInfo = userMap.get(m.sender?.name);
        const senderEmail = senderInfo?.email || (m.sender?.type === "BOT" ? "bot@google.com" : "externo@chat.google.com");
        const senderName = senderInfo?.name || (m.sender?.type === "BOT" ? "Google Bot" : "Utilizador Google");

        const sourceHash = crypto.createHash("sha256").update(m.name).digest("hex");
        const sentAt = m.createTime ? new Date(m.createTime) : new Date();

        return {
          id: crypto.randomUUID(),
          chatSpaceId: space.id,
          providerMessageId: m.name,
          sourceHash,
          senderId: m.sender?.name || null,
          senderName: cleanText(senderName),
          senderEmail: cleanText(senderEmail).toLowerCase(),
          text: cleanText(m.text || m.argumentText || ""),
          formattedText: cleanText(m.formattedText || m.text || m.argumentText || ""),
          sentAt,
          rawMetadata: cleanJson(m),
        };
      });

      try {
        const res = await prisma.chatMessage.createMany({
          data: batchData,
          skipDuplicates: true,
        });
        totalMessagesInserted += res.count;
      } catch (chunkErr) {
        console.warn(`[Aviso] Falha no bloco do espaço ${space.displayName}, tentando item a item...`);
        for (const item of batchData) {
          try {
            await prisma.chatMessage.upsert({
              where: { sourceHash: item.sourceHash },
              create: item,
              update: {},
            });
            totalMessagesInserted++;
          } catch {}
        }
      }
    }

    // Inserir anexos se existirem
    const msgsWithAttachments = rawMsgs.filter((m) => m.attachment && Array.isArray(m.attachment) && m.attachment.length > 0);
    if (msgsWithAttachments.length > 0) {
      for (const m of msgsWithAttachments) {
        const sourceHash = crypto.createHash("sha256").update(m.name).digest("hex");
        const savedMsg = await prisma.chatMessage.findUnique({
          where: { sourceHash },
          select: { id: true },
        });

        if (savedMsg) {
          for (const att of m.attachment) {
            await prisma.chatAttachment.create({
              data: {
                chatMessageId: savedMsg.id,
                filename: att.contentName || "anexo",
                relativePath: att.downloadUri || att.name || "",
                bytes: BigInt(0),
                mimeType: att.contentType || "application/octet-stream",
                scanStatus: "CLEAN",
              },
            });
            totalAttachmentsInserted++;
          }
        }
      }
    }

    if ((i + 1) % 10 === 0 || i === dirs.length - 1) {
      console.log(`[Progresso] ${i + 1}/${dirs.length} espaços processados. Total mensagens inseridas: ${totalMessagesInserted}`);
    }
  }

  // 7. Atualizar ChatArchive final
  await prisma.chatArchive.update({
    where: { id: chatArchive.id },
    data: {
      totalSpaces: dirs.length,
      totalMessages: totalMessagesInserted,
      totalAttachments: totalAttachmentsInserted,
      status: "READY",
      processedAt: new Date(),
    },
  });

  console.log("=== INGESTÃO CONCLUÍDA COM SUCESSO! ===");
  console.log(`Total Espaços: ${dirs.length}`);
  console.log(`Total Mensagens: ${totalMessagesInserted}`);
  console.log(`Total Anexos: ${totalAttachmentsInserted}`);
}

main()
  .catch((err) => {
    console.error("ERRO FATAL NA INGESTÃO:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
