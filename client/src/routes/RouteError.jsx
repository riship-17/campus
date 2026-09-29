import { Component } from 'react';
import { Notice } from '../components/ui/Notice.jsx';
import { Button } from '../components/ui/Button.jsx';

/**
 * Per-route error boundary. A crash in one screen should not blank the whole app, and the
 * user should get a way out that is not "reload and hope".
 */
export class RouteError extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Route crashed', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto max-w-md py-10">
        <Notice tone="error" title="This page stopped working">
          Something on this screen failed to render. Nothing you did was saved or lost.
        </Notice>
        <Button className="mt-4" variant="secondary" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    );
  }
}
