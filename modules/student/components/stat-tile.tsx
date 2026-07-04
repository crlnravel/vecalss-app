function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-white/86 p-3.5 shadow-sm">
      <p className="text-xs text-secondary-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-secondary-900">{value}</p>
    </div>
  );
}

export { StatTile };
