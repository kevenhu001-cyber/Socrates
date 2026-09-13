/**
 * react/tool-output/OutputErrorBoundary.tsx — one output must not take the
 * turn down.
 *
 * A renderer that throws while React is building it (an adapter module that
 * failed to initialize, a malformed spec reaching a component) is caught here
 * and replaced with a compact fallback plus a local Retry. Retry re-runs the
 * renderer only — it never re-executes the tool or asks the model again.
 */
import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';

export interface OutputErrorBoundaryProps {
  outputId: string;
  children: ReactNode;
}

interface OutputErrorBoundaryState {
  failed: boolean;
  /** Bumped on retry to force the subtree (and its effects) to mount fresh. */
  revision: number;
}

export class OutputErrorBoundary extends Component<
  OutputErrorBoundaryProps,
  OutputErrorBoundaryState
> {
  constructor(props: OutputErrorBoundaryProps) {
    super(props);
    this.state = { failed: false, revision: 0 };
  }

  static getDerivedStateFromError(): Partial<OutputErrorBoundaryState> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      console.warn('[tool-output] renderer failed', this.props.outputId, error.message, info.componentStack);
    } catch (_) { /* logging must never rethrow */ }
  }

  private retry = (): void => {
    this.setState((state) => ({ failed: false, revision: state.revision + 1 }));
  };

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="tool-output-error" role="status">
          <span>This result failed to render.</span>
          <button type="button" onClick={this.retry}>Retry</button>
        </div>
      );
    }
    return <Fragment key={this.state.revision}>{this.props.children}</Fragment>;
  }
}
