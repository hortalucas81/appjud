import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/supabase/server";
import type { Norma } from "@/lib/tipos";

async function usarComoTemplate(form: FormData) {
  "use server";
  const { supabase, user } = await usuarioAtual();
  if (!user) redirect("/login");
  const normaId = String(form.get("norma_id"));
  await supabase.from("minhas_normas").upsert({ norma_id: normaId, user_id: user.id });
  revalidatePath("/leis");
  redirect(`/leis/${form.get("slug")}`);
}

export default async function Leis() {
  const { supabase, user } = await usuarioAtual();
  const [{ data: normas }, { data: minhas }, { data: anotacoes }] = await Promise.all([
    supabase.from("normas").select("id, slug, titulo, apelido, ementa, fonte_url").order("titulo"),
    supabase.from("minhas_normas").select("norma_id").eq("user_id", user!.id),
    supabase.from("anotacoes").select("norma_id").eq("user_id", user!.id),
  ]);
  const minhasIds = new Set((minhas ?? []).map((m) => m.norma_id));
  const contagem = new Map<string, number>();
  (anotacoes ?? []).forEach((a) => contagem.set(a.norma_id, (contagem.get(a.norma_id) ?? 0) + 1));
  const lista = (normas ?? []) as Norma[];
  const minhasNormas = lista.filter((n) => minhasIds.has(n.id));
  const banco = lista.filter((n) => !minhasIds.has(n.id));

  const Cartao = ({ n, minha }: { n: Norma; minha: boolean }) => (
    <li className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-lg font-semibold">{n.apelido || n.titulo}</p>
          {n.apelido && <p className="text-sm text-stone-600">{n.titulo}</p>}
          {n.ementa && <p className="mt-2 text-sm text-stone-500">{n.ementa}</p>}
        </div>
        {minha ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-500">{contagem.get(n.id) ?? 0} anotações</span>
            <Link href={`/leis/${n.slug}`} className="rounded bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-800">
              Abrir
            </Link>
          </div>
        ) : (
          <form action={usarComoTemplate}>
            <input type="hidden" name="norma_id" value={n.id} />
            <input type="hidden" name="slug" value={n.slug} />
            <button className="rounded border border-emerald-700 px-4 py-2 text-sm text-emerald-800 hover:bg-emerald-50">
              Usar como template
            </button>
          </form>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-serif text-2xl font-semibold">Minhas leis</h1>
        {minhasNormas.length === 0 ? (
          <p className="mt-3 text-stone-600">Você ainda não adotou nenhuma lei. Escolha uma no banco abaixo.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {minhasNormas.map((n) => (
              <Cartao key={n.id} n={n} minha />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="font-serif text-xl font-semibold">Banco de legislação</h2>
        {banco.length === 0 ? (
          <p className="mt-3 text-stone-600">
            {lista.length === 0
              ? "Nenhuma lei importada ainda. Rode o arquivo de seed no Supabase (veja o README)."
              : "Você já adotou todas as leis disponíveis."}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {banco.map((n) => (
              <Cartao key={n.id} n={n} minha={false} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
