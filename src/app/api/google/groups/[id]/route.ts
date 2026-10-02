import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(req);

    const group = await prisma.googleGroup.findUnique({
      where: { id: params.id },
      include: {
        aliases: true,
        members: true,
        backupRequests: {
          orderBy: { createdAt: "desc" },
          include: {
            exports: true,
            artifacts: {
              include: {
                files: true,
              },
            },
            events: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
        migrationMappings: {
          include: {
            targetMailbox: true,
          },
        },
        migrationJobs: {
          orderBy: { createdAt: "desc" },
          include: {
            events: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!group) {
      return NextResponse.json({ error: "Grupo Google não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
