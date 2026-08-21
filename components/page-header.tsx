export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-[-0.045em] text-white sm:text-[38px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-white/42">{description}</p>}
      </div>
      {action}
    </div>
  );
}
