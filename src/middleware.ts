import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnvReady, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

// Pages anyone may open. Everything else requires a signed-in session;
// the pages themselves then check the roster and role on the server.
const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/confirm", "/auth/signout", "/set-password"];

function contentSecurityPolicy(nonce: string): string {
  const supabase = SUPABASE_URL;
  const realtime = supabase.replace(/^https:/, "wss:");
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabase} ${realtime}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  const forwardHeaders = () => {
    const h = new Headers(request.headers);
    h.set("x-nonce", nonce);
    h.set("Content-Security-Policy", csp); // lets Next.js attach the nonce to its scripts
    return h;
  };

  let response = NextResponse.next({ request: { headers: forwardHeaders() } });

  let signedIn = false;

  if (publicEnvReady()) {
    try {
      const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request: { headers: forwardHeaders() } });
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      });
      // Refreshes the session cookie if needed. Do not put code between createServerClient and getUser().
      const {
        data: { user },
      } = await supabase.auth.getUser();
      signedIn = !!user;
    } catch {
      signedIn = false; // Supabase unreachable or misconfigured: treat as signed out
    }
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    if (path !== "/" && !path.startsWith("/api/")) login.searchParams.set("next", path + request.nextUrl.search);
    if (path.startsWith("/api/")) {
      return new NextResponse(JSON.stringify({ error: "Not signed in" }), {
        status: 401,
        headers: { "content-type": "application/json", "Content-Security-Policy": csp },
      });
    }
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
