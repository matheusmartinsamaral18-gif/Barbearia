export type AppointmentStatus = 
  | 'pending'           // Aguardando aprovação
  | 'accepted'          // Aceito (Verde)
  | 'cancelled'         // Cancelado (Cinza)
  | 'completed'         // Concluído
  | 'waiting_approval'  // Aguardando nova aprovação (remarcação)
  | 'suggestion_sent'   // Sugestão enviada (Azul)
  | 'rejected';         // Recusado

export interface Appointment {
  id: string;
  clientName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: AppointmentStatus;
  createdAt: number;
  phone?: string;
  adminNote?: string;
  suggestionTime?: string; // If admin suggests a new time
  deviceToken?: string;
}

export interface ShopSettings {
  isOpen: boolean;
  openTime: string; // "09:00"
  closeTime: string; // "19:00"
  intervalMinutes: number; // e.g., 45
  blockedDates: string[]; // ["2024-12-25"]
  workDays: number[]; // [1, 2, 3, 4, 5, 6] (0=Sun, 6=Sat)
  releasedClients?: string[]; // Names of clients who can bypass cooldown
}
