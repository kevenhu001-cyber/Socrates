import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught:', error.message, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="error-boundary-fallback" style={{ padding: 16, color: 'hsl(0 60% 50%)' }}>
          <p>Something went wrong. <button className="text-btn" onClick={() => this.setState({ hasError: false, error: null })}>Try again</button></p>
        </div>
      );
    }
    return this.props.children;
  }
}
