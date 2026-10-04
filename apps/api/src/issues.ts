import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ReviewStatus } from '@marina/contracts';
import { randomUUID } from 'node:crypto';
import { PrismaService } from './database';
import { VisionIssueAgent } from './agents';
import { issueInclude, issueDto } from './responses';
import { validateFile, storeFiles, removeFiles } from './storage';
@Injectable()
export class IssuesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(VisionIssueAgent) private readonly visionAgent: VisionIssueAgent,
  ) {}
  async issue(id: string) {
    const issue = await this.db.issueReport.findUnique({
      where: { id },
      include: issueInclude,
    });
    if (!issue) throw new NotFoundException('Issue not found.');
    return issueDto(issue);
  }

  async createIssue(unitId: string, files: Express.Multer.File[]) {
    if (!(await this.db.unit.findUnique({ where: { id: unitId } })))
      throw new NotFoundException('Choose an existing unit.');
    if (!files?.length)
      throw new BadRequestException('Choose one or more photos.');
    const stored = await Promise.all(
      files.map((f) => validateFile(f, 'image')),
    );
    const photos = stored.map((f) => ({ ...f, id: randomUUID() }));
    const analysis = await this.visionAgent.run(unitId, photos);
    await storeFiles(stored);
    try {
      const id = await this.db.$transaction(async (tx) => {
        const issue = await tx.issueReport.create({
          data: { unitId, provider: 'stub — illustrated fixture demo' },
        });
        for (const p of photos)
          await tx.issuePhoto.create({
            data: {
              id: p.id,
              issueId: issue.id,
              filename: p.filename,
              storageKey: p.storageKey,
              mimeType: p.mimeType,
            },
          });
        const connect = (ids: string[]) => ({
          connect: ids.map((id) => ({ id })),
        });
        await tx.issueAssessment.create({
          data: {
            issueId: issue.id,
            condition: analysis.condition,
            summary: analysis.summary,
            photos: connect(photos.map((p) => p.id)),
          },
        });
        for (const a of analysis.assets)
          await tx.detectedAsset.create({
            data: {
              issueId: issue.id,
              label: a.label,
              photos: connect(a.photoIds),
            },
          });
        for (const d of analysis.damages)
          await tx.detectedDamage.create({
            data: {
              issueId: issue.id,
              label: d.label,
              photos: connect(d.photoIds),
            },
          });
        await tx.draftWorkOrder.create({
          data: {
            issueId: issue.id,
            title: analysis.title,
            description: analysis.description,
            photos: connect(analysis.photoIds),
          },
        });
        return issue.id;
      });
      return this.issue(id);
    } catch (error) {
      await removeFiles(stored.map((f) => f.storageKey));
      throw error;
    }
  }
  async reviewWorkOrder(id: string, status: ReviewStatus) {
    const order = await this.db.draftWorkOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Draft work order not found.');
    await this.db.draftWorkOrder.update({
      where: { id },
      data: { reviewStatus: status, reviewedAt: new Date() },
    });
    return this.issue(order.issueId);
  }
}
