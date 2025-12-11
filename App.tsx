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
  Power,
  Key,
  Info,
  CalendarOff,
  Trash2,
  Users,
  PlusCircle
} from 'lucide-react';
import { Appointment, AppointmentStatus, ShopSettings } from './types';
import { getToken, onMessage } from 'firebase/messaging';

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
  releasedClients: [],
  lunchStart: "12:00",
  lunchEnd: "13:00"
};

// --- UTILS ---

const formatDate = (dateStr: any) => {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const date = new Date(dateStr + 'T00:00:00'); 
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

const getStatusColor = (status: AppointmentStatus) => {
  switch (status) {
    case 'aceito': return 'text-[#04D361] bg-[#04D361]/10 border-[#04D361]/20';
    case 'cancelado': return 'text-textSecondary bg-surfaceHover border-surfaceHover';
    case 'aguardando_aprovacao': return 'text-warning bg-warning/10 border-warning/20';
    case 'aguardando_nova_aprovacao': return 'text-warning bg-warning/10 border-warning/20';
    case 'sugestao_enviada_admin': return 'text-info bg-info/10 border-info/20';
    case 'concluido': return 'text-primary bg-primary/10 border-primary/20';
    default: return 'text-textSecondary';
  }
};

const getStatusLabel = (status: AppointmentStatus) => {
  switch (status) {
    case 'aceito': return 'Aceito';
    case 'cancelado': return 'Cancelado';
    case 'aguardando_aprovacao': return 'Pendente';
    case 'aguardando_nova_aprovacao': return 'Aguardando aprovação'; 
    case 'sugestao_enviada_admin': return 'Sugestão enviada';
    case 'concluido': return 'Concluído';
    default: return status;
  }
};

const WEEKDAYS = [
  { id: 0, label: 'Dom' },
  { id: 1, label: 'Seg' },
  { id: 2, label: 'Ter' },
  { id: 3, label: 'Qua' },
  { id: 4, label: 'Qui' },
  { id: 5, label: 'Sex' },
  { id: 6, label: 'Sáb' },
];

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
  <div className="flex flex-col gap-1.5 mb-4 w-full">
    {label && <label className="text-sm text-textSecondary font-medium">{label}</label>}
    <input 
      className="w-full bg-surface border border-surfaceHover rounded-lg px-4 py-3 text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-gray-600 disabled:opacity-50"
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
      <div className="bg-[#121214] border border-surfaceHover w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fade-in max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-surfaceHover flex justify-between items-center bg-surface shrink-0">
          <h3 className="font-serif font-bold text-lg text-primary">{title}</h3>
          <button onClick={onClose} className="text-textSecondary hover:text-text">
            <XCircle size={24} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
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
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  
  // Booking Form State
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rescheduleApp, setRescheduleApp] = useState<Appointment | null>(null);

  // Admin State
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminTab, setAdminTab] = useState<'pending' | 'today' | 'upcoming' | 'all' | 'clients' | 'config'>('pending');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  
  // Suggestion Modal State
  const [showSuggestionModal, setShowSuggestionModal] = useState<Appointment | null>(null);
  const [suggestionDate, setSuggestionDate] = useState('');
  const [suggestionTime, setSuggestionTime] = useState('');

  // Manual Booking Modal State
  const [showManualBookModal, setShowManualBookModal] = useState(false);
  const [manualClientName, setManualClientName] = useState('');

  // Settings Temp State
  const [tempSettings, setTempSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [newHoliday, setNewHoliday] = useState('');

  // Load Settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'shop'), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as ShopSettings;
        setSettings(data);
        setTempSettings(data); // Sync temp state
      } else {
        setDoc(doc.ref, DEFAULT_SETTINGS); 
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

  // Initialize Client & FCM
  useEffect(() => {
    const savedName = localStorage.getItem('barber_client_name');
    if (savedName) {
      setClientName(savedName);
      setView('home');
    }

    const requestFCM = async () => {
      try {
        const messaging = await initMessaging();
        if (messaging) {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            const token = await getToken(messaging, { vapidKey: "BPp...YOUR_VAPID_KEY..." });
            setFcmToken(token);
            onMessage(messaging, (payload) => {
              alert(`Nova notificação: ${payload.notification?.title} - ${payload.notification?.body}`);
            });
          }
        }
      } catch(e) {
        console.log("FCM Error", e);
      }
    };
    requestFCM();

  }, []);

  // --- ACTIONS ---

  const sendPushNotification = async (token: string, title: string, body: string) => {
    console.log("SENDING PUSH TO:", token, title, body);
  };

  const handleClientLogin = () => {
    if (!clientName.trim()) return;
    localStorage.setItem('barber_client_name', clientName.trim());
    setClientName(clientName.trim());
    setView('home');
  };

  const handleAdminLogin = async () => {
    try {
      setIsSubmitting(true);
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, adminPasswordInput);
      setView('admin-dashboard');
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        if (adminPasswordInput === '12345678') {
           try {
             await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, '12345678');
             setView('admin-dashboard');
           } catch(e) {}
        } else {
          alert('Senha incorreta!');
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
        return true;
      } catch (e) {
        alert('Erro ao atualizar senha. Faça login novamente.');
        return false;
      }
    }
    return false;
  };

  const toggleShopStatus = async () => {
    const newState = !settings.isOpen;
    await updateDoc(doc(db, 'config', 'shop'), {
      isOpen: newState
    });
  };

  const saveSettings = async () => {
    try {
      await updateDoc(doc(db, 'config', 'shop'), tempSettings);
      alert('Configurações salvas com sucesso!');
    } catch (e) {
      alert('Erro ao salvar configurações.');
    }
  };

  const checkCooldown = () => {
    if (settings.releasedClients?.includes(clientName)) return false;

    const lastCompleted = appointments
      .filter(a => a.clientName === clientName && a.status === 'concluido')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (!lastCompleted) return false;

    const diffTime = Math.abs(new Date().getTime() - new Date(lastCompleted.date).getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    return diffDays < COOLDOWN_DAYS;
  };

  const hasActiveAppointment = () => {
    return appointments.some(a => 
      a.clientName === clientName && 
      ['aguardando_aprovacao', 'aceito', 'aguardando_nova_aprovacao', 'sugestao_enviada_admin'].includes(a.status)
    );
  };

  const generateTimeSlots = (date: string) => {
    if (!date) return [];
    
    // Check Holiday
    if (settings.blockedDates.includes(date)) return [];

    // Check Work Day
    const dayOfWeek = new Date(date + 'T00:00:00').getDay(); // 0-6
    if (!settings.workDays.includes(dayOfWeek)) return []; // Closed that day

    const slots = [];
    let [currH, currM] = settings.openTime.split(':').map(Number);
    const [endH, endM] = settings.closeTime.split(':').map(Number);
    
    // Lunch Break
    let lunchStartH, lunchStartM, lunchEndH, lunchEndM;
    if (settings.lunchStart && settings.lunchEnd) {
       [lunchStartH, lunchStartM] = settings.lunchStart.split(':').map(Number);
       [lunchEndH, lunchEndM] = settings.lunchEnd.split(':').map(Number);
    }

    const endMinutes = endH * 60 + endM;
    const lunchStartMinutes = lunchStartH !== undefined ? lunchStartH * 60 + lunchStartM! : -1;
    const lunchEndMinutes = lunchEndH !== undefined ? lunchEndH * 60 + lunchEndM! : -1;

    while (currH * 60 + currM < endMinutes) {
      const currentTotal = currH * 60 + currM;
      
      // Skip if inside lunch break
      if (lunchStartMinutes !== -1 && currentTotal >= lunchStartMinutes && currentTotal < lunchEndMinutes) {
         // Skip forward
         currM += settings.intervalMinutes;
         if (currM >= 60) { currH += Math.floor(currM/60); currM %= 60; }
         continue;
      }

      const timeString = `${String(currH).padStart(2, '0')}:${String(currM).padStart(2, '0')}`;
      slots.push(timeString);

      currM += settings.intervalMinutes;
      if (currM >= 60) {
        currH += Math.floor(currM / 60);
        currM %= 60;
      }
    }
    return slots;
  };

  const isSlotBooked = (date: string, time: string, excludeAppId?: string) => {
    return appointments.some(a => 
      a.date === date && 
      a.time === time && 
      a.id !== excludeAppId && 
      ['aguardando_aprovacao', 'aceito', 'aguardando_nova_aprovacao', 'sugestao_enviada_admin', 'concluido'].includes(a.status)
    );
  };

  const handleBooking = async () => {
    if (!selectedDate || !selectedTime) return;
    
    if (isSlotBooked(selectedDate, selectedTime, rescheduleApp?.id)) {
      alert('Este horário já está ocupado. Por favor, escolha outro.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (rescheduleApp) {
        await updateDoc(doc(db, 'appointments', rescheduleApp.id), {
          date: selectedDate,
          time: selectedTime,
          status: 'aguardando_nova_aprovacao',
          suggestionTime: null
        });
        alert('Agendamento remarcado com sucesso! Aguarde nova aprovação.');
      } else {
        await addDoc(collection(db, 'appointments'), {
          clientName,
          date: selectedDate,
          time: selectedTime,
          status: 'aguardando_aprovacao',
          createdAt: Date.now(),
          deviceToken: fcmToken
        });
        alert('Agendamento enviado com sucesso!');
      }
      
      setView('home');
      setSelectedDate('');
      setSelectedTime('');
      setRescheduleApp(null);
    } catch (e: any) {
      alert('Erro ao agendar: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (id: string, AppointmentStatus, extraData = {}) => {
    try {
      await updateDoc(doc(db, 'appointments', id), {
        status: AppointmentStatus,
        ...extraData
      });

      const app = appointments.find(a => a.id === id);
      if (app && app.deviceToken) {
        let title = "Atualização no Agendamento";
        let body = `Seu status mudou para: ${getStatusLabel(AppointmentStatus)}`;

        if (AppointmentStatus === 'aceito') {
           title = "Agendamento Aceito! ✅";
           body = `Seu horário de ${app.time} foi confirmado.`;
        } else if (AppointmentStatus === 'sugestao_enviada_admin') {
           title = "Nova Sugestão 🕒";
           body = `O barbeiro sugeriu um novo horário. Confira no app.`;
        } else if (AppointmentStatus === 'concluido') {
           title = "Atendimento Concluído ✂️";
           body = "Obrigado pela preferência! Volte sempre.";
        } else if (AppointmentStatus === 'cancelado') {
           title = "Agendamento Recusado/Cancelado ❌";
           body = "Seu agendamento foi cancelado.";
        }

        await sendPushNotification(app.deviceToken, title, body);
      }

    } catch (e) {
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

  const handleManualBooking = async () => {
    if (!manualClientName || !selectedDate || !selectedTime) return;
    
    if (isSlotBooked(selectedDate, selectedTime)) {
      alert('Este horário já está ocupado.');
      return;
    }

    try {
      await addDoc(collection(db, 'appointments'), {
        clientName: manualClientName,
        date: selectedDate,
        time: selectedTime,
        status: 'aceito',
        createdAt: Date.now(),
        adminNote: 'Agendamento manual'
      });
      alert('Agendamento manual criado com sucesso!');
      setShowManualBookModal(false);
      setManualClientName('');
      setSelectedDate('');
      setSelectedTime('');
    } catch(e: any) {
      alert('Erro: ' + e.message);
    }
  };

  // --- RENDER ---

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

          {view === 'home' ? (
            <>
              <Button 
                onClick={() => {
                  setRescheduleApp(null);
                  setView('booking');
                }}
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

                      {app.status === 'sugestao_enviada_admin' && (
                        <div className="mt-4 pt-4 border-t border-surfaceHover bg-surfaceHover/50 p-3 rounded-lg">
                           <div className="flex items-center gap-2 mb-3">
                              <Info size={16} className="text-info" />
                              <div className="text-sm">
                                 <p className="text-textSecondary text-xs">Sugestão do Barbeiro:</p>
                                 <p className="font-bold text-info text-lg">{app.suggestionTime}</p>
                              </div>
                           </div>
                           
                           <div className="space-y-2">
                              <Button 
                                variant="success" 
                                className="py-2 text-xs w-full" 
                                onClick={() => updateStatus(app.id, 'aceito', { time: app.suggestionTime, suggestionTime: null })}
                              >Aceitar Sugestão</Button>
                              
                              <div className="grid grid-cols-2 gap-2">
                                <Button 
                                  variant="danger" 
                                  className="py-2 text-xs bg-danger/10 border-danger/20" 
                                  onClick={() => updateStatus(app.id, 'aguardando_nova_aprovacao', { suggestionTime: null })}
                                >Recusar</Button>
                                
                                <Button 
                                  variant="secondary" 
                                  className="py-2 text-xs"
                                   onClick={() => {
                                     setRescheduleApp(app);
                                     setView('booking');
                                   }}
                                >Outro Horário</Button>
                              </div>
                           </div>
                        </div>
                      )}

                      {/* Reschedule Button */}
                      {['aguardando_aprovacao', 'aceito', 'concluido'].includes(app.status) && (
                         <div className="mt-4 pt-4 border-t border-surfaceHover">
                           <Button 
                             variant="secondary" 
                             className="py-2 text-sm"
                             onClick={() => {
                               setRescheduleApp(app);
                               setView('booking');
                             }}
                           >
                             <RefreshCcw size={16} /> Remarcar
                           </Button>
                         </div>
                      )}

                      {/* Cancel Button (Only if not completed) */}
                      {['aguardando_aprovacao', 'aceito'].includes(app.status) && (
                        <div className="mt-3 flex justify-end">
                           <button 
                             onClick={() => updateStatus(app.id, 'cancelado')}
                             className="text-xs text-danger hover:underline flex items-center gap-1"
                           >
                             <XCircle size={12} /> Cancelar
                           </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-6">
                <button onClick={() => { setView('home'); setRescheduleApp(null); }} className="bg-surface p-2 rounded-lg border border-surfaceHover text-textSecondary hover:text-text">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="font-serif text-xl text-text">
                  {rescheduleApp ? 'Remarcar' : 'Novo Agendamento'}
                </h2>
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
                      {generateTimeSlots(selectedDate).map(time => {
                        const isTaken = isSlotBooked(selectedDate, time, rescheduleApp?.id);
                        return (
                          <button
                            key={time}
                            onClick={() => !isTaken && setSelectedTime(time)}
                            disabled={isTaken}
                            className={`py-2 rounded border text-sm transition-all relative ${
                              isTaken 
                                ? 'bg-surface border-transparent text-textSecondary line-through cursor-not-allowed opacity-50' 
                                : selectedTime === time 
                                  ? 'bg-primary text-background border-primary font-bold' 
                                  : 'bg-surfaceHover border-transparent text-text hover:border-primary/50'
                            }`}
                          >
                            {time}
                          </button>
                        );
                      })}
                      {generateTimeSlots(selectedDate).length === 0 && (
                        <p className="col-span-4 text-sm text-textSecondary text-center py-2">Sem horários para este dia.</p>
                      )}
                    </div>
                  </div>
                )}
                <Button onClick={handleBooking} disabled={!selectedDate || !selectedTime || isSubmitting}>
                  {isSubmitting ? 'Enviando...' : (rescheduleApp ? 'Confirmar Remarcação' : 'Enviar Agendamento')}
                </Button>
              </Card>
            </div>
          )}

          <div className="flex justify-center mt-8">
            <button 
              onClick={() => { localStorage.removeItem('barber_client_name'); setView('welcome'); }}
              className="flex items-center gap-2 text-textSecondary text-sm hover:text-text transition-colors"
            >
              <ChevronLeft size={16} /> Voltar tela inicial
            </button>
          </div>
        </div>
      </div>
    );
  }

  // VIEW: ADMIN DASHBOARD
  if (view === 'admin-dashboard') {
    const filteredAppointments = appointments.filter(app => {
      if (adminTab === 'pending') return app.status === 'aguardando_aprovacao' || app.status === 'aguardando_nova_aprovacao' || app.status === 'sugestao_enviada_admin';
      if (adminTab === 'today') {
        const today = new Date().toISOString().split('T')[0];
        return app.date === today && app.status !== 'cancelado';
      }
      if (adminTab === 'upcoming') {
        const today = new Date().toISOString().split('T')[0];
        return app.date >= today && ['aceito', 'aguardando_aprovacao'].includes(app.status);
      }
      return true;
    });

    const nextAppointment = appointments
      .filter(a => a.status === 'aceito' && new Date(a.date + 'T' + a.time) > new Date())
      .sort((a, b) => new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime())[0];

    // Unique Clients Logic
    const uniqueClients = Array.from(new Set(appointments.map(a => a.clientName))).map(name => {
      const history = appointments.filter(a => a.clientName === name);
      // Sort history desc
      history.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const lastApp = history[0];
      return { name, history, lastApp };
    });

    return (
      <div className="min-h-screen bg-background">
        <div className="bg-surface border-b border-surfaceHover px-6 py-4 flex justify-between items-center sticky top-0 z-40">
           <h1 className="font-serif text-lg text-primary font-bold">Painel Admin</h1>
           <div className="flex items-center gap-4">
             <button onClick={toggleShopStatus} className={`px-3 py-1 rounded text-xs font-bold border ${settings.isOpen ? 'text-success border-success bg-success/10' : 'text-danger border-danger bg-danger/10'}`}>
               {settings.isOpen ? 'LOJA ABERTA' : 'LOJA FECHADA'}
             </button>
             
             <button onClick={() => setAdminTab('config')} className="text-textSecondary hover:text-text p-1" title="Configurações">
               <Settings size={20} />
             </button>

             <button onClick={() => setShowPasswordModal(true)} className="text-textSecondary hover:text-text p-1" title="Alterar Senha">
               <Key size={20} />
             </button>

             <button onClick={() => { signOut(auth); setView('welcome'); }} className="text-textSecondary hover:text-text">
               Sair
             </button>
           </div>
        </div>

        <div className="p-6 max-w-4xl mx-auto space-y-6">
          
          {/* Create Manual Button */}
          {adminTab === 'pending' && (
             <div className="flex justify-end">
               <Button className="w-auto px-4 py-2" onClick={() => setShowManualBookModal(true)}>
                 <PlusCircle size={18} /> Novo Agendamento
               </Button>
             </div>
          )}

          {adminTab === 'config' ? (
            <div className="animate-fade-in space-y-6">
               <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setAdminTab('pending')}><ChevronLeft/></button>
                  <h2 className="text-xl font-bold">Configurações da Loja</h2>
               </div>

               <Card>
                 <h3 className="font-bold text-lg mb-4 text-primary">Horário de Funcionamento</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <Input label="Abertura" type="time" value={tempSettings.openTime} onChange={(e: any) => setTempSettings({...tempSettings, openTime: e.target.value})} />
                    <Input label="Fechamento" type="time" value={tempSettings.closeTime} onChange={(e: any) => setTempSettings({...tempSettings, closeTime: e.target.value})} />
                 </div>
                 <Input label="Intervalo entre Cortes (minutos)" type="number" value={tempSettings.intervalMinutes} onChange={(e: any) => setTempSettings({...tempSettings, intervalMinutes: parseInt(e.target.value)})} />
               </Card>

               <Card>
                 <h3 className="font-bold text-lg mb-4 text-primary">Dias de Trabalho</h3>
                 <div className="flex flex-wrap gap-2">
                   {WEEKDAYS.map(day => (
                     <button
                       key={day.id}
                       onClick={() => {
                         const current = tempSettings.workDays;
                         if (current.includes(day.id)) {
                           setTempSettings({...tempSettings, workDays: current.filter(d => d !== day.id)});
                         } else {
                           setTempSettings({...tempSettings, workDays: [...current, day.id]});
                         }
                       }}
                       className={`px-3 py-2 rounded text-sm border transition-all ${
                         tempSettings.workDays.includes(day.id) 
                           ? 'bg-primary text-background border-primary font-bold' 
                           : 'bg-surface border-surfaceHover text-textSecondary hover:border-primary/50'
                       }`}
                     >
                       {day.label}
                     </button>
                   ))}
                 </div>
               </Card>

               <Card>
                 <h3 className="font-bold text-lg mb-4 text-primary">Pausa / Almoço</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <Input label="Início" type="time" value={tempSettings.lunchStart || ''} onChange={(e: any) => setTempSettings({...tempSettings, lunchStart: e.target.value})} />
                    <Input label="Fim" type="time" value={tempSettings.lunchEnd || ''} onChange={(e: any) => setTempSettings({...tempSettings, lunchEnd: e.target.value})} />
                 </div>
               </Card>

               <Card>
                 <h3 className="font-bold text-lg mb-4 text-primary">Feriados / Dias Bloqueados</h3>
                 <div className="flex gap-2 mb-4">
                   <input type="date" className="bg-surface border border-surfaceHover rounded px-3 py-2" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} />
                   <Button className="w-auto px-4 py-2" onClick={() => {
                     if (newHoliday && !tempSettings.blockedDates.includes(newHoliday)) {
                       setTempSettings({...tempSettings, blockedDates: [...tempSettings.blockedDates, newHoliday]});
                       setNewHoliday('');
                     }
                   }}>Adicionar</Button>
                 </div>
                 <div className="flex flex-wrap gap-2">
                   {tempSettings.blockedDates.map(date => (
                     <div key={date} className="bg-surfaceHover px-3 py-1 rounded-full text-xs flex items-center gap-2 border border-surfaceHover">
                       <CalendarOff size={12} /> {formatDate(date)}
                       <button onClick={() => setTempSettings({...tempSettings, blockedDates: tempSettings.blockedDates.filter(d => d !== date)})} className="text-danger hover:text-white"><XCircle size={14}/></button>
                     </div>
                   ))}
                 </div>
               </Card>

               <Button onClick={saveSettings}>Salvar Configurações</Button>
            </div>
          ) : adminTab === 'clients' ? (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setAdminTab('pending')}><ChevronLeft/></button>
                  <h2 className="text-xl font-bold">Gerenciar Clientes</h2>
              </div>
              <div className="space-y-4">
                {uniqueClients.length === 0 && <p className="text-textSecondary text-center">Nenhum cliente registrado.</p>}
                {uniqueClients.map(c => (
                  <div key={c.name} className="bg-surface border border-surfaceHover p-4 rounded-lg flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-lg text-text flex items-center gap-2">
                        <Users size={18} className="text-primary"/> {c.name}
                      </h3>
                      <p className="text-sm text-textSecondary mt-1">Último corte: {c.lastApp ? formatDate(c.lastApp.date) : 'N/A'}</p>
                      <p className="text-xs text-textSecondary">Total de visitas: {c.history.filter(h => h.status === 'concluido').length}</p>
                    </div>
                    
                    <button 
                      onClick={() => releaseClient(c.name)}
                      className="px-3 py-2 bg-surfaceHover border border-surfaceHover rounded hover:border-primary text-xs transition-all text-textSecondary hover:text-white"
                    >
                      Liberar Bloqueio (10d)
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Card className="flex items-center justify-between">
                  <div>
                    <span className="text-2xl font-bold text-text">{appointments.filter(a => a.status === 'aguardando_aprovacao').length}</span>
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

              {nextAppointment && (
                <div className="bg-gradient-to-r from-primary/20 to-surface border border-primary/30 rounded-xl p-5 relative overflow-hidden mt-6">
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
                      onClick={() => updateStatus(nextAppointment.id, 'concluido')}
                    >Concluir</Button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-2 border-b border-surfaceHover mt-6">
                {[
                  { id: 'pending', label: 'Pendentes' },
                  { id: 'today', label: 'Hoje' },
                  { id: 'upcoming', label: 'Próximos' },
                  { id: 'all', label: 'Todos' },
                  { id: 'clients', label: 'Clientes' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setAdminTab(tab.id as any)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      adminTab === tab.id 
                        ? 'bg-primary text-background' 
                        : 'text-textSecondary hover:text-text bg-surfaceHover/50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 mt-4">
                {adminTab !== 'clients' && adminTab !== 'config' && (
                  <>
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
                              
                              {app.status === 'aguardando_nova_aprovacao' && (
                                <p className="text-xs text-warning font-bold mt-1 flex items-center gap-1">
                                  <RefreshCcw size={12} /> Cliente solicitou remarcação
                                </p>
                              )}
                              
                              {app.status === 'sugestao_enviada_admin' && (
                                <p className="text-xs text-info font-bold mt-1 flex items-center gap-1">
                                  <Info size={12} /> Sugestão enviada para cliente
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 md:justify-end">
                            {(app.status === 'aguardando_aprovacao' || app.status === 'aguardando_nova_aprovacao') && (
                              <>
                                <button onClick={() => updateStatus(app.id, 'aceito')} className="flex items-center gap-1 px-3 py-2 rounded bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-colors text-xs font-bold uppercase tracking-wide">
                                  <CheckCircle size={16} /> Aceitar
                                </button>
                                <button onClick={() => {
                                  setSuggestionDate(app.date); // Use appointment date for suggestion context
                                  setSuggestionTime('');
                                  setShowSuggestionModal(app);
                                }} className="flex items-center gap-1 px-3 py-2 rounded bg-info/10 text-info border border-info/20 hover:bg-info/20 transition-colors text-xs font-bold uppercase tracking-wide">
                                  <RefreshCcw size={16} /> Sugerir Horário
                                </button>
                                <button onClick={() => updateStatus(app.id, 'cancelado')} className="flex items-center gap-1 px-3 py-2 rounded bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 transition-colors text-xs font-bold uppercase tracking-wide">
                                  <XCircle size={16} /> Recusar
                                </button>
                              </>
                            )}
                            {app.status === 'concluido' && (
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
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <Modal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="Alterar Senha de Admin">
          <div className="space-y-4">
             <p className="text-sm text-textSecondary">Digite a nova senha para o acesso administrativo.</p>
             <Input 
               type="password"
               placeholder="Nova senha (mín. 6 caracteres)"
               value={newPassword}
               onChange={(e: any) => setNewPassword(e.target.value)}
             />
             <Button onClick={async () => {
                if(newPassword.length < 6) {
                  alert('A senha deve ter no mínimo 6 caracteres');
                  return;
                }
                const success = await handleChangePassword(newPassword);
                if (success) {
                  setShowPasswordModal(false);
                  setNewPassword('');
                }
             }}>
               Salvar Nova Senha
             </Button>
          </div>
        </Modal>

        {/* Suggestion Modal with Grid */}
        <Modal isOpen={!!showSuggestionModal} onClose={() => setShowSuggestionModal(null)} title="Sugerir Novo Horário">
          <div className="space-y-4">
             <p className="text-sm text-textSecondary">
               Sugerir para <strong>{showSuggestionModal?.clientName}</strong> no dia:
             </p>
             <input 
               type="date" 
               className="w-full bg-surface border border-surfaceHover rounded-lg px-4 py-3 text-text focus:border-primary focus:ring-1 focus:ring-primary [color-scheme:dark]"
               value={suggestionDate}
               onChange={(e) => setSuggestionDate(e.target.value)}
             />
             
             {suggestionDate && (
               <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                 {generateTimeSlots(suggestionDate).map(time => {
                   const isTaken = isSlotBooked(suggestionDate, time, showSuggestionModal?.id);
                   return (
                     <button
                       key={time}
                       onClick={() => !isTaken && setSuggestionTime(time)}
                       disabled={isTaken}
                       className={`py-2 rounded border text-xs transition-all ${
                         isTaken 
                           ? 'bg-surface border-transparent text-textSecondary line-through cursor-not-allowed opacity-50'
                           : suggestionTime === time 
                             ? 'bg-info text-background border-info font-bold' 
                             : 'bg-surfaceHover border-transparent text-text hover:border-info/50'
                       }`}
                     >
                       {time}
                     </button>
                   );
                 })}
               </div>
             )}

             <Button 
               disabled={!suggestionTime}
               onClick={() => {
                if (showSuggestionModal && suggestionTime && suggestionDate) {
                  // Validate conflict again before sending
                  if (isSlotBooked(suggestionDate, suggestionTime, showSuggestionModal.id)) {
                    alert('Este horário está ocupado.');
                    return;
                  }
                  
                  updateStatus(showSuggestionModal.id, 'sugestao_enviada_admin', { 
                    suggestionTime: suggestionTime,
                  });
                  setShowSuggestionModal(null);
                }
             }}>
               Enviar Sugestão {suggestionTime}
             </Button>
          </div>
        </Modal>

        {/* Manual Booking Modal */}
        <Modal isOpen={showManualBookModal} onClose={() => setShowManualBookModal(false)} title="Agendamento Manual">
           <div className="space-y-4">
             <Input 
               label="Nome do Cliente" 
               value={manualClientName} 
               onChange={(e: any) => setManualClientName(e.target.value)} 
             />
             
             <div className="mb-2">
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
                <div className="mb-4">
                  <label className="text-sm text-textSecondary font-medium mb-1.5 block">Horário</label>
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {generateTimeSlots(selectedDate).map(time => {
                      const isTaken = isSlotBooked(selectedDate, time);
                      return (
                        <button
                          key={time}
                          onClick={() => !isTaken && setSelectedTime(time)}
                          disabled={isTaken}
                          className={`py-2 rounded border text-xs transition-all ${
                            isTaken 
                              ? 'bg-surface border-transparent text-textSecondary line-through cursor-not-allowed opacity-50' 
                              : selectedTime === time 
                                ? 'bg-primary text-background border-primary font-bold' 
                                : 'bg-surfaceHover border-transparent text-text hover:border-primary/50'
                          }`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                </div>
             )}

             <Button onClick={handleManualBooking} disabled={!manualClientName || !selectedDate || !selectedTime}>
               Criar Agendamento
             </Button>
           </div>
        </Modal>

      </div>
    );
  }

  return null;
}