import Link from "next/link";
import type { ItemEstoque } from "@/lib/estoque";

export function EstoqueBaixoBanner({ itens }: { itens: ItemEstoque[] }) {
  if (itens.length === 0) return null;

  return (
    <Link
      href="/estoque"
      className="mb-6 block rounded-xl border border-amber bg-amber-soft p-4 transition-opacity hover:opacity-90"
    >
      <p className="text-sm font-medium text-amber">
        {itens.length === 1 ? "1 item de estoque precisa de reposição" : `${itens.length} itens de estoque precisam de reposição`}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{itens.map((i) => i.nome).join(", ")}</p>
    </Link>
  );
}
