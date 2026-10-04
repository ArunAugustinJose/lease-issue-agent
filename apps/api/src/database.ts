import { Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
