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
    let startDate: Date | undefined = undefined;
    if (searchParams.get("startDate")) {
      const parsedStart = new Date(searchParams.get("startDate")!);
      if (!isNaN(parsedStart.getTime())) {
        parsedStart.setUTCHours(0, 0, 0, 0);
        startDate = parsedStart;
      }
    }

    let endDate: Date | undefined = undefined;
    if (searchParams.get("endDate")) {
      const parsedEnd = new Date(searchParams.get("endDate")!);
      if (!isNaN(parsedEnd.getTime())) {
        parsedEnd.setUTCHours(23, 59, 59, 999);
        endDate = parsedEnd;
      }
    }

    const limit = parseInt(searchParams.get("limit") || "50", 10);

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
