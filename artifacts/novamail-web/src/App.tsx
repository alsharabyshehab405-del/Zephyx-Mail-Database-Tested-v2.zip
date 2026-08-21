import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { I18nProvider } from '@/hooks/use-i18n';
import { ThemeProvider } from '@/components/theme-provider';
import { ProtectedRoute } from '@/components/protected-route';

// Pages
import Login from '@/pages/login';
import Register from '@/pages/register';
import Inbox from '@/pages/inbox';
import Settings from '@/pages/settings';
import Admin from '@/pages/admin';
import ForgotPassword from '@/pages/forgot-password';
import ResetPassword from '@/pages/reset-password';
import VerifyEmail from '@/pages/verify-email';
import Home from '@/pages/home';
import Privacy from '@/pages/privacy';
import Terms from '@/pages/terms';
import Tasks from '@/pages/tasks';
import Calendar from '@/pages/calendar';
import Analytics from '@/pages/analytics';
import Templates from '@/pages/templates';
import AiAssistant from '@/pages/ai-assistant';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function RootPage() {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? <Inbox /> : <Home />;
}

function Router() {
  return (
    <Switch>
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      
      <Route path="/" component={RootPage} />
      
      <Route path="/folder/:folder">
        <ProtectedRoute>
          <Inbox />
        </ProtectedRoute>
      </Route>
      
      <Route path="/settings">
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      </Route>

      <Route path="/ai">
        <ProtectedRoute><AiAssistant /></ProtectedRoute>
      </Route>

      <Route path="/tasks">
        <ProtectedRoute><Tasks /></ProtectedRoute>
      </Route>
      <Route path="/calendar">
        <ProtectedRoute><Calendar /></ProtectedRoute>
      </Route>
      <Route path="/analytics">
        <ProtectedRoute><Analytics /></ProtectedRoute>
      </Route>
      <Route path="/templates">
        <ProtectedRoute><Templates /></ProtectedRoute>
      </Route>

      <Route path="/admin/users">
        <ProtectedRoute adminOnly>
          <Admin />
        </ProtectedRoute>
      </Route>

      <Route path="/admin">
        <ProtectedRoute adminOnly>
          <Admin />
        </ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="novamail-theme">
        <I18nProvider>
          <AuthProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
