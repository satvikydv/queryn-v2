import prisma from "@/server/prisma";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

async function SyncUser() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("User not authenticated");
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  if (!user.emailAddresses[0]?.emailAddress) {
    return notFound();
  }

  await prisma.user.upsert({
    where: {
      email: user.emailAddresses[0]?.emailAddress ?? "",
    },
    update: {
      imageUrl: user.imageUrl,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    create: {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress ?? "",
      imageUrl: user.imageUrl,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  });
  return redirect("/dashboard");
}

export default SyncUser;
