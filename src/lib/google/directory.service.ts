import { google, admin_directory_v1 } from "googleapis";
import { getGoogleAuthClient } from "./auth";
import { prisma } from "../prisma";
import { logAudit } from "../audit/audit.service";

export class GoogleDirectoryService {
  private getDirectoryClient(): admin_directory_v1.Admin {
    const auth = getGoogleAuthClient();
    return google.admin({ version: "directory_v1", auth });
  }

  /**
   * Synchronize all Google Workspace Users with full pagination.
   */
  public async syncGoogleUsers(actorUserId?: string): Promise<{ totalSynced: number; created: number; updated: number }> {
    const directory = this.getDirectoryClient();
    const customer = process.env.GOOGLE_CUSTOMER_ID || "my_customer";
    const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN;

    let pageToken: string | undefined = undefined;
    let totalSynced = 0;
    let created = 0;
    let updated = 0;

    do {
      const response: admin_directory_v1.Schema$Users = (
        await directory.users.list({
          customer,
          maxResults: 100,
          pageToken,
          orderBy: "email",
        })
      ).data;

      const users = response.users || [];
      for (const u of users) {
        if (!u.id || !u.primaryEmail) continue;

        if (allowedDomain && !u.primaryEmail.endsWith(`@${allowedDomain}`)) {
          // If domain filtering is strictly required
        }

        const existing = await prisma.googleUser.findUnique({
          where: { providerId: u.id },
        });

        const userData = {
          providerId: u.id,
          primaryEmail: u.primaryEmail.toLowerCase(),
          name: u.name?.fullName || null,
          givenName: u.name?.givenName || null,
          familyName: u.name?.familyName || null,
          fullName: u.name?.fullName || null,
          suspended: Boolean(u.suspended),
          archived: Boolean(u.archived),
          orgUnitPath: u.orgUnitPath || null,
          creationTime: u.creationTime ? new Date(u.creationTime) : null,
          lastLoginTime: u.lastLoginTime ? new Date(u.lastLoginTime) : null,
          isAdmin: Boolean(u.isAdmin),
          isDelegatedAdmin: Boolean(u.isDelegatedAdmin),
          rawMetadata: u as any,
          lastSyncedAt: new Date(),
        };

        const savedUser = await prisma.googleUser.upsert({
          where: { providerId: u.id },
          create: userData,
          update: userData,
        });

        if (existing) updated++;
        else created++;
        totalSynced++;

        // Sync Aliases
        if (u.aliases && u.aliases.length > 0) {
          for (const alias of u.aliases) {
            await prisma.googleUserAlias.upsert({
              where: { aliasEmail: alias.toLowerCase() },
              create: {
                googleUserId: savedUser.id,
                aliasEmail: alias.toLowerCase(),
              },
              update: {
                googleUserId: savedUser.id,
              },
            });
          }
        }
      }

      pageToken = response.nextPageToken || undefined;
    } while (pageToken);

    await logAudit({
      actorUserId,
      action: "GOOGLE_SYNC",
      entityType: "USER",
      provider: "GOOGLE",
      metadata: { totalSynced, created, updated },
    });

    return { totalSynced, created, updated };
  }

  /**
   * Synchronize all Google Groups and their Members.
   */
  public async syncGoogleGroups(actorUserId?: string): Promise<{ totalSynced: number; created: number; updated: number }> {
    const directory = this.getDirectoryClient();
    const customer = process.env.GOOGLE_CUSTOMER_ID || "my_customer";

    let pageToken: string | undefined = undefined;
    let totalSynced = 0;
    let created = 0;
    let updated = 0;

    do {
      const response: admin_directory_v1.Schema$Groups = (
        await directory.groups.list({
          customer,
          maxResults: 100,
          pageToken,
        })
      ).data;

      const groups = response.groups || [];
      for (const g of groups) {
        if (!g.id || !g.email) continue;

        const existing = await prisma.googleGroup.findUnique({
          where: { providerId: g.id },
        });

        const groupData = {
          providerId: g.id,
          email: g.email.toLowerCase(),
          name: g.name || g.email,
          description: g.description || null,
          directMembersCount: Number(g.directMembersCount || 0),
          rawMetadata: g as any,
          lastSyncedAt: new Date(),
        };

        const savedGroup = await prisma.googleGroup.upsert({
          where: { providerId: g.id },
          create: groupData,
          update: groupData,
        });

        if (existing) updated++;
        else created++;
        totalSynced++;

        // Fetch and sync Group Members
        try {
          let memberPageToken: string | undefined = undefined;
          do {
            const memberRes: admin_directory_v1.Schema$Members = (
              await directory.members.list({
                groupKey: g.id,
                maxResults: 100,
                pageToken: memberPageToken,
              })
            ).data;

            const members = memberRes.members || [];
            for (const m of members) {
              if (!m.email) continue;
              const existingMember = await prisma.googleGroupMember.findFirst({
                where: {
                  googleGroupId: savedGroup.id,
                  email: m.email.toLowerCase(),
                },
              });

              if (!existingMember) {
                await prisma.googleGroupMember.create({
                  data: {
                    googleGroupId: savedGroup.id,
                    email: m.email.toLowerCase(),
                    memberId: m.id || null,
                    role: m.role || "MEMBER",
                    type: m.type || "USER",
                    rawMetadata: m as any,
                  },
                });
              } else {
                await prisma.googleGroupMember.update({
                  where: { id: existingMember.id },
                  data: {
                    role: m.role || "MEMBER",
                    type: m.type || "USER",
                    rawMetadata: m as any,
                  },
                });
              }
            }

            memberPageToken = memberRes.nextPageToken || undefined;
          } while (memberPageToken);
        } catch (memberErr) {
          console.warn(`[GOOGLE DIRECTORY] Não foi possível sincronizar membros do grupo ${g.email}:`, memberErr);
        }
      }

      pageToken = response.nextPageToken || undefined;
    } while (pageToken);

    await logAudit({
      actorUserId,
      action: "GOOGLE_SYNC",
      entityType: "GROUP",
      provider: "GOOGLE",
      metadata: { totalSynced, created, updated },
    });

    return { totalSynced, created, updated };
  }
}

export const googleDirectoryService = new GoogleDirectoryService();
