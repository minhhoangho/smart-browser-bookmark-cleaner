import { getBookmarkTree } from '@/adapters/bookmarks';
import { buildAuditReport, type AuditReport } from '@/core/bookmarks/audit';

/** Runs the offline audit against the live bookmark tree. */
export async function runAudit(): Promise<AuditReport> {
  return buildAuditReport(await getBookmarkTree());
}
