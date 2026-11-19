export const templateFields = {
  feedback: ['report_id', 'report_url'],
  'admission-request': ['email'],
} as const;

export type TemplateKind = keyof typeof templateFields;

export const defaultTemplates: Record<TemplateKind, string> = {
  feedback: 'New card report: {{report_id}}\n{{report_url}}',
  'admission-request': 'New access request: {{email}}',
};

export function isTemplateKind(value: unknown): value is TemplateKind {
  return value === 'feedback' || value === 'admission-request';
}

export function renderTemplate(kind: TemplateKind, body: string, values: Record<string, string>): string {
  if (!body.trim() || body.length > 2000 || body.includes('\0')) {
    throw new Error('invalid_template');
  }
  const parts = body.split(/(\{\{[a-z_]+\}\})/);
  const fields: readonly string[] = templateFields[kind];
  const text = parts.map((part, index) => {
    if (index % 2 === 0) {
      if (part.includes('{{') || part.includes('}}')) throw new Error('invalid_field');
      return part;
    }
    const field = part.slice(2, -2);
    if (!fields.includes(field) || !values[field]) throw new Error('invalid_field');
    return values[field];
  }).join('');
  // Leave space for the test marker and keep UTF-16 lengths within the transport limit.
  if (text.length > 4080) throw new Error('template_too_long');
  return text;
}

export function previewTemplate(kind: TemplateKind, body: string, siteOrigin?: string): string {
  const reportId = '00000000-0000-4000-8000-000000001042';
  const reportUrl = `${siteOrigin || 'https://example.org'}/admin/reports/?feedback=${reportId}`;
  renderTemplate(kind, body, { report_id: reportId, report_url: reportUrl, email: 'x'.repeat(320) });
  return renderTemplate(kind, body, { report_id: reportId, report_url: reportUrl, email: 'learner@example.org' });
}
