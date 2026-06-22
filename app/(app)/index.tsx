import { withScreenErrorBoundary } from '@/components/ScreenErrorBoundary';
import { ClientHome } from '@/components/ClientHome';

// Customer app home — the client home directly (single persona; no business
// dashboard / persona branching in this app).
function HomeScreen() {
  return <ClientHome />;
}

export default withScreenErrorBoundary(HomeScreen);
