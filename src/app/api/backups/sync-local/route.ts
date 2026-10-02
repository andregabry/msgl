import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { backupAutoDiscoveryService } from "@/lib/backups/auto-discovery.service";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "backup:process");
    const result = await backupAutoDiscoveryService.syncAndRegisterBackups(user.userId);
    return NextResponse.json({
      success: true,
      message: `Sincronização de backups concluída. ${result.registeredCount} novos registados, ${result.updatedCount} atualizados.`,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req, "backup:process");
    const result = await backupAutoDiscoveryService.syncAndRegisterBackups(user.userId);
    return NextResponse.json({
      success: true,
      message: `Sincronização de backups concluída. ${result.registeredCount} novos registados, ${result.updatedCount} atualizados.`,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
