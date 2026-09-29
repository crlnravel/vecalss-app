import "server-only";

type PreviewCpuGateState = { active: boolean };
type GlobalWithPreviewCpuGate = typeof globalThis & {
  __vecalssQuestionBankXlsxPreviewCpuGate__?: PreviewCpuGateState;
};

const runtimeGlobal = globalThis as GlobalWithPreviewCpuGate;
const gate = runtimeGlobal.__vecalssQuestionBankXlsxPreviewCpuGate__ ??= { active: false };

/**
 * Keep uninterruptible ExcelJS/Sharp work to one preview per Node process.
 * Admission is fail-fast with no waiter queue, so cancelled callers cannot
 * leave expensive work queued to start after their request has ended.
 */
function acquireQuestionBankXlsxPreviewCpuPermit() {
  if (gate.active) return null;
  gate.active = true;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    gate.active = false;
  };
}

export { acquireQuestionBankXlsxPreviewCpuPermit };
