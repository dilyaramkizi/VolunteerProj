import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Clock, Trophy, MapPin, Edit3, CheckCircle2, X, AlertCircle } from 'lucide-react';

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (window.location.hostname === 'localhost' ? 'http://localhost:4000' : '');

const REGIONS = ['Almaty', 'Astana'];

interface User {
  id: string;
  name: string;
  email: string;
  role: 'Participant' | 'Coordinator';
  region: string;
  birthDate: string;
  photoUrl?: string;
}

interface JoinHistory {
  id: string;
  eventId: string;
  eventName: string;
  eventRegion: string;
  shift: string;
  status: string;
  requestedAt: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<JoinHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [editName, setEditName] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState('');

  useEffect(() => {
    const loadUserData = async () => {
      setIsLoading(true);
      try {
        const storedUser = localStorage.getItem('ngo_current_user');
        console.log('Loaded user:', storedUser); // Отладка
        
        if (!storedUser) {
          navigate('/login');
          return;
        }
        
        const currentUser: User = JSON.parse(storedUser);
        setUser(currentUser);
        setEditName(currentUser.name);
        setEditRegion(currentUser.region);
        setEditBirthDate(currentUser.birthDate?.split('T')[0] || '');
        
        const response = await fetch(`${API_BASE}/api/users/${currentUser.id}/joins`);
        if (response.ok) {
          const data = await response.json();
          setHistory(data.filter((h: JoinHistory) => h.status === 'approved'));
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadUserData();
  }, [navigate]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    try {
      const formData = new FormData();
      formData.append('name', editName);
      formData.append('region', editRegion);
      formData.append('birthDate', editBirthDate);
      if (editPhoto) {
        formData.append('photo', editPhoto);
      }
      
      const response = await fetch(`${API_BASE}/api/users/${user?.id}`, {
        method: 'PATCH',
        body: formData,
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Failed to update profile');
      
      localStorage.setItem('ngo_current_user', JSON.stringify(result.user));
      setUser(result.user);
      setSuccess('Profile updated successfully!');
      window.dispatchEvent(new CustomEvent('userChanged', { detail: result.user }));
      
      setTimeout(() => {
        setSuccess('');
        setIsEditing(false);
      }, 2000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 3000);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEditPhoto(file);
      const previewUrl = URL.createObjectURL(file);
      setEditPhotoPreview(previewUrl);
    }
  };

  const getStats = () => {
    const totalShifts = history.length;
    const totalHours = history.length * 4;
    const uniqueRegions = new Set(history.map(h => h.eventRegion)).size;
    return { totalHours, totalShifts, uniqueRegions };
  };

  const stats = user ? getStats() : { totalHours: 0, totalShifts: 0, uniqueRegions: 0 };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const getAvatarUrl = () => {
    if (editPhotoPreview) return editPhotoPreview;
    if (user.photoUrl) return `${API_BASE}${user.photoUrl}`;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=f97316&color=fff&bold=true`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div className="bg-white rounded-[2rem] p-8 md:p-10 border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-orange-50 to-teal-50 rounded-bl-full opacity-60 -z-0 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start md:items-center">
          <div className="relative">
            <img 
              src={getAvatarUrl()} 
              alt={user.name} 
              className="w-32 h-32 rounded-3xl object-cover border-4 border-white shadow-lg"
            />
            {!isEditing && (
              <button 
                onClick={() => setIsEditing(true)}
                className="absolute -bottom-3 -right-3 w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 transition-colors shadow-md border-2 border-white"
              >
                <Edit3 size={16} />
              </button>
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">{user.name}</h1>
                <p className="text-lg font-medium text-slate-500 mt-1">{user.region}, Kazakhstan</p>
                <p className="text-sm text-slate-400 mt-1">{user.email}</p>
              </div>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 text-orange-700 text-sm font-bold uppercase tracking-widest">
                {user.role === 'Participant' ? 'Volunteer' : 'Coordinator'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Edit Profile</h2>
              <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            {error && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2">
                <AlertCircle size={16} /> {error}
              </div>
            )}
            
            {success && (
              <div className="mb-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-600 flex items-center gap-2">
                <CheckCircle2 size={16} /> {success}
              </div>
            )}
            
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-500 outline-none"
                  required
                />
              </div>
              
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">Region</label>
                <select 
                  value={editRegion}
                  onChange={(e) => setEditRegion(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-500 outline-none"
                  required
                >
                  {REGIONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">Date of Birth</label>
                <input 
                  type="date" 
                  value={editBirthDate}
                  onChange={(e) => setEditBirthDate(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-500 outline-none"
                  required
                />
              </div>
              
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">Profile Photo</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  type="submit"
                  className="flex-1 bg-orange-600 text-white py-2 rounded-xl font-semibold hover:bg-orange-700 transition-colors"
                >
                  Save Changes
                </button>
                <button 
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="space-y-8">
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
            <h3 className="text-lg font-extrabold text-slate-900 mb-6">Impact Summary</h3>
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Clock size={24} />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Total Hours</p>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{stats.totalHours}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Trophy size={24} />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Completed Shifts</p>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{stats.totalShifts}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <MapPin size={24} />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Locations Served</p>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{stats.uniqueRegions}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm h-full">
            <h3 className="text-2xl font-extrabold text-slate-900 mb-8">Volunteering History</h3>
            
            {history.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-lg font-medium text-slate-500">No volunteering history yet</p>
                <p className="text-sm text-slate-400 mt-2">Join events to start building your impact!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div key={item.id} className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                        {new Date(item.requestedAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 size={12} /> Completed
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 mb-1">{item.eventName}</h4>
                    <p className="text-sm font-medium text-slate-500">{item.eventRegion}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs bg-white px-2 py-1 rounded-lg text-slate-600 border border-slate-200">
                        {item.shift}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
