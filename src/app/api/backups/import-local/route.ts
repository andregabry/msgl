import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { storageProvider } from "@/lib/storage/backup-storage.provider";
import { logAudit } from "@/lib/audit/audit.service";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "backup:process");
    const body = await req.json();

    const {
      sourceFilePath,
      entityEmail,
      entityType,
      serviceType,
      format,
    } = body;

    if (!sourceFilePath || !entityEmail || !entityType || !serviceType) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios em falta: sourceFilePath, entityEmail, entityType, serviceType." },
        { status: 400 }
      );
    }

    if (!fs.existsSync(sourceFilePath)) {
      return NextResponse.json(
        { error: `Ficheiro local não encontrado: ${sourceFilePath}` },
        { status: 404 }
      );
    }

    const stat = await fsp.stat(sourceFilePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "O caminho fornecido não é um ficheiro válido." }, { status: 400 });
    }

    const filename = path.basename(sourceFilePath);

    // Create BackupRequest record
    const backupReq = await prisma.backupRequest.create({
      data: {
        entityEmail: entityEmail.toLowerCase(),
        entityType,
        serviceType,
        format: format || (filename.endsWith(".pst") ? "PST" : filename.endsWith(".zip") ? "ZIP" : "MBOX"),
        status: "PROCESSING",
        requestedBy: user.email,
      },
    });

    // Stream copy to managed storage directory
    const subPath = `google/${entityType.toLowerCase()}s/${entityEmail.replace(/[^a-zA-Z0-9_-]/g, "_")}/${serviceType.toLowerCase()}/${backupReq.id}`;
    const readStream = fs.createReadStream(sourceFilePath);
    const writeResult = await storageProvider.writeStream(subPath, filename, readStream);

    const artifact = await prisma.backupArtifact.create({
      data: {
        backupRequestId: backupReq.id,
        relativePath: writeResult.relativePath,
        originalFilename: filename,
        storedFilename: writeResult.storedFilename,
        bytes: BigInt(writeResult.bytes),
        sha256: writeResult.sha256,
        mimeType: filename.endsWith(".pst")
          ? "application/vnd.ms-outlook"
          : filename.endsWith(".zip")
          ? "application/zip"
          : "application/mbox",
        origin: "IMPORTED_LOCAL",
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    await prisma.backupFile.create({
      data: {
        backupArtifactId: artifact.id,
        relativePath: writeResult.relativePath,
        filename: writeResult.storedFilename,
        bytes: BigInt(writeResult.bytes),
        sha256: writeResult.sha256,
        mimeType: artifact.mimeType,
      },
    });

    await prisma.backupRequest.update({
      where: { id: backupReq.id },
      data: { status: "READY" },
    });

    await prisma.backupEvent.create({
      data: {
        backupRequestId: backupReq.id,
        toStatus: "READY",
        message: `Backup local importado com sucesso a partir de ${filename} (${writeResult.bytes} bytes, SHA-256: ${writeResult.sha256.substring(0, 10)}...)`,
      },
    });

    await logAudit({
      actorUserId: user.userId,
      action: "BACKUP_REQUESTED",
      entityType: "BACKUP",
      entityId: backupReq.id,
      metadata: { sourceFilePath, filename, sha256: writeResult.sha256, origin: "IMPORTED_LOCAL" },
    });

    return NextResponse.json({
      success: true,
      backupRequestId: backupReq.id,
      artifactId: artifact.id,
      sha256: writeResult.sha256,
      bytes: writeResult.bytes,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
