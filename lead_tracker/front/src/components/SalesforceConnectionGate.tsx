import type { ReactNode } from 'react';
import { useSalesforceSession } from '../api/salesforceSession';
import { toast } from '../lib/toast';

// Doit matcher back/src/config.ts (config.salesforce.reportUrl) — l'ouverture se fait en pur front
// (target="_blank" dans le même Chrome dédié), sans passer par le back.
const SALESFORCE_REPORT_URL = 'https://orgfarm-fec657de9c-dev-ed.develop.lightning.force.com/lightning/r/Report/00Ofj00000FxuDdEAJ/edit';

interface SalesforceConnectionGateProps {
  children: ReactNode;
}

export function SalesforceConnectionGate({ children }: SalesforceConnectionGateProps) {
  const { data, isFetching, refetch } = useSalesforceSession();
  const isConnected = data?.status === 'connecte';

  const handleCheck = () => {
    refetch()
      .then((result) => {
        if (result.data?.status === 'connecte') {
          toast.success('Connecté à Salesforce');
        } else if (result.data?.status === 'deconnecte') {
          toast.error('Toujours pas connecté — termine la connexion dans l’onglet Salesforce ouvert.');
        } else {
          toast.error("Impossible de vérifier la connexion — vérifie que l'appli tourne bien.");
        }
      })
      .catch(() => {
        toast.error("Impossible de vérifier la connexion — vérifie que l'appli tourne bien.");
      });
  };

  return (
    <>
      {children}
      {!isConnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="glass-panel glow-cyan w-full max-w-md rounded-2xl p-8 text-center">
            <p className="font-mono-display text-xs tracking-[0.3em] text-neon-cyan uppercase">Connexion requise</p>
            <h2 className="mt-3 text-xl font-semibold text-slate-100">Salesforce n’est pas connecté</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connecte-toi à Salesforce dans la fenêtre Chrome dédiée, puis vérifie la connexion ici.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <a
                href={SALESFORCE_REPORT_URL}
                target="_blank"
                rel="noopener"
                className="rounded-md bg-neon-cyan/90 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-neon-cyan"
              >
                Ouvrir Salesforce
              </a>
              <button
                type="button"
                onClick={handleCheck}
                disabled={isFetching}
                className="cursor-pointer rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-neon-violet disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFetching ? 'Vérification…' : 'Vérifier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
