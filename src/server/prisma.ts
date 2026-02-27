import { PrismaClient } from '../../generated/prisma/client'

const prismaClientSingleton = () => {
    return new PrismaClient()
}

type prismaClientSingleton = ReturnType<typeof prismaClientSingleton>
// Prevent multiple instances of Prisma Client in development

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined }

const prisma = globalForPrisma.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma