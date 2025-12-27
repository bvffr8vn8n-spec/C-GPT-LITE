import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id } = await Promise.resolve(params);
    const message = db
      .query(`SELECT id, thread_id, role, content, created_at FROM messages WHERE id = ?`)
      .get(id);

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(message);
  } catch (error) {
    console.error("[api/messages/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to load message" },
      { status: 500 }
    );
  }
}

