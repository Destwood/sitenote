export const PAGE_SIZE = 25;

const MAX_PAGE = 1_000_000;
const PAGE_NUMBER = /^[0-9]{1,7}$/;

export function parsePageNumber(value: string | undefined): number {
  if (value === undefined || !PAGE_NUMBER.test(value)) {
    return 1;
  }
  return Math.max(1, Math.min(Number(value), MAX_PAGE));
}

export function pageOffset(pageNumber: number, pageSize: number = PAGE_SIZE): number {
  return (pageNumber - 1) * pageSize;
}

export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
