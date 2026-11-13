import { useState } from 'react';
import { User, Mail, Phone, MapPin, Building, LogOut, Settings, Bell, Shield, Edit3, Check, X } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { api } from '../../../../api';

interface ProfilePageProps {
  onLogout?: () => void;
}

export function ProfilePage({ onLogout }: ProfilePageProps) {
  const [currentUser, setCurrentUser] = useState(() => api.getUser());
  const [name, setName] = useState(currentUser?.name || 'Administrator');
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(name);

  const userEmail = currentUser?.email || 'admin@civic.com';
  const userBadge = currentUser?.badge || 'ADM-001';

  const handleSaveName = () => {
    if (!editVal.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    const updated = { ...(currentUser || {}), name: editVal.trim() };
    api.setUser(updated);
    setCurrentUser(updated);
    setName(editVal.trim());
    setIsEditing(false);
    toast.success('Admin profile name updated successfully!');
  };

  const handleLogoutClick = () => {
    if (onLogout) {
      onLogout();
    } else {
      api.clearToken();
      window.location.reload();
    }
  };

  return (
    <div className="h-full bg-white pb-24 overflow-y-auto">
      {/* Header */}
      <div className="bg-gradient-to-b from-purple-600 to-purple-700 p-6 pb-20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Administrator Profile</h2>
          <button
            onClick={handleLogoutClick}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl flex items-center gap-1.5 text-xs font-bold text-white transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-2xl p-6 -mb-12 shadow-sm border border-gray-100">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-black shrink-0 shadow-md">
              {name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    className="w-full px-3 py-1.5 text-base font-bold text-black border border-purple-300 focus:border-purple-600 rounded-xl outline-none"
                    placeholder="Enter your name"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveName}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      onClick={() => { setEditVal(name); setIsEditing(false); }}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-black truncate">{name}</h3>
                    <button
                      onClick={() => { setEditVal(name); setIsEditing(true); }}
                      className="p-1 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                      title="Edit Name"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-500">City Municipal Administration Directorate</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Building className="w-4 h-4 text-purple-600" />
                    <span className="text-xs text-purple-600 font-bold">Admin ID #{userBadge}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-5 h-5 text-gray-400" />
              <span className="text-gray-700 font-medium">{userEmail}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Phone className="w-5 h-5 text-gray-400" />
              <span className="text-gray-700 font-medium">+91 (0831) 240-5000</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="w-5 h-5 text-gray-400" />
              <span className="text-gray-700 font-medium">City Municipal Authority Headquarters</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 pt-16 pb-6">
        {/* Menu Items */}
        <div className="space-y-2">
          {[
            { icon: Settings, label: 'System Configurations', color: 'blue' },
            { icon: Shield, label: 'Role-Based Access Control', color: 'purple' },
            { icon: Bell, label: 'City Alert Broadcaster', color: 'red' },
            { icon: Building, label: 'Municipal Department Integrations', color: 'green' }
          ].map((item) => (
            <motion.button
              key={item.label}
              whileTap={{ scale: 0.98 }}
              onClick={() => toast.info(item.label)}
              className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 bg-${item.color}-100 rounded-xl flex items-center justify-center`}>
                  <item.icon className={`w-5 h-5 text-${item.color}-600`} />
                </div>
                <span className="font-medium text-black">{item.label}</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </motion.button>
          ))}
        </div>

        {/* Big Logout Button */}
        <button
          onClick={handleLogoutClick}
          className="w-full mt-6 py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold flex items-center justify-center gap-2 border border-red-200 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign Out of Administrator Portal
        </button>
      </div>
    </div>
  );
}
