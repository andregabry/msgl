import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { storageProvider } from "@/lib/storage/backup-storage.provider";
import { logAudit } from "@/lib/audit/audit.service";
import fs from "fs";
import path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req, "backup:download");

    let artifact = await prisma.backupArtifact.findUnique({
      where: { id: params.id },
      include: { backupRequest: true },
    });

    if (!artifact) {
      artifact = await prisma.backupArtifact.findFirst({
        where: { backupRequestId: params.id },
        include: { backupRequest: true },
      });
    }

    if (!artifact) {
      return NextResponse.json({ error: "Artefacto de backup não encontrado." }, { status: 404 });
    }

    let safePath = "";
    if (artifact.relativePath) {
      try {
        const resolved = storageProvider.resolveSafePath(artifact.relativePath);
        if (fs.existsSync(resolved)) {
          safePath = resolved;
        }
      } catch {}
    }

    if (!safePath && artifact.backupRequest) {
      const cleanService = (artifact.backupRequest.serviceType || "general").toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const cleanEmail = (artifact.backupRequest.entityEmail || "unknown").toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
      const filename = artifact.originalFilename || artifact.storedFilename;
      const internal = path.resolve(process.cwd(), "storage/backups", cleanService, cleanEmail, filename);
      if (fs.existsSync(internal)) {
        safePath = internal;
      }
    }

    if (!safePath && artifact.backupRequest?.criteria) {
      const importedFrom = (artifact.backupRequest.criteria as any).importedFrom;
      if (importedFrom && fs.existsSync(importedFrom)) {
        safePath = importedFrom;
      }
    }

    if (!safePath || !fs.existsSync(safePath)) {
      return NextResponse.json({ error: "Ficheiro físico não encontrado no storage local." }, { status: 404 });
    }

    const stat = fs.statSync(safePath);
    const readStream = fs.createReadStream(safePath);

    await logAudit({
      actorUserId: user.userId,
      action: "BACKUP_FILE_DOWNLOADED",
      entityType: "BACKUP",
      entityId: artifact.id,
      metadata: {
        filename: artifact.originalFilename,
        bytes: stat.size,
        backupRequestId: artifact.backupRequestId,
      },
    });

    // Node Stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        readStream.on("data", (chunk: any) => controller.enqueue(chunk));
        readStream.on("end", () => controller.close());
        readStream.on("error", (err) => controller.error(err));
      },
    });

    const headers = new Headers();
    headers.set("Content-Type", artifact.mimeType || "application/octet-stream");
    headers.set("Content-Length", stat.size.toString());
    // Safe Content-Disposition sanitizing quotes
    const safeFilename = artifact.originalFilename.replace(/["\r\n]/g, "_");
    headers.set("Content-Disposition", `attachment; filename="${safeFilename}"`);

    return new NextResponse(webStream, { headers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
