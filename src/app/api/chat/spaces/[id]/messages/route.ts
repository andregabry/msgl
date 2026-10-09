import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { chatQueryService } from "@/lib/chat/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const limit = Math.min(parseInt(searchParams.get("limit") || "5000", 10), 10000);
    const cursor = searchParams.get("cursor") || undefined;
    const query = searchParams.get("q") || undefined;
    const order = (searchParams.get("order") === "desc" ? "desc" : "asc") as "asc" | "desc";

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

    const result = await chatQueryService.getSpaceMessages({
      spaceId: params.id,
      appUserId: user.userId,
      role: user.role,
      limit,
      cursor,
      startDate,
      endDate,
      query,
      order,
    });

    return NextResponse.json({
      messages: result.messages.map((m) => ({
        ...m,
        attachments: m.attachments.map((a) => ({
          ...a,
          bytes: a.bytes.toString(),
        })),
      })),
      nextCursor: result.nextCursor,
      totalCount: result.totalCount,
      hasMore: !!result.nextCursor,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
