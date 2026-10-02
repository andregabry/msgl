import { NextRequest, NextResponse } from "next/server";
import { prisma, serializeBigInt } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { microsoftDirectoryService } from "@/lib/microsoft/directory.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search.trim() !== "") {
      where.OR = [
        { userPrincipalName: { contains: search.trim(), mode: "insensitive" } },
        { displayName: { contains: search.trim(), mode: "insensitive" } },
        { mail: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.microsoftUser.count({ where }),
      prisma.microsoftUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { userPrincipalName: "asc" },
      }),
    ]);

    return NextResponse.json(
      serializeBigInt({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        users,
      })
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "manage:integrations");
    const result = await microsoftDirectoryService.syncMicrosoftUsers(user.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
