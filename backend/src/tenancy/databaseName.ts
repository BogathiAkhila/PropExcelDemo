export function databaseNameFromOrganizationName(organizationName: string): string | undefined {
  const normalized = organizationName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let databaseName = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!databaseName) return undefined;
  if (!/^[a-z]/.test(databaseName)) databaseName = `org_${databaseName}`;
  return databaseName.slice(0, 63).replace(/_+$/g, '') || undefined;
}
