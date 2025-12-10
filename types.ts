export type AppointmentStatus = 
  | 'aguardando_aprovacao'          // Solicitado pelo cliente
  | 'aceito'                        // Confirmado
  | 'cancelado'                     // Cancelado pelo cliente ou admin
  | 'concluido'                     // Serviço finalizado
  | 'aguardando_nova_aprovacao'     // Cliente remarcou
  | 'sugestao_enviada_admin'        // Admin sugeriu novo horário
  | 'aguardando_resposta_cliente';  // Estado intermediário

export interface Appointment {
  id: string;
  clientName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: AppointmentStatus;
  createdAt: number;
  phone?: string;
  adminNote?: string;
  suggestionTime?: string; // Horário sugerido pelo admin
  deviceToken?: string;
}

export interface ShopSettings {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  intervalMinutes: number;
  blockedDates: string[];
  workDays: number[];
  releasedClients?: string[];
}