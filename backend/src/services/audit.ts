import type pg from 'pg';

export async function audit(
  db: pg.Pool,
  event: { actorId?: number | null; actorEmail?: string | null; actorType?: string;
    action: string; resourceType: string; resourceId?: string | number | null;
    description: string; outcome?: 'SUCCESS'|'FAILURE'; metadata?: Record<string, unknown> }
) {
  await db.query(
    `INSERT INTO activity_logs
      (actor_id, actor_email, actor_type, action, resource_type, resource_id, description, outcome, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [event.actorId ?? null, event.actorEmail ?? null, event.actorType ?? 'USER',
     event.action, event.resourceType, event.resourceId == null ? null : String(event.resourceId),
     event.description, event.outcome ?? 'SUCCESS', JSON.stringify(event.metadata ?? {})]
  );
}
