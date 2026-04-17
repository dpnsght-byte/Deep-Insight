import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Admin from './components/Admin';
import { AuthProvider, useAuth } from './AuthContext';
import { LogIn } from 'lucide-react';

const AppContent = () => {
  const { user, loading, login, error, skipLogin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center space-y-6">
          <div className="bg-blue-600/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto">
            <LogIn className="w-8 h-8 text-blue-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Deep Insight SEC</h1>
            <p className="text-slate-400">Please sign in to access the dashboard and administration panel.</p>
          </div>
          <div className="space-y-4">
            <button
              onClick={login}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              Sign in with Google
            </button>
            <button
              onClick={skipLogin}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-6 rounded-xl transition-all"
            >
              Skip Login (Preview Only)
            </button>
          </div>
          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Layout>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
