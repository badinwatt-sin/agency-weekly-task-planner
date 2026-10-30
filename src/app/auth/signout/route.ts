import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = request.nextUrl.searchParams.get("reason") === "inactive" ? "?reason=inactive" : "";
  return NextResponse.redirect(url, { status: 303 });
}

export const POST = signOut;
// GET is used only to clear the session of a deactivated account.
export const GET = signOut;
