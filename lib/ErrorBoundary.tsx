import { Component, type ReactNode } from 'react';
import { logError } from './logError';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Stack traces are only for development: in a production build they are not rendered, so a
 * screenshot of a crash shows nothing beyond the message. `import.meta.env.DEV` is false in
 * `wxt build`, true in `wxt dev`.
 */
const SHOW_STACK: boolean = import.meta.env.DEV;

/** What the crash screen shows. Separate from the boundary so the stack rule can be tested. */
export function CrashReport({ error, showStack }: { error: Error; showStack: boolean }) {
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
      <strong>Focused Time crashed while rendering:</strong>
      <div style={{ marginTop: '0.5em' }}>{error.message}</div>
      {showStack && <div style={{ opacity: 0.7, marginTop: '0.5em' }}>{error.stack}</div>}
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    // Name only: the message, stack and component stack are never logged.
    logError('Focused Time crashed while rendering', error);
  }

  override render() {
    if (this.state.error) return <CrashReport error={this.state.error} showStack={SHOW_STACK} />;
    return this.props.children;
  }
}
