import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { chatAttachmentService } from "@/lib/chat/attachment.service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const inline = searchParams.get("view") === "true" || searchParams.get("inline") === "true";

    const { buffer, filename, mimeType } = await chatAttachmentService.getAttachment(
      params.id,
      session.userId
    );

    const disposition = inline ? "inline" : "attachment";
    const safeFilename = filename.replace(/["\r\n]/g, "_");

    const headers = new Headers();
    headers.set("Content-Type", mimeType);
    headers.set("Content-Disposition", `${disposition}; filename="${safeFilename}"`);
    headers.set("Content-Length", buffer.length.toString());
    headers.set("Cache-Control", "public, max-age=86400, immutable");

    return new NextResponse(new Uint8Array(buffer) as any, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error("Attachment download error:", err.message);
    return NextResponse.json(
      { error: err.message || "Erro ao descarregar anexo." },
      { status: 500 }
    );
  }
}
