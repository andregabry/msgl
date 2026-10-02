import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(req);

    const user = await prisma.googleUser.findUnique({
      where: { id: params.id },
      include: {
        aliases: true,
        identityLinks: {
          include: {
            appUser: true,
          },
        },
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
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilizador Google não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
