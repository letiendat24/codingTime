import { PrismaClient, RoleName } from '@prisma/client';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

function loadNearestEnvFile() {
  let currentDirectory = process.cwd();

  while (true) {
    const candidate = join(currentDirectory, '.env');

    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return;
    }

    currentDirectory = parentDirectory;
  }
}

loadNearestEnvFile();

const prisma = new PrismaClient();

const categories = ['Frontend', 'Backend', 'DevOps', 'Database', 'Algorithms'];
const tags = ['javascript', 'react', 'nodejs', 'docker', 'postgresql'];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function seedRoles() {
  for (const name of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

async function seedCourseReferenceData() {
  for (const name of categories) {
    await prisma.courseCategory.upsert({
      where: { slug: slugify(name) },
      update: { name },
      create: { name, slug: slugify(name) },
    });
  }

  for (const name of tags) {
    await prisma.courseTag.upsert({
      where: { slug: slugify(name) },
      update: { name },
      create: { name, slug: slugify(name) },
    });
  }
}

async function main() {
  await seedRoles();
  await seedCourseReferenceData();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
