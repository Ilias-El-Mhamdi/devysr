interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming?: boolean;
}

export function ConfirmModal({ title, description, confirmLabel = 'Confirm', onConfirm, onCancel, isConfirming = false }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass-panel glow-violet w-full max-w-sm rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="cursor-pointer rounded-md bg-neon-red/90 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-neon-red disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConfirming ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
