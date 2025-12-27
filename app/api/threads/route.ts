import { NextResponse } from "next/server";
import { getAllThreads, createThread } from "@/lib/db/chat-store";

export async function GET() {
  try {
    const threads = getAllThreads();
    return NextResponse.json(threads);
  } catch (error) {
    console.error("[api/threads] Error:", error);
    return NextResponse.json(
      { error: "Failed to load threads" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { title } = await req.json();

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    const id = createThread(title.trim());
    return NextResponse.json({ id, title: title.trim() });
  } catch (error) {
    console.error("[api/threads] Error:", error);
    return NextResponse.json(
      { error: "Failed to create thread" },
      { status: 500 }
    );
  }
}

