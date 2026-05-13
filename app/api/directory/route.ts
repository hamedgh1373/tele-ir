import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDb, type AppUser } from "@/lib/chat";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase() || "";
  const db = await getDb();
  const query = q
    ? {
        email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
      }
    : {};

  const users = (await db
    .collection("users")
    .find(query, { projection: { _id: 0, passwordHash: 0 } })
    .sort({ email: 1 })
    .limit(40)
    .toArray()) as unknown as AppUser[];

  const visibleUsers = users.filter((user) => {
    if (user.email === session.user.email) {
      return false;
    }

    return !q || user.email.includes(q) || user.name.toLowerCase().includes(q);
  });

  return NextResponse.json({
    users: visibleUsers
  });
}
