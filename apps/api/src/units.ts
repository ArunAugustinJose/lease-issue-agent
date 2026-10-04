import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type { UnitDetail } from '@marina/contracts';
import { PrismaService } from './database';
import {
  unitDto,
  unitInclude,
  leaseInclude,
  issueInclude,
  leaseDto,
  issueDto,
} from './responses';
@Injectable()
export class UnitsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async units() {
    return (
      await this.db.unit.findMany({
        include: unitInclude,
        orderBy: [{ buildingId: 'asc' }, { id: 'asc' }],
      })
    ).map(unitDto);
  }
  async unit(id: string): Promise<UnitDetail> {
    const unit = await this.db.unit.findUnique({
      where: { id },
      include: unitInclude,
    });
    if (!unit) throw new NotFoundException('Unit not found.');
    const [leases, issues] = await Promise.all([
      this.db.lease.findMany({
        where: { OR: [{ unitId: id }, { candidateUnitId: id }] },
        include: leaseInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.issueReport.findMany({
        where: { unitId: id },
        include: issueInclude,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      ...unitDto(unit),
      leases: leases.map(leaseDto),
      issues: issues.map(issueDto),
    };
  }
}
