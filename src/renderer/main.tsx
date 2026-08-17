import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e } }
  componentDidCatch(e: Error) { console.error('[ErrorBoundary]', e) }
  render() {
    if (this.state.error) {
      const msg = (this.state.error as Error).message
      return (
        <div style={{ padding: 32, color: '#7a1a1a', fontFamily: 'monospace', fontSize: 13 }}>
          <strong>App crashed</strong>
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{msg}</pre>
          <pre style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all', opacity: 0.7 }}>
            {(this.state.error as Error).stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary><App /></ErrorBoundary>
)
