import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";

export interface StorageWriteResult {
  relativePath: string;
  absolutePath: string;
  storedFilename: string;
  bytes: number;
  sha256: string;
}

export interface BackupStorageProvider {
  writeStream(
    subPath: string,
    filename: string,
    stream: Readable
  ): Promise<StorageWriteResult>;

  readStream(relativePath: string): Promise<Readable>;

  verifyChecksum(relativePath: string, expectedSha256: string): Promise<boolean>;

  deleteFile(relativePath: string): Promise<void>;

  exists(relativePath: string): Promise<boolean>;

  resolveSafePath(relativePath: string): string;
}

export class LocalFilesystemStorageProvider implements BackupStorageProvider {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = path.resolve(
      rootDir || process.env.BACKUP_STORAGE_ROOT || "C:/Users/andre.gabry/Projects/m365/Google Groups/_migration-system/storage"
    );
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
  }

  public getRootDirectory(): string {
    return this.rootDir;
  }

  /**
   * Prevents path traversal and Zip Slip attacks by asserting resolved path starts with rootDir.
   */
  public resolveSafePath(relativePath: string): string {
    const resolved = path.resolve(this.rootDir, relativePath);

    if (!resolved.startsWith(this.rootDir)) {
      throw new Error(`Tentativa de Path Traversal bloqueada: ${relativePath}`);
    }

    return resolved;
  }

  /**
   * Sanitizes filenames to avoid illegal characters and traversal
   */
  public sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.{2,}/g, "_")
      .substring(0, 200);
  }

  public async writeStream(
    subPath: string,
    filename: string,
    stream: Readable
  ): Promise<StorageWriteResult> {
    const safeSubPath = subPath.replace(/[^a-zA-Z0-9/_.-]/g, "_");
    const targetDir = this.resolveSafePath(safeSubPath);
    await fsp.mkdir(targetDir, { recursive: true });

    const safeFilename = this.sanitizeFilename(filename);
    const tempFilename = `${safeFilename}.part-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const tempPath = path.join(targetDir, tempFilename);
    const finalPath = path.join(targetDir, safeFilename);

    const hash = crypto.createHash("sha256");
    const writeStream = fs.createWriteStream(tempPath);

    let bytes = 0;

    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        hash.update(chunk);
      });

      stream.pipe(writeStream);

      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      stream.on("error", reject);
    });

    const sha256 = hash.digest("hex");

    // Atomic rename to final path
    await fsp.rename(tempPath, finalPath);

    const relativePath = path.relative(this.rootDir, finalPath).replace(/\\/g, "/");

    return {
      relativePath,
      absolutePath: finalPath,
      storedFilename: safeFilename,
      bytes,
      sha256,
    };
  }

  public async readStream(relativePath: string): Promise<Readable> {
    const safePath = this.resolveSafePath(relativePath);
    if (!fs.existsSync(safePath)) {
      throw new Error(`Ficheiro não encontrado no storage: ${relativePath}`);
    }
    return fs.createReadStream(safePath);
  }

  public async verifyChecksum(relativePath: string, expectedSha256: string): Promise<boolean> {
    const safePath = this.resolveSafePath(relativePath);
    if (!fs.existsSync(safePath)) return false;

    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(safePath);

    return new Promise((resolve) => {
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex").toLowerCase() === expectedSha256.toLowerCase()));
      stream.on("error", () => resolve(false));
    });
  }

  public async deleteFile(relativePath: string): Promise<void> {
    const safePath = this.resolveSafePath(relativePath);
    if (fs.existsSync(safePath)) {
      await fsp.unlink(safePath);
    }
  }

  public async exists(relativePath: string): Promise<boolean> {
    const safePath = this.resolveSafePath(relativePath);
    return fs.existsSync(safePath);
  }
}

// Export singleton instance
export const storageProvider = new LocalFilesystemStorageProvider();
