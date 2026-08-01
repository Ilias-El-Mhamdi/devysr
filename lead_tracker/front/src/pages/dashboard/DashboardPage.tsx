import { useHello } from '../../api/hello';

export function DashboardPage() {
  const { data, isPending, isError } = useHello();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-lg border border-slate-200 bg-white px-8 py-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">lead_tracker 2</h1>
        {isPending && <p className="mt-2 text-slate-500">Connexion au back…</p>}
        {isError && <p className="mt-2 text-red-600">Le back ne répond pas.</p>}
        {data && <p className="mt-2 text-slate-700">{data.message}</p>}
      </div>
    </main>
  );
}
