import React, { useState, useRef, useEffect } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

export const CustomDatePicker = ({ value, onChange, minDateStr, maxDateStr }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(new Date(value));
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Check if click was on the scrollbar
            if (event.clientX >= document.documentElement.clientWidth) return;
            
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const minDate = new Date(minDateStr);
    minDate.setHours(0,0,0,0);
    const maxDate = new Date(maxDateStr);
    maxDate.setHours(23,59,59,999);

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => {
        let day = new Date(year, month, 1).getDay();
        return day === 0 ? 6 : day - 1; // Monday as first day
    };

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

    const handlePrevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const handleNextMonth = () => setViewDate(new Date(year, month + 1, 1));

    const formatDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const monthNames = ["Januar", "Februar", "Marec", "April", "Maj", "Junij", "Julij", "Avgust", "September", "Oktober", "November", "December"];

    return (
        <div className="relative" ref={containerRef}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 px-6 font-bold focus:ring-4 focus:ring-[#FEBA4F]/20 focus:border-[#FEBA4F] transition-all outline-none flex items-center justify-between cursor-pointer"
            >
                <div className="flex items-center gap-3 text-[#0A1128]">
                    <Calendar size={20} className="text-[#FEBA4F]" />
                    {value.split('-').reverse().join('. ')}
                </div>
                <ChevronDown size={20} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-full sm:w-80 bg-white border border-slate-100 rounded-3xl shadow-2xl z-50 p-6 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between mb-6">
                        <button type="button" onClick={handlePrevMonth} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400 hover:text-[#0A1128]">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="font-black text-[#0A1128] uppercase tracking-widest text-sm">
                            {monthNames[month]} {year}
                        </div>
                        <button type="button" onClick={handleNextMonth} className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400 hover:text-[#0A1128]">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-2 mb-2">
                        {['Po', 'To', 'Sr', 'Če', 'Pe', 'So', 'Ne'].map(d => (
                            <div key={d} className="text-center text-[10px] font-black text-slate-300 uppercase">{d}</div>
                        ))}
                    </div>
                    
                    <div className="grid grid-cols-7 gap-2">
                        {days.map((date, i) => {
                            if (!date) return <div key={`empty-${i}`} className="h-10" />;
                            
                            const dateStr = formatDate(date);
                            const isSelected = value === dateStr;
                            // TESTING PHASE: Allowed all dates
                            // const isSelectable = date >= minDate && date <= maxDate;
                            const isSelectable = true;
                            
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    disabled={!isSelectable}
                                    onClick={() => {
                                        onChange(dateStr);
                                        setIsOpen(false);
                                    }}
                                    className={`h-10 rounded-xl font-bold text-sm transition-all flex items-center justify-center
                                        ${isSelected ? 'bg-[#FEBA4F] text-[#0A1128] shadow-lg shadow-[#FEBA4F]/20 scale-110 z-10' : ''}
                                        ${!isSelected && isSelectable ? 'bg-slate-50 text-[#0A1128] hover:bg-slate-100' : ''}
                                        ${!isSelectable ? 'opacity-30 cursor-not-allowed text-slate-400 bg-transparent' : ''}
                                    `}
                                >
                                    {date.getDate()}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export const CustomTimePicker = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const hoursContainerRef = useRef<HTMLDivElement>(null);
    const minutesContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                const selectedHourBtn = hoursContainerRef.current?.querySelector('.bg-\\[\\#FEBA4F\\]');
                if (selectedHourBtn) {
                    selectedHourBtn.scrollIntoView({ block: 'center', behavior: 'auto' });
                }
                const selectedMinBtn = minutesContainerRef.current?.querySelector('.bg-\\[\\#FEBA4F\\]');
                if (selectedMinBtn) {
                    selectedMinBtn.scrollIntoView({ block: 'center', behavior: 'auto' });
                }
            }, 10);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Check if click was on the scrollbar
            if (event.clientX >= document.documentElement.clientWidth) return;
            
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const [hours, minutes] = value.split(':');

    const handleHourChange = (h: string) => {
        onChange(`${h}:${minutes}`);
    };

    const handleMinuteChange = (m: string) => {
        onChange(`${hours}:${m}`);
    };

    // TESTING PHASE: Allowed all hours 0-23
    const validHours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')); 
    // TESTING PHASE: Allowed 1-minute increments
    const validMinutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    return (
        <div className="relative" ref={containerRef}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 px-6 font-bold focus:ring-4 focus:ring-[#FEBA4F]/20 focus:border-[#FEBA4F] transition-all outline-none flex items-center justify-between cursor-pointer"
            >
                <div className="flex items-center gap-3 text-[#0A1128]">
                    <Clock size={20} className="text-[#FEBA4F]" />
                    {value}
                </div>
                <ChevronDown size={20} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-full bg-white border border-slate-100 rounded-3xl shadow-2xl z-50 p-6 animate-in fade-in slide-in-from-top-2 flex gap-4">
                    <div className="flex-1">
                        <div className="text-[10px] font-black uppercase text-slate-400 mb-3 text-center">Ura</div>
                        <div ref={hoursContainerRef} className="h-48 overflow-y-auto scrollbar-hide flex flex-col gap-1 pr-2" style={{ scrollbarWidth: 'none' }}>
                            {validHours.map(h => (
                                <button
                                    key={h}
                                    type="button"
                                    onClick={() => handleHourChange(h)}
                                    className={`py-3 rounded-xl font-bold text-sm transition-all ${hours === h ? 'bg-[#FEBA4F] text-[#0A1128] shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-[#0A1128]'}`}
                                >
                                    {h}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="w-px bg-slate-100"></div>
                    <div className="flex-1">
                        <div className="text-[10px] font-black uppercase text-slate-400 mb-3 text-center">Minute</div>
                        <div ref={minutesContainerRef} className="h-48 overflow-y-auto scrollbar-hide flex flex-col gap-1 pl-2" style={{ scrollbarWidth: 'none' }}>
                            {validMinutes.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => {
                                        handleMinuteChange(m);
                                        setIsOpen(false);
                                    }}
                                    className={`py-3 rounded-xl font-bold text-sm transition-all ${minutes === m ? 'bg-[#FEBA4F] text-[#0A1128] shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-[#0A1128]'}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
