import { uiContractContent } from '../../../../services/uiContract.js';
import type { ToolExecutor } from './types.js';

export const executeGetUiContract: ToolExecutor = async (args, call, { emitter }) => {
  const contract = uiContractContent(args);
  const result = contract.ok
    ? { status: 'completed', output: contract.output, retryable: false }
    : { status: 'failed', errorCode: 'ui_contract_invalid', error: contract.error, retryable: true };
  emitter.event('tool_result', {
    id: call.id,
    name: 'get_ui_contract',
    ok: contract.ok,
    ...result,
  });
  return { result };
};
