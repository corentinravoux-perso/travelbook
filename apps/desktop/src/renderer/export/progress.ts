import type { ExportProgress } from '../../shared/api';

const STEP_WEIGHT: Record<string, number> = {
  derivatives: 0.05,
  render: 0.3,
  print: 0.5,
  capture: 0.6,
  write: 0.9,
};

/** Share of the whole export that is done, from the step of the page being made. */
export const progressRatio = ({ page, total, step }: ExportProgress): number =>
  total <= 0 ? 0 : Math.min(1, (page - 1 + (STEP_WEIGHT[step] ?? 0)) / total);
