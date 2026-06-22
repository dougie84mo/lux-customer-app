import React, { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { reportError } from '@/lib/errorLog';

type Props = { children: ReactNode };
type State = { error: Error | null };

// Catches render-time errors anywhere inside a screen so the user sees a
// retry button instead of a white screen. Async errors thrown inside
// useEffect / useMutation / useQuery are NOT caught here — those surface as
// React Query `error` states inside their owning screen.
//
// React 19 still requires error boundaries to be class components (no hook
// equivalent yet). We reset state on Retry by re-mounting the children via
// a `key` change, which forces React to throw away the broken subtree and
// run a fresh render.
export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  resetKey = 0;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Best-effort remote log (no-ops until the table is deployed + a user is
    // signed in); reportError also mirrors to the console.
    reportError(error, { componentStack: info.componentStack });
  }

  retry = () => {
    this.resetKey += 1;
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.center}>
          <Text variant="titleMedium" style={styles.title}>
            Something went wrong
          </Text>
          <Text variant="bodySmall" style={styles.message}>
            {this.state.error.message}
          </Text>
          <Button mode="contained" onPress={this.retry} icon="refresh">
            Retry
          </Button>
        </View>
      );
    }
    return <React.Fragment key={this.resetKey}>{this.props.children}</React.Fragment>;
  }
}

// HOC for terse default-export wrapping:
//   export default withScreenErrorBoundary(MyScreen);
export function withScreenErrorBoundary<P extends object>(
  Wrapped: ComponentType<P>,
): ComponentType<P> {
  const Boundary = (props: P) => (
    <ScreenErrorBoundary>
      <Wrapped {...props} />
    </ScreenErrorBoundary>
  );
  Boundary.displayName = `withScreenErrorBoundary(${Wrapped.displayName ?? Wrapped.name ?? 'Screen'})`;
  return Boundary;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', opacity: 0.7 },
});
