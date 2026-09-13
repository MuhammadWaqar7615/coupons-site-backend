import { NextResponse } from "next/server";

export function handleAuthError(error) {
  if (error?.message === "Unauthorized") {
    return NextResponse.json(
      { message: "Unauthorized", error: "Unauthorized", success: false },
      { status: 401 }
    );
  }
  if (error?.message === "Forbidden") {
    return NextResponse.json(
      { message: "Forbidden", error: "Forbidden", success: false },
      { status: 403 }
    );
  }
  return null;
}
