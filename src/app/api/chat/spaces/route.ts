import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { chatQueryService } from "@/lib/chat/service";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const spaces = await chatQueryService.getUserSpaces(user.userId, user.role);
    return NextResponse.json({ spaces });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
