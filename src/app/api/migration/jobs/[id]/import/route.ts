import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { purviewPstAdapter } from "@/lib/microsoft/adapters/historical-mail-import.adapter";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(req, "migration:execute");

    const result = await purviewPstAdapter.import(params.id);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(req, "migration:execute");
    const body = await req.json();
    const { purviewJobId, status } = body;

    const job = await prisma.migrationJob.update({
      where: { id: params.id },
      data: {
        purviewJobId: purviewJobId !== undefined ? purviewJobId : undefined,
        status: status || undefined,
      },
    });

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
