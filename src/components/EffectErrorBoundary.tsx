import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  effectId?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error boundary specifically for effect components
 * Prevents broken effects from crashing the entire app
 */
export class EffectErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { effectId } = this.props;
    console.error(`❌ Effect Error [${effectId || 'unknown'}]:`, error);
    console.error('Error Info:', errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  componentWillReceiveProps(nextProps: Props) {
    // Reset error state if effectId changes
    if (nextProps.effectId !== this.props.effectId) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
      });
    }
  }

  render() {
    const { hasError, error } = this.state;
    const { children, effectId, fallback } = this.props;

    if (hasError) {
      // If a custom fallback is provided, use it
      if (fallback !== undefined) {
        return fallback;
      }

      // Otherwise, render nothing (allows app to continue)
      console.warn(
        `⚠️ Effect "${effectId || 'unknown'}" failed to render and has been hidden. Error: ${error?.message}`
      );
      
      // Return null to hide the broken effect but keep the app running
      return null;
    }

    return children;
  }
}

/**
 * Functional wrapper for EffectErrorBoundary
 * Use this to wrap effect components
 */
export const withEffectErrorBoundary = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  effectId?: string
): React.FC<P> => {
  const ComponentWithErrorBoundary: React.FC<P> = (props) => (
    <EffectErrorBoundary effectId={effectId}>
      <WrappedComponent {...props} />
    </EffectErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withEffectErrorBoundary(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return ComponentWithErrorBoundary;
};

