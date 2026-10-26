import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('Focus Pool crashed:', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: '1em',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '12px',
            color: '#f2555a',
            background: '#1a1a1a',
            whiteSpace: 'pre-wrap',
            minWidth: '260px',
          }}
        >
          <strong>Focus Pool crashed while rendering:</strong>
          <div style={{ marginTop: '0.5em' }}>{this.state.error.message}</div>
          <div style={{ opacity: 0.7, marginTop: '0.5em' }}>{this.state.error.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
