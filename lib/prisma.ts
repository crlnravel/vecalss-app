import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const databaseSchema = (() => {
  try {
    return new URL(connectionString).searchParams.get("schema") ?? undefined;
  } catch {
    return undefined;
  }
})();

const adapter = new PrismaPg({ connectionString }, { schema: databaseSchema });
declare global {
  var vecalssPrisma: PrismaClient | undefined;
}

const prisma = globalThis.vecalssPrisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.vecalssPrisma = prisma;
}

export { prisma };
