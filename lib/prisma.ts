import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
declare global {
  var vecalssPrisma: PrismaClient | undefined;
}

const prisma = globalThis.vecalssPrisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.vecalssPrisma = prisma;
}

export { prisma };
