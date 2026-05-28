export interface QualityReport {
  pass: boolean;
  errors: string[];
}

const REQUIRED_FIELDS = ['id', 'title', 'type', 'files', 'acceptance'];

const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function validateTaskSchema(tasks: any[]): QualityReport {
  const errors: string[] = [];
  for (const task of tasks) {
    const missing = REQUIRED_FIELDS.filter(f => !(f in task));
    if (missing.length > 0) {
      const label = task.id || '<missing-id>';
      errors.push(`${label}: missing fields: ${missing.join(', ')}`);
    }
  }
  return { pass: errors.length === 0, errors };
}

export function validateTaskIds(tasks: any[]): QualityReport {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    const id: string = task.id;
    if (!id) continue; // caught by validateTaskSchema
    if (!KEBAB_CASE_RE.test(id)) {
      errors.push(`${id}: not kebab-case`);
    }
    if (seen.has(id)) {
      errors.push(`${id}: duplicate task id`);
    }
    seen.add(id);
  }
  return { pass: errors.length === 0, errors };
}

export function validateAcceptance(tasks: any[]): QualityReport {
  const errors: string[] = [];
  for (const task of tasks) {
    const id: string = task.id || '<missing-id>';
    if (!Array.isArray(task.acceptance)) {
      errors.push(`${id}: missing acceptance criteria`);
    } else if (task.acceptance.length === 0) {
      errors.push(`${id}: acceptance criteria is empty`);
    }
  }
  return { pass: errors.length === 0, errors };
}

export function validateFiles(tasks: any[]): QualityReport {
  const errors: string[] = [];
  for (const task of tasks) {
    const id: string = task.id || '<missing-id>';
    if (!Array.isArray(task.files) || task.files.length === 0) {
      errors.push(`${id}: files array is empty or missing`);
      continue;
    }
    for (const f of task.files) {
      if (!f.path || !f.action) {
        errors.push(`${id}: file entry missing path or action`);
        break;
      }
    }
  }
  return { pass: errors.length === 0, errors };
}
