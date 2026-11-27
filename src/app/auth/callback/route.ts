import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

// Link de confirmação de e-mail do Supabase cai aqui.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await criarClienteServidor();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/leis", request.url));
}
