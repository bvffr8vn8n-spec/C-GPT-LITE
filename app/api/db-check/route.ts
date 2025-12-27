import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export async function GET() {
  try {
    const threadsCount = db.query(`SELECT COUNT(*) as count FROM threads`).get() as { count: number };
    const messagesCount = db.query(`SELECT COUNT(*) as count FROM messages`).get() as { count: number };

    return NextResponse.json({
      ok: true,
      threads: threadsCount.count,
      messages: messagesCount.count,
    });
  } catch (error) {
    console.error("[api/db-check] Error:", error);
    return NextResponse.json(
      { error: "Database check failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

