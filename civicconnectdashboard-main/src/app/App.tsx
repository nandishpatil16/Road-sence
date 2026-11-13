import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { SplashScreen } from './components/SplashScreen';
import { LoginPage } from './components/LoginPage';
import { InstallPwaPrompt } from './components/InstallPwaPrompt';
import { api } from '../api';

// Role-based dashboards
import { PoliceDashboard } from './components/roles/police/PoliceDashboard';
import { AmbulanceDashboard } from './components/roles/ambulance/AmbulanceDashboard';
import { ConstructionDashboard } from './components/roles/construction/ConstructionDashboard';
import { AdminDashboard } from './components/roles/admin/AdminDashboard';
import { CitizenDashboard } from './components/roles/user/CitizenDashboard';

export default function App() {
  const [appState, setAppState] = useState<'splash' | 'login' | 'main'>('splash');
  const [userRole, setUserRole] = useState<string>('');

  const handleSplashComplete = () => {
    setAppState('login');
  };

  const handleLogin = (role: string) => {
    setUserRole(role);
    setAppState('main');
  };

  const handleLogout = () => {
    api.clearToken();
    setUserRole('');
    setAppState('login');
    toast.success('Logged out successfully');
  };

  // Render role-based dashboard
  const renderDashboard = () => {
    switch (userRole) {
      case 'police':
        return <PoliceDashboard onLogout={handleLogout} />;
      case 'ambulance':
        return <AmbulanceDashboard onLogout={handleLogout} />;
      case 'construction':
        return <ConstructionDashboard onLogout={handleLogout} />;
      case 'admin':
        return <AdminDashboard onLogout={handleLogout} />;
      case 'user':
        return <CitizenDashboard onLogout={handleLogout} />;
      default:
        return <CitizenDashboard onLogout={handleLogout} />;
    }
  };

  return (
    <>
      <InstallPwaPrompt />
      <div className="fixed inset-0 bg-white overflow-hidden">
        {appState === 'splash' && <SplashScreen onComplete={handleSplashComplete} />}
        {appState === 'login' && <LoginPage onLogin={handleLogin} />}
        {appState === 'main' && renderDashboard()}
      </div>
      <Toaster position="top-center" richColors />
    </>
  );
}
