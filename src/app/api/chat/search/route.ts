import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { chatQueryService } from "@/lib/chat/service";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const query = searchParams.get("q") || "";
    const spaceId = searchParams.get("spaceId") || undefined;
    const participantEmail = searchParams.get("participantEmail") || undefined;
    const startDate = searchParams.get("startDate") ? new Date(searchParams.get("startDate")!) : undefined;
    const endDate = searchParams.get("endDate") ? new Date(searchParams.get("endDate")!) : undefined;
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    const results = await chatQueryService.searchMessages({
      appUserId: user.userId,
      role: user.role,
      query,
      spaceId,
      participantEmail,
      startDate,
      endDate,
      limit,
    });

    return NextResponse.json({
      results: results.map((m) => ({
        ...m,
        attachments: m.attachments.map((a) => ({
          ...a,
          bytes: a.bytes.toString(),
        })),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
