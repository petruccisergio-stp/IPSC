
import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { AppView, Hymn, FlipcardContent, Devotional, ChurchEvent } from './types';
/* Fixed: Added DEVOTIONALS_JAN_2026 to the constants import list */
import { 
  NAV_ITEMS, MOCK_EVENTS, THEMATIC_STUDIES, BIBLE_BOOKS, 
  CATECHISM_CARDS, CATECHISM_SECTIONS, CHURCH_NAME, 
  MANUAL_RESEARCH_QUESTIONS, MONTHS, WEEKDAYS,
  ALL_DEVOTIONALS, DEVOTIONALS_JAN_2026
} from './constants';
import { 
  searchBibleKeywords,
  getBibleChapter,
  generateVerseAudio,
  checkCache,
  searchCatechism,
  queryManualPresbiteriano,
  analyzeStudyDocument
} from './services/gemini';
import { 
  X, Heart, Youtube, Volume2, 
  Calendar as CalendarIcon, Send, BookOpen, Music, Sparkles, ShieldCheck, 
  Search, ArrowLeft, ChevronLeft, ChevronRight, Loader2, Play, 
  Mic, Share2, BookMarked, Menu, History, Copy, CheckCircle2,
  ListMusic, Mic2, ChevronDown, Book, Hash, AlertCircle, RefreshCcw,
  Music2, Filter, Settings, Moon, Sun, Type as TypeIcon, AlignJustify,
  Maximize2, Minimize2, Eye, EyeOff, Palette, RotateCcw, Plus, Minus,
  ChevronRight as ChevronRightIcon, Layers, Info, List, GraduationCap,
  Lightbulb, FileText, Scale, Tag, ExternalLink, Globe, Upload, FileUp,
  FileSearch, CheckCircle, Clock, MapPin, Quote, MessageCircle, Save, Trash2, CalendarPlus, Lock, Unlock, KeyRound
} from 'lucide-react';

/**
 * Reader Settings Interface and Constants
 */
interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  useSerif: boolean;
  theme: 'light' | 'dark' | 'sepia';
  focusMode: boolean;
  verseSpacing: number;
}

const STORAGE_KEY = 'ipsc_reader_settings_v4';

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.6,
  useSerif: true,
  theme: 'light',
  focusMode: false,
  verseSpacing: 16
};

/**
 * Utilitário para gerar Link do Google Agenda
 */
const getGoogleCalendarUrl = (event: ChurchEvent) => {
  const date = new Date(event.date);
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const startStr = dateStr + 'T' + (event.time || '19:00').replace(':', '') + '00Z';
  const endStr = dateStr + 'T' + (event.endTime || '20:00').replace(':', '') + '00Z';
  
  let url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startStr}/${endStr}&details=${encodeURIComponent(event.description || '')}&location=${encodeURIComponent(event.location || 'IP São Caetano')}`;
  
  if (event.recurrence && event.recurrence !== 'none') {
    const freq = event.recurrence === 'daily' ? 'DAILY' : event.recurrence === 'weekly' ? 'WEEKLY' : 'MONTHLY';
    url += `&recur=RRULE:FREQ=${freq}`;
  }
  return url;
};

/**
 * Lógica de Recorrência
 */
const isEventOnDate = (event: ChurchEvent, date: Date) => {
  const evDate = new Date(event.date);
  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const eventStartDate = new Date(evDate.getFullYear(), evDate.getMonth(), evDate.getDate());

  if (checkDate < eventStartDate) return false;

  const recurrence = event.recurrence || 'none';

  if (recurrence === 'daily') return true;
  
  if (recurrence === 'weekly') {
    return evDate.getDay() === date.getDay();
  }
  
  if (recurrence === 'monthly') {
    return evDate.getDate() === date.getDate();
  }

  return evDate.getDate() === date.getDate() && 
         evDate.getMonth() === date.getMonth() && 
         evDate.getFullYear() === date.getFullYear();
};

/**
 * Modal de Login do Admin
 */
const AdminLoginModal = ({ isOpen, onClose, onAuth }: { isOpen: boolean, onClose: () => void, onAuth: (pass: string) => void }) => {
  const [password, setPassword] = useState('');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-[40px] p-10 shadow-2xl space-y-8">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-black shadow-xl">
            <Lock size={32}/>
          </div>
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">Área Restrita</h3>
          <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Digite a senha de administrador</p>
        </div>
        
        <div className="space-y-4">
          <div className="relative">
            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18}/>
            <input 
              autoFocus
              type="password" 
              placeholder="Senha" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onAuth(password)}
              className="w-full pl-12 pr-6 py-4 rounded-2xl bg-zinc-800 border border-zinc-700 text-white outline-none focus:border-amber-400 transition-all font-bold"
            />
          </div>
          <button 
            onClick={() => onAuth(password)}
            className="w-full py-4 rounded-2xl bg-amber-400 text-black font-black uppercase tracking-widest text-xs shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
          >
            Acessar Painel
          </button>
          <button 
            onClick={onClose}
            className="w-full text-zinc-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Modal de Evento (CRUD Admin + Visualização Usuário)
 */
const EventModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  onDelete, 
  event, 
  initialDate,
  settings,
  isAdmin
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (event: ChurchEvent) => void; 
  onDelete?: (id: string) => void;
  event: ChurchEvent | null; 
  initialDate: Date | null;
  settings: any;
  isAdmin: boolean;
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('20:00');
  const [location, setLocation] = useState('IP São Caetano');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#f09c1d');
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      const d = new Date(event.date);
      setDate(d.toISOString().split('T')[0]);
      setStartTime(event.time || '19:00');
      setEndTime(event.endTime || '20:00');
      setLocation(event.location || 'IP São Caetano');
      setDescription(event.description || '');
      setColor(event.color || '#f09c1d');
      setRecurrence(event.recurrence || 'none');
    } else if (initialDate) {
      setTitle('');
      setDate(initialDate.toISOString().split('T')[0]);
      setStartTime('19:00');
      setEndTime('20:00');
      setLocation('IP São Caetano');
      setDescription('');
      setColor('#f09c1d');
      setRecurrence('none');
    }
  }, [event, initialDate, isOpen]);

  if (!isOpen) return null;

  const handleExport = () => {
    const mockEvent: ChurchEvent = {
      id: 'temp',
      title,
      date: new Date(date + 'T12:00:00'),
      time: startTime,
      endTime,
      location,
      description,
      recurrence
    };
    window.open(getGoogleCalendarUrl(mockEvent), '_blank');
  };

  const bgClass = settings.theme === 'dark' ? 'bg-zinc-900 text-zinc-100 border-zinc-800' : 'bg-white text-slate-800 border-slate-200';
  const inputBg = settings.theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-slate-50 border-slate-200';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className={`w-full max-w-lg rounded-[40px] border shadow-2xl overflow-hidden ${bgClass}`}>
        <div className="flex items-center justify-between p-6 border-b border-black/5">
          <h3 className="text-sm font-black uppercase tracking-widest opacity-40">
            {isAdmin ? (event ? 'Editar Evento' : 'Novo Evento') : 'Detalhes do Evento'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors"><X size={20}/></button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
          {isAdmin ? (
            <>
              <div className="space-y-2">
                <input 
                  type="text" 
                  placeholder="Adicionar título" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full text-3xl font-black bg-transparent outline-none border-b-2 border-transparent focus:border-amber-400 pb-2 transition-all placeholder:opacity-30"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2"><CalendarIcon size={12}/> Data de Início</label>
                  <input 
                    type="date" 
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className={`w-full p-3 rounded-2xl border text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/20 ${inputBg}`}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2"><Clock size={12}/> Início</label>
                    <input 
                      type="time" 
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className={`w-full p-3 rounded-2xl border text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/20 ${inputBg}`}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2"><Clock size={12}/> Fim</label>
                    <input 
                      type="time" 
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                      className={`w-full p-3 rounded-2xl border text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/20 ${inputBg}`}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2"><RefreshCcw size={12}/> Recorrência</label>
                <select 
                  value={recurrence}
                  onChange={e => setRecurrence(e.target.value as any)}
                  className={`w-full p-3 rounded-2xl border text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/20 ${inputBg}`}
                >
                  <option value="none">Não se repete</option>
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2"><MapPin size={12}/> Localização</label>
                <input 
                  type="text" 
                  placeholder="Ex: Templo, Salão Social..." 
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className={`w-full p-3 rounded-2xl border text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/20 ${inputBg}`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-2"><AlignJustify size={12}/> Descrição</label>
                <textarea 
                  placeholder="Adicionar detalhes..." 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={`w-full p-4 rounded-2xl border text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/20 min-h-[100px] resize-none ${inputBg}`}
                />
              </div>
            </>
          ) : (
            <div className="space-y-8">
              <div className="space-y-2">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-4"
                  style={{ backgroundColor: color }}
                >
                  <Sparkles size={24} />
                </div>
                <h2 className="text-4xl font-black tracking-tighter leading-none">{title}</h2>
                <div className="flex flex-wrap gap-4 text-[11px] font-black uppercase tracking-widest opacity-40 pt-2">
                  <span className="flex items-center gap-2"><Clock size={14}/> {startTime} {endTime ? `- ${endTime}` : ''}</span>
                  <span className="flex items-center gap-2"><MapPin size={14}/> {location}</span>
                  {recurrence !== 'none' && <span className="flex items-center gap-2"><RefreshCcw size={14}/> {recurrence}</span>}
                </div>
              </div>
              
              {description && (
                <div className="space-y-2">
                   <h4 className="text-[10px] font-black uppercase tracking-widest opacity-30">Descrição</h4>
                   <p className="text-sm font-bold leading-relaxed">{description}</p>
                </div>
              )}

              <button 
                onClick={handleExport}
                className="w-full py-6 rounded-[30px] bg-amber-400 text-black font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-xl shadow-amber-400/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                <CalendarPlus size={20} /> Adicionar ao Google Agenda
              </button>
            </div>
          )}
          
          {isAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-black/5">
              <div className="flex gap-2">
                {['#f09c1d', '#4285f4', '#34a853', '#ea4335', '#9c27b0'].map(c => (
                  <button 
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full transition-all ${color === c ? 'ring-4 ring-black/10 scale-125' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-amber-400 hover:text-black transition-all text-[10px] font-black uppercase tracking-widest shadow-sm"
              >
                <CalendarPlus size={14} /> Adicionar ao Google
              </button>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="p-6 bg-black/5 flex items-center justify-between">
            <div className="flex gap-2">
              {event && onDelete && (
                <button 
                  onClick={() => onDelete(event.id)}
                  className="p-4 rounded-2xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center gap-2 text-xs font-bold"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-6 py-4 rounded-2xl text-xs font-bold opacity-40 hover:opacity-100 transition-opacity">Cancelar</button>
              <button 
                onClick={() => onSave({
                  id: event?.id || `event-${Date.now()}`,
                  title: title || '(Sem título)',
                  date: new Date(date + 'T12:00:00'),
                  time: startTime,
                  endTime: endTime,
                  location,
                  description,
                  color,
                  recurrence
                })}
                className="px-8 py-4 rounded-2xl bg-amber-400 text-black shadow-lg shadow-amber-400/20 hover:scale-105 active:scale-95 transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2"
              >
                <Save size={18} /> Salvar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Calendar Component
 */
const CalendarView = ({ 
  events, 
  settings, 
  isAdmin,
  onEditEvent, 
  onAddEvent 
}: { 
  events: ChurchEvent[], 
  settings: any,
  isAdmin: boolean,
  onEditEvent: (event: ChurchEvent) => void,
  onAddEvent: (date: Date) => void
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let i = 1; i <= totalDays; i++) days.push(new Date(year, month, i));

  const eventsOnSelectedDay = useMemo(() => {
    return events.filter(e => isEventOnDate(e, selectedDate));
  }, [events, selectedDate]);

  const hasEvent = (date: Date) => {
    return events.some(e => isEventOnDate(e, date));
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col lg:flex-row gap-10">
        <div className={`flex-1 p-8 md:p-12 rounded-[50px] border shadow-xl ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : settings.theme === 'sepia' ? 'bg-[#f4ecd8] border-[#e1d3b0]' : 'bg-white border-slate-100'}`}>
          <div className="flex items-center justify-between mb-10 px-4">
            <h3 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">
              {MONTHS[month]} <span className="opacity-20">{year}</span>
            </h3>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="p-3 hover:bg-black/5 rounded-2xl transition-colors"><ChevronLeft /></button>
              {isAdmin && (
                <button 
                  onClick={() => onAddEvent(selectedDate)}
                  className="mx-2 px-6 py-2 bg-amber-400 text-black text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-lg hover:scale-105 transition-all flex items-center gap-2"
                >
                  <Plus size={16} /> Criar
                </button>
              )}
              <button onClick={nextMonth} className="p-3 hover:bg-black/5 rounded-2xl transition-colors"><ChevronRight /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 md:gap-4 mb-4">
            {WEEKDAYS.map(day => (
              <div key={day} className="text-center text-[10px] font-black uppercase tracking-[0.2em] opacity-30 pb-4">{day}</div>
            ))}
            {days.map((date, idx) => {
              if (!date) return <div key={`empty-${idx}`} />;
              const isSelected = selectedDate.getDate() === date.getDate() && selectedDate.getMonth() === date.getMonth();
              const hasEvents = hasEvent(date);
              
              return (
                <button 
                  key={idx} 
                  onClick={() => setSelectedDate(date)}
                  onDoubleClick={() => isAdmin && onAddEvent(date)}
                  className={`aspect-square relative rounded-3xl md:rounded-[30px] flex flex-col items-center justify-center transition-all group border-2 ${
                    isSelected 
                      ? 'bg-amber-400 border-amber-300 text-black scale-105 shadow-lg' 
                      : (settings.theme === 'dark' ? 'hover:bg-zinc-800 border-transparent text-zinc-400' : 'hover:bg-amber-50 border-transparent text-slate-500')
                  }`}
                >
                  <span className={`text-sm md:text-xl font-bold ${isToday(date) && !isSelected ? 'text-amber-500' : ''}`}>
                    {date.getDate()}
                  </span>
                  {hasEvents && (
                    <div className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full mt-1 ${isSelected ? 'bg-black' : 'bg-amber-500 animate-pulse'}`} />
                  )}
                  {isToday(date) && !isSelected && (
                    <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-amber-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-full lg:w-96 space-y-6">
          <div className={`p-8 rounded-[40px] border shadow-sm ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center justify-between mb-8">
               <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Programação</span>
               <span className="text-xs font-bold opacity-40">{selectedDate.getDate()} de {MONTHS[selectedDate.getMonth()]}</span>
            </div>
            
            {eventsOnSelectedDay.length > 0 ? (
              <div className="space-y-6">
                {eventsOnSelectedDay.map((event, idx) => (
                  <div key={`${event.id}-${idx}`} className="group cursor-pointer relative" onClick={() => onEditEvent(event)}>
                    <div className="flex items-start gap-4">
                      <div 
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white transition-transform group-hover:scale-110`}
                        style={{ backgroundColor: event.color || '#f09c1d' }}
                      >
                        {event.icon || <Sparkles size={20}/>}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                           <h4 className="font-bold text-lg leading-tight group-hover:text-amber-500 transition-colors line-clamp-1">{event.title}</h4>
                           <button 
                             onClick={(e) => { e.stopPropagation(); window.open(getGoogleCalendarUrl(event), '_blank'); }}
                             className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-amber-400 hover:text-black transition-all shadow-sm"
                             title="Adicionar ao Google Agenda"
                           >
                             <CalendarPlus size={14} />
                           </button>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest opacity-40">
                           <span className="flex items-center gap-1"><Clock size={12}/> {event.time}</span>
                           <span className="flex items-center gap-1"><MapPin size={12}/> {event.location || 'Templo'}</span>
                        </div>
                        {event.recurrence && event.recurrence !== 'none' && (
                           <span className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-500 flex items-center gap-1 mt-1"><RefreshCcw size={10}/> Recorrente</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center space-y-4">
                 <div className="opacity-10 flex justify-center"><CalendarIcon size={48} /></div>
                 <p className="text-xs font-black uppercase tracking-widest opacity-30">Sem eventos para este dia</p>
                 {isAdmin && (
                    <button 
                      onClick={() => onAddEvent(selectedDate)}
                      className="mx-auto px-4 py-2 border border-dashed rounded-xl text-[10px] font-black opacity-40 hover:opacity-100 transition-all uppercase tracking-widest"
                    >
                      Adicionar Evento
                    </button>
                 )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Flipcard Component with 3D animation
 */
const Flipcard = memo(({ card, settings }: { card: FlipcardContent, settings: any }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="h-[400px] w-full perspective-1000 cursor-pointer group"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div className={`relative w-full h-full transition-all duration-700 preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
        {/* Front */}
        <div className={`absolute inset-0 backface-hidden rounded-[40px] border p-8 flex flex-col justify-between shadow-sm group-hover:shadow-xl transition-all ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : settings.theme === 'sepia' ? 'bg-[#e1d3b0] border-[#b09e75]' : 'bg-white border-slate-100'}`}>
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">{card.category}</span>
              <div className="text-2xl">{card.visualHint}</div>
            </div>
            <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter leading-tight">{card.title}</h3>
            <p className="text-base font-serif italic opacity-70 leading-relaxed pt-2">{card.question}</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-500">
            Clique para ver a resposta <ChevronRight size={14} />
          </div>
        </div>

        {/* Back */}
        <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[40px] border p-8 flex flex-col shadow-2xl ${settings.theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : settings.theme === 'sepia' ? 'bg-[#f4ecd8] border-[#e1d3b0]' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            <p style={{ fontSize: `${settings.fontSize * 0.85}px` }} className="font-serif italic leading-relaxed text-balance">
              {card.answer}
            </p>
            
            <div className="flex flex-wrap gap-2">
              {card.highlights.map((h, i) => (
                <span key={i} className="px-3 py-1 bg-amber-400/20 text-amber-600 dark:text-amber-400 rounded-full text-[9px] font-black uppercase">
                  {h}
                </span>
              ))}
            </div>

            {card.biblicalRef && (
              <div className="pt-4 border-t border-black/5">
                <span className="block text-[8px] font-black uppercase mb-1">Base Bíblica</span>
                <span className="text-[11px] font-bold text-amber-600">{card.biblicalRef}</span>
              </div>
            )}
          </div>
          <div className="pt-4 flex justify-center">
            <button className="text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">Voltar à pergunta</button>
          </div>
        </div>
      </div>
    </div>
  );
});

const VerseItem = memo(({ v, i, settings, onCopy, onShare, onPlay, copiedId, referencePrefix }: any) => {
  const handleCopy = useCallback(() => onCopy(v.text, i, referencePrefix + (v.verse || i+1)), [onCopy, v.text, i, referencePrefix, v.verse]);
  const handleShare = useCallback(() => onShare(v.text, referencePrefix + (v.verse || i+1)), [onShare, v.text, referencePrefix, v.verse, i]);
  const handlePlay = useCallback(() => onPlay(v.text), [onPlay, v.text]);

  return (
    <div id={`verse-${v.verse || i+1}`} className={`flex gap-6 group p-5 rounded-2xl transition-all ${settings.theme === 'dark' ? 'hover:bg-zinc-800' : settings.theme === 'sepia' ? 'hover:bg-[#e1d3b0]' : 'hover:bg-slate-50'}`}>
      <span className="text-amber-500 font-black text-sm shrink-0 mt-2 italic opacity-50">{v.verse || (i+1)}</span>
      <div className="flex-1 space-y-4">
        <p 
          style={{ 
            fontSize: `${settings.fontSize}px`, 
            lineHeight: settings.lineHeight,
            fontFamily: settings.useSerif ? '"Instrument Serif", serif' : 'Inter, sans-serif'
          }} 
          className={`${settings.theme === 'dark' ? 'text-zinc-300' : settings.theme === 'sepia' ? 'text-[#5b4636]' : 'text-slate-700'} transition-all duration-300`}
        >
          {v.text}
        </p>
        <div className={`flex gap-4 ${settings.focusMode ? 'opacity-0 group-hover:opacity-100' : 'opacity-40'} transition-opacity`}>
          <button onClick={handleCopy} className="text-[9px] font-black uppercase hover:text-amber-500 transition-colors flex items-center gap-1">
            {copiedId === i ? <CheckCircle2 size={12}/> : <Copy size={12}/>}
            {copiedId === i ? 'COPIADO' : 'COPIAR'}
          </button>
          <button onClick={handleShare} className="text-[9px] font-black uppercase hover:text-amber-500 transition-colors flex items-center gap-1">
            <Share2 size={12}/> WHATSAPP
          </button>
          <button onClick={handlePlay} className="text-[9px] font-black uppercase hover:text-amber-500 transition-colors flex items-center gap-1">
            <Volume2 size={12}/> OUVIR
          </button>
        </div>
      </div>
    </div>
  );
});

const SearchBar = memo(({ value, onChange, onSearch, placeholder, theme }: any) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch(value);
  };
  
  return (
    <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl border flex-1 md:max-w-xs shadow-inner transition-colors ${theme === 'dark' ? 'bg-zinc-950 border-zinc-800' : theme === 'sepia' ? 'bg-[#fdf3e1] border-[#e1d3b0]' : 'bg-slate-50 border-slate-100'}`}>
      <Search size={18} className="opacity-30" />
      <input 
        type="text" 
        placeholder={placeholder} 
        className="bg-transparent text-xs font-bold outline-none flex-1 placeholder:opacity-30" 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        onKeyDown={handleKeyDown} 
      />
    </div>
  );
});

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // Agenda States
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ChurchEvent | null>(null);
  const [selectedDayForNewEvent, setSelectedDayForNewEvent] = useState<Date | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<ReaderSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch (e) { return DEFAULT_SETTINGS; }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const [bibleMode, setBibleMode] = useState<'browse' | 'search'>('browse');
  const [bibleSearch, setBibleSearch] = useState("");
  const [bibleVerses, setBibleVerses] = useState<any[]>([]);
  const [selectedBook, setSelectedBook] = useState<typeof BIBLE_BOOKS[0] | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [showBookSelector, setShowBookSelector] = useState(false);
  const [showChapterSelector, setShowChapterSelector] = useState(false);
  const [bookFilter, setBookFilter] = useState("");
  const [selectedTestament, setSelectedTestament] = useState<'all' | 'Velho' | 'Novo'>('all');

  const [devotionalMode, setDevotionalMode] = useState<'month' | 'reading'>('month');
  const [selectedDevotional, setSelectedDevotional] = useState<Devotional | null>(null);
  const [devotionalMonth, setDevotionalMonth] = useState(0); // 0 = Jan, 1 = Feb, 2 = Mar...

  const [catechismMode, setCatechismMode] = useState<'sections' | 'reading'>('sections');
  const [catechismSearch, setCatechismSearch] = useState("");
  const [catechismResults, setCatechismResults] = useState<FlipcardContent[] | null>(null);
  const [selectedSection, setSelectedSection] = useState<typeof CATECHISM_SECTIONS[0] | null>(null);

  const [manualSearch, setManualSearch] = useState("");
  const [manualResult, setManualResult] = useState<any>(null);

  const [studyResult, setStudyResult] = useState<any>(null);
  
  const [agendaEvents, setAgendaEvents] = useState<ChurchEvent[]>(MOCK_EVENTS as any);

  const normalize = useCallback((s: string) => 
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(), []);

  const handleAdminToggle = () => {
    if (isAdmin) {
      setIsAdmin(false);
    } else {
      setIsAdminModalOpen(true);
    }
  };

  const handleAdminAuth = (password: string) => {
    if (password === "@IPSCS_2026") {
      setIsAdmin(true);
      setIsAdminModalOpen(false);
    } else {
      alert("Senha incorreta!");
    }
  };

  const handleCopy = useCallback((text: string, id: number, ref: string) => {
    const fullText = `${ref} - ${text} (${CHURCH_NAME})`;
    navigator.clipboard.writeText(fullText).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handleShare = useCallback((text: string, ref: string) => {
    const fullText = `${ref} - ${text} (${CHURCH_NAME})`;
    window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank');
  }, []);

  const playVerseAudio = useCallback(async (text: string) => {
    setLoading(true);
    setError(null);
    try {
      const base64Audio = await generateVerseAudio(text);
      if (base64Audio) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const decodeBase64 = (base64: string) => {
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes;
        };
        const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) => {
          const dataInt16 = new Int16Array(data.buffer);
          const frameCount = dataInt16.length / numChannels;
          const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
          for (let channel = 0; channel < numChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < frameCount; i++) {
              channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
            }
          }
          return buffer;
        };
        const bytes = decodeBase64(base64Audio);
        const audioBuffer = await decodeAudioData(bytes, audioContext, 24000, 1);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
      }
    } catch (e) {
      setError("Erro ao processar áudio do versículo.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setManualResult(null);
    try {
      const res = await queryManualPresbiteriano(q);
      setManualResult(res);
    } catch (e) {
      setError("Falha ao analisar o Manual Presbiteriano.");
    } finally {
      setLoading(false);
    }
  }, []);

  const resetBible = useCallback(() => {
    setBibleMode('browse');
    setSelectedBook(null);
    setSelectedChapter(null);
    setBibleVerses([]);
    setBibleSearch("");
    setError(null);
    setShowBookSelector(false);
    setShowChapterSelector(false);
    setBookFilter("");
  }, []);

  const handleBibleSearch = useCallback(async (queryInput: string) => {
    const query = queryInput.trim();
    if (!query || loading) return;
    setLoading(true);
    setError(null);
    try {
      const refMatch = query.match(/^(\d?\s?[a-zA-Záàâãéèêíïóôõöúçñ\s]+)\s+(\d+)(?::(\d+))?$/i);
      if (refMatch) {
        const inputBookName = normalize(refMatch[1]);
        const chapterNum = parseInt(refMatch[2]);
        const book = BIBLE_BOOKS.find(b => normalize(b.name) === inputBookName || b.abbr.some(a => normalize(a) === inputBookName));
        if (book && chapterNum > 0 && chapterNum <= book.chapters) {
          setSelectedBook(book);
          setBibleMode('browse');
          setSelectedChapter(chapterNum);
          const cached = checkCache(`chapter_v4_${book.name.toLowerCase()}_${chapterNum}`);
          if (cached) setBibleVerses(cached);
          else setBibleVerses(await getBibleChapter(book.name, chapterNum));
          return;
        }
      }
      setBibleVerses(await searchBibleKeywords(query));
      setBibleMode('search');
    } catch (e) { setError("Erro na busca de Bíblia."); } finally { setLoading(false); }
  }, [loading, normalize]);

  const handleCatechismSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCatechismResults(null);
      return;
    }
    setLoading(true);
    try {
      const results = await searchCatechism(q);
      setCatechismResults(results);
      setCatechismMode('reading');
    } catch (e) { setError("Falha ao buscar no Catecismo."); } finally { setLoading(false); }
  }, []);

  const handleCatechismSectionSelect = useCallback(async (section: typeof CATECHISM_SECTIONS[0]) => {
    setLoading(true);
    setSelectedSection(section);
    setCatechismMode('reading');
    setCatechismResults(null);
    try {
      const results = await searchCatechism(`perguntas ${section.range[0]} a ${section.range[1]}`);
      setCatechismResults(results);
    } catch (e) { setError("Erro ao carregar seção do catecismo."); } finally { setLoading(false); }
  }, []);

  const handleChapterSelect = useCallback(async (bookName: string, chapter: number) => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (loading && selectedChapter === chapter) return;
    setError(null);
    setSelectedChapter(chapter);
    setShowChapterSelector(false);
    const cacheKey = `chapter_v4_${bookName.toLowerCase()}_${chapter}`;
    const cachedData = checkCache(cacheKey);
    if (cachedData) {
      setBibleVerses(cachedData);
      getBibleChapter(bookName, chapter).catch(() => {});
    } else {
      setLoading(true);
      try { setBibleVerses(await getBibleChapter(bookName, chapter)); }
      catch (e) { setError("Falha ao carregar capítulo."); } finally { setLoading(false); }
    }
  }, [loading, selectedChapter]);

  const navigateChapter = (direction: 'next' | 'prev') => {
    if (!selectedBook || !selectedChapter) return;
    const newChapter = direction === 'next' ? selectedChapter + 1 : selectedChapter - 1;
    if (newChapter >= 1 && newChapter <= selectedBook.chapters) {
      handleChapterSelect(selectedBook.name, newChapter);
    }
  };

  const updateSetting = useCallback(<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const filteredBooks = useMemo(() => {
    const search = normalize(bookFilter);
    return BIBLE_BOOKS.filter(b => {
      const matchesSearch = !search || normalize(b.name).includes(search) || b.abbr.some(a => normalize(a).includes(search));
      const matchesTestament = selectedTestament === 'all' || b.testament === selectedTestament;
      return matchesSearch && matchesTestament;
    });
  }, [bookFilter, selectedTestament, normalize]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setStudyResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = (e.target?.result as string).split(',')[1];
        try {
          const result = await analyzeStudyDocument(base64Data, file.type);
          setStudyResult(result);
        } catch (err) {
          setError("Falha ao analisar o documento. Tente um arquivo menor ou imagem mais clara.");
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Erro ao ler o arquivo.");
      setLoading(false);
    }
  };

  // Agenda Event Handlers
  const openAddEvent = (date: Date) => {
    setEditingEvent(null);
    setSelectedDayForNewEvent(date);
    setIsEventModalOpen(true);
  };

  const openEditEvent = (event: ChurchEvent) => {
    setEditingEvent(event);
    setSelectedDayForNewEvent(null);
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = (eventData: ChurchEvent) => {
    if (editingEvent) {
      setAgendaEvents(prev => prev.map(e => e.id === eventData.id ? eventData : e));
    } else {
      setAgendaEvents(prev => [...prev, eventData]);
    }
    setIsEventModalOpen(false);
  };

  const handleDeleteEvent = (id: string) => {
    setAgendaEvents(prev => prev.filter(e => e.id !== id));
    setIsEventModalOpen(false);
  };

  const NavItemsList = useMemo(() => NAV_ITEMS.map(item => (
    <button 
      key={item.id} 
      onClick={() => { setActiveView(item.id as AppView); setIsMobileMenuOpen(false); }}
      className={`w-full flex items-center gap-5 px-6 py-4 rounded-3xl transition-all duration-300 group ${activeView === item.id ? 'bg-white/10 text-white shadow-lg border-r-4 border-amber-400' : 'hover:text-white hover:bg-white/5'}`}
    >
      <span className={`${activeView === item.id ? 'text-amber-400' : 'group-hover:text-amber-400'}`}>{item.icon}</span>
      <span className="text-[11px] font-black uppercase tracking-[0.1em]">{item.label}</span>
    </button>
  )), [activeView]);

  const appThemeClasses = useMemo(() => {
    switch(settings.theme) {
      case 'dark': return 'bg-zinc-950 text-zinc-100 dark-theme';
      case 'sepia': return 'bg-[#f4ecd8] text-[#5b4636] sepia-theme';
      default: return 'bg-[#fdfdfc] text-slate-800 light-theme';
    }
  }, [settings.theme]);

  // A sidebar desktop é controlada pelo modo foco, mas no mobile o cabeçalho deve estar sempre acessível.
  const sidebarVisible = !settings.focusMode || activeView !== 'bible';

  // Current month's devotionals logic
  const availableMonthsKeys = useMemo(() => Object.keys(ALL_DEVOTIONALS), []);
  
  const currentMonthDevotionals = useMemo(() => {
    const key = `${MONTHS[devotionalMonth]}-2026`;
    return ALL_DEVOTIONALS[key] || [];
  }, [devotionalMonth]);

  const nextDevotionalMonth = () => setDevotionalMonth(prev => Math.min(availableMonthsKeys.length - 1, prev + 1));
  const prevDevotionalMonth = () => setDevotionalMonth(prev => Math.max(0, prev - 1));

  return (
    <div className={`min-h-screen flex flex-col lg:flex-row relative ${appThemeClasses} transition-all duration-500 overflow-x-hidden`}>
      {/* Sidebar Desktop - Apenas para telas LG ou maiores */}
      <aside className={`fixed top-0 left-0 h-full w-72 bg-[#121212] text-slate-400 z-50 p-8 shadow-2xl transition-transform duration-500 ease-out-expo hidden lg:flex flex-col ${sidebarVisible ? 'translate-x-0' : '-translate-x-full'}`}>
        <nav className="flex-1 space-y-2 mt-8">{NavItemsList}</nav>

        <div className="pt-8 space-y-4 border-t border-white/5">
          <button 
            onClick={handleAdminToggle}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${isAdmin ? 'bg-amber-400 text-black font-bold' : 'hover:bg-white/5 text-slate-500'}`}
          >
            {isAdmin ? <Unlock size={18}/> : <Lock size={18}/>}
            <span className="text-[10px] font-black uppercase tracking-widest">{isAdmin ? 'Admin Ativo' : 'Área do Admin'}</span>
          </button>
          <div className="text-[9px] font-black tracking-[0.3em] text-white/10 text-center uppercase">Soli Deo Gloria</div>
        </div>
      </aside>

      {/* Header Mobile - Visível apenas em telas menores que LG */}
      <header className={`lg:hidden bg-[#121212] p-4 sticky top-0 z-[100] flex justify-between items-center text-white border-b border-white/5 shadow-lg`}>
        <div className="flex items-center gap-3">
           {/* Logo removida conforme solicitado */}
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleAdminToggle} className={isAdmin ? 'text-amber-400' : 'text-white/40'} title="Painel Admin">
            {isAdmin ? <Unlock size={20}/> : <Lock size={20}/>}
          </button>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-white/5 rounded-xl">
            {isMobileMenuOpen ? <X size={28}/> : <Menu size={28}/>}
          </button>
        </div>
      </header>

      {/* Menu Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-[#121212] z-[200] lg:hidden p-10 animate-in fade-in slide-in-from-top-10 overflow-y-auto">
          <div className="flex justify-end mb-12">
            <button onClick={() => setIsMobileMenuOpen(false)} className="text-white p-2 hover:bg-white/5 rounded-full">
              <X size={32} />
            </button>
          </div>
          <div className="space-y-4 max-w-sm mx-auto">{NavItemsList}</div>
          <div className="mt-12 pt-8 border-t border-white/5 text-center opacity-20 text-[9px] font-black tracking-[0.3em] uppercase">
            IP São Caetano do Sul
          </div>
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className={`flex-1 transition-all duration-500 ${sidebarVisible ? 'lg:ml-72' : 'lg:ml-0'} p-4 md:p-12 lg:p-20 relative`}>
        {loading && (
          <div className="fixed top-0 left-0 right-0 h-1 bg-amber-400/30 z-[300] pointer-events-none">
            <div className="h-full bg-amber-400 animate-progress w-full origin-left"></div>
          </div>
        )}

        <div className="max-w-6xl mx-auto">
          {error && (
            <div className={`mb-8 p-4 rounded-2xl flex items-center justify-between animate-in slide-in-from-top-2 border ${settings.theme === 'dark' ? 'bg-red-900/20 border-red-800 text-red-400' : 'bg-red-50 border-red-100 text-red-600'}`}>
              <div className="flex items-center gap-3 font-bold text-xs uppercase tracking-tight"><AlertCircle size={20} /> {error}</div>
              <button onClick={() => setError(null)} className="p-2 hover:bg-black/5 rounded-xl"><X size={16} /></button>
            </div>
          )}

          {activeView === 'home' && (
            <div className="space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <header className="relative h-[250px] md:h-[400px] rounded-[30px] md:rounded-[40px] overflow-hidden group shadow-2xl">
                <img src="https://yt3.googleusercontent.com/_FsoRlRjxFLdjrZjOX8vpVa5jFTPJm3Ejc0vo2D3NEe4eb9jAUtjyExmNWgMe_bmrmL0aA4Lxg=w1707-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" alt="Igreja Presbiteriana de São Caetano" />
                <div className="absolute inset-0 flex flex-col items-center justify-start text-center p-6 md:p-10 md:pt-16 pointer-events-none bg-gradient-to-b from-black/60 to-transparent">
                  <span className="text-amber-400 font-black tracking-[0.4em] uppercase text-[8px] md:text-[10px] drop-shadow-lg">Igreja Presbiteriana do Brasil</span>
                </div>
              </header>
              
              <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                <div className={`p-8 md:p-10 rounded-[35px] md:rounded-[40px] flex flex-col justify-between shadow-sm border ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : settings.theme === 'sepia' ? 'bg-[#e1d3b0] border-[#b09e75]' : 'bg-white border-slate-100'}`}>
                  <div className="space-y-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 dark:bg-amber-400/10 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400"><Sparkles size={24} /></div>
                    <h3 className="text-xl md:text-2xl font-bold">Devocional do Dia</h3>
                    <p className="opacity-60 italic text-sm md:text-base line-clamp-3">"{DEVOTIONALS_JAN_2026[0].title}"</p>
                  </div>
                  <button onClick={() => { setSelectedDevotional(DEVOTIONALS_JAN_2026[0]); setDevotionalMode('reading'); setActiveView('devotionals'); }} className="mt-8 text-amber-600 dark:text-amber-400 font-bold flex items-center gap-2 hover:translate-x-2 transition-all uppercase text-[10px] tracking-widest font-black">LER COMPLETO <ChevronRight size={18} /></button>
                </div>
                
                <div className="bg-[#121212] p-8 md:p-10 rounded-[35px] md:rounded-[40px] text-white shadow-xl">
                  <h3 className="text-xl md:text-2xl font-bold mb-6 flex items-center gap-3"><CalendarIcon className="text-amber-400" /> Agenda Semanal</h3>
                  <div className="space-y-4">
                    {agendaEvents.slice(0, 3).map((event, idx) => (
                      <div 
                        key={`${event.id}-${idx}`} 
                        className="flex items-center justify-between border-b border-white/10 pb-4 last:border-0 cursor-pointer hover:opacity-80"
                        onClick={() => { setActiveView('agenda'); openEditEvent(event); }}
                      >
                        <div>
                          <p className="font-bold text-base md:text-lg line-clamp-1">{event.title}</p>
                          <p className="text-white/50 text-[9px] md:text-[10px] uppercase tracking-widest">
                            {event.date.toLocaleDateString('pt-BR', { weekday: 'short' })}, {event.time}
                          </p>
                        </div>
                        <div className="text-amber-400/30 p-2 rounded-lg"><Sparkles size={16}/></div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setActiveView('agenda')} className="w-full mt-6 py-4 rounded-2xl border border-white/10 hover:bg-white/5 transition-all text-[10px] font-black uppercase tracking-widest">Ver Tudo</button>
                </div>

                <div className={`p-8 md:p-10 rounded-[35px] md:rounded-[40px] shadow-xl border flex flex-col ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-100'}`}>
                  <h3 className="text-xl md:text-2xl font-bold mb-6 md:mb-8 flex items-center gap-3"><ExternalLink className="text-amber-500" /> Links Úteis</h3>
                  <div className="space-y-3 flex-1">
                    <button onClick={() => window.open('https://www.youtube.com/@ipsaocaetanodosul/featured', '_blank')} className="w-full group flex items-center justify-between p-4 rounded-2xl bg-red-600/5 hover:bg-red-600 transition-all text-left">
                       <div className="flex items-center gap-3">
                         <Youtube className="text-red-600 group-hover:text-white" size={20} />
                         <span className="font-black uppercase text-[9px] tracking-widest group-hover:text-white">YouTube</span>
                       </div>
                       <ChevronRight size={16} className="opacity-40 group-hover:text-white" />
                    </button>

                    <button onClick={() => window.open('https://www.ipb.org.br/', '_blank')} className="w-full group flex items-center justify-between p-4 rounded-2xl bg-emerald-600/5 hover:bg-emerald-600 transition-all text-left">
                       <div className="flex items-center gap-3">
                         <Globe className="text-emerald-600 group-hover:text-white" size={20} />
                         <span className="font-black uppercase text-[9px] tracking-widest group-hover:text-white">Site IPB</span>
                       </div>
                       <ChevronRight size={16} className="opacity-40 group-hover:text-white" />
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeView === 'devotionals' && (
            <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-20">
              <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-400 rounded-2xl flex items-center justify-center text-black shadow-lg"><Sun size={24} /></div>
                    <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter leading-none">Devocionais Diários</h2>
                  </div>
                  <p className="opacity-60 max-w-lg text-xs md:text-sm leading-relaxed">Perspectiva Reformada para o seu crescimento espiritual diário em 2026.</p>
                </div>
                <div className="flex flex-col gap-4 w-full md:max-w-md">
                   <div className={`p-4 rounded-2xl md:rounded-3xl border flex items-center justify-between ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-100'}`}>
                      <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">{MONTHS[devotionalMonth]} 2026</span>
                      <div className="flex gap-2">
                        <button onClick={prevDevotionalMonth} disabled={devotionalMonth === 0} className={`p-2 transition-opacity ${devotionalMonth === 0 ? 'opacity-20' : 'hover:bg-black/5 rounded-full'}`}><ChevronLeft size={16}/></button>
                        <button onClick={nextDevotionalMonth} disabled={devotionalMonth === availableMonthsKeys.length - 1} className={`p-2 transition-opacity ${devotionalMonth === availableMonthsKeys.length - 1 ? 'opacity-20' : 'hover:bg-black/5 rounded-full'}`}><ChevronRight size={16}/></button>
                      </div>
                   </div>
                   {devotionalMode === 'reading' && (
                     <button onClick={() => { setDevotionalMode('month'); setSelectedDevotional(null); }} className="text-amber-500 font-black text-[9px] uppercase tracking-widest flex items-center gap-2 self-end"><ArrowLeft size={14}/> Voltar</button>
                   )}
                </div>
              </header>

              {devotionalMode === 'month' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 animate-in slide-in-from-bottom-4">
                  {currentMonthDevotionals.map(dev => (
                    <button 
                      key={dev.id} 
                      onClick={() => { setSelectedDevotional(dev); setDevotionalMode('reading'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className={`p-8 md:p-10 rounded-[35px] md:rounded-[45px] border text-left group transition-all hover:shadow-2xl hover:-translate-y-1 ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-100'}`}
                    >
                      <div className="space-y-4">
                        <span className="text-amber-500 font-black text-[9px] uppercase tracking-[0.2em]">Dia {dev.day}</span>
                        <h3 className="text-lg md:text-xl font-black uppercase tracking-tighter leading-tight group-hover:text-amber-500 transition-colors">{dev.title}</h3>
                        <p className="text-xs opacity-40 font-serif italic line-clamp-2">{dev.content}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : selectedDevotional && (
                <div className="space-y-8 md:space-y-12 animate-in fade-in max-w-4xl mx-auto">
                  <div className="space-y-4">
                    <span className="text-amber-500 font-black text-[10px] md:text-xs uppercase tracking-[0.4em]">DIA {selectedDevotional.day} - {selectedDevotional.month.toUpperCase()}</span>
                    <h3 className="text-3xl md:text-6xl font-black uppercase tracking-tighter leading-none">{selectedDevotional.title}</h3>
                    
                    <div className={`p-6 md:p-8 rounded-[30px] md:rounded-[40px] border relative ${settings.theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-[#fdf3e1] border-[#e1d3b0]'}`}>
                      <Quote className="absolute -top-3 -left-3 md:-top-4 md:-left-4 text-amber-500 opacity-20" size={40} />
                      <p className="font-serif italic text-xl md:text-3xl leading-snug">"{selectedDevotional.verse}"</p>
                      <span className="block text-right text-[10px] md:text-xs font-black uppercase tracking-widest opacity-40 mt-4">— {selectedDevotional.reference}</span>
                    </div>
                  </div>

                  <div className={`prose prose-zinc dark:prose-invert max-w-none text-lg md:text-xl font-serif italic leading-relaxed whitespace-pre-wrap ${settings.theme === 'dark' ? 'text-zinc-300' : 'text-slate-700'}`}>
                    {selectedDevotional.content}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-8">
                    <button onClick={() => handleShare(selectedDevotional.content, selectedDevotional.title)} className="flex-1 py-4 md:py-5 rounded-2xl md:rounded-3xl bg-amber-400 text-black font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 shadow-xl"><Share2 size={16}/> Compartilhar</button>
                    <button onClick={() => playVerseAudio(selectedDevotional.verse)} className="flex-1 py-4 md:py-5 rounded-2xl md:rounded-3xl border border-black/10 font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 hover:bg-black/5 transition-all"><Volume2 size={16}/> Ouvir Versículo</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === 'agenda' && (
            <div className="pb-20">
              <CalendarView 
                events={agendaEvents} 
                settings={settings} 
                isAdmin={isAdmin}
                onEditEvent={openEditEvent}
                onAddEvent={openAddEvent}
              />
              <EventModal 
                isOpen={isEventModalOpen}
                onClose={() => setIsEventModalOpen(false)}
                onSave={handleSaveEvent}
                onDelete={handleDeleteEvent}
                event={editingEvent}
                initialDate={selectedDayForNewEvent}
                settings={settings}
                isAdmin={isAdmin}
              />
            </div>
          )}

          {activeView === 'bible' && (
            <div className="space-y-6 md:space-y-8 animate-in fade-in duration-700 pb-20">
              <div className={`p-4 md:p-6 rounded-[25px] md:rounded-[35px] shadow-sm sticky top-2 z-[90] backdrop-blur-md border animate-in slide-in-from-top-4 duration-500 ${settings.theme === 'dark' ? 'bg-zinc-900/80 border-zinc-800' : settings.theme === 'sepia' ? 'bg-[#e1d3b0]/80 border-[#b09e75]' : 'bg-white/80 border-slate-100'}`}>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-1 md:gap-2">
                    <button onClick={resetBible} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-black/5 ${!selectedBook ? 'text-amber-500' : 'opacity-40'}`}>BIBLIOTECA</button>
                    <ChevronRight size={12} className="opacity-20" />
                    
                    <div className="relative">
                      <button 
                        onClick={() => { setShowBookSelector(!showBookSelector); setShowChapterSelector(false); }} 
                        className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase border ${showBookSelector ? 'bg-amber-400 text-black' : 'bg-white/5 border-black/5'}`}
                      >
                        {selectedBook ? selectedBook.name : "Livro"} <ChevronDown size={14} />
                      </button>
                      {showBookSelector && (
                        <div className={`absolute top-full left-0 mt-3 w-72 md:w-80 border shadow-2xl rounded-[30px] overflow-hidden z-[300] ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-100'}`}>
                          <div className="p-3 border-b border-black/5">
                            <input type="text" placeholder="Buscar livro..." className="w-full p-2 bg-black/5 rounded-xl text-xs outline-none" value={bookFilter} onChange={e => setBookFilter(e.target.value)} />
                          </div>
                          <div className="max-h-64 overflow-y-auto">
                            {filteredBooks.map(book => (
                              <button key={book.name} onClick={() => { setSelectedBook(book); setShowBookSelector(false); setShowChapterSelector(true); }} className="w-full text-left px-5 py-3 text-xs font-bold hover:bg-amber-400 hover:text-black border-b border-black/5 last:border-0">{book.name}</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {selectedBook && (
                      <>
                        <ChevronRight size={12} className="opacity-20" />
                        <div className="relative">
                          <button onClick={() => setShowChapterSelector(!showChapterSelector)} className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase border ${showChapterSelector ? 'bg-amber-400 text-black' : 'bg-white/5 border-black/5'}`}>
                            {selectedChapter ? `Cap. ${selectedChapter}` : "Cap."} <ChevronDown size={14} />
                          </button>
                          {showChapterSelector && (
                            /* Fixed: Use right-0 and max-width to ensure the dropdown stays within screen bounds on mobile */
                            <div className={`absolute top-full right-0 mt-3 w-64 max-w-[85vw] border shadow-2xl rounded-[30px] p-6 z-[300] ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-100'}`}>
                              <div className="grid grid-cols-5 gap-2 max-h-60 overflow-y-auto p-1">
                                {Array.from({ length: selectedBook.chapters }, (_, i) => i + 1).map(num => (
                                  <button key={num} onClick={() => handleChapterSelect(selectedBook.name, num)} className={`aspect-square flex items-center justify-center rounded-xl text-[11px] font-black ${selectedChapter === num ? 'bg-amber-400 text-black' : 'bg-black/5'}`}>{num}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <SearchBar value={bibleSearch} onChange={setBibleSearch} onSearch={handleBibleSearch} placeholder="Pesquisar versículo..." theme={settings.theme} />
                </div>
              </div>

              <div className={`min-h-[600px] rounded-[35px] md:rounded-[50px] shadow-lg border overflow-hidden relative ${settings.focusMode ? 'p-8 md:p-24' : 'p-6 md:p-16'} transition-all duration-500 ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : settings.theme === 'sepia' ? 'bg-[#f4ecd8] border-[#e1d3b0]' : 'bg-white border-slate-100'}`}>
                <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-[250] flex flex-col gap-3">
                  <div className="flex flex-col gap-2 mb-2">
                    <button onClick={() => updateSetting('fontSize', Math.min(42, settings.fontSize + 2))} className="w-10 h-10 md:w-12 md:h-12 bg-white/90 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center border border-black/5 text-slate-600"><Plus size={20} /></button>
                    <button onClick={() => updateSetting('fontSize', Math.max(14, settings.fontSize - 2))} className="w-10 h-10 md:w-12 md:h-12 bg-white/90 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center border border-black/5 text-slate-600"><Minus size={20} /></button>
                  </div>
                  <button onClick={() => setIsSettingsOpen(true)} className="w-12 h-12 md:w-14 md:h-14 bg-amber-400 text-black rounded-full shadow-2xl flex items-center justify-center border-2 border-amber-300"><Settings size={24} /></button>
                </div>

                {!selectedBook && bibleMode === 'browse' && (
                  <div className="max-w-4xl mx-auto space-y-8 md:space-y-12">
                    <div className="text-center space-y-4">
                      <span className="text-amber-500 font-black text-[10px] md:text-xs uppercase tracking-[0.4em]">Biblioteca Sagrada</span>
                      <h2 className="text-3xl md:text-6xl font-black uppercase tracking-tighter">Escolha um Livro</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                      {BIBLE_BOOKS.map(book => (
                        <button key={book.name} onClick={() => { setSelectedBook(book); setSelectedChapter(null); }} className={`p-4 md:p-6 border rounded-3xl text-[9px] md:text-[10px] font-black uppercase transition-all flex flex-col items-center gap-2 group hover:shadow-xl ${settings.theme === 'dark' ? 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-amber-400' : 'bg-white border-slate-100 hover:border-amber-400'}`}>
                          <span className="w-8 h-8 md:w-10 md:h-10 bg-amber-100 dark:bg-amber-400/10 text-amber-600 rounded-xl flex items-center justify-center group-hover:bg-amber-400 group-hover:text-black transition-colors">{book.abbr[0]}</span>
                          {book.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {selectedChapter && bibleVerses.length > 0 && (
                  <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-10 opacity-30">
                      <h2 className="serif-italic text-5xl md:text-8xl">Capítulo {selectedChapter}</h2>
                    </div>
                    <div style={{ gap: `${settings.verseSpacing}px` }} className="flex flex-col">
                      {bibleVerses.map((v, i) => (
                        <VerseItem key={i} v={v} i={i} settings={settings} onCopy={handleCopy} onShare={handleShare} onPlay={playVerseAudio} copiedId={copiedId} referencePrefix={`${selectedBook?.name} ${selectedChapter}:`} />
                      ))}
                    </div>
                    
                    {/* Added: Chapter Navigation Buttons */}
                    <div className="flex items-center justify-between mt-12 pt-8 border-t border-black/5">
                      <button 
                        onClick={() => navigateChapter('prev')}
                        disabled={selectedChapter === 1}
                        className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-black/5 hover:bg-amber-400 hover:text-black transition-all disabled:opacity-20 text-xs font-black uppercase"
                      >
                        <ChevronLeft size={16}/> Anterior
                      </button>
                      <button 
                        onClick={() => navigateChapter('next')}
                        disabled={selectedChapter === selectedBook?.chapters}
                        className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-black/5 hover:bg-amber-400 hover:text-black transition-all disabled:opacity-20 text-xs font-black uppercase"
                      >
                        Próximo <ChevronRight size={16}/>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Visualizações do Manual Presbiteriano e Catecismo Maior */}
          {activeView === 'manual' && (
            <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-20">
              <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-400 rounded-2xl flex items-center justify-center text-black shadow-lg"><Book size={24} /></div>
                    <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter leading-none">Manual Presbiteriano</h2>
                  </div>
                  <p className="opacity-60 max-w-lg text-sm leading-relaxed">Doutrina, Governo e Disciplina da Igreja Presbiteriana do Brasil.</p>
                </div>
                <div className="w-full md:max-w-md">
                   <SearchBar value={manualSearch} onChange={setManualSearch} onSearch={handleManualSearch} placeholder="Pesquisar normas..." theme={settings.theme} />
                </div>
              </header>

              {manualResult ? (
                <div className="space-y-8 animate-in fade-in max-w-4xl mx-auto">
                  <button onClick={() => setManualResult(null)} className="text-amber-500 font-black text-[9px] uppercase tracking-widest flex items-center gap-2"><ArrowLeft size={14}/> Voltar</button>
                  <div className={`p-8 md:p-12 rounded-[45px] border ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-100 shadow-xl'}`}>
                    <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tight mb-6">{manualResult.title}</h3>
                    <div className="prose prose-zinc dark:prose-invert max-w-none">
                      <p className="font-serif italic text-lg leading-relaxed whitespace-pre-wrap">{manualResult.analysis}</p>
                    </div>
                    {manualResult.practicalApplication && (
                      <div className="mt-10 pt-8 border-t border-black/5">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-4">Aplicação Prática</h4>
                        <p className="text-sm font-bold opacity-70 leading-relaxed">{manualResult.practicalApplication}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {MANUAL_RESEARCH_QUESTIONS.map(q => (
                    <button 
                      key={q.id} 
                      onClick={() => handleManualSearch(q.query)}
                      className={`p-10 rounded-[45px] border text-left group transition-all hover:shadow-2xl ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-100'}`}
                    >
                      <span className="text-amber-500 font-black text-[9px] uppercase tracking-widest">Consulta</span>
                      <h3 className="text-xl font-black mt-2 leading-tight group-hover:text-amber-500 transition-colors">{q.label}</h3>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeView === 'catechism' && (
            <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-20">
              <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-400 rounded-2xl flex items-center justify-center text-black shadow-lg"><Layers size={24} /></div>
                    <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter leading-none">Catecismo Maior</h2>
                  </div>
                  <p className="opacity-60 max-w-lg text-sm leading-relaxed">Exposição completa da fé reformada conforme os padrões de Westminster.</p>
                </div>
                <div className="w-full md:max-w-md">
                   <SearchBar value={catechismSearch} onChange={setCatechismSearch} onSearch={handleCatechismSearch} placeholder="Número da pergunta..." theme={settings.theme} />
                </div>
              </header>

              {catechismMode === 'sections' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {CATECHISM_SECTIONS.map(s => (
                    <button 
                      key={s.id} 
                      onClick={() => handleCatechismSectionSelect(s)}
                      className={`p-10 rounded-[45px] border text-left group transition-all hover:shadow-2xl ${settings.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-100'}`}
                    >
                      <span className="text-amber-500 font-black text-[9px] uppercase tracking-widest">{s.description}</span>
                      <h3 className="text-xl font-black mt-2 leading-tight group-hover:text-amber-500 transition-colors">{s.title}</h3>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-10 animate-in fade-in">
                  <button onClick={() => { setCatechismMode('sections'); setCatechismResults(null); }} className="text-amber-500 font-black text-[9px] uppercase tracking-widest flex items-center gap-2"><ArrowLeft size={14}/> Voltar</button>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {(catechismResults || CATECHISM_CARDS).map(card => (
                      <Flipcard key={card.id} card={card} settings={settings} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <AdminLoginModal isOpen={isAdminModalOpen} onClose={() => setIsAdminModalOpen(false)} onAuth={handleAdminAuth} />

      {/* Painel de Configurações Lateral */}
      {isSettingsOpen && <div onClick={() => setIsSettingsOpen(false)} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[240]" />}
      <div className={`fixed inset-y-0 right-0 w-80 z-[250] transform transition-transform duration-500 ease-out-expo ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'} ${settings.theme === 'dark' ? 'bg-zinc-900 text-zinc-100 border-l border-zinc-800' : 'bg-white text-slate-800 border-l border-slate-100'} shadow-2xl p-8 overflow-y-auto`}>
        <div className="flex items-center justify-between mb-8">
           <h3 className="text-xs font-black uppercase tracking-[0.2em]">Configurações</h3>
           <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-black/5 rounded-full"><X size={20}/></button>
        </div>
        <div className="space-y-10">
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-50 flex items-center gap-2"><Palette size={12}/> Paleta</label>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => updateSetting('theme', 'light')} className={`py-4 rounded-xl border text-[9px] font-black uppercase ${settings.theme === 'light' ? 'bg-white border-amber-400 text-black shadow-lg' : 'bg-white/50 border-slate-100'}`}>Claro</button>
              <button onClick={() => updateSetting('theme', 'sepia')} className={`py-4 rounded-xl border text-[9px] font-black uppercase ${settings.theme === 'sepia' ? 'bg-[#e1d3b0] border-[#b09e75] text-[#5b4636]' : 'bg-[#f4ecd8]/50 border-[#e1d3b0]'}`}>Sépia</button>
              <button onClick={() => updateSetting('theme', 'dark')} className={`py-4 rounded-xl border text-[9px] font-black uppercase ${settings.theme === 'dark' ? 'bg-zinc-800 border-amber-400 text-white shadow-lg' : 'bg-zinc-950 border-zinc-800'}`}>Noite</button>
            </div>
          </div>
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Texto</label>
            <div className="flex items-center gap-4">
              <button onClick={() => updateSetting('fontSize', Math.max(14, settings.fontSize - 2))} className="p-3 border rounded-xl hover:bg-black/5"><Minus size={16}/></button>
              <span className="flex-1 text-center font-bold text-sm">{settings.fontSize}px</span>
              <button onClick={() => updateSetting('fontSize', Math.min(42, settings.fontSize + 2))} className="p-3 border rounded-xl hover:bg-black/5"><Plus size={16}/></button>
            </div>
          </div>
          <div className="space-y-4">
             <label className="text-[10px] font-black uppercase tracking-widest opacity-50">Modo de Leitura</label>
             <button onClick={() => updateSetting('focusMode', !settings.focusMode)} className={`w-full py-4 rounded-xl border flex items-center justify-center gap-3 text-[10px] font-black uppercase ${settings.focusMode ? 'bg-amber-400 text-black border-amber-500' : 'bg-black/5 border-transparent'}`}>
                {settings.focusMode ? <EyeOff size={16}/> : <Eye size={16}/>}
                {settings.focusMode ? 'Sair do Modo Foco' : 'Ativar Modo Foco'}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
