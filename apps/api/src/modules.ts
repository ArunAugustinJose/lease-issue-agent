import { Module } from '@nestjs/common';
import { PrismaModule } from './database';
import {
  LeaseDocumentAgent,
  StubLeaseModelProvider,
  VisionIssueAgent,
  StubVisionModelProvider,
} from './agents';
import { RulesEngine } from './rules';
import { UnitsService } from './units';
import { LeasesService } from './leases';
import { IssuesService } from './issues';
import { FilesService } from './files';
@Module({
  providers: [
    {
      provide: LeaseDocumentAgent,
      useFactory: () => {
        if (process.env.MODEL_PROVIDER && process.env.MODEL_PROVIDER !== 'stub')
          throw new Error('Only MODEL_PROVIDER=stub is implemented.');
        return new LeaseDocumentAgent(new StubLeaseModelProvider());
      },
    },
    {
      provide: VisionIssueAgent,
      useFactory: () => new VisionIssueAgent(new StubVisionModelProvider()),
    },
  ],
  exports: [LeaseDocumentAgent, VisionIssueAgent],
})
export class AgentsModule {}
@Module({
  providers: [{ provide: RulesEngine, useFactory: () => new RulesEngine() }],
  exports: [RulesEngine],
})
export class RulesModule {}
@Module({
  imports: [PrismaModule],
  providers: [UnitsService],
  exports: [UnitsService],
})
export class UnitsModule {}
@Module({
  imports: [PrismaModule, AgentsModule, RulesModule],
  providers: [LeasesService],
  exports: [LeasesService],
})
export class LeasesModule {}
@Module({
  imports: [PrismaModule, AgentsModule],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
@Module({
  imports: [PrismaModule],
  providers: [FilesService],
  exports: [FilesService],
})
export class StorageModule {}
