import { NextRequest, NextResponse } from "next/server";
import { prisma, serializeBigInt } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { googleDirectoryService } from "@/lib/google/directory.service";

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
        { primaryEmail: { contains: search.trim(), mode: "insensitive" } },
        { name: { contains: search.trim(), mode: "insensitive" } },
        { fullName: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.googleUser.count({ where }),
      prisma.googleUser.findMany({
        where,
        skip,
        take: limit,
        orderBy: { primaryEmail: "asc" },
        include: {
          aliases: true,
          identityLinks: {
            include: {
              appUser: true,
            },
          },
          backupRequests: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
              artifacts: true,
            },
          },
        },
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
    console.error("Erro em GET /api/google/users:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "manage:integrations");
    const result = await googleDirectoryService.syncGoogleUsers(user.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
