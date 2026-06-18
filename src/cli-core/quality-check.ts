export interface QualityReport {
  pass: boolean;
  errors: string[];
  warnings?: string[];
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

export function validateSpecBoundExecution(tasks: any[]): QualityReport {
  const errors: string[] = [];
  const methods = new Set(['tdd', 'implementation', 'refactor', 'docs', 'migration']);

  for (const task of tasks) {
    if (task.type !== 'implementation' && task.type !== 'testing') continue;

    const id: string = task.id || '<missing-id>';
    if (!methods.has(task.method)) {
      errors.push(`${id}: method must be one of ${Array.from(methods).join(', ')}`);
    }
    if (!Array.isArray(task.specRefs) || task.specRefs.length === 0) {
      errors.push(`${id}: specRefs is empty or missing; include OpenSpec requirement ids such as specs.<capability>.requirements.<requirement-id>`);
    }
    if (!Array.isArray(task.acceptanceRefs) || task.acceptanceRefs.length === 0) {
      errors.push(`${id}: acceptanceRefs is empty or missing; include OpenSpec acceptance ids such as specs.<capability>.acceptance.<acceptance-id>`);
    }
    if (!Array.isArray(task.verification?.commands) || task.verification.commands.length === 0) {
      errors.push(`${id}: verification.commands is empty or missing`);
    }
  }

  return { pass: errors.length === 0, errors };
}

const MAX_FILES_PER_TASK = 10;
const UI_TASK_MAX_FILES = 4;

function taskLooksLikeUiWork(task: any): boolean {
  const text = [task.id, task.title, task.description, task.type, task.method]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  if (/\b(ui|ux|screen|view|layout|visual|figma|component|cell|collection|table|scroll)\b/i.test(text)) {
    return true;
  }
  const files: any[] = Array.isArray(task.files) ? task.files : [];
  return files.some(file =>
    typeof file?.path === 'string' &&
    /\b(View|Screen|ViewController|CollectionView|TableView|Cell|Storyboard|Assets\.xcassets|Composable|Component)\b|\.xib$|\.storyboard$/i.test(file.path)
  );
}

export function validateTaskGranularity(tasks: any[]): QualityReport {
  const warnings: string[] = [];
  const implTasks = tasks.filter(t => t.type === 'implementation');

  for (const task of implTasks) {
    const id: string = task.id || '<missing-id>';
    const files: any[] = task.files || [];

    if (files.length > MAX_FILES_PER_TASK) {
      warnings.push(`${id}: has ${files.length} files (recommended ≤${MAX_FILES_PER_TASK}). Consider splitting into smaller tasks.`);
    }
    if (taskLooksLikeUiWork(task) && files.length > UI_TASK_MAX_FILES) {
      warnings.push(`${id}: UI work touches ${files.length} files (recommended ≤${UI_TASK_MAX_FILES}). Split by screen, major component, state/interaction, assets/tokens, and verification to preserve fidelity.`);
    }
  }

  if (implTasks.length === 1 && implTasks[0]?.files?.length > 3) {
    const paths = implTasks[0].files.map((f: any) => f.path || '');
    const topDirs = new Set(paths.map((p: string) => p.split('/')[0]).filter(Boolean));
    if (topDirs.size > 1) {
      warnings.push(`Single implementation task spans ${topDirs.size} top-level directories (${Array.from(topDirs).join(', ')}). Consider splitting by platform or module.`);
    }
  }

  return { pass: true, errors: [], warnings };
}
