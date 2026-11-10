/**
 * Tool reliability metrics and telemetry accounting.
 *
 * Tracks:
 * - first_attempt_validation_success_rate
 * - tool_execution_success_rate
 * - component_render_success_rate
 * - interaction_success_rate
 * - average_attempts_per_success
 * - tool_schema_rejection_count
 * - tool_arguments_truncated_count
 * - tool_retry_exhausted_count
 * - provider_tool_protocol_failure_count
 *
 * Broken down by model, provider, toolName, componentType, and failureStage.
 * Strictly avoids logging sensitive parameters, authentication, or user messages.
 */

export interface ValidationRecord {
  model?: string;
  provider?: string;
  toolName: string;
  componentType?: string;
  attemptNumber: number;
  success: boolean;
  failureStage?: string;
  errorCode?: string;
}

export interface ExecutionRecord {
  model?: string;
  provider?: string;
  toolName: string;
  componentType?: string;
  success: boolean;
  durationMs?: number;
  errorCode?: string;
}

export interface RenderRecord {
  toolName: string;
  componentType?: string;
  success: boolean;
  failureReason?: string;
}

export interface InteractionRecord {
  toolName: string;
  componentType?: string;
  actionType?: string;
  success: boolean;
}

export interface ProtocolFailureRecord {
  model?: string;
  provider?: string;
  toolName?: string;
  errorCode: string;
}

export interface ReliabilityMetricsSummary {
  first_attempt_validation_success_rate: number;
  tool_execution_success_rate: number;
  component_render_success_rate: number;
  interaction_success_rate: number;
  average_attempts_per_success: number;
  tool_schema_rejection_count: number;
  tool_arguments_truncated_count: number;
  tool_retry_exhausted_count: number;
  provider_tool_protocol_failure_count: number;
  total_validation_attempts: number;
  total_validation_successes: number;
  total_executions: number;
  total_renders: number;
  total_interactions: number;
}

class ToolReliabilityTracker {
  private validationAttempts: ValidationRecord[] = [];
  private executionRecords: ExecutionRecord[] = [];
  private renderRecords: RenderRecord[] = [];
  private interactionRecords: InteractionRecord[] = [];
  private protocolFailures: ProtocolFailureRecord[] = [];
  private retryExhaustedCount = 0;

  recordValidation(record: ValidationRecord): void {
    this.validationAttempts.push({
      model: record.model ? record.model.slice(0, 80) : 'unknown',
      provider: record.provider ? record.provider.slice(0, 80) : 'unknown',
      toolName: (record.toolName || 'unknown').slice(0, 80),
      componentType: record.componentType ? record.componentType.slice(0, 80) : undefined,
      attemptNumber: Math.max(1, record.attemptNumber || 1),
      success: Boolean(record.success),
      failureStage: record.failureStage ? record.failureStage.slice(0, 80) : undefined,
      errorCode: record.errorCode ? record.errorCode.slice(0, 80) : undefined,
    });
  }

  recordExecution(record: ExecutionRecord): void {
    this.executionRecords.push({
      model: record.model ? record.model.slice(0, 80) : 'unknown',
      provider: record.provider ? record.provider.slice(0, 80) : 'unknown',
      toolName: (record.toolName || 'unknown').slice(0, 80),
      componentType: record.componentType ? record.componentType.slice(0, 80) : undefined,
      success: Boolean(record.success),
      durationMs: typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) ? record.durationMs : undefined,
      errorCode: record.errorCode ? record.errorCode.slice(0, 80) : undefined,
    });
  }

  recordRender(record: RenderRecord): void {
    this.renderRecords.push({
      toolName: (record.toolName || 'unknown').slice(0, 80),
      componentType: record.componentType ? record.componentType.slice(0, 80) : undefined,
      success: Boolean(record.success),
      failureReason: record.failureReason ? record.failureReason.slice(0, 120) : undefined,
    });
  }

  recordInteraction(record: InteractionRecord): void {
    this.interactionRecords.push({
      toolName: (record.toolName || 'unknown').slice(0, 80),
      componentType: record.componentType ? record.componentType.slice(0, 80) : undefined,
      actionType: record.actionType ? record.actionType.slice(0, 80) : undefined,
      success: Boolean(record.success),
    });
  }

  recordProtocolFailure(record: ProtocolFailureRecord): void {
    this.protocolFailures.push({
      model: record.model ? record.model.slice(0, 80) : 'unknown',
      provider: record.provider ? record.provider.slice(0, 80) : 'unknown',
      toolName: record.toolName ? record.toolName.slice(0, 80) : undefined,
      errorCode: (record.errorCode || 'unknown').slice(0, 80),
    });
  }

  recordRetryExhausted(): void {
    this.retryExhaustedCount++;
  }

  getSummary(): ReliabilityMetricsSummary {
    const firstAttempts = this.validationAttempts.filter((r) => r.attemptNumber === 1);
    const firstSuccess = firstAttempts.filter((r) => r.success).length;
    const firstAttemptRate = firstAttempts.length > 0 ? firstSuccess / firstAttempts.length : 1;

    const execSuccess = this.executionRecords.filter((r) => r.success).length;
    const execRate = this.executionRecords.length > 0 ? execSuccess / this.executionRecords.length : 1;

    const renderSuccess = this.renderRecords.filter((r) => r.success).length;
    const renderRate = this.renderRecords.length > 0 ? renderSuccess / this.renderRecords.length : 1;

    const interactSuccess = this.interactionRecords.filter((r) => r.success).length;
    const interactRate = this.interactionRecords.length > 0 ? interactSuccess / this.interactionRecords.length : 1;

    const successfulAttempts = this.validationAttempts.filter((r) => r.success);
    const totalAttemptsForSuccess = successfulAttempts.reduce((sum, r) => sum + r.attemptNumber, 0);
    const avgAttempts = successfulAttempts.length > 0 ? totalAttemptsForSuccess / successfulAttempts.length : 1;

    const schemaRejections = this.validationAttempts.filter((r) =>
      !r.success && (r.errorCode === 'arguments_schema_failed' || r.failureStage === 'control' || r.failureStage === 'learning' || r.failureStage === 'visualization' || r.failureStage === 'demonstration')
    ).length;

    const truncatedCount = this.validationAttempts.filter((r) =>
      !r.success && (r.errorCode === 'arguments_truncated' || r.failureStage === 'openui_truncated')
    ).length;

    return {
      first_attempt_validation_success_rate: Math.round(firstAttemptRate * 1000) / 1000,
      tool_execution_success_rate: Math.round(execRate * 1000) / 1000,
      component_render_success_rate: Math.round(renderRate * 1000) / 1000,
      interaction_success_rate: Math.round(interactRate * 1000) / 1000,
      average_attempts_per_success: Math.round(avgAttempts * 100) / 100,
      tool_schema_rejection_count: schemaRejections,
      tool_arguments_truncated_count: truncatedCount,
      tool_retry_exhausted_count: this.retryExhaustedCount,
      provider_tool_protocol_failure_count: this.protocolFailures.length,
      total_validation_attempts: this.validationAttempts.length,
      total_validation_successes: successfulAttempts.length,
      total_executions: this.executionRecords.length,
      total_renders: this.renderRecords.length,
      total_interactions: this.interactionRecords.length,
    };
  }

  reset(): void {
    this.validationAttempts = [];
    this.executionRecords = [];
    this.renderRecords = [];
    this.interactionRecords = [];
    this.protocolFailures = [];
    this.retryExhaustedCount = 0;
  }
}

export const toolReliabilityTracker = new ToolReliabilityTracker();
