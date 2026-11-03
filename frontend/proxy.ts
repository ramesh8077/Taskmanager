import { NextRequest, NextResponse } from "next/server";
import { can } from "@/lib/rbac";
import { navigationItems } from "@/lib/navConfig";

interface SessionResponse {
  success?: boolean;
  data?: {
    user?: {
      id: number;
      role: string;
      position: string;
      permissions: string[];
    };
  };
}

function loginRedirect(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

function unavailableResponse() {
  return new NextResponse("Unable to verify your session right now.", {
    status: 503,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export async function proxy(request: NextRequest) {
  if (!request.cookies.has("token")) {
    return loginRedirect(request);
  }

  if (!request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL || `${request.nextUrl.origin}/api`;
  const authUrl = `${apiBase.replace(/\/+$/, "")}/auth/me`;
  let session: SessionResponse;
  try {
    const response = await fetch(authUrl, {
      headers: { cookie: request.headers.get("cookie") || "" },
      cache: "no-store",
      redirect: "manual",
    });
    if (response.status === 401 || response.status === 403) {
      return loginRedirect(request);
    }
    if (!response.ok) {
      console.error("Dashboard authorization check failed:", response.status);
      return unavailableResponse();
    }
    session = await response.json() as SessionResponse;
  } catch (error) {
    console.error("Dashboard authorization service unavailable:", error);
    return unavailableResponse();
  }

  const user = session.data?.user;
  if (!session.success || !user || !Array.isArray(user.permissions)) {
    console.error("Dashboard authorization returned an invalid session response.");
    return unavailableResponse();
  }

  const pathname = request.nextUrl.pathname;
  const item = navigationItems
    .filter((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0];
  if (!item) {
    return new NextResponse("This dashboard section is not available.", {
      status: 403,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  if (!item.allowedPositions.includes(user.position as (typeof item.allowedPositions)[number]) ||
      !can(user, item.permission)) {
    return new NextResponse("You do not have permission to access this section.", {
      status: 403,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/admin/:path*"],
};
