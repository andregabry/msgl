import fs from "fs";
import crypto from "crypto";
import { simpleParser, ParsedMail } from "mailparser";
import { prisma } from "../prisma";
import { storageProvider } from "../storage/backup-storage.provider";

export interface MboxMessageItem {
  messageNumber: number;
  rawBytes: Buffer;
  rawSha256: string;
}

export class MboxStreamParser {
  /**
   * Streaming generator to split an MBOX file into individual raw RFC 5322 message buffers
   * without loading entire gigabyte archives into RAM.
   */
  public async *iterateMbox(filePath: string): AsyncGenerator<MboxMessageItem> {
    const stream = fs.createReadStream(filePath);
    let chunks: Buffer[] = [];
    let seenFrom = false;
    let messageNumber = 0;

    for await (const chunk of stream) {
      let startIndex = 0;

      while (startIndex < chunk.length) {
        // Look for newline followed by "From " (MBOX delimiter)
        const fromIndex = this.findFromDelimiter(chunk, startIndex);

        if (fromIndex !== -1) {
          // Push previous data up to From delimiter
          if (fromIndex > startIndex) {
            chunks.push(chunk.subarray(startIndex, fromIndex));
          }

          if (seenFrom && chunks.length > 0) {
            const rawBytes = Buffer.concat(chunks);
            messageNumber++;
            const rawSha256 = crypto.createHash("sha256").update(rawBytes).digest("hex");
            yield { messageNumber, rawBytes, rawSha256 };
            chunks = [];
          }

          seenFrom = true;
          startIndex = fromIndex;
          // Advance past "From " line
          const lineEnd = chunk.indexOf(10, startIndex); // newline \n
          if (lineEnd !== -1) {
            startIndex = lineEnd + 1;
          } else {
            break;
          }
        } else {
          chunks.push(chunk.subarray(startIndex));
          break;
        }
      }
    }

    if (seenFrom && chunks.length > 0) {
      const rawBytes = Buffer.concat(chunks);
      messageNumber++;
      const rawSha256 = crypto.createHash("sha256").update(rawBytes).digest("hex");
      yield { messageNumber, rawBytes, rawSha256 };
    }
  }

  private findFromDelimiter(chunk: Buffer, start: number): number {
    // "From " in ASCII is [70, 114, 111, 109, 32]
    for (let i = start; i < chunk.length - 5; i++) {
      if (
        (i === 0 || chunk[i - 1] === 10) && // preceded by start or \n
        chunk[i] === 70 &&
        chunk[i + 1] === 114 &&
        chunk[i + 2] === 111 &&
        chunk[i + 3] === 109 &&
        chunk[i + 4] === 32
      ) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Parse an individual raw RFC 5322 message into structured metadata and calculate deduplication keys.
   */
  public async parseRfc5322(rawBytes: Buffer): Promise<{
    messageId: string | null;
    dateUtc: Date | null;
    subject: string | null;
    from: string | null;
    to: string | null;
    cc: string | null;
    dedupKey: string;
    textBody: string | null;
    htmlBody: string | null;
    attachmentsCount: number;
  }> {
    const parsed: ParsedMail = await simpleParser(rawBytes);

    const messageId = parsed.messageId ? parsed.messageId.trim() : null;
    const dateUtc = parsed.date || null;
    const subject = parsed.subject || "(sem assunto)";
    const from = parsed.from?.text || null;
    const to = parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to.text) : null;
    const cc = parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc.map((c) => c.text).join(", ") : parsed.cc.text) : null;

    // Deduplication Key: Message-ID preferred, fallback to SHA-256 of stable combination
    let dedupKey: string;
    if (messageId && messageId.length > 5) {
      dedupKey = crypto.createHash("sha256").update(messageId).digest("hex");
    } else {
      const composite = `${from || ""}|${to || ""}|${dateUtc?.toISOString() || ""}|${subject}|${(parsed.text || "").trim().substring(0, 500)}`;
      dedupKey = crypto.createHash("sha256").update(composite).digest("hex");
    }

    return {
      messageId,
      dateUtc,
      subject,
      from,
      to,
      cc,
      dedupKey,
      textBody: parsed.text || null,
      htmlBody: typeof parsed.html === "string" ? parsed.html : null,
      attachmentsCount: parsed.attachments.length,
    };
  }

  /**
   * Process and register MBOX items for a MigrationJob idempotently.
   */
  public async processMboxForMigration(
    migrationJobId: string,
    relativeMboxPath: string
  ): Promise<{ totalParsed: number; duplicates: number }> {
    const fullPath = storageProvider.resolveSafePath(relativeMboxPath);
    let totalParsed = 0;
    let duplicates = 0;

    for await (const item of this.iterateMbox(fullPath)) {
      const parsed = await this.parseRfc5322(item.rawBytes);

      // Check duplicate within this migration job
      const existing = await prisma.migrationItem.findUnique({
        where: {
          migrationJobId_sourceHash: {
            migrationJobId,
            sourceHash: item.rawSha256,
          },
        },
      });

      if (existing) {
        duplicates++;
        continue;
      }

      await prisma.migrationItem.create({
        data: {
          migrationJobId,
          sourceMessageId: parsed.messageId,
          sourceHash: item.rawSha256,
          dedupKey: parsed.dedupKey,
          dateUtc: parsed.dateUtc,
          subject: parsed.subject,
          fromAddr: parsed.from,
          toAddrs: parsed.to,
          sizeBytes: BigInt(item.rawBytes.length),
          status: "PARSED",
        },
      });

      totalParsed++;
    }

    await prisma.migrationJob.update({
      where: { id: migrationJobId },
      data: {
        totalItems: totalParsed + duplicates,
        validItems: totalParsed,
        duplicateItems: duplicates,
        status: "VALIDATING",
      },
    });

    return { totalParsed, duplicates };
  }
}

export const mboxParser = new MboxStreamParser();
