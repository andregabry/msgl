import { graphClient } from "./graph.client";
import { prisma } from "../prisma";
import { logAudit } from "../audit/audit.service";

export interface MicrosoftSyncResult {
  totalSynced: number;
  created: number;
  updated: number;
}

export class MicrosoftDirectoryService {
  /**
   * Synchronize Microsoft Entra Users via Microsoft Graph API.
   */
  public async syncMicrosoftUsers(actorUserId?: string): Promise<MicrosoftSyncResult> {
    if (!graphClient.isConfigured()) {
      throw new Error("Microsoft 365 não configurado. Defina as credenciais no menu de Integrações.");
    }

    let nextLink: string | undefined = "/users?$select=id,userPrincipalName,mail,displayName,accountEnabled,userType,assignedLicenses&$top=100";
    let totalSynced = 0;
    let created = 0;
    let updated = 0;

    do {
      const data: { value: any[]; "@odata.nextLink"?: string } =
        await graphClient.fetchGraph<{ value: any[]; "@odata.nextLink"?: string }>(nextLink);
      const users = data.value || [];

      for (const u of users) {
        if (!u.id || !u.userPrincipalName) continue;

        const existing = await prisma.microsoftUser.findUnique({
          where: { providerId: u.id },
        });

        const userData = {
          providerId: u.id,
          userPrincipalName: u.userPrincipalName.toLowerCase(),
          mail: u.mail ? u.mail.toLowerCase() : null,
          displayName: u.displayName || u.userPrincipalName,
          accountEnabled: Boolean(u.accountEnabled),
          userType: u.userType || "Member",
          rawMetadata: u,
          lastSyncedAt: new Date(),
        };

        await prisma.microsoftUser.upsert({
          where: { providerId: u.id },
          create: userData,
          update: userData,
        });

        if (existing) updated++;
        else created++;
        totalSynced++;
      }

      nextLink = data["@odata.nextLink"];
    } while (nextLink);

    await logAudit({
      actorUserId,
      action: "MICROSOFT_SYNC",
      entityType: "USER",
      provider: "MICROSOFT",
      metadata: { totalSynced, created, updated },
    });

    return { totalSynced, created, updated };
  }

  /**
   * Synchronize Microsoft 365 Mailboxes, accurately distinguishing UserMailbox vs SharedMailbox.
   */
  public async syncMicrosoftMailboxes(actorUserId?: string): Promise<MicrosoftSyncResult> {
    if (!graphClient.isConfigured()) {
      throw new Error("Microsoft 365 não configurado. Defina as credenciais no menu de Integrações.");
    }

    let nextLink: string | undefined = "/users?$select=id,userPrincipalName,mail,displayName,accountEnabled,assignedLicenses&$top=100";
    let totalSynced = 0;
    let created = 0;
    let updated = 0;

    do {
      const data: { value: any[]; "@odata.nextLink"?: string } =
        await graphClient.fetchGraph<{ value: any[]; "@odata.nextLink"?: string }>(nextLink);
      const users = data.value || [];

      for (const u of users) {
        const primarySmtp = (u.mail || u.userPrincipalName || "").toLowerCase();
        if (!primarySmtp || !primarySmtp.includes("@")) continue;

        // Distinguish SharedMailbox vs UserMailbox:
        // Shared mailboxes typically have accountEnabled: false or 0 assigned licenses with a mailbox plan,
        // or can be flagged explicitly by Exchange Online.
        const isShared = !u.accountEnabled && (!u.assignedLicenses || u.assignedLicenses.length === 0);
        const recipientType = isShared ? "SHARED_MAILBOX" : "USER_MAILBOX";

        const existing = await prisma.microsoftMailbox.findUnique({
          where: { primarySmtpAddress: primarySmtp },
        });

        const mailboxData = {
          providerMailboxId: u.id,
          displayName: u.displayName || primarySmtp,
          primarySmtpAddress: primarySmtp,
          recipientType,
          archiveEnabled: false,
          externalDirectoryObjectId: u.id,
          rawMetadata: u,
          lastSyncedAt: new Date(),
        };

        await prisma.microsoftMailbox.upsert({
          where: { primarySmtpAddress: primarySmtp },
          create: mailboxData,
          update: mailboxData,
        });

        if (existing) updated++;
        else created++;
        totalSynced++;
      }

      nextLink = data["@odata.nextLink"];
    } while (nextLink);

    await logAudit({
      actorUserId,
      action: "MICROSOFT_SYNC",
      entityType: "INTEGRATION",
      provider: "MICROSOFT",
      metadata: { totalMailboxesSynced: totalSynced, created, updated },
    });

    return { totalSynced, created, updated };
  }
}

export const microsoftDirectoryService = new MicrosoftDirectoryService();
