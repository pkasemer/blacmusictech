/** Returns a copy of the list with the item at `from` moved to index `to` (unchanged when out of range). */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x as T);
  return next;
}
