import { criarConta, entrar } from "./actions";

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { erro, aviso, voltar } = await searchParams;
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="font-serif text-2xl font-semibold">Entrar</h1>
      {erro && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</p>}
      <form className="mt-6 space-y-4">
        <input type="hidden" name="voltar" value={voltar ?? "/leis"} />
        <label className="block text-sm">
          E-mail
          <input name="email" type="email" required className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Senha (mínimo 6 caracteres)
          <input name="senha" type="password" required minLength={6} className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </label>
        <div className="flex gap-3">
          <button formAction={entrar} className="flex-1 rounded bg-emerald-700 py-2 text-white hover:bg-emerald-800">
            Entrar
          </button>
          <button formAction={criarConta} className="flex-1 rounded border border-stone-300 py-2 hover:bg-stone-100">
            Criar conta
          </button>
        </div>
      </form>
    </div>
  );
}
