import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, auth, initMessaging } from './firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  Timestamp,
  setDoc,
  getDocs
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  User as FirebaseUser,
  updatePassword
} from 'firebase/auth';
import { 
  Scissors, 
  Calendar, 
  Clock, 
  Lock, 
  LogOut, 
  Settings, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ChevronLeft,
  Store,
  RefreshCcw,
  Bell,
  Send,
  Home,
  User,
  Power
} from 'lucide-react';
import { Appointment, AppointmentStatus, ShopSettings } from './types';
import { getToken } from 'firebase/messaging';

// --- CONSTANTS ---

const ADMIN_EMAIL = "admin@papodehomem.com"; // Hardcoded email for the specific password flow
const COOLDOWN_DAYS = 10;
const DEFAULT_SETTINGS: ShopSettings = {
  isOpen: true,
  openTime: "09:00",
  closeTime: "20:00",
  intervalMinutes: 40,
  blockedDates: [],
  workDays: [1, 2, 3, 4, 5, 6],
  releasedClients: []
};

// --- UTILS ---

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00'); 
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

const getStatusColor = (status: AppointmentStatus) => {
  switch (status) {
    case 'accepted': return 'text-[#04D361] bg-[#04D361]/10 border-[#04D361]/20';
    case 'cancelled': return 'text-textSecondary bg-surfaceHover border-surfaceHover';
    case 'pending': return 'text-warning bg-warning/10 border-warning/20';
    case 'waiting_approval': return 'text-warning bg-warning/10 border-warning/20';
    case 'suggestion_sent': return 'text-info bg-info/10 border-info/20';
    case 'completed': return 'text-primary bg-primary/10 border-primary/20';
    case 'rejected': return 'text-danger bg-danger/10 border-danger/20';
    default: return 'text-textSecondary';
  }
};

const getStatusLabel = (status: AppointmentStatus) => {
  switch (status) {
    case 'accepted': return 'Aceito';
    case 'cancelled': return 'Cancelado';
    case 'pending': return 'Pendente';
    case 'waiting_approval': return 'Aguardando aprovação';
    case 'suggestion_sent': return 'Sugestão enviada';
    case 'completed': return 'Concluído';
    case 'rejected': return 'Recusado';
    default: return status;
  }
};

// --- COMPONENTS ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }: any) => {
  const baseStyle = "w-full font-medium rounded-lg px-4 py-3 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-primary text-[#121214] hover:bg-primaryHover shadow-lg shadow-primary/20",
    secondary: "bg-surfaceHover text-text hover:bg-[#323238]",
    outline: "border border-surfaceHover text-text hover:bg-surfaceHover",
    danger: "bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20",
    success: "bg-success/10 text-success hover:bg-success/20 border border-success/20",
  };
  
  return (
    <button 
      onClick={onClick} 
      className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${className}`}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

const Input = ({ label, ...props }: any) => (
  <div className="flex flex-col gap-1.5 mb-4">
    {label && <label className="text-sm text-textSecondary font-medium">{label}</label>}
    <input 
      className="bg-surface border border-surfaceHover rounded-lg px-4 py-3 text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-gray-600"
      {...props}
    />
  </div>
);

const Card = ({ children, className = '' }: any) => (
  <div className={`bg-surface border border-surfaceHover rounded-xl p-5 ${className}`}>
    {children}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#121214] border border-surfaceHover w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
        <div className="p-4 border-b border-surfaceHover flex justify-between items-center bg-surface">
          <h3 className="font-serif font-bold text-lg text-primary">{title}</h3>
          <button onClick={onClose} className="text-textSecondary hover:text-text">
            <XCircle size={24} />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---

export default function App() {
  // State
  const [view, setView] = useState<'welcome' | 'home' | 'booking' | 'admin-login' | 'admin-dashboard'>('welcome');
  const [clientName, setClientName] = useState('');
  const [adminUser, setAdminUser] = useState<FirebaseUser | null>(null);
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Booking Form State
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Admin State
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminTab, setAdminTab] = useState<'pending' | 'today' | 'upcoming' | 'all'>('pending');

  // Load Settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'shop'), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as ShopSettings);
      } else {
        setDoc(doc.ref, DEFAULT_SETTINGS); // Create if not exists
      }
      setLoading(false);
    }, (error) => {
      console.error("Error loading settings:", error);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Load Appointments
  useEffect(() => {
    // IMPORTANT: Simplified query to avoid "Missing Index" errors on new projects.
    // Sorting is done client-side below.
    const q = query(collection(db, 'appointments'));
    
    const unsub = onSnapshot(q, (snapshot) => {
      const apps = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
      
      // Sort in memory: Newest dates first
      apps.sort((a, b) => {
        const dateA = new Date(a.date + 'T' + a.time);
        const dateB = new Date(b.date + 'T' + b.time);
        return dateB.getTime() - dateA.getTime();
      });

      setAppointments(apps);
    }, (error) => {
      console.error("Error loading appointments:", error);
      alert("Erro ao carregar agendamentos. Verifique o console ou as regras do Firestore.");
    });
    return () => unsub();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAdminUser(user);
    });
    return () => unsub();
  }, []);

  // Initialize Client
  useEffect(() => {
    const savedName = localStorage.getItem('barber_client_name');
    if (savedName) {
      setClientName(savedName);
      setView('home');
    }
  }, []);

  // --- ACTIONS ---

  const handleClientLogin = () => {
    if (!clientName.trim()) return;
    localStorage.setItem('barber_client_name', clientName.trim());
    setClientName(clientName.trim());
    setView('home');
  };

  const handleAdminLogin = async () => {
    try {
      setIsSubmitting(true);
      // Attempt login
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, adminPasswordInput);
      setView('admin-dashboard');
    } catch (error: any) {
      // If user doesn't exist, create it (First time setup for this demo)
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        try {
          if (adminPasswordInput === '12345678') {
             await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, '12345678');
             setView('admin-dashboard');
          } else {
            alert('Senha incorreta!');
          }
        } catch (createError: any) {
          alert('Erro ao criar admin: ' + createError.message);
        }
      } else {
        alert('Senha incorreta ou erro de login.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (newPass: string) => {
    if (adminUser) {
      try {
        await updatePassword(adminUser, newPass);
        alert('Senha atualizada com sucesso!');
      } catch (e) {
        alert('Erro ao atualizar senha. Faça login novamente.');
      }
    }
  };

  const toggleShopStatus = async () => {
    await updateDoc(doc(db, 'config', 'shop'), {
      isOpen: !settings.isOpen
    });
  };

  const checkCooldown = () => {
    if (settings.releasedClients?.includes(clientName)) return false;

    const lastCompleted = appointments
      .filter(a => a.clientName === clientName && a.status === 'completed')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (!lastCompleted) return false;

    const diffTime = Math.abs(new Date().getTime() - new Date(lastCompleted.date).getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    return diffDays < COOLDOWN_DAYS;
  };

  const hasActiveAppointment = () => {
    return appointments.some(a => 
      a.clientName === clientName && 
      ['pending', 'accepted', 'waiting_approval', 'suggestion_sent'].includes(a.status)
    );
  };

  const getAvailableSlots = (date: string) => {
    if (!date) return [];
    
    const dayOfWeek = new Date(date + 'T00:00:00').getDay(); // 0-6
    if (!settings.workDays.includes(dayOfWeek)) return []; // Closed that day

    const slots = [];
    let [currH, currM] = settings.openTime.split(':').map(Number);
    const [endH, endM] = settings.closeTime.split(':').map(Number);
    const endMinutes = endH * 60 + endM;

    while (currH * 60 + currM < endMinutes) {
      const timeString = `${String(currH).padStart(2, '0')}:${String(currM).padStart(2, '0')}`;
      
      // Check if booked
      const isBooked = appointments.some(a => 
        a.date === date && 
        a.time === timeString && 
        ['pending', 'accepted', 'waiting_approval', 'suggestion_sent', 'completed'].includes(a.status)
      );

      if (!isBooked) {
        slots.push(timeString);
      }

      currM += settings.intervalMinutes;
      if (currM >= 60) {
        currH += Math.floor(currM / 60);
        currM %= 60;
      }
    }
    return slots;
  };

  const handleBooking = async () => {
    if (!selectedDate || !selectedTime) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'appointments'), {
        clientName,
        date: selectedDate,
        time: selectedTime,
        status: 'pending',
        createdAt: Date.now()
      });
      alert('Agendamento enviado com sucesso!');
      setView('home');
      setSelectedDate('');
      setSelectedTime('');
    } catch (e: any) {
      console.error("Erro ao salvar no Firestore:", e);
      alert('Erro ao agendar: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: AppointmentStatus, extraData = {}) => {
    try {
      await updateDoc(doc(db, 'appointments', id), {
        status,
        ...extraData
      });
    } catch (e) {
      console.error("Error updating status:", e);
      alert("Erro ao atualizar status");
    }
  };

  const releaseClient = async (name: string) => {
    const currentList = settings.releasedClients || [];
    if (!currentList.includes(name)) {
      await updateDoc(doc(db, 'config', 'shop'), {
        releasedClients: [...currentList, name]
      });
      alert(`Cliente ${name} liberado do cooldown!`);
    }
  };

  // --- RENDER HELPERS ---

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center text-primary">Carregando...</div>;

  // VIEW: WELCOME
  if (view === 'welcome') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative">
        <div className="absolute top-6 right-6">
          <button onClick={() => setView('admin-login')} className="text-surfaceHover hover:text-textSecondary transition-colors">
            <Settings size={24} />
          </button>
        </div>

        <div className="bg-primary p-4 rounded-full mb-6 shadow-lg shadow-primary/20">
          <Scissors size={48} className="text-background" />
        </div>
        
        <h1 className="font-serif text-4xl text-primary font-bold mb-2 text-center">Papo de Homem</h1>
        <p className="text-textSecondary tracking-widest text-sm mb-12 uppercase">Barbearia</p>

        <Card className="w-full max-w-sm bg-surface/50 backdrop-blur-md border-surfaceHover/50">
          <h2 className="font-serif text-2xl text-text mb-2 text-center">Bem-vindo!</h2>
          <p className="text-textSecondary text-center mb-6 text-sm">Digite seu nome para começar a agendar</p>
          
          <Input 
            label="Seu nome" 
            placeholder="Ex: João Silva" 
            value={clientName}
            onChange={(e: any) => setClientName(e.target.value)}
          />
          
          <Button onClick={handleClientLogin} disabled={!clientName}>
            Continuar <Send size={18} />
          </Button>
        </Card>
        
        <p className="absolute bottom-6 text-xs text-textSecondary/50">
          © 2024 Papo de Homem Barbearia
        </p>
      </div>
    );
  }

  // VIEW: ADMIN LOGIN
  if (view === 'admin-login') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="absolute top-6 left-6">
           <button onClick={() => setView('welcome')} className="text-textSecondary hover:text-text">
             <ChevronLeft size={24} />
           </button>
        </div>
        
        <div className="bg-primary p-4 rounded-full mb-6 shadow-lg shadow-primary/20">
           <Scissors size={48} className="text-background" />
        </div>
        <h1 className="font-serif text-3xl text-primary font-bold mb-2">Papo de Homem</h1>
        <p className="text-textSecondary text-sm mb-12 uppercase">Barbearia</p>

        <Card className="w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <div className="bg-surfaceHover p-4 rounded-full">
              <Lock size={32} className="text-primary" />
            </div>
          </div>
          
          <h2 className="font-serif text-xl text-text mb-2 text-center">Área Administrativa</h2>
          <p className="text-textSecondary text-center mb-6 text-sm">Digite a senha para acessar o painel</p>
          
          <Input 
            type="password"
            placeholder="Senha" 
            className="text-center"
            value={adminPasswordInput}
            onChange={(e: any) => setAdminPasswordInput(e.target.value)}
          />
          
          <Button onClick={handleAdminLogin} disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </Button>

          <button 
            onClick={() => setView('welcome')}
            className="w-full mt-4 text-sm text-textSecondary hover:text-text"
          >
            Voltar para início
          </button>
        </Card>
      </div>
    );
  }

  // VIEW: CLIENT HOME & BOOKING
  if (view === 'home' || view === 'booking') {
    const myAppointments = appointments.filter(a => a.clientName === clientName);
    const isOnCooldown = checkCooldown();
    const activeApp = hasActiveAppointment();
    const canBook = !isOnCooldown && !activeApp && settings.isOpen;

    return (
      <div className="min-h-screen bg-background pb-20">
        {/* Header */}
        <div className="bg-surface/50 backdrop-blur-md sticky top-0 z-30 border-b border-surfaceHover px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-primary p-2 rounded-full">
                <Scissors size={20} className="text-background" />
             </div>
             <div>
               <h1 className="font-serif text-lg text-primary font-bold leading-tight">Papo de Homem</h1>
               <p className="text-[10px] text-textSecondary tracking-wider uppercase">Barbearia</p>
             </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-textSecondary">Olá,</span>
            <span className="font-medium text-text">{clientName}</span>
          </div>
        </div>

        <div className="p-6 max-w-lg mx-auto space-y-6">
          
          {/* Shop Status Banner */}
          {!settings.isOpen ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-4">
              <div className="bg-red-500/20 p-2 rounded-full">
                <Store className="text-red-500" size={24} />
              </div>
              <div>
                <h3 className="text-red-500 font-bold">Barbearia Fechada</h3>
                <p className="text-textSecondary text-sm">A barbearia está fechada no momento. Volte mais tarde!</p>
              </div>
            </div>
          ) : isOnCooldown ? (
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-start gap-4">
               <AlertCircle className="text-warning shrink-0 mt-1" size={20} />
               <div>
                 <h3 className="text-warning font-bold mb-1">Intervalo Necessário</h3>
                 <p className="text-textSecondary text-sm">Você concluiu um corte recentemente. Aguarde {COOLDOWN_DAYS} dias para agendar novamente.</p>
               </div>
            </div>
          ) : null}

          {/* Main Action Area */}
          {view === 'home' ? (
            <>
              <Button 
                onClick={() => setView('booking')}
                disabled={!canBook}
                className={!canBook ? 'opacity-50 grayscale' : ''}
              >
                + Agendar
              </Button>

              <div className="flex items-center justify-between mt-8 mb-4">
                <h2 className="font-serif text-xl text-text">Meus Agendamentos</h2>
                <span className="bg-surface px-2 py-1 rounded text-xs text-textSecondary border border-surfaceHover">
                  {myAppointments.length}
                </span>
              </div>

              {myAppointments.length === 0 ? (
                <div className="text-center py-10 text-textSecondary">
                  <Calendar size={48} className="mx-auto mb-3 opacity-20" />
                  <p>Nenhum agendamento encontrado.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myAppointments.map(app => (
                    <div key={app.id} className="bg-surface border border-surfaceHover rounded-xl p-4 relative overflow-hidden group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                           <User size={16} className="text-primary" />
                           <span className="font-medium text-text">{app.clientName}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(app.status)}`}>
                          {getStatusLabel(app.status)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-6 text-sm text-textSecondary">
                         <div className="flex items-center gap-2">
                           <Calendar size={14} />
                           {formatDate(app.date)}
                         </div>
                         <div className="flex items-center gap-2">
                           <Clock size={14} />
                           {app.time}
                         </div>
                      </div>

                      {/* Client Actions */}
                      {app.status === 'suggestion_sent' && (
                        <div className="mt-4 pt-4 border-t border-surfaceHover flex gap-2">
                          <p className="text-xs text-info w-full mb-2">Admin sugeriu: {app.suggestionTime}</p>
                          <Button 
                            variant="success" 
                            className="py-1 text-xs" 
                            onClick={() => updateStatus(app.id, 'accepted', { time: app.suggestionTime })}
                          >Aceitar</Button>
                           <Button 
                            variant="danger" 
                            className="py-1 text-xs" 
                            onClick={() => updateStatus(app.id, 'rejected')}
                          >Recusar</Button>
                        </div>
                      )}

                      {['pending', 'accepted'].includes(app.status) && (
                        <div className="mt-4 pt-4 border-t border-surfaceHover">
                           <button 
                             onClick={() => updateStatus(app.id, 'cancelled')}
                             className="text-xs text-danger hover:underline flex items-center gap-1"
                           >
                             <XCircle size={12} /> Cancelar agendamento
                           </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            // BOOKING FORM
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-6">
                <button onClick={() => setView('home')} className="bg-surface p-2 rounded-lg border border-surfaceHover text-textSecondary hover:text-text">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="font-serif text-xl text-text">Novo Agendamento</h2>
              </div>

              <Card>
                <Input label="Nome" value={clientName} disabled />
                
                <div className="mb-4">
                  <label className="text-sm text-textSecondary font-medium mb-1.5 block">Data</label>
                  <input 
                    type="date" 
                    min={new Date().toISOString().split('T')[0]}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-surface border border-surfaceHover rounded-lg px-4 py-3 text-text focus:border-primary focus:ring-1 focus:ring-primary [color-scheme:dark]"
                  />
                </div>

                {selectedDate && (
                  <div className="mb-6">
                    <label className="text-sm text-textSecondary font-medium mb-1.5 block">Horários Disponíveis</label>
                    <div className="grid grid-cols-4 gap-2">
                      {getAvailableSlots(selectedDate).map(time => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`py-2 rounded border text-sm transition-all ${
                            selectedTime === time 
                              ? 'bg-primary text-background border-primary font-bold' 
                              : 'bg-surfaceHover border-transparent text-text hover:border-primary/50'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                      {getAvailableSlots(selectedDate).length === 0 && (
                        <p className="col-span-4 text-sm text-textSecondary text-center py-2">Sem horários para este dia.</p>
                      )}
                    </div>
                  </div>
                )}

                <Button onClick={handleBooking} disabled={!selectedDate || !selectedTime || isSubmitting}>
                  {isSubmitting ? 'Enviando...' : 'Enviar Agendamento'}
                </Button>
              </Card>
            </div>
          )}

          <div className="flex justify-center mt-8">
            <button 
              onClick={() => { localStorage.removeItem('barber_client_name'); setView('welcome'); }}
              className="flex items-center gap-2 text-textSecondary text-sm hover:text-danger"
            >
              <LogOut size={16} /> Sair / Trocar Nome
            </button>
          </div>
        </div>
      </div>
    );
  }

  // VIEW: ADMIN DASHBOARD
  if (view === 'admin-dashboard') {
    // Admin Filters
    const filteredAppointments = appointments.filter(app => {
      if (adminTab === 'pending') return app.status === 'pending' || app.status === 'waiting_approval';
      if (adminTab === 'today') {
        const today = new Date().toISOString().split('T')[0];
        return app.date === today && app.status !== 'cancelled' && app.status !== 'rejected';
      }
      if (adminTab === 'upcoming') {
        const today = new Date().toISOString().split('T')[0];
        return app.date >= today && ['accepted', 'pending'].includes(app.status);
      }
      return true; // All
    });

    // Next Appointment Highlight
    const nextAppointment = appointments
      .filter(a => a.status === 'accepted' && new Date(a.date + 'T' + a.time) > new Date())
      .sort((a, b) => new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime())[0];

    return (
      <div className="min-h-screen bg-background">
        {/* Admin Header */}
        <div className="bg-surface border-b border-surfaceHover px-6 py-4 flex justify-between items-center sticky top-0 z-40">
           <h1 className="font-serif text-lg text-primary font-bold">Painel Admin</h1>
           <div className="flex items-center gap-4">
             <button onClick={toggleShopStatus} className={`px-3 py-1 rounded text-xs font-bold border ${settings.isOpen ? 'text-success border-success bg-success/10' : 'text-danger border-danger bg-danger/10'}`}>
               {settings.isOpen ? 'LOJA ABERTA' : 'LOJA FECHADA'}
             </button>
             <button onClick={() => { signOut(auth); setView('welcome'); }} className="text-textSecondary hover:text-text">
               Sair
             </button>
           </div>
        </div>

        <div className="p-6 max-w-4xl mx-auto space-y-6">
          
          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-4">
             <Card className="flex items-center justify-between">
               <div>
                 <span className="text-2xl font-bold text-text">{appointments.filter(a => a.status === 'pending').length}</span>
                 <p className="text-xs text-textSecondary uppercase">Pendentes</p>
               </div>
               <div className="bg-warning/10 p-2 rounded-full text-warning"><Bell size={20} /></div>
             </Card>
             <Card className="flex items-center justify-between">
               <div>
                 <span className="text-2xl font-bold text-text">{appointments.filter(a => a.date === new Date().toISOString().split('T')[0]).length}</span>
                 <p className="text-xs text-textSecondary uppercase">Hoje</p>
               </div>
               <div className="bg-primary/10 p-2 rounded-full text-primary"><Calendar size={20} /></div>
             </Card>
          </div>

          {/* Next Appointment Highlight */}
          {nextAppointment && (
            <div className="bg-gradient-to-r from-primary/20 to-surface border border-primary/30 rounded-xl p-5 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10"><Scissors size={100} /></div>
               <h3 className="text-primary font-serif font-bold text-lg mb-4 flex items-center gap-2">
                 <RefreshCcw size={18} className="animate-spin-slow" /> Próximo Atendimento
               </h3>
               <div className="flex justify-between items-end relative z-10">
                 <div>
                   <h2 className="text-2xl text-text font-bold">{nextAppointment.clientName}</h2>
                   <p className="text-textSecondary mt-1 flex items-center gap-2">
                     <Clock size={16} /> {nextAppointment.time} - {formatDate(nextAppointment.date)}
                   </p>
                 </div>
                 <Button 
                   className="w-auto px-6 py-2 text-sm"
                   onClick={() => updateStatus(nextAppointment.id, 'completed')}
                 >Concluir</Button>
               </div>
            </div>
          )}

          {/* Lists Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 border-b border-surfaceHover">
            {['pending', 'today', 'upcoming', 'all'].map((tab) => (
              <button
                key={tab}
                onClick={() => setAdminTab(tab as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  adminTab === tab 
                    ? 'bg-primary text-background' 
                    : 'text-textSecondary hover:text-text bg-surfaceHover/50'
                }`}
              >
                {tab === 'pending' ? 'Pendentes' : tab === 'today' ? 'Hoje' : tab === 'upcoming' ? 'Próximos' : 'Todos'}
              </button>
            ))}
          </div>

          {/* List Content */}
          <div className="space-y-3">
             {filteredAppointments.length === 0 && (
               <p className="text-center text-textSecondary py-8">Nenhum agendamento nesta lista.</p>
             )}
             {filteredAppointments.map(app => (
               <div key={app.id} className="bg-surface border border-surfaceHover rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-surfaceHover p-3 rounded-full">
                      <User className="text-textSecondary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-text flex items-center gap-2">
                        {app.clientName}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(app.status)}`}>
                          {getStatusLabel(app.status)}
                        </span>
                      </h4>
                      <p className="text-sm text-textSecondary flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1"><Calendar size={12}/> {formatDate(app.date)}</span>
                        <span className="flex items-center gap-1"><Clock size={12}/> {app.time}</span>
                      </p>
                    </div>
                  </div>

                  {/* Admin Actions */}
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {app.status === 'pending' && (
                      <>
                        <button onClick={() => updateStatus(app.id, 'accepted')} className="p-2 rounded bg-success/10 text-success border border-success/20 hover:bg-success/20">
                          <CheckCircle size={18} />
                        </button>
                        <button onClick={() => {
                          const newTime = prompt("Sugerir novo horário (HH:MM):", app.time);
                          if (newTime) updateStatus(app.id, 'suggestion_sent', { suggestionTime: newTime });
                        }} className="p-2 rounded bg-info/10 text-info border border-info/20 hover:bg-info/20">
                          <RefreshCcw size={18} />
                        </button>
                        <button onClick={() => updateStatus(app.id, 'rejected')} className="p-2 rounded bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20">
                          <XCircle size={18} />
                        </button>
                      </>
                    )}
                    {app.status === 'completed' && (
                      <button 
                        onClick={() => releaseClient(app.clientName)} 
                        className="text-xs px-3 py-1 bg-surfaceHover rounded text-textSecondary hover:text-primary border border-transparent hover:border-primary"
                      >
                        Liberar Cliente (Reset 10d)
                      </button>
                    )}
                  </div>
               </div>
             ))}
          </div>

        </div>
      </div>
    );
  }

  return null;
}