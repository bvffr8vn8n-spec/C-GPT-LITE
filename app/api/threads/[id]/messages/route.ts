import { NextResponse } from "next/server";
import { getMessages } from "@/lib/db/chat-store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: threadId } = await Promise.resolve(params);
    const messages = getMessages(threadId);
    return NextResponse.json(messages);
  } catch (error) {
    console.error("[api/threads/[id]/messages] Error:", error);
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 }
    );
  }
}

