const deploymentFields = ['status', 'version', 'commit', 'run_url', 'candidate_url'] as const;

export const templateFields = {
  feedback: ['report_id', 'report_url'],
  'admission-request': ['email'],
  'deployment-staging': deploymentFields,
  'deployment-production': deploymentFields,
} as const;

export type TemplateKind = keyof typeof templateFields;

export const defaultTemplates: Record<TemplateKind, string> = {
  feedback: 'New card report: {{report_id}}\n{{report_url}}',
  'admission-request': 'New access request: {{email}}',
  'deployment-staging': '2000NL · Staging · {{status}}\nВерсия: {{version}}\nКоммит: {{commit}}\n{{run_url}}',
  'deployment-production': '2000NL · Production · {{status}}\nВерсия: {{version}}\nКоммит: {{commit}}\nStaging: {{candidate_url}}\n{{run_url}}',
};

export function isTemplateKind(value: unknown): value is TemplateKind {
  return typeof value === 'string' && Object.hasOwn(templateFields, value);
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
  const values = {
    report_id: reportId, report_url: reportUrl, email: 'learner@example.org',
    status: '✅ Успешно', version: '1.4.2', commit: '70f3910d2ae14273fc100502fa17791f3eabcf41',
    run_url: 'https://github.com/example/project/actions/runs/1042/attempts/1',
    candidate_url: 'https://github.com/example/project/actions/runs/1038',
  };
  const maxVersion = values.version.padEnd(80, 'x');
  const maxLink = values.run_url.padEnd(255, '9');
  const longest = {report_id: reportId, report_url: reportUrl, email: 'x'.repeat(320), status: '⚠️ Отменён',
    version: maxVersion, commit: values.commit, run_url: maxLink, candidate_url: maxLink};
  renderTemplate(kind, body, longest);
  return renderTemplate(kind, body, values);
}
