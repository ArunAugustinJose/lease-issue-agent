import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './database';
@Injectable()
export class FilesService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async file(key: string) {
    if (!/^[\da-f-]{36}\.(pdf|docx|txt|png|jpe?g|webp|svg)$/.test(key))
      throw new NotFoundException('File not found.');
    const file =
      (await this.db.leaseDocument.findUnique({
        where: { storageKey: key },
      })) ??
      (await this.db.issuePhoto.findUnique({ where: { storageKey: key } }));
    if (!file) throw new NotFoundException('File not found.');
    return file;
  }
}
