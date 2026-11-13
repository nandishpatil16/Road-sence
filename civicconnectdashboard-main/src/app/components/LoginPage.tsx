import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Navigation, ChevronDown, User, Shield, UserCheck, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../api';

interface LoginPageProps {
  onLogin: (role: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  // Primary mode: 'signin' | 'signup'
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  // In signin mode: 'authority' vs 'citizen'
  const [loginRoleType, setLoginRoleType] = useState<'authority' | 'citizen'>('authority');

  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: 'police@civic.com', password: 'password123', role: 'police' });
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const authorities = [
    { id: 'police',       name: 'Traffic Police',          icon: '🚓', email: 'police@civic.com' },
    { id: 'ambulance',    name: 'Ambulance Driver',         icon: '🚑', email: 'ambulance@civic.com' },
    { id: 'construction', name: 'Construction Authority',   icon: '🚧', email: 'construction@civic.com' },
    { id: 'admin',        name: 'City Authority / Admin',   icon: '🏛️', email: 'admin@civic.com' },
  ];

  const selectedAuthority = authorities.find(a => a.id === formData.role) || authorities[0];

  const handleSelectAuthority = (auth: typeof authorities[0]) => {
    setFormData({
      ...formData,
      role: auth.id,
      email: auth.email,
      password: 'password123',
    });
    setShowRoleDropdown(false);
    setError('');
  };

  const switchAuthMode = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setError('');
    setSuccess('');
    if (mode === 'signup') {
      setFormData({ name: '', email: '', password: '', role: 'user' });
    } else {
      if (loginRoleType === 'authority') {
        setFormData({ name: '', email: selectedAuthority.email, password: 'password123', role: selectedAuthority.id });
      } else {
        setFormData({ name: '', email: '', password: '', role: 'user' });
      }
    }
  };

  const switchLoginRoleType = (type: 'authority' | 'citizen') => {
    setLoginRoleType(type);
    setError('');
    setSuccess('');
    if (type === 'authority') {
      setFormData({ name: '', email: selectedAuthority.email, password: 'password123', role: selectedAuthority.id });
    } else {
      setFormData({ name: '', email: '', password: '', role: 'user' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (authMode === 'signin') {
      if (!formData.email || !formData.password) {
        setError('Email and password are required');
        return;
      }
      setLoading(true);
      try {
        const data = await api.login(formData.email, formData.password);
        onLogin(data.role || (loginRoleType === 'authority' ? formData.role : 'user'));
      } catch (err: any) {
        setError(err.message || 'Login failed. Please check credentials.');
      } finally {
        setLoading(false);
      }
    } else {
      // Sign Up (Citizen only)
      if (!formData.name.trim()) {
        setError('Full name is required');
        return;
      }
      if (!formData.email || !formData.password) {
        setError('Email and password are required');
        return;
      }
      setLoading(true);
      try {
        const data = await api.register(formData.name.trim(), formData.email, formData.password, 'user');
        setSuccess('Account created successfully! Logging you in...');
        setTimeout(() => onLogin(data.role || 'user'), 700);
      } catch (err: any) {
        setError(err.message || 'Registration failed');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-white overflow-auto">
      <div className="min-h-full flex items-center justify-center p-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Brand Header */}
          <div className="mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.6 }}
              className="flex items-center gap-3 mb-6"
            >
              <div className="w-16 h-16 bg-black rounded-3xl flex items-center justify-center shadow-md">
                <Navigation className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-black tracking-tight">CivicConnect</h1>
                <p className="text-sm text-gray-400">Urban Mobility & Safety Platform</p>
              </div>
            </motion.div>

            <h2 className="text-3xl font-extrabold text-black mb-1">
              {authMode === 'signin'
                ? loginRoleType === 'authority'
                  ? 'Authority Sign In'
                  : 'Citizen Sign In'
                : 'Citizen Sign Up'}
            </h2>
            <p className="text-sm text-gray-400">
              {authMode === 'signin'
                ? loginRoleType === 'authority'
                  ? 'Official command login for police, emergency & city departments'
                  : 'Enter your credentials to access your citizen dashboard'
                : 'Create an account to report civic issues and receive live alerts'}
            </p>
          </div>

          {/* PRIMARY TOGGLE: [ Sign In ] vs [ Sign Up ] */}
          <div className="flex gap-2 mb-4 bg-gray-100 p-1.5 rounded-2xl">
            <button
              type="button"
              onClick={() => switchAuthMode('signin')}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all text-sm flex items-center justify-center gap-2 ${
                authMode === 'signin'
                  ? 'bg-white text-black shadow-sm font-bold'
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              <LogIn className="w-4 h-4 text-blue-600" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchAuthMode('signup')}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all text-sm flex items-center justify-center gap-2 ${
                authMode === 'signup'
                  ? 'bg-white text-black shadow-sm font-bold'
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              <UserCheck className="w-4 h-4 text-emerald-600" />
              Sign Up
            </button>
          </div>

          {/* SECONDARY TOGGLE (Inside Sign In): Authority vs Citizen */}
          {authMode === 'signin' && (
            <div className="flex gap-2 mb-6 bg-gray-50 border border-gray-200/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => switchLoginRoleType('authority')}
                className={`flex-1 py-2 px-3 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 transition-all ${
                  loginRoleType === 'authority'
                    ? 'bg-black text-white shadow-xs font-semibold'
                    : 'text-gray-500 hover:text-black'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Authority Portal
              </button>
              <button
                type="button"
                onClick={() => switchLoginRoleType('citizen')}
                className={`flex-1 py-2 px-3 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 transition-all ${
                  loginRoleType === 'citizen'
                    ? 'bg-black text-white shadow-xs font-semibold'
                    : 'text-gray-500 hover:text-black'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                Citizen User
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* AUTHORITY SIGN IN */}
            {authMode === 'signin' && loginRoleType === 'authority' && (
              <>
                {/* Select Authority Dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Select Authority Department
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <span className="text-black font-semibold flex items-center gap-2">
                        <span>{selectedAuthority.icon}</span>
                        <span>{selectedAuthority.name}</span>
                      </span>
                      <ChevronDown
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          showRoleDropdown ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <AnimatePresence>
                      {showRoleDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="absolute top-full mt-2 w-full bg-white border border-gray-200 rounded-2xl overflow-hidden z-20 shadow-xl"
                        >
                          {authorities.map((auth) => (
                            <button
                              key={auth.id}
                              type="button"
                              onClick={() => handleSelectAuthority(auth)}
                              className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between text-black ${
                                formData.role === auth.id ? 'bg-blue-50/60 font-semibold' : ''
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{auth.icon}</span>
                                <div>
                                  <div className="text-sm font-semibold">{auth.name}</div>
                                  <div className="text-xs text-gray-400">{auth.email}</div>
                                </div>
                              </div>
                              <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono font-medium">
                                Quick Select
                              </span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Official Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-4 py-3.5 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder="department@civic.com"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-12 py-3.5 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder="Enter password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5 text-gray-400" />
                      ) : (
                        <Eye className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* CITIZEN SIGN IN */}
            {authMode === 'signin' && loginRoleType === 'citizen' && (
              <>
                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-4 py-3.5 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder="Enter your email address"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-12 py-3.5 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5 text-gray-400" />
                      ) : (
                        <Eye className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* CITIZEN SIGN UP */}
            {authMode === 'signup' && (
              <>
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Your Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-4 py-3.5 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-4 py-3.5 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder="Enter your email address"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Create Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-12 py-3.5 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                      placeholder="Create a secure password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5 text-gray-400" />
                      ) : (
                        <Eye className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Role indicator badge */}
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-800">
                  <span className="text-base">👤</span>
                  <span>Registering as <strong>Citizen / Public User</strong></span>
                </div>
              </>
            )}

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-600 text-sm font-medium text-center bg-red-50 border border-red-200 py-2.5 px-4 rounded-xl"
              >
                ⚠️ {error}
              </motion.div>
            )}

            {/* Success Message */}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-emerald-700 text-sm font-medium text-center bg-emerald-50 border border-emerald-200 py-2.5 px-4 rounded-xl"
              >
                ✅ {success}
              </motion.div>
            )}

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full py-4 bg-black text-white font-semibold rounded-2xl transition-all shadow-md disabled:opacity-60 text-base"
            >
              {loading
                ? 'Processing...'
                : authMode === 'signin'
                ? loginRoleType === 'authority'
                  ? `Sign In as ${selectedAuthority.name}`
                  : 'Sign In as Citizen'
                : 'Create Citizen Account'}
            </motion.button>

            {/* Switch between Sign In and Sign Up footer link */}
            <p className="text-center text-sm text-gray-500 pt-2">
              {authMode === 'signin' ? (
                <>
                  New citizen?{' '}
                  <button
                    type="button"
                    onClick={() => switchAuthMode('signup')}
                    className="text-black font-semibold underline underline-offset-2"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => switchAuthMode('signin')}
                    className="text-black font-semibold underline underline-offset-2"
                  >
                    Sign In here
                  </button>
                </>
              )}
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
export default LoginPage;