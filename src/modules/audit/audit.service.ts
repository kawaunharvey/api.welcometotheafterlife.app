import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface RecordAuditLogDto {
  subjectType: string;
  subjectId: string;
  actorUserId?: string;
  action: string;
  payload?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * Record an audit log entry.
   */
  async record(dto: RecordAuditLogDto): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        actorUserId: dto.actorUserId,
        action: dto.action,
        payload: dto.payload || null,
      },
    });
  }

  /**
   * Get audit logs for a subject.
   */
  async getLogsForSubject(subjectType: string, subjectId: string) {
    return this.prisma.auditLog.findMany({
      where: { subjectType, subjectId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}
