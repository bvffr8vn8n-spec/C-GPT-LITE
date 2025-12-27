import { NextResponse } from "next/server";
import { getThread, deleteThread } from "@/lib/db/chat-store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const thread = getThread(id);

    if (!thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(thread);
  } catch (error) {
    console.error("[api/threads/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to load thread" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const thread = getThread(id);

    if (!thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    deleteThread(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/threads/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete thread" },
      { status: 500 }
    );
  }
}

