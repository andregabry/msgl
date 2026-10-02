import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { backupDownloadService } from "@/lib/backups/backup-download.service";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "backup:download");
    const body = await req.json();
    const { backupRequestId, action } = body;

    if (!backupRequestId || !action) {
      return NextResponse.json(
        { error: "backupRequestId e action ('DOWNLOAD' | 'REMOVE') são obrigatórios." },
        { status: 400 }
      );
    }

    if (action === "DOWNLOAD") {
      const result = await backupDownloadService.downloadBackupToApp(backupRequestId, user.userId);
      return NextResponse.json(result);
    } else if (action === "REMOVE") {
      const result = await backupDownloadService.removeBackupFromApp(backupRequestId, user.userId);
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: "Ação inválida. Use 'DOWNLOAD' ou 'REMOVE'." }, { status: 400 });
    }
  } catch (err: any) {
    console.error("Erro em POST /api/backups/toggle-local:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const backupRequestId = searchParams.get("backupRequestId");

    if (!backupRequestId) {
      return NextResponse.json({ error: "backupRequestId obrigatório." }, { status: 400 });
    }

    const backupReq = await prisma.backupRequest.findUnique({
      where: { id: backupRequestId },
      include: { artifacts: true },
    });

    if (!backupReq) {
      return NextResponse.json({ error: "Backup não encontrado." }, { status: 404 });
    }

    const status = backupDownloadService.getBackupStatus(backupReq);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
