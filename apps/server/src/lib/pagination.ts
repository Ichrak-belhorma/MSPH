import type { Paginated, PaginationQuery } from "@msph/shared";

/** Prisma `skip`/`take` for a validated `{page, pageSize}` query. */
export function paginationArgs({ page, pageSize }: PaginationQuery): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function toPaginated<T>(items: T[], total: number, { page, pageSize }: PaginationQuery): Paginated<T> {
  return { items, total, page, pageSize };
}
