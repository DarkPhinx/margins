/** Address of a journal entry's writing page. */
export function journalPath(id: string, isNew = false): string {
  return `/journal/${id}${isNew ? '?new=1' : ''}`;
}
