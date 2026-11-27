import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Renova a sessão do Supabase a cada requisição e protege as páginas internas.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista, headers) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const caminho = request.nextUrl.pathname;
  const publico = caminho === "/" || caminho.startsWith("/login") || caminho.startsWith("/auth");

  if (!data.user && !publico) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("voltar", caminho);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
