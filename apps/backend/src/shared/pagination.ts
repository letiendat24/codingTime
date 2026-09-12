export function paginationMeta(input: {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}) {
  return {
    page: input.page,
    limit: input.limit,
    total: input.total,
    totalPages: Math.ceil(input.total / input.limit),
  };
}
