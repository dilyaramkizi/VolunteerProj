import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { 
  Clock, Trophy, MapPin, Edit3, CheckCircle2, X, AlertCircle, 
  Calendar, Users, Briefcase, TrendingUp, PlusCircle
} from 'lucide-react';

const API_BASE = (() => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:4000';
  }
  return '';
})();

const REGIONS = ['Almaty', 'Astana'];

interface Shift {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  volunteersNeeded: number;
}

interface Event {
  id: string;
  name: string;
  description: string;
  region: string;
  shifts?: Shift[];
  coordinatorId: string;
  coordinatorName: string;
  createdAt: string;
}

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
  decidedAt?: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [myEvents, setMyEvents] = useState<Event[]>([]);
  const [history, setHistory] = useState<JoinHistory[]>([]); // ← ДОБАВЛЕНО
  const [events, setEvents] = useState<Event[]>([]);
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
        if (!storedUser) {
          navigate('/login');
          return;
        }
        
        const currentUser: User = JSON.parse(storedUser);
        setUser(currentUser);
        setEditName(currentUser.name);
        setEditRegion(currentUser.region);
        setEditBirthDate(currentUser.birthDate?.split('T')[0] || '');
        
        // Load events (для смен)
        const eventsRes = await fetch(`${API_BASE}/api/items`);
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          const parsedEvents = eventsData.map((event: any) => ({
            ...event,
            shifts: event.shifts ? (typeof event.shifts === 'string' ? JSON.parse(event.shifts) : event.shifts) : []
          }));
          setEvents(parsedEvents);
          
          // If coordinator, load their created events
          if (currentUser.role === 'Coordinator') {
            const myEventsList = parsedEvents.filter((e: Event) => e.coordinatorId === currentUser.id);
            setMyEvents(myEventsList);
          }
        }
        
        // 🔧 ДОБАВЛЕНО: Load volunteer history for all users (both volunteer and coordinator)
        const joinsRes = await fetch(`${API_BASE}/api/users/${currentUser.id}/joins`);
        if (joinsRes.ok) {
          const joinsData = await joinsRes.json();
          setHistory(joinsData.filter((j: JoinHistory) => j.status === 'approved'));
        }
        
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadUserData();
  }, [navigate]);

  const getShiftDetails = (eventId: string, shiftName: string): Shift | null => {
    const event = events.find(e => e.id === eventId);
    if (!event || !event.shifts) return null;
    return event.shifts.find(s => s.name === shiftName) || null;
  };

  const isPastShift = (eventId: string, shiftName: string): boolean => {
    const shift = getShiftDetails(eventId, shiftName);
    if (!shift) return false;
    
    const [year, month, day] = shift.date.split('-');
    const [endHour, endMinute] = shift.endTime.split(':');
    const shiftEndDateTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(endHour), parseInt(endMinute));
    
    const now = new Date();
    return shiftEndDateTime < now;
  };

  const getShiftDurationInHours = (startTime: string, endTime: string): number => {
    const start = startTime.split(':').map(Number);
    const end = endTime.split(':').map(Number);
    
    let startMinutes = start[0] * 60 + (start[1] || 0);
    let endMinutes = end[0] * 60 + (end[1] || 0);
    
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60;
    }
    
    const durationMinutes = endMinutes - startMinutes;
    return durationMinutes / 60;
  };

  // Расчет часов для волонтера
  const getTotalHours = (): number => {
    let total = 0;
    history.forEach(join => {
      if (isPastShift(join.eventId, join.shift)) {
        const shift = getShiftDetails(join.eventId, join.shift);
        if (shift) {
          total += getShiftDurationInHours(shift.startTime, shift.endTime);
        } else {
          total += 4;
        }
      }
    });
    return total;
  };

  const getCompletedShiftsCount = (): number => {
    return history.filter(join => isPastShift(join.eventId, join.shift)).length;
  };

  const totalHours = getTotalHours();
  const completedShifts = getCompletedShiftsCount();
  const uniqueRegions = new Set(history.map(h => h.eventRegion)).size;

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

  const isCoordinator = user.role === 'Coordinator';

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Profile Header */}
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

      {/* Edit Profile Modal */}
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

      {/* Content based on role */}
      {isCoordinator ? (
        // Coordinator View - только мои события
        <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
          <h3 className="text-2xl font-extrabold text-slate-900 mb-8 flex items-center gap-2">
            <Briefcase size={24} className="text-orange-600" />
            Events I Created
          </h3>
          
          {myEvents.length === 0 ? (
            <div className="text-center py-12">
              <Calendar size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-lg font-medium text-slate-500">No events created yet</p>
              <p className="text-sm text-slate-400 mt-2">Create your first event to get started!</p>
              <Link 
                to="/dashboard/create-event"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 transition-colors"
              >
                <PlusCircle size={16} />
                Create Event
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {myEvents.map((event) => (
                <div key={event.id} className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 mb-1">{event.name}</h4>
                      <p className="text-sm text-slate-500">{event.region}</p>
                    </div>
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                      {event.shifts?.length || 0} shifts
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2 mb-3">{event.description}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      Created {new Date(event.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Volunteer View - статистика и история
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Stats Column */}
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
                    <p className="text-2xl font-black text-slate-900 tracking-tight">{totalHours.toFixed(1)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Trophy size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Completed Shifts</p>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">{completedShifts}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Locations Served</p>
                    <p className="text-2xl font-black text-slate-900 tracking-tight">{uniqueRegions}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* History Column */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm h-full">
              <h3 className="text-2xl font-extrabold text-slate-900 mb-8">Volunteering History</h3>
              
              {history.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-24 h-24 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                    <Users size={40} className="text-orange-600" />
                  </div>
                  <p className="text-lg font-medium text-slate-500">No volunteering history yet</p>
                  <p className="text-sm text-slate-400 mt-2">Join events to start building your impact!</p>
                  <Link 
                    to="/dashboard/opportunities"
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 transition-colors"
                  >
                    Find Opportunities
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => {
                    const shiftDetails = getShiftDetails(item.eventId, item.shift);
                    const isPast = isPastShift(item.eventId, item.shift);
                    
                    return (
                      <div key={item.id} className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                            {new Date(item.requestedAt).toLocaleDateString()}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                            isPast ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            <CheckCircle2 size={12} />
                            {isPast ? 'Completed' : 'Upcoming'}
                          </span>
                        </div>
                        <h4 className="text-lg font-bold text-slate-900 mb-1">{item.eventName}</h4>
                        <p className="text-sm font-medium text-slate-500">{item.eventRegion}</p>
                        {shiftDetails && (
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span className="bg-white px-2 py-1 rounded-lg border border-slate-200">
                              {item.shift}
                            </span>
                            <span className="bg-white px-2 py-1 rounded-lg border border-slate-200">
                              {shiftDetails.startTime} - {shiftDetails.endTime}
                            </span>
                            <span className="bg-white px-2 py-1 rounded-lg border border-slate-200">
                              {new Date(shiftDetails.date).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}