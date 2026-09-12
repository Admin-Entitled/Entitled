import fs from 'node:fs/promises';
import path from 'node:path';
import type { JobRecord } from '../../shared/types.js';
const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
export async function writeReports(outputDir: string, jobs: JobRecord[]) {
  await fs.mkdir(outputDir, { recursive: true });
  const rows = await Promise.all(
    jobs.map(async (job) => ({
      ...job,
      references: job.references.join('|'),
      orderedInputs: job.orderedInputs.map(({ uploadedUrl: _uploadedUrl, ...input }) => input),
      sourceMappings: job.sourceMappings ?? [],
      dryRunDiagnostics: job.dryRunDiagnostics,
      settings: JSON.stringify(job.settings),
      runId: job.runId,
      jobId: job.id,
      rawOutputPath: job.rawOutputPath,
      finalOutputPath: job.finalOutputPath ?? job.outputPath,
      rawOutputExists: await exists(job.rawOutputPath),
      finalOutputExists: await exists(job.finalOutputPath ?? job.outputPath),
      outputExists: await exists(job.finalOutputPath ?? job.outputPath),
    })),
  );
  await fs.writeFile(path.join(outputDir, 'processing-report.json'), JSON.stringify(rows, null, 2));
  const headers = [
    'runId',
    'jobId',
    'product',
    'promptKey',
    'promptFile',
    'references',
    'orderedInputs',
    'sourceMappings',
    'dryRunDiagnostics',
    'rawOutputPath',
    'finalOutputPath',
    'model',
    'settings',
    'generationId',
    'status',
    'attemptCount',
    'retries',
    'failureStage',
    'startedAt',
    'endedAt',
    'creditsUsed',
    'estimatedCredits',
    'creditDifference',
    'actualCreditsSource',
    'balanceBefore',
    'balanceAfter',
    'rawOutputExists',
    'finalOutputExists',
    'error',
  ];
  await fs.writeFile(
    path.join(outputDir, 'processing-report.csv'),
    [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((key) =>
            csv(
              key === 'orderedInputs' || key === 'sourceMappings' || key === 'dryRunDiagnostics'
                ? JSON.stringify((row as Record<string, unknown>)[key])
                : (row as Record<string, unknown>)[key],
            ),
          )
          .join(','),
      ),
    ].join('\n'),
  );
}

async function exists(file: string | undefined) {
  if (!file) return false;
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}
