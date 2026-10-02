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

    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const cursor = searchParams.get("cursor") || undefined;
    const startDate = searchParams.get("startDate") ? new Date(searchParams.get("startDate")!) : undefined;
    const endDate = searchParams.get("endDate") ? new Date(searchParams.get("endDate")!) : undefined;

    const result = await chatQueryService.getSpaceMessages({
      spaceId: params.id,
      appUserId: user.userId,
      role: user.role,
      limit,
      cursor,
      startDate,
      endDate,
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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
