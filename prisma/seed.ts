import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import units from '../config/units.json';
const db = new PrismaClient();
async function seed() {
  await db.$transaction(async (tx) => {
    for (const p of units.properties) {
      await tx.property.upsert({
        where: { id: p.property_id },
        create: {
          id: p.property_id,
          name: p.name,
          location: p.location,
          ownershipEntity: units.ownership_entity,
        },
        update: {
          name: p.name,
          location: p.location,
          ownershipEntity: units.ownership_entity,
        },
      });
      for (const b of p.buildings) {
        await tx.building.upsert({
          where: { id: b.building_id },
          create: {
            id: b.building_id,
            name: b.name,
            propertyId: p.property_id,
          },
          update: { name: b.name },
        });
        for (const u of b.units) {
          const data = {
            label: u.label,
            type: u.type,
            areaSqm: u.area_sqm,
            parkingBay: u.parking_bay,
            buildingId: b.building_id,
          };
          await tx.unit.upsert({
            where: { id: u.unit_id },
            create: {
              id: u.unit_id,
              ...data,
              status: u.status === 'available' ? 'AVAILABLE' : 'OCCUPIED',
            },
            update: data,
          });
        }
      }
    }
  });
  console.log(
    'Seeded Marina Crest: 1 property, 2 buildings, 5 units. Existing occupancy preserved.',
  );
}
seed().finally(() => db.$disconnect());
