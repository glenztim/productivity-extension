import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CrashReport } from './ErrorBoundary';

function crash(): Error {
  const err = new Error('Something broke');
  err.stack = 'Error: Something broke\n    at secretFunction (moz-extension://abc/chunks/popup.js:1:2)';
  return err;
}

describe('CrashReport', () => {
  it('does not render the stack when showStack is false (production)', () => {
    const html = renderToStaticMarkup(createElement(CrashReport, { error: crash(), showStack: false }));
    expect(html).toContain('Something broke');
    expect(html).not.toContain('secretFunction');
    expect(html).not.toContain('moz-extension');
  });

  it('renders the stack in development', () => {
    const html = renderToStaticMarkup(createElement(CrashReport, { error: crash(), showStack: true }));
    expect(html).toContain('secretFunction');
  });
});
