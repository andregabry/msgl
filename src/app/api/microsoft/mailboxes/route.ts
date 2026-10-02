import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";
import { microsoftDirectoryService } from "@/lib/microsoft/directory.service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type"); // USER_MAILBOX, SHARED_MAILBOX, ALL
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (type && type !== "ALL") {
      where.recipientType = type;
    }
    if (search.trim() !== "") {
      where.OR = [
        { primarySmtpAddress: { contains: search.trim(), mode: "insensitive" } },
        { displayName: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [total, mailboxes, counts] = await Promise.all([
      prisma.microsoftMailbox.count({ where }),
      prisma.microsoftMailbox.findMany({
        where,
        skip,
        take: limit,
        orderBy: { primarySmtpAddress: "asc" },
        include: {
          migrationMappings: {
            include: {
              sourceGroup: true,
            },
          },
        },
      }),
      prisma.microsoftMailbox.groupBy({
        by: ["recipientType"],
        _count: true,
      }),
    ]);

    const countMap: Record<string, number> = {
      USER_MAILBOX: 0,
      SHARED_MAILBOX: 0,
      ARCHIVE: 0,
      UNKNOWN: 0,
    };
    counts.forEach((c) => {
      countMap[c.recipientType] = c._count;
    });

    return NextResponse.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      counts: countMap,
      mailboxes,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, "manage:integrations");
    const result = await microsoftDirectoryService.syncMicrosoftMailboxes(user.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
