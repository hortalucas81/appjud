import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/supabase/server";

export default async function Inicio() {
  const { user } = await usuarioAtual();
  if (user) redirect("/leis");
  return (
    <div className="mx-auto max-w-2xl py-12">
      <h1 className="font-serif text-3xl font-semibold">Sua legislação, anotada do seu jeito.</h1>
      <p className="mt-4 text-stone-700">
        Escolha uma lei do banco, use como template e anote em cada artigo, parágrafo, inciso ou alínea. Cole um
        julgado, um trecho de doutrina ou uma nota sua: a IA sugere os dispositivos em que aquilo se encaixa, e você
        confirma antes de salvar.
      </p>
      <p className="mt-2 text-sm text-stone-500">Piloto: Lei nº 9.605/1998 (Lei de Crimes Ambientais).</p>
      <Link href="/login" className="mt-8 inline-block rounded bg-emerald-700 px-5 py-2 text-white hover:bg-emerald-800">
        Entrar ou criar conta
      </Link>
    </div>
  );
}
