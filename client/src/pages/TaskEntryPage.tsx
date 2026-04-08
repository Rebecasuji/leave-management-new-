import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useParams } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import TaskForm from '@/components/TaskForm';
import FlyInRobot from '@/components/FlyInRobot';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { format } from 'date-fns';
import { useAuth } from '@/context/AuthContext';
import { ChevronLeft, Trophy, Volume2, VolumeX, Flame, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Task } from '@/components/TaskTable';
import DuckAnimation from '@/components/DuckAnimation';
import AchievementCelebration from '@/components/AchievementCelebration';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';

const getPendingTasksKey = (u: string, d: string) => `pendingTasks_${u}_${d}`;

// ─── SOUND ENGINE ─────────────────────────────────────────────────────────────
const playSound = (type: 'pop' | 'success' | 'woosh' | 'coin' | 'bounce' | 'magic' | 'levelup' | 'keyboard' | 'restrict') => {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const m = ctx.createGain(); m.gain.value = 0.16; m.connect(ctx.destination);
        const tone = (f: number, d: number, w: OscillatorType = 'sine', delay = 0, v = 1) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(m); o.type = w;
            o.frequency.setValueAtTime(f, ctx.currentTime + delay);
            g.gain.setValueAtTime(v, ctx.currentTime + delay);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + d);
            o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + d);
        };
        switch (type) {
            case 'pop': tone(900, 0.07); tone(500, 0.1, 'sine', 0.05); break;
            case 'keyboard': tone(800 + Math.random() * 300, 0.04, 'square', 0, 0.4); break;
            case 'coin': tone(1047, 0.1, 'square'); tone(1319, 0.1, 'square', 0.1); tone(1568, 0.14, 'square', 0.2); break;
            case 'bounce': [350, 700, 1050].forEach((f, i) => tone(f, 0.07, 'sine', i * 0.05)); break;
            case 'woosh': tone(120, 0.3, 'sawtooth'); tone(200, 0.2, 'sawtooth', 0.12); break;
            case 'success': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'sine', i * 0.09)); break;
            case 'magic': [440, 554, 659, 880, 1108, 1318, 1760].forEach((f, i) => tone(f, 0.22, 'sine', i * 0.065, 0.5)); break;
            case 'levelup': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'square', i * 0.1)); break;
            case 'restrict': tone(220, 0.4, 'sawtooth'); tone(200, 0.3, 'sawtooth', 0.1); break;
        }
        setTimeout(() => ctx.close(), 3000);
    } catch (_) { }
};

// ─── CREATIVE SVG ICON SYSTEM ─────────────────────────────────────────────────
// Each member gets a unique hand-crafted SVG icon instead of plain emoji
// These render as beautiful inline illustrations at any size

const SvgIcons: Record<string, (size?: number) => JSX.Element> = {

    // 🌸 Pushpa — Angel with halo + flower wings
    angel_flower: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="af_body" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fde8d0" /><stop offset="100%" stopColor="#fbcfa4" /></radialGradient>
                <radialGradient id="af_wing" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fce7f3" /><stop offset="100%" stopColor="#fbcfe8" /></radialGradient>
            </defs>
            {/* Halo */}
            <ellipse cx="16" cy="4" rx="6" ry="2" fill="none" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" />
            <ellipse cx="16" cy="4" rx="4" ry="1.2" fill="#fef3c7" opacity="0.6" />
            {/* Wings left */}
            <ellipse cx="6" cy="18" rx="6" ry="4" fill="url(#af_wing)" transform="rotate(-20 6 18)" />
            <ellipse cx="8" cy="16" rx="4" ry="2.5" fill="white" opacity="0.5" transform="rotate(-20 8 16)" />
            {/* Wings right */}
            <ellipse cx="26" cy="18" rx="6" ry="4" fill="url(#af_wing)" transform="rotate(20 26 18)" />
            <ellipse cx="24" cy="16" rx="4" ry="2.5" fill="white" opacity="0.5" transform="rotate(20 24 16)" />
            {/* Body */}
            <ellipse cx="16" cy="22" rx="5" ry="7" fill="url(#af_body)" />
            {/* Head */}
            <circle cx="16" cy="12" r="5" fill="url(#af_body)" />
            {/* Eyes */}
            <circle cx="14" cy="11.5" r="1.2" fill="#1e1b4b" />
            <circle cx="18" cy="11.5" r="1.2" fill="#1e1b4b" />
            <circle cx="13.5" cy="11" r="0.4" fill="white" />
            <circle cx="17.5" cy="11" r="0.4" fill="white" />
            {/* Smile */}
            <path d="M13.5 14 Q16 16 18.5 14" fill="none" stroke="#e9967a" strokeWidth="0.9" strokeLinecap="round" />
            {/* Flower on dress */}
            <circle cx="16" cy="24" r="2" fill="#ec4899" />
            <circle cx="16" cy="22" r="1.2" fill="#fce7f3" />
            <circle cx="14.5" cy="24" r="1.2" fill="#fce7f3" />
            <circle cx="17.5" cy="24" r="1.2" fill="#fce7f3" />
            <circle cx="16" cy="25.5" r="1.2" fill="#fce7f3" />
            <circle cx="16" cy="24" r="0.7" fill="#fbbf24" />
            {/* Sparkles */}
            <path d="M4 8 L4.6 9.6 L6.2 10.2 L4.6 10.8 L4 12.4 L3.4 10.8 L1.8 10.2 L3.4 9.6Z" fill="#fbbf24" opacity="0.9" />
            <path d="M27 6 L27.4 7.2 L28.6 7.6 L27.4 8 L27 9.2 L26.6 8 L25.4 7.6 L26.6 7.2Z" fill="#f9a8d4" opacity="0.8" />
        </svg>
    ),

    // 💜 Samyuktha — Star angel with purple wings
    star_angel: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="sa_wing" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#e9d5ff" /><stop offset="100%" stopColor="#d8b4fe" /></radialGradient>
            </defs>
            {/* Halo star */}
            <path d="M16 2 L17 5 L20 5 L17.5 7 L18.5 10 L16 8 L13.5 10 L14.5 7 L12 5 L15 5Z" fill="#fbbf24" opacity="0.9" />
            {/* Wings */}
            <path d="M4 20 Q2 14 8 12 Q5 16 10 18Z" fill="url(#sa_wing)" />
            <path d="M28 20 Q30 14 24 12 Q27 16 22 18Z" fill="url(#sa_wing)" />
            <path d="M5 19 Q4 15 8 14" fill="none" stroke="#c084fc" strokeWidth="0.8" opacity="0.6" />
            <path d="M27 19 Q28 15 24 14" fill="none" stroke="#c084fc" strokeWidth="0.8" opacity="0.6" />
            {/* Dress */}
            <path d="M11 18 Q10 28 16 29 Q22 28 21 18Z" fill="#a855f7" />
            <path d="M11 18 Q16 22 21 18" fill="#c084fc" />
            {/* Head */}
            <circle cx="16" cy="14" r="5" fill="#fde8d0" />
            {/* Eyes — big sparkly */}
            <ellipse cx="14" cy="13.5" rx="1.4" ry="1.6" fill="#4c1d95" />
            <ellipse cx="18" cy="13.5" rx="1.4" ry="1.6" fill="#4c1d95" />
            <circle cx="13.5" cy="13" r="0.5" fill="white" />
            <circle cx="17.5" cy="13" r="0.5" fill="white" />
            {/* Blush */}
            <ellipse cx="12.5" cy="15.5" rx="1.5" ry="1" fill="#f9a8d4" opacity="0.5" />
            <ellipse cx="19.5" cy="15.5" rx="1.5" ry="1" fill="#f9a8d4" opacity="0.5" />
            {/* Smile */}
            <path d="M14 16.5 Q16 18 18 16.5" fill="none" stroke="#e9967a" strokeWidth="0.9" strokeLinecap="round" />
            {/* Mini stars floating */}
            <path d="M5 10 L5.5 11.5 L7 12 L5.5 12.5 L5 14 L4.5 12.5 L3 12 L4.5 11.5Z" fill="#e879f9" opacity="0.7" />
            <path d="M26 8 L26.4 9.2 L27.6 9.6 L26.4 10 L26 11.2 L25.6 10 L24.4 9.6 L25.6 9.2Z" fill="#c084fc" opacity="0.8" />
        </svg>
    ),

    // 🖥️ Sam — Techno angel / robot with halo
    tech_angel: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Halo circuit */}
            <ellipse cx="16" cy="4.5" rx="6.5" ry="2" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="2,2" />
            <circle cx="16" cy="4.5" r="1" fill="#6366f1" />
            {/* Wings — geometric/circuit style */}
            <path d="M4 18 L2 14 L6 13 L8 16 L6 20Z" fill="#3730a3" opacity="0.85" />
            <path d="M3 15 L6 14" stroke="#818cf8" strokeWidth="0.8" />
            <path d="M3.5 17 L6 16" stroke="#818cf8" strokeWidth="0.8" />
            <path d="M28 18 L30 14 L26 13 L24 16 L26 20Z" fill="#3730a3" opacity="0.85" />
            <path d="M29 15 L26 14" stroke="#818cf8" strokeWidth="0.8" />
            <path d="M28.5 17 L26 16" stroke="#818cf8" strokeWidth="0.8" />
            {/* Body — suit */}
            <rect x="11" y="19" width="10" height="11" rx="3" fill="#1e1b4b" />
            <rect x="13" y="20" width="6" height="4" rx="1" fill="#3730a3" />
            {/* Screen/chest panel */}
            <rect x="13.5" y="20.5" width="5" height="3" rx="0.5" fill="#6366f1" opacity="0.4" />
            <rect x="14" y="21" width="1.5" height="1.5" rx="0.2" fill="#818cf8" />
            <rect x="16.5" y="21" width="1.5" height="1.5" rx="0.2" fill="#34d399" />
            {/* Head */}
            <rect x="11" y="10" width="10" height="10" rx="3.5" fill="#fde8d0" />
            {/* Eyes — screen style */}
            <rect x="12.5" y="13" width="3" height="2.5" rx="0.8" fill="#1e1b4b" />
            <rect x="16.5" y="13" width="3" height="2.5" rx="0.8" fill="#1e1b4b" />
            <rect x="13" y="13.3" width="2" height="1.5" rx="0.4" fill="#6366f1" />
            <rect x="17" y="13.3" width="2" height="1.5" rx="0.4" fill="#6366f1" />
            <circle cx="13.8" cy="13.8" r="0.5" fill="white" />
            <circle cx="17.8" cy="13.8" r="0.5" fill="white" />
            {/* Mouth LED */}
            <path d="M13 17 L19 17" stroke="#818cf8" strokeWidth="1" strokeLinecap="round" />
            <circle cx="14.5" cy="17" r="0.5" fill="#34d399" />
            <circle cx="17.5" cy="17" r="0.5" fill="#818cf8" />
            {/* Glasses */}
            <rect x="12" y="12.5" width="3.5" height="3" rx="1" fill="none" stroke="#818cf8" strokeWidth="0.8" />
            <rect x="16.5" y="12.5" width="3.5" height="3" rx="1" fill="none" stroke="#818cf8" strokeWidth="0.8" />
            <line x1="15.5" y1="14" x2="16.5" y2="14" stroke="#818cf8" strokeWidth="0.8" />
            {/* Binary float */}
            <text x="1" y="10" fontSize="3.5" fill="#6366f1" opacity="0.6" fontFamily="monospace">01</text>
            <text x="25" y="10" fontSize="3.5" fill="#818cf8" opacity="0.6" fontFamily="monospace">10</text>
        </svg>
    ),

    // 💻 Durga — Coding goddess angel
    code_angel: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="ca_wing" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#d1fae5" /><stop offset="100%" stopColor="#6ee7b7" /></radialGradient>
            </defs>
            {/* Halo — green glow ring */}
            <circle cx="16" cy="5" r="5" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.8" />
            <circle cx="16" cy="5" r="3" fill="#d1fae5" opacity="0.4" />
            <text x="13.5" y="7" fontSize="4" fill="#10b981" fontFamily="monospace" fontWeight="bold">{`</>`}</text>
            {/* Wings — leaf/nature style */}
            <path d="M2 19 Q1 13 7 11 Q4 16 9 18Q6 19 2 19Z" fill="url(#ca_wing)" opacity="0.9" />
            <path d="M30 19 Q31 13 25 11 Q28 16 23 18 Q26 19 30 19Z" fill="url(#ca_wing)" opacity="0.9" />
            <path d="M3 18 Q3 14 7 12" fill="none" stroke="#34d399" strokeWidth="0.7" opacity="0.7" />
            <path d="M29 18 Q29 14 25 12" fill="none" stroke="#34d399" strokeWidth="0.7" opacity="0.7" />
            {/* Body hoodie */}
            <path d="M11 19 Q10 29 16 30 Q22 29 21 19Z" fill="#065f46" />
            <text x="13" y="26" fontSize="5" fill="#34d399" fontFamily="monospace">{`{}`}</text>
            {/* Head */}
            <circle cx="16" cy="15" r="5.5" fill="#fde8d0" />
            {/* Curly hair hint */}
            <path d="M10.5 13 Q11 9 16 9.5 Q21 9 21.5 13" fill="#292524" />
            <path d="M11 13 Q10 10 12 10" fill="#1c1917" />
            <path d="M21 13 Q22 10 20 10" fill="#1c1917" />
            {/* Eyes bright green */}
            <ellipse cx="14" cy="14.5" rx="1.5" ry="1.7" fill="#14532d" />
            <ellipse cx="18" cy="14.5" rx="1.5" ry="1.7" fill="#14532d" />
            <circle cx="13.5" cy="14" r="0.6" fill="white" />
            <circle cx="17.5" cy="14" r="0.6" fill="white" />
            {/* Blush */}
            <ellipse cx="12" cy="16" rx="1.5" ry="1" fill="#fca5a5" opacity="0.45" />
            <ellipse cx="20" cy="16" rx="1.5" ry="1" fill="#fca5a5" opacity="0.45" />
            {/* Smile */}
            <path d="M13.5 17.5 Q16 19.5 18.5 17.5" fill="#fda4af" stroke="#dc2626" strokeWidth="0.7" strokeLinecap="round" />
            {/* Floating sparkles */}
            <circle cx="4" cy="8" r="1" fill="#34d399" opacity="0.7" />
            <circle cx="28" cy="8" r="1" fill="#6ee7b7" opacity="0.7" />
            <path d="M26 5 L26.5 6.5 L28 7 L26.5 7.5 L26 9 L25.5 7.5 L24 7 L25.5 6.5Z" fill="#10b981" opacity="0.6" />
        </svg>
    ),

    // 🚀 Rebecca — Rocket angel / space girl
    rocket_angel: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="ra_wing" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#cffafe" /><stop offset="100%" stopColor="#a5f3fc" /></radialGradient>
            </defs>
            {/* Rocket halo */}
            <ellipse cx="16" cy="4" rx="6" ry="2" fill="none" stroke="#06b6d4" strokeWidth="1.5" />
            {/* Rocket on top */}
            <path d="M14 4 Q16 1 18 4 L18 8 Q16 10 14 8Z" fill="#0891b2" />
            <ellipse cx="16" cy="8" rx="2" ry="1" fill="#06b6d4" />
            <path d="M12 7 L14 6" fill="none" stroke="#e0f2fe" strokeWidth="0.8" />
            <path d="M20 7 L18 6" fill="none" stroke="#e0f2fe" strokeWidth="0.8" />
            {/* Exhaust flames */}
            <path d="M15 8 L14.5 11 L16 10 L17.5 11 L17 8" fill="#f97316" opacity="0.8" />
            {/* Wings — techy rounded */}
            <path d="M3 21 Q2 16 7 14 Q5 18 9 20Z" fill="url(#ra_wing)" opacity="0.9" />
            <path d="M29 21 Q30 16 25 14 Q27 18 23 20Z" fill="url(#ra_wing)" opacity="0.9" />
            {/* Body — jumpsuit */}
            <path d="M11 20 Q10 29 16 30 Q22 29 21 20Z" fill="#0e7490" />
            {/* Chest badge */}
            <circle cx="16" cy="24" r="2.5" fill="#06b6d4" />
            <path d="M14.5 24 L15.5 22.5 L17.5 24 L15.5 25.5Z" fill="white" opacity="0.8" />
            {/* Head */}
            <circle cx="16" cy="16" r="5.5" fill="#fde8d0" />
            {/* Hair bob */}
            <path d="M10.5 15 Q11 10 16 10 Q21 10 21.5 15" fill="#164e63" />
            <path d="M10.5 15 Q10 18 12 18" fill="#164e63" />
            <path d="M21.5 15 Q22 18 20 18" fill="#164e63" />
            {/* Eyes + glasses */}
            <circle cx="14" cy="16" r="2.2" fill="none" stroke="#06b6d4" strokeWidth="1.2" />
            <circle cx="18" cy="16" r="2.2" fill="none" stroke="#06b6d4" strokeWidth="1.2" />
            <line x1="16.2" y1="16" x2="15.8" y2="16" stroke="#06b6d4" strokeWidth="1.2" />
            <ellipse cx="14" cy="16" rx="1.3" ry="1.5" fill="#082f49" />
            <ellipse cx="18" cy="16" rx="1.3" ry="1.5" fill="#082f49" />
            <circle cx="13.4" cy="15.4" r="0.5" fill="white" />
            <circle cx="17.4" cy="15.4" r="0.5" fill="white" />
            {/* Smile + dimples */}
            <path d="M13.5 19 Q16 21 18.5 19" fill="none" stroke="#0891b2" strokeWidth="1" strokeLinecap="round" />
            {/* Stars */}
            <path d="M4 9 L4.5 10.5 L6 11 L4.5 11.5 L4 13 L3.5 11.5 L2 11 L3.5 10.5Z" fill="#67e8f9" opacity="0.7" />
            <path d="M28 7 L28.4 8.2 L29.6 8.6 L28.4 9 L28 10.2 L27.6 9 L26.4 8.6 L27.6 8.2Z" fill="#a5f3fc" opacity="0.8" />
            <circle cx="27" cy="14" r="0.8" fill="#06b6d4" opacity="0.5" />
        </svg>
    ),

    // 💰 Zameela — Fortune angel with gold coins
    fortune_angel: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="fa_wing" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fef9c3" /><stop offset="100%" stopColor="#fde68a" /></radialGradient>
            </defs>
            {/* Gold halo */}
            <circle cx="16" cy="5" r="4.5" fill="none" stroke="#fbbf24" strokeWidth="2" />
            <circle cx="16" cy="5" r="2" fill="#fef3c7" opacity="0.7" />
            <text x="14.5" y="7" fontSize="3.5" fill="#d97706">₿</text>
            {/* Gold wings */}
            <path d="M2 20 Q1 14 7 12 Q4 17 9 19Z" fill="url(#fa_wing)" opacity="0.95" />
            <path d="M30 20 Q31 14 25 12 Q28 17 23 19Z" fill="url(#fa_wing)" opacity="0.95" />
            <path d="M3 19 Q3 15 7 13" fill="none" stroke="#fbbf24" strokeWidth="0.8" />
            <path d="M29 19 Q29 15 25 13" fill="none" stroke="#fbbf24" strokeWidth="0.8" />
            {/* Hijab */}
            <path d="M9.5 16 Q10 10 16 9.5 Q22 10 22.5 16 Q22 22 16 23 Q10 22 9.5 16Z" fill="#b45309" />
            <path d="M9.5 17 Q8 22 10 26 Q13 30 16 30 Q19 30 22 26 Q24 22 22.5 17" fill="#92400e" />
            {/* Face */}
            <ellipse cx="16" cy="16.5" rx="5.5" ry="5" fill="#fde8d0" />
            {/* Eyes almond */}
            <ellipse cx="13.5" cy="15.5" rx="1.8" ry="1.4" fill="#1c1917" />
            <ellipse cx="18.5" cy="15.5" rx="1.8" ry="1.4" fill="#1c1917" />
            <circle cx="13" cy="15" r="0.5" fill="white" />
            <circle cx="18" cy="15" r="0.5" fill="white" />
            {/* Blush gold tint */}
            <ellipse cx="11.5" cy="17.5" rx="1.5" ry="1" fill="#fcd34d" opacity="0.45" />
            <ellipse cx="20.5" cy="17.5" rx="1.5" ry="1" fill="#fcd34d" opacity="0.45" />
            {/* Smile */}
            <path d="M13.5 19 Q16 21 18.5 19" fill="none" stroke="#c2410c" strokeWidth="0.9" strokeLinecap="round" />
            {/* Gold coins floating */}
            <circle cx="5" cy="11" r="2.5" fill="#fbbf24" />
            <circle cx="5" cy="11" r="1.5" fill="#fef3c7" />
            <text x="3.5" y="12.3" fontSize="3" fill="#d97706" fontWeight="bold">$</text>
            <circle cx="27" cy="9" r="2" fill="#fbbf24" />
            <circle cx="27" cy="9" r="1.2" fill="#fef3c7" />
            <text x="25.7" y="10.2" fontSize="2.8" fill="#d97706" fontWeight="bold">$</text>
            <circle cx="5" cy="25" r="1.5" fill="#fcd34d" opacity="0.6" />
        </svg>
    ),

    // 📈 Mohan — Chart wizard / finance god
    chart_wizard: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Wizard hat with chart */}
            <path d="M10 12 L16 2 L22 12Z" fill="#a16207" />
            <path d="M10 12 L16 3 L22 12" fill="none" stroke="#fbbf24" strokeWidth="0.7" opacity="0.5" />
            {/* Hat band */}
            <rect x="9.5" y="11.5" width="13" height="2" rx="1" fill="#92400e" />
            {/* Chart on hat */}
            <polyline points="11,11 13,8 15,9 17,6 19,7" fill="none" stroke="#fcd34d" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            {/* Halo ring */}
            <ellipse cx="16" cy="12" rx="7" ry="2.5" fill="none" stroke="#fbbf24" strokeWidth="1.2" opacity="0.6" />
            {/* Wings — paper/document style */}
            <rect x="1" y="19" width="8" height="10" rx="1.5" fill="#fef3c7" opacity="0.9" transform="rotate(-20 5 24)" />
            <line x1="2.5" y1="21" x2="7.5" y2="21" stroke="#fbbf24" strokeWidth="0.7" transform="rotate(-20 5 21)" />
            <line x1="2.5" y1="23" x2="7.5" y2="23" stroke="#fcd34d" strokeWidth="0.7" transform="rotate(-20 5 23)" />
            <rect x="23" y="19" width="8" height="10" rx="1.5" fill="#fef3c7" opacity="0.9" transform="rotate(20 27 24)" />
            <line x1="24.5" y1="21" x2="29.5" y2="21" stroke="#fbbf24" strokeWidth="0.7" transform="rotate(20 27 21)" />
            <line x1="24.5" y1="23" x2="29.5" y2="23" stroke="#fcd34d" strokeWidth="0.7" transform="rotate(20 27 23)" />
            {/* Body — formal */}
            <rect x="11" y="21" width="10" height="9" rx="3" fill="#78350f" />
            <rect x="14" y="22" width="4" height="3" rx="0.5" fill="#fef3c7" />
            {/* Tie */}
            <path d="M15 24 L16 29 L17 24 Q16 22.5 15 24Z" fill="#f59e0b" />
            {/* Head with moustache */}
            <ellipse cx="16" cy="18" rx="5.5" ry="5" fill="#fed7aa" />
            {/* Eyes wise squint */}
            <ellipse cx="13.5" cy="17.5" rx="1.6" ry="1.3" fill="#1c1917" />
            <ellipse cx="18.5" cy="17.5" rx="1.6" ry="1.3" fill="#1c1917" />
            <circle cx="13" cy="17" r="0.5" fill="white" />
            <circle cx="18" cy="17" r="0.5" fill="white" />
            {/* Moustache */}
            <path d="M12.5 20.5 Q14.5 19.5 16 20 Q17.5 19.5 19.5 20.5 Q17.5 21.5 16 21 Q14.5 21.5 12.5 20.5Z" fill="#1c1917" />
            {/* Arrow up floating */}
            <path d="M27 3 L27 7 M25 5 L27 3 L29 5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="5" cy="15" r="1" fill="#fbbf24" opacity="0.6" />
        </svg>
    ),

    // 📦 Arun — Guardian angel with shield
    guardian_angel: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="ga_wing" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fee2e2" /><stop offset="100%" stopColor="#fca5a5" /></radialGradient>
            </defs>
            {/* Crown halo */}
            <path d="M10 6 L12 3 L16 5 L20 3 L22 6 L21 8 L11 8Z" fill="#fbbf24" />
            <circle cx="12" cy="3" r="1" fill="#fef3c7" />
            <circle cx="16" cy="5" r="1" fill="#fef3c7" />
            <circle cx="20" cy="3" r="1" fill="#fef3c7" />
            {/* Wings — strong feathered */}
            <path d="M2 20 Q1 14 8 12 Q5 16 10 19Z" fill="url(#ga_wing)" opacity="0.95" />
            <path d="M30 20 Q31 14 24 12 Q27 16 22 19Z" fill="url(#ga_wing)" opacity="0.95" />
            <path d="M3 19 Q2 15 7 13" fill="none" stroke="#fca5a5" strokeWidth="0.8" />
            <path d="M29 19 Q30 15 25 13" fill="none" stroke="#fca5a5" strokeWidth="0.8" />
            {/* Shield on chest */}
            <path d="M11 22 Q11 30 16 31 Q21 30 21 22 L16 20Z" fill="#991b1b" />
            <path d="M12 23 Q12 29 16 30 Q20 29 20 23 L16 21.5Z" fill="#dc2626" />
            {/* Shield symbol */}
            <path d="M14 26 L15.5 24 L18 26 L15.5 28Z" fill="#fef2f2" opacity="0.8" />
            {/* Body suit */}
            <rect x="12" y="20" width="8" height="6" rx="2" fill="#450a0a" opacity="0" />
            {/* Head — strong jaw */}
            <ellipse cx="16" cy="15.5" rx="5.5" ry="5.5" fill="#fed7aa" />
            {/* Hair neat */}
            <path d="M10.5 14 Q11 9 16 9 Q21 9 21.5 14" fill="#1c1917" />
            <path d="M10.5 14 Q10.5 11 12 11" fill="#1c1917" />
            {/* Eyes determined */}
            <ellipse cx="13.5" cy="14.5" rx="1.6" ry="1.6" fill="#7f1d1d" />
            <ellipse cx="18.5" cy="14.5" rx="1.6" ry="1.6" fill="#7f1d1d" />
            <circle cx="13" cy="14" r="0.55" fill="white" />
            <circle cx="18" cy="14" r="0.55" fill="white" />
            {/* Bold brows */}
            <path d="M11.5 12 L15 12" stroke="#1c1917" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M17 12 L20.5 12" stroke="#1c1917" strokeWidth="1.2" strokeLinecap="round" />
            {/* Smirk */}
            <path d="M13.5 17.5 Q16.5 19.5 19 17" fill="none" stroke="#b91c1c" strokeWidth="1" strokeLinecap="round" />
            {/* Sparkle stars */}
            <path d="M4 9 L4.5 10.5 L6 11 L4.5 11.5 L4 13 L3.5 11.5 L2 11 L3.5 10.5Z" fill="#f87171" opacity="0.8" />
            <path d="M27 7 L27.4 8.2 L28.6 8.6 L27.4 9 L27 10.2 L26.6 9 L25.4 8.6 L26.6 8.2Z" fill="#fca5a5" opacity="0.7" />
        </svg>
    ),

    // 🏆 Yuvaraj — Trophy angel / champion
    trophy_angel: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Trophy halo */}
            <path d="M12 7 L12 4 Q12 2 16 2 Q20 2 20 4 L20 7 Q20 10 16 11 Q12 10 12 7Z" fill="#fbbf24" />
            <path d="M12 5 L10 3" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M20 5 L22 3" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M16 11 L16 13" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="13.5" y="13" width="5" height="1.5" rx="0.5" fill="#fbbf24" />
            {/* Cap with star */}
            <path d="M9 16 Q9 13 16 13 Q23 13 23 16 Q22 18 16 18.5 Q10 18 9 16Z" fill="#991b1b" />
            <path d="M9 16 L23 16" stroke="#dc2626" strokeWidth="0.8" />
            <path d="M16 14.5 L16.5 15.7 L17.8 15.7 L16.8 16.4 L17.2 17.7 L16 17 L14.8 17.7 L15.2 16.4 L14.2 15.7 L15.5 15.7Z" fill="#fbbf24" />
            {/* Wings sporty */}
            <path d="M2 23 Q2 18 8 16 Q5 20 10 22Z" fill="#fca5a5" opacity="0.85" />
            <path d="M30 23 Q30 18 24 16 Q27 20 22 22Z" fill="#fca5a5" opacity="0.85" />
            {/* Jersey */}
            <path d="M10 22 Q9 31 16 32 Q23 31 22 22Z" fill="#dc2626" />
            <text x="13" y="29" fontSize="5" fill="white" fontFamily="sans-serif" fontWeight="900">10</text>
            {/* Head */}
            <ellipse cx="16" cy="21" rx="5.5" ry="5" fill="#fde8d0" />
            {/* Big smile */}
            <path d="M12.5 23 Q16 26 19.5 23" fill="#fda4af" stroke="#b91c1c" strokeWidth="0.9" strokeLinecap="round" />
            <path d="M13.5 23.5 Q16 26 18.5 23.5" fill="white" opacity="0.6" />
            {/* Eyes excited */}
            <ellipse cx="13.5" cy="20.5" rx="1.7" ry="1.9" fill="#7f1d1d" />
            <ellipse cx="18.5" cy="20.5" rx="1.7" ry="1.9" fill="#7f1d1d" />
            <circle cx="13" cy="20" r="0.6" fill="white" />
            <circle cx="18" cy="20" r="0.6" fill="white" />
            {/* Confetti */}
            <rect x="3" y="8" width="2" height="2" rx="0.3" fill="#f87171" transform="rotate(20 4 9)" />
            <rect x="27" y="6" width="1.5" height="1.5" rx="0.3" fill="#fbbf24" transform="rotate(-15 27.5 7)" />
            <circle cx="5" cy="14" r="0.8" fill="#fca5a5" />
            <circle cx="27" cy="14" r="0.8" fill="#fbbf24" />
        </svg>
    ),

    // 🎯 Kamali — Mystic angel / sales wizard
    mystic_angel: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="ma_wing" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ede9fe" /><stop offset="100%" stopColor="#c4b5fd" /></radialGradient>
            </defs>
            {/* Magic wand + target halo */}
            <circle cx="16" cy="5" r="4.5" fill="none" stroke="#8b5cf6" strokeWidth="1.5" />
            <circle cx="16" cy="5" r="2.5" fill="none" stroke="#a855f7" strokeWidth="1" />
            <circle cx="16" cy="5" r="1" fill="#8b5cf6" />
            {/* Wand */}
            <line x1="20" y1="2" x2="26" y2="8" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M24 6 L26 8 L24 8Z" fill="#fbbf24" />
            {/* Wings — crystal/mystic */}
            <path d="M2 21 Q1 15 7 13 Q5 18 10 20Z" fill="url(#ma_wing)" opacity="0.95" />
            <path d="M30 21 Q31 15 25 13 Q27 18 22 20Z" fill="url(#ma_wing)" opacity="0.95" />
            <path d="M3 20 Q2 16 6 14" fill="none" stroke="#a855f7" strokeWidth="0.7" />
            <path d="M29 20 Q30 16 26 14" fill="none" stroke="#a855f7" strokeWidth="0.7" />
            {/* Body — blazer */}
            <path d="M11 21 Q10 30 16 31 Q22 30 21 21Z" fill="#4c1d95" />
            <path d="M11 21 L16 25 L21 21 L19 19 L16 23 L13 19Z" fill="#5b21b6" />
            {/* Gem on chest */}
            <path d="M14.5 25 L16 23 L17.5 25 L16 27Z" fill="#a855f7" />
            <path d="M14.5 25 L16 23 L17.5 25" fill="#c084fc" />
            {/* Head */}
            <circle cx="16" cy="16" r="5.5" fill="#fde8d0" />
            {/* Ponytail */}
            <path d="M10.5 14.5 Q11 9.5 16 9.5 Q21 9.5 21.5 14.5" fill="#1c1917" />
            <path d="M21 12 Q24 12 24 18 Q22 16 22 14" fill="#1c1917" />
            <circle cx="22" cy="11" r="2" fill="#8b5cf6" />
            <circle cx="22" cy="11" r="1" fill="#c084fc" />
            {/* Eyes confident */}
            <ellipse cx="13.5" cy="15.5" rx="1.7" ry="1.9" fill="#2e1065" />
            <ellipse cx="18.5" cy="15.5" rx="1.7" ry="1.9" fill="#2e1065" />
            <circle cx="13" cy="14.9" r="0.6" fill="white" />
            <circle cx="18" cy="14.9" r="0.6" fill="white" />
            {/* Earring */}
            <circle cx="10.5" cy="17" r="1.5" fill="#8b5cf6" />
            <circle cx="10.5" cy="17" r="0.7" fill="#e9d5ff" />
            {/* Smile */}
            <path d="M13.5 18.5 Q16 20.5 18.5 18.5" fill="none" stroke="#7c3aed" strokeWidth="1" strokeLinecap="round" />
            {/* Star sparks */}
            <path d="M4 9 L4.5 10.5 L6 11 L4.5 11.5 L4 13 L3.5 11.5 L2 11 L3.5 10.5Z" fill="#a855f7" opacity="0.8" />
            <path d="M27 5 L27.4 6.2 L28.6 6.6 L27.4 7 L27 8.2 L26.6 7 L25.4 6.6 L26.6 6.2Z" fill="#c084fc" opacity="0.9" />
            <circle cx="6" cy="19" r="0.8" fill="#8b5cf6" opacity="0.5" />
        </svg>
    ),

    // 🔧 Naveen — Cyber angel / IT support
    cyber_angel: (s = 22) => (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="cya_wing" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#e0f2fe" /><stop offset="100%" stopColor="#7dd3fc" /></radialGradient>
            </defs>
            {/* Headset halo */}
            <path d="M9.5 10 Q9.5 5 16 5 Q22.5 5 22.5 10" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" />
            <circle cx="9.5" cy="11" r="2.5" fill="#0c4a6e" />
            <circle cx="9.5" cy="11" r="1.3" fill="#0ea5e9" />
            <circle cx="22.5" cy="11" r="2.5" fill="#0c4a6e" />
            <circle cx="22.5" cy="11" r="1.3" fill="#0ea5e9" />
            {/* Mic */}
            <path d="M22.5 13 Q25 14 25 17" stroke="#0c4a6e" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="25" cy="17.5" r="1.5" fill="#0ea5e9" opacity="0.8" />
            <circle cx="25" cy="17.5" r="0.6" fill="#38bdf8" />
            {/* Wings — circuit */}
            <path d="M2 22 L1 18 L6 17 L8 20 L5 23Z" fill="url(#cya_wing)" opacity="0.9" />
            <line x1="2.5" y1="19.5" x2="6" y2="18.5" stroke="#0ea5e9" strokeWidth="0.7" />
            <line x1="2.5" y1="21" x2="5.5" y2="20" stroke="#7dd3fc" strokeWidth="0.7" />
            <path d="M30 22 L31 18 L26 17 L24 20 L27 23Z" fill="url(#cya_wing)" opacity="0.9" />
            <line x1="29.5" y1="19.5" x2="26" y2="18.5" stroke="#0ea5e9" strokeWidth="0.7" />
            <line x1="29.5" y1="21" x2="26.5" y2="20" stroke="#7dd3fc" strokeWidth="0.7" />
            {/* Body tee */}
            <path d="M11 21 Q10 30 16 31 Q22 30 21 21Z" fill="#075985" />
            <rect x="13" y="23" width="6" height="5" rx="1" fill="#0c4a6e" opacity="0.6" />
            <text x="13.5" y="27" fontSize="3.5" fill="#38bdf8" fontFamily="monospace">{`>_`}</text>
            {/* Head */}
            <ellipse cx="16" cy="17" rx="5.5" ry="5.5" fill="#fed7aa" />
            {/* Hair */}
            <path d="M10.5 15.5 Q11 10.5 16 10.5 Q21 10.5 21.5 15.5" fill="#0f172a" />
            {/* Eyes alert */}
            <ellipse cx="13.5" cy="16.5" rx="1.6" ry="1.8" fill="#0c4a6e" />
            <ellipse cx="18.5" cy="16.5" rx="1.6" ry="1.8" fill="#0c4a6e" />
            <circle cx="13" cy="16" r="0.55" fill="white" />
            <circle cx="18" cy="16" r="0.55" fill="white" />
            {/* Brows raised */}
            <path d="M11.5 14.5 Q13.5 13.5 15.5 14" stroke="#0f172a" strokeWidth="1" strokeLinecap="round" />
            <path d="M16.5 14 Q18.5 13.5 20.5 14.5" stroke="#0f172a" strokeWidth="1" strokeLinecap="round" />
            {/* Smile friendly */}
            <path d="M13.5 19.5 Q16 21.5 18.5 19.5" fill="none" stroke="#0284c7" strokeWidth="1" strokeLinecap="round" />
            {/* WiFi signal */}
            <path d="M4 7 Q7 4 10 7" fill="none" stroke="#38bdf8" strokeWidth="1" strokeLinecap="round" />
            <path d="M5.5 8.5 Q7 7 8.5 8.5" fill="none" stroke="#7dd3fc" strokeWidth="1" strokeLinecap="round" />
            <circle cx="7" cy="10" r="0.7" fill="#0ea5e9" />
            {/* Spark */}
            <path d="M27 4 L27.5 5.5 L29 6 L27.5 6.5 L27 8 L26.5 6.5 L25 6 L26.5 5.5Z" fill="#38bdf8" opacity="0.8" />
        </svg>
    ),
};

type AvatarGender = 'female' | 'male';

const buildAnimeAvatarUrl = (member: TeamMember): string => {
    if (member.photo) return member.photo;
    const seed = encodeURIComponent(member.avatarSeed);
    const bg = member.bgColor.replace('#', '');
    if (member.gender === 'female') {
        return `https://api.dicebear.com/9.x/lorelei/svg?seed=${seed}&backgroundColor=${bg}&backgroundType=gradientLinear&radius=24`;
    } else {
        return `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=${bg}&backgroundType=gradientLinear&radius=24`;
    }
};

// ─── TEAM DATA ────────────────────────────────────────────────────────────────
const TEAM = [
    {
        id: 'pushpa', name: 'Pushpa', dept: 'HR', deptColor: '#ec4899', bgFrom: '#4a044e', bgTo: '#831843',
        gender: 'female' as AvatarGender, avatarSeed: 'Pushpa-anime-girl-pink', bgColor: '#831843',
        iconKey: 'angel_flower',
        cheers: ['HR says: Amazing work! 💼', 'Pushpa is so proud!', 'Great employee today!', 'Policy followed! ✅'],
        idle: ['HR reminder: Log hours!', 'Pushpa is waiting! 😊', 'Don\'t miss the deadline!'],
    },
    {
        id: 'samyuktha', name: 'Samyuktha', dept: 'HR', deptColor: '#f472b6', bgFrom: '#701a75', bgTo: '#a21caf',
        gender: 'female' as AvatarGender, avatarSeed: 'Samyuktha-anime-girl-purple', bgColor: '#a21caf',
        iconKey: 'star_angel',
        cheers: ['Attendance perfect! 🗓️', 'Samyuktha cheers! 🎊', 'Keep it up! 💪', 'Well documented!'],
        idle: ['Time to log! 🕐', 'Samyuktha says: hurry!', 'Update your entries! 📝'],
    },
    {
        id: 'sam', name: 'Sam', dept: 'Management', deptColor: '#f43f5e', bgFrom: '#4c0519', bgTo: '#9f1239',
        gender: 'male' as AvatarGender, avatarSeed: 'Sam-anime-boy-rose', bgColor: '#9f1239',
        iconKey: 'tech_angel',
        cheers: ['Strategy aligned! 📈', 'Sam leads the way! 👑', 'Goal achieved! ✅', 'Excellence in action!'],
        idle: ['Sam is planning! 🧠', 'Quarterly review time!', 'Strategic thought...'],
    },
    {
        id: 'durga', name: 'Durga', dept: 'Software', deptColor: '#10b981', bgFrom: '#052e16', bgTo: '#065f46',
        gender: 'female' as AvatarGender, avatarSeed: 'Durga-anime-girl-green', bgColor: '#065f46',
        iconKey: 'code_angel',
        cheers: ['Code committed! 💻', 'Durga approves! 🧠', 'Build is green! 🟢', 'Clean entry! ✨'],
        idle: ['Console says: log it!', 'Durga needs your update!', 'Sprint is waiting! 🚀'],
    },
    {
        id: 'rebecca', name: 'Rebecca', dept: 'Software', deptColor: '#06b6d4', bgFrom: '#082f49', bgTo: '#0e7490',
        gender: 'female' as AvatarGender, avatarSeed: 'Rebecca-anime-girl-cyan',
        photo: '/avatars/rebecca.svg',
        bgColor: '#0e7490',
        iconKey: 'rocket_angel',
        cheers: ['Tests passed! ✅', 'Rebecca high-fives! 🙌', 'Deployment ready!', 'Clean logs! 💙'],
        idle: ['Rebecca says: log hours!', 'Debugging boredom! 🐛', 'Ping! Update entry! 📡'],
    },
    {
        id: 'zameela', name: 'Zameela', dept: 'Finance', deptColor: '#f59e0b', bgFrom: '#451a03', bgTo: '#92400e',
        gender: 'female' as AvatarGender, avatarSeed: 'Zameela-anime-girl-gold', bgColor: '#92400e',
        iconKey: 'fortune_angel',
        cheers: ['Budget balanced! 💰', 'Zameela approves! 📊', 'Numbers great!', 'Finance cleared! ✅'],
        idle: ['Balance sheet needs update!', 'Zameela: submit now!', 'Invoice time! 🧾'],
    },
    {
        id: 'mohan', name: 'Mohan', dept: 'Finance', deptColor: '#fbbf24', bgFrom: '#713f12', bgTo: '#a16207',
        gender: 'male' as AvatarGender, avatarSeed: 'Mohan-anime-boy-amber', bgColor: '#a16207',
        iconKey: 'chart_wizard',
        cheers: ['ROI excellent! 📈', 'Mohan approves! 🤝', 'Tax compliant!', 'Accounts updated! ✔️'],
        idle: ['Mohan checking ledgers!', 'Financial entry needed!', 'Waiting with chai! ☕'],
    },
    {
        id: 'arun', name: 'Arun', dept: 'Purchase', deptColor: '#ef4444', bgFrom: '#450a0a', bgTo: '#991b1b',
        gender: 'male' as AvatarGender, avatarSeed: 'Arun-anime-boy-red', bgColor: '#991b1b',
        iconKey: 'guardian_angel',
        cheers: ['PO raised! 📦', 'Arun got the deal! 🤝', 'Procurement done! ✅', 'Purchase approved!'],
        idle: ['Vendor is waiting! 📞', 'Arun: update hours!', 'PO pending! 📝'],
    },
    {
        id: 'yuvaraj', name: 'Yuvaraj', dept: 'Purchase', deptColor: '#f87171', bgFrom: '#7f1d1d', bgTo: '#dc2626',
        gender: 'male' as AvatarGender, avatarSeed: 'Yuvaraj-anime-boy-crimson', bgColor: '#dc2626',
        iconKey: 'trophy_angel',
        cheers: ['Inventory updated!', 'Yuvaraj scores! 💪', 'Stock sorted! 🗃️', 'Supplier confirmed! ✅'],
        idle: ['Stock count needs you!', 'Almost time! ⏱️', 'Log before delivery! 🚚'],
    },
    {
        id: 'kamali', name: 'Kamali', dept: 'Pre-sales', deptColor: '#8b5cf6', bgFrom: '#2e1065', bgTo: '#5b21b6',
        gender: 'female' as AvatarGender, avatarSeed: 'Kamali-anime-girl-violet', bgColor: '#5b21b6',
        iconKey: 'mystic_angel',
        cheers: ['Pipeline growing! 📈', 'Kamali closed it! 🎯', 'Proposal sent!', 'Client happy! 😄'],
        idle: ['Demo call in 5! 📞', 'Quick log! ⚡', 'Proposal deadline! 📄'],
    },
    {
        id: 'naveen', name: 'Naveen', dept: 'IT Support', deptColor: '#0ea5e9', bgFrom: '#0c4a6e', bgTo: '#075985',
        gender: 'male' as AvatarGender, avatarSeed: 'Naveen-anime-boy-sky', bgColor: '#075985',
        iconKey: 'cyber_angel',
        cheers: ['Ticket resolved! 🎫', 'Naveen fixes all! 🔧', 'System UP! 🖥️', 'Issue closed! ✅'],
        idle: ['Naveen on a call! 📞', 'System: log hours!', 'Don\'t skip logs! 🖱️'],
    },
];

type TeamMember = {
    id: string; name: string; dept: string; deptColor: string;
    bgFrom: string; bgTo: string; avatarSeed: string; gender: AvatarGender;
    photo?: string; bgColor: string; iconKey: string;
    cheers: string[]; idle: string[];
};

const DEPT_LIST = ['Management', 'HR', 'Admin', 'Software', 'Finance', 'Purchase', 'Pre-sales', 'IT Support'];
const DEPT_COLORS: Record<string, string> = {
    'Management': '#f43f5e', 'HR': '#ec4899', 'Admin': '#6366f1', 'Software': '#10b981',
    'Finance': '#f59e0b', 'Purchase': '#ef4444', 'Pre-sales': '#8b5cf6', 'IT Support': '#0ea5e9'
};
const WIN_ADD = ['⏱️ Hours logged!', '✅ Entry saved!', '📋 Sheet updated!', '🎯 Right on time!', '🏆 Great work!', '📊 Data recorded!'];
const WIN_EDIT = ['✏️ Entry revised!', '🔄 Updated!', '✅ Corrected!', '🎯 Precise!'];
// --- Simplified, High-Energy Messages ---
const MESSAGES = [
    "Great!",
    "Hurray!",
    "Ha ha ha!",
    "Let's go!",
    "Amazing!",
    "Keep it up!",
    "You got this!",
    "Perfect!",
    "Woohoo!",
    "Fantastic!",
    "Brilliant!",
    "Yes!"
];
const CAREER_TITLES = ['Intern', 'Junior', 'Associate', 'Senior', 'Lead', 'Principal', 'Director', 'VP', 'C-Suite', 'Legend'];

const GENDER_BADGE: Record<AvatarGender, { bg: string; text: string; label: string }> = {
    female: { bg: '#fce7f344', text: '#f472b6', label: '♀' },
    male: { bg: '#dbeafe44', text: '#60a5fa', label: '♂' },
};

// ─── ANIME AVATAR CARD ────────────────────────────────────────────────────────
function AvatarCard({
    member, size = 56, wiggle = false, bounce = false, floatAnim = true,
}: {
    member: TeamMember; size?: number; wiggle?: boolean; bounce?: boolean; floatAnim?: boolean;
}) {
    const url = buildAnimeAvatarUrl(member);
    const gb = GENDER_BADGE[member.gender];
    const iconFn = SvgIcons[member.iconKey];
    const iconSize = Math.round(size * 0.38);

    return (
        <div className="relative" style={{ width: size + 8, height: size + 8, flexShrink: 0 }}>
            {/* Spinning halo ring */}
            <div style={{
                position: 'absolute', inset: -3, borderRadius: '50%',
                border: `2.5px dashed ${member.gender === 'female' ? '#f472b6' : '#60a5fa'}`,
                opacity: 0.7,
                animation: member.gender === 'female' ? 'spinCW 8s linear infinite' : 'spinCCW 8s linear infinite',
                pointerEvents: 'none',
            }} />
            {/* Glow pulse ring */}
            <div style={{
                position: 'absolute', inset: -2, borderRadius: '50%',
                boxShadow: `0 0 12px 3px ${member.deptColor}55`,
                animation: 'glowRing 2.5s ease-in-out infinite',
                pointerEvents: 'none',
            }} />
            {/* Avatar circle */}
            <div style={{
                width: size, height: size, borderRadius: '50%', overflow: 'hidden',
                background: `radial-gradient(circle at 35% 35%, ${member.bgFrom}, ${member.bgTo})`,
                border: `2.5px solid ${member.deptColor}`,
                boxShadow: `0 6px 22px ${member.deptColor}50, inset 0 1px 0 rgba(255,255,255,0.15)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                animation: bounce ? 'bigBounce .5s cubic-bezier(.36,.07,.19,.97)'
                    : wiggle ? 'cardWiggle .55s ease-in-out infinite'
                        : floatAnim ? 'cardFloat 3s ease-in-out infinite' : 'none',
            }}>
                {/* Shine overlay */}
                <div style={{
                    position: 'absolute', top: 0, left: '-60%', width: '40%', height: '100%',
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.22) 50%, transparent 60%)',
                    animation: 'shineSweep 4s ease-in-out infinite',
                    pointerEvents: 'none', zIndex: 2,
                }} />
                <img src={url} alt={member.name} width={size} height={size}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'relative', zIndex: 1 }}
                    loading="lazy" />
            </div>

            {/* Gender badge */}
            <div style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 16, height: 16, borderRadius: '50%',
                background: gb.bg, border: `1.5px solid ${gb.text}`,
                color: gb.text, fontSize: 9, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 5, backdropFilter: 'blur(4px)',
                boxShadow: `0 2px 6px ${gb.text}60`,
            }}>{gb.label}</div>

            {/* ✨ CREATIVE SVG ICON TAG — replaces plain emoji */}
            <div style={{
                position: 'absolute', top: -6, left: -6,
                width: iconSize + 4, height: iconSize + 4,
                animation: 'emojiWobble 3.5s ease-in-out infinite',
                zIndex: 5,
                filter: `drop-shadow(0 2px 6px ${member.deptColor}90)`,
                pointerEvents: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {iconFn ? iconFn(iconSize) : null}
            </div>
        </div>
    );
}

// ─── CONFETTI ─────────────────────────────────────────────────────────────────
function ConfettiCanvas({ active }: { active: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const parts = useRef<any[]>([]);
    const raf = useRef(0);
    const COLS = [...Object.values(DEPT_COLORS), '#fff', '#fbbf24'];
    useEffect(() => {
        if (!active) return;
        const c = ref.current!; const ctx = c.getContext('2d')!;
        c.width = window.innerWidth; c.height = window.innerHeight;
        parts.current = Array.from({ length: 160 }, (_, i) => ({
            x: Math.random() * c.width, y: -20,
            vx: (Math.random() - .5) * 8, vy: Math.random() * 4 + 1.5,
            color: COLS[i % COLS.length], shape: ['rect', 'circle', 'check'][i % 3],
            size: Math.random() * 12 + 5, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - .5) * 0.2,
        }));
        const check = (ctx: CanvasRenderingContext2D, s: number) => {
            ctx.beginPath(); ctx.lineWidth = s * .18; ctx.strokeStyle = ctx.fillStyle as string;
            ctx.moveTo(-s * .4, 0); ctx.lineTo(-s * .1, s * .35); ctx.lineTo(s * .4, -s * .3); ctx.stroke();
        };
        const anim = () => {
            ctx.clearRect(0, 0, c.width, c.height);
            parts.current = parts.current.filter(p => p.y < c.height + 50);
            parts.current.forEach(p => {
                p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.vx += (Math.random() - .5) * .1; p.rot += p.rotV;
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.globalAlpha = .88;
                if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
                else if (p.shape === 'rect') { ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size / 2); }
                else { check(ctx, p.size); }
                ctx.restore();
            });
            if (parts.current.length > 0) raf.current = requestAnimationFrame(anim);
        };
        raf.current = requestAnimationFrame(anim);
        return () => { cancelAnimationFrame(raf.current); parts.current = []; };
    }, [active]);
    if (!active) return null;
    return <canvas ref={ref} className="fixed inset-0 z-40 pointer-events-none" />;
}

// ─── FIREWORK ─────────────────────────────────────────────────────────────────
function FireworkCanvas({ trigger }: { trigger: number }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const raf = useRef(0);
    useEffect(() => {
        if (!trigger) return;
        const c = ref.current!; if (!c) return; const ctx = c.getContext('2d')!;
        c.width = window.innerWidth; c.height = window.innerHeight;
        const COLS = [...Object.values(DEPT_COLORS), '#fff'];
        const sparks = Array.from({ length: 100 }, (_, i) => {
            const a = Math.random() * Math.PI * 2, s = Math.random() * 14 + 4;
            return { x: c.width / 2, y: c.height * .32, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color: COLS[i % COLS.length], life: 1, size: 2 + Math.random() * 3 };
        });
        const anim = () => {
            ctx.globalAlpha = .15; ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, c.width, c.height); ctx.globalAlpha = 1;
            sparks.forEach(s => {
                s.x += s.vx; s.y += s.vy; s.vy += .22; s.life -= .011;
                ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
            });
            if (sparks.some(s => s.life > 0)) raf.current = requestAnimationFrame(anim);
            else ctx.clearRect(0, 0, c.width, c.height);
        };
        raf.current = requestAnimationFrame(anim);
        return () => cancelAnimationFrame(raf.current);
    }, [trigger]);
    return <canvas ref={ref} className="fixed inset-0 z-30 pointer-events-none" />;
}

// ─── MEMBER POPUP ─────────────────────────────────────────────────────────────
interface MemberPopup { id: number; member: TeamMember; msg: string; x: number; y: number; }
function MemberPopupEl({ d }: { d: MemberPopup }) {
    const iconFn = SvgIcons[d.member.iconKey];
    return (
        <div className="fixed z-50 pointer-events-none select-none"
            style={{ left: `${d.x}%`, top: `${d.y}%`, transform: 'translate(-50%,-50%)', animation: 'popIn .38s cubic-bezier(.36,.07,.19,.97) both' }}>
            <div className="flex flex-col items-center gap-1.5">
                <AvatarCard member={d.member} size={64} wiggle={true} floatAnim={false} />
                <div className="text-[8px] font-black px-2 py-0.5 rounded-full text-white -mt-1 shadow"
                    style={{ background: d.member.deptColor }}>{d.member.dept}</div>
                <div className="px-3 py-1.5 rounded-xl text-xs font-black text-white whitespace-nowrap shadow-2xl text-center max-w-[200px] leading-snug flex items-center gap-1.5"
                    style={{
                        background: `linear-gradient(135deg,${d.member.bgTo},${d.member.deptColor}dd)`,
                        boxShadow: `0 4px 20px ${d.member.deptColor}60`, animation: 'msgPop .25s ease-out .12s both',
                        border: `1px solid ${d.member.deptColor}50`
                    }}>
                    {iconFn && <span style={{ flexShrink: 0 }}>{iconFn(16)}</span>}
                    <span>{d.msg}</span>
                </div>
                <span className="text-[9px] font-black" style={{ color: d.member.deptColor }}>{d.member.name}</span>
            </div>
        </div>
    );
}

// ─── SCORE FLOAT ──────────────────────────────────────────────────────────────
function ScoreFloat({ s }: { s: { id: number; text: string; x: number; y: number; color: string } }) {
    return (
        <div className="fixed z-50 pointer-events-none font-black text-xl select-none"
            style={{ left: s.x, top: s.y, color: s.color, textShadow: `0 2px 12px ${s.color}80`, animation: 'scoreUp 1.5s ease-out forwards' }}>
            {s.text}
        </div>
    );
}

// ─── STREAK BADGE ─────────────────────────────────────────────────────────────
function StreakBadge({ streak }: { streak: number }) {
    if (streak < 2) return null;
    return (
        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black"
            style={{ background: '#f59e0b18', border: '1px solid #f59e0b40', animation: 'streakGlow 1.5s ease-in-out infinite' }}>
            <Flame className="w-2.5 h-2.5 text-orange-400" />
            <span className="text-orange-400">{streak}-day streak</span>
        </div>
    );
}

// ─── XP BAR ───────────────────────────────────────────────────────────────────
function XPBar({ xp }: { xp: number }) {
    const pct = xp % 100, level = Math.floor(xp / 100) + 1;
    const title = CAREER_TITLES[Math.min(level - 1, CAREER_TITLES.length - 1)];
    return (
        <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col items-end">
                <span className="text-[9px] font-black text-violet-300 leading-none">{title}</span>
                <span className="text-[7px] text-slate-600">Level {level}</span>
            </div>
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <div className="relative h-2.5 w-20 rounded-full overflow-hidden bg-slate-800 border border-slate-700">
                <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#7c3aed,#a78bfa)', boxShadow: '0 0 8px #7c3aed70' }} />
            </div>
            <span className="text-[9px] font-black text-violet-400">{xp}xp</span>
        </div>
    );
}

// ─── CORNER BUDDY SQUAD ────────────────────────────────────────────────────────
// Helper: match logged-in user to a TEAM member by first name
function resolveUserBuddyId(user: any): string {
    if (!user) return TEAM[0].id;
    const firstName = (user.name || user.username || user.employeeCode || '').split(' ')[0].toLowerCase();
    const match = TEAM.find(m => m.name.toLowerCase() === firstName || m.id === firstName);
    return match ? match.id : TEAM[0].id;
}

function CornerBuddy({ typing, soundOn, activeBuddyId, onSwitchBuddy, currentUser }: { typing: boolean; soundOn: boolean; activeBuddyId: string; onSwitchBuddy: (id: string) => void; currentUser?: any }) {
    const [bubble, setBubble] = useState('');
    const [show, setShow] = useState(false);
    const [bounce, setBounce] = useState(false);
    const [selectorOpen, setSelectorOpen] = useState(false);
    
    const activeMember = TEAM.find(m => m.id === activeBuddyId) || TEAM[0];
    const iconFn = SvgIcons[activeMember.iconKey];

    // Get 2 other random members for the "squad" look - make it feel like a real team
    const squadIds = useRef<string[]>([]);
    if (squadIds.current.length === 0) {
        squadIds.current = TEAM.filter(m => m.id !== activeBuddyId).sort(() => Math.random() - 0.5).slice(0, 2).map(m => m.id);
    }
    const squad = TEAM.filter(m => squadIds.current.includes(m.id));

    const pop = useCallback(() => {
        const msgs = MESSAGES;
        setBubble(msgs[Math.floor(Math.random() * msgs.length)]);
        setShow(true); setBounce(true);
        if (soundOn) playSound('pop');
        setTimeout(() => setBounce(false), 500);
        setTimeout(() => setShow(false), 5000);
    }, [soundOn, activeMember]);

    useEffect(() => { const t = setInterval(pop, 12000); return () => clearInterval(t); }, [pop]);

    return (
        <>
        {/* Left Corner Squad (Secondary Buddies) */}
        <div className="fixed bottom-5 left-5 z-[60] flex items-end gap-2 pointer-events-none">
            {squad.map((m, i) => (
                <motion.div
                    key={m.id}
                    initial={{ opacity: 0, x: -20, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ delay: i * 0.15 }}
                    className="relative group/squad"
                >
                    <AvatarCard member={m} size={42} wiggle={typing} floatAnim={!typing} />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/squad:opacity-100 transition-opacity bg-slate-900 text-[8px] font-black text-white px-2 py-0.5 rounded-full whitespace-nowrap border border-white/10 shadow-xl">
                        {m.name}
                    </div>
                </motion.div>
            ))}
        </div>

        {/* Right Corner Guide (Main Buddy) */}
        <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3 group">
            {/* Bubble */}
            <AnimatePresence>
            {show && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.8, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 5 }}
                    className="px-3 py-2 rounded-2xl text-[11px] font-black text-white shadow-2xl max-w-[190px] text-center mb-1 mr-2 relative"
                    style={{
                        background: `linear-gradient(135deg,${activeMember.bgFrom},${activeMember.bgTo}ee)`,
                        border: `1.5px solid ${activeMember.deptColor}55`, 
                        boxShadow: `0 12px 40px ${activeMember.deptColor}60`,
                    }}>
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                        {iconFn && iconFn(18)}
                        <span>{bubble}</span>
                    </div>
                    {/* Tiny sparkle */}
                    <div className="absolute -top-1 -right-1 animate-pulse">✨</div>
                </motion.div>
            )}
            </AnimatePresence>

            {/* Buddy Selector Panel */}
            <AnimatePresence>
            {selectorOpen && (
                <motion.div 
                    initial={{ opacity: 0, y: 30, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.8 }}
                    className="absolute bottom-24 right-0 grid grid-cols-4 gap-2 p-4 bg-slate-900/95 backdrop-blur-2xl border border-white/20 rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.8)] w-[280px] ring-1 ring-white/10"
                >
                    <div className="col-span-4 text-[10px] font-black text-slate-400 mb-1 px-1 flex items-center justify-between">
                        <span>SELECT YOUR GUIDE</span>
                        <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectorOpen(false)} />
                    </div>
                    {TEAM.map(m => (
                        <button 
                            key={m.id}
                            onClick={() => { onSwitchBuddy(m.id); setSelectorOpen(false); if (soundOn) playSound('success'); }}
                            className={`relative p-1.5 rounded-2xl transition-all hover:scale-125 active:scale-90 ${activeBuddyId === m.id ? 'bg-white/20 ring-2 ring-white/40 z-10' : 'hover:bg-white/10'}`}
                        >
                            <img 
                                src={buildAnimeAvatarUrl(m)} 
                                alt={m.name} 
                                className="w-12 h-12 rounded-full object-cover shadow-lg"
                                style={{ background: m.deptColor + '40' }}
                            />
                            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center border border-white/30 shadow-md">
                                {SvgIcons[m.iconKey](12)}
                            </div>
                        </button>
                    ))}
                </motion.div>
            )}
            </AnimatePresence>

            <div className="relative flex items-end">
                {/* Peer Buddies (Smaller version of squad members next to main buddy) */}
                <div className="flex -space-x-3 mr-1">
                    {squad.map((m, i) => (
                        <motion.div 
                            key={m.id}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 + i * 0.1 }}
                            className="relative z-0 scale-75 grayscale hover:grayscale-0 hover:scale-110 transition-all cursor-help"
                        >
                            <AvatarCard member={m} size={40} floatAnim={true} />
                        </motion.div>
                    ))}
                </div>

                {/* Main Buddy */}
                <div className="relative">
                    <motion.div 
                        onClick={pop} 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="cursor-pointer select-none relative z-10" 
                        title={`${activeMember.name} — Employee`}
                    >
                        <AvatarCard member={activeMember} size={84} wiggle={typing} bounce={bounce} floatAnim={!typing && !bounce} />
                    </motion.div>

                    {/* Selector Toggle Icon - Pulsing for visibility */}
                    <button 
                        onClick={(e) => { e.stopPropagation(); setSelectorOpen(!selectorOpen); if (soundOn) playSound('woosh'); }}
                        className="absolute -top-1 -left-1 w-10 h-10 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/20 flex items-center justify-center text-white z-20 hover:bg-white/20 hover:scale-125 transition-all shadow-[0_8px_24px_rgba(0,0,0,0.5)] animate-pulse"
                    >
                        <RefreshCw className={`w-5 h-5 ${selectorOpen ? 'rotate-180' : ''} transition-transform duration-500`} />
                    </button>
                    
                    {/* Role Label */}
                    <div className="absolute -bottom-3 right-1/2 translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-full text-[9px] font-black text-white z-20 shadow-2xl skew-x-[-10deg]"
                         style={{ background: activeMember.deptColor, border: '1px solid white/20' }}>
                        EMPLOYEE GUIDE ✨
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}

import { RefreshCw, X } from 'lucide-react';

// ─── TEAM PANEL ───────────────────────────────────────────────────────────────
function TeamPanel({ onMemberClick }: { onMemberClick: (m: TeamMember) => void }) {
    const [active, setActive] = useState<string | null>(null);
    const [deptFilter, setDeptFilter] = useState<string | null>(null);
    const [genderFilter, setGenderFilter] = useState<AvatarGender | null>(null);

    let filtered = deptFilter ? TEAM.filter(m => m.dept === deptFilter) : TEAM;
    if (genderFilter) filtered = filtered.filter(m => m.gender === genderFilter);

    return (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 backdrop-blur overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/40">
                <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                        {TEAM.slice(0, 5).map(m => (
                            <div key={m.id} className="relative" style={{ width: 26, height: 26 }}>
                                <img src={buildAnimeAvatarUrl(m)} alt={m.name}
                                    className="rounded-full border-2 border-slate-900 object-cover"
                                    style={{ width: 24, height: 24, background: `linear-gradient(135deg,${m.bgFrom},${m.bgTo})`, boxShadow: `0 0 6px ${m.deptColor}70` }} />
                                <div style={{
                                    position: 'absolute', bottom: -1, right: -1, width: 8, height: 8,
                                    borderRadius: '50%', background: m.gender === 'female' ? '#f472b6' : '#60a5fa',
                                    border: '1.5px solid #0f172a',
                                }} />
                            </div>
                        ))}
                        <div className="w-6 h-6 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-[8px] font-black text-slate-400">
                            +{TEAM.length - 5}
                        </div>
                    </div>
                    <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase">All Employees</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-black text-violet-300 bg-violet-900/30 border border-violet-800/40">+3 XP per tap</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setGenderFilter(g => g === 'female' ? null : 'female')}
                        className="text-[9px] font-black px-2 py-1 rounded-full transition-all"
                        style={{
                            background: genderFilter === 'female' ? '#f472b622' : 'transparent',
                            color: genderFilter === 'female' ? '#f472b6' : '#475569',
                            border: `1px solid ${genderFilter === 'female' ? '#f472b6' : '#334155'}`,
                        }}>♀ Girls</button>
                    <button onClick={() => setGenderFilter(g => g === 'male' ? null : 'male')}
                        className="text-[9px] font-black px-2 py-1 rounded-full transition-all"
                        style={{
                            background: genderFilter === 'male' ? '#60a5fa22' : 'transparent',
                            color: genderFilter === 'male' ? '#60a5fa' : '#475569',
                            border: `1px solid ${genderFilter === 'male' ? '#60a5fa' : '#334155'}`,
                        }}>♂ Boys</button>
                    <div className="flex items-center gap-1 text-[9px] text-green-400">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>{TEAM.length} online</span>
                    </div>
                </div>
            </div>

            <div className="flex gap-1.5 px-4 pt-2.5 overflow-x-auto pb-1">
                {['All', ...DEPT_LIST].map(d => (
                    <button key={d} onClick={() => setDeptFilter(d === 'All' ? null : d)}
                        className="flex-shrink-0 px-2.5 py-1 rounded-full text-[9px] font-black transition-all"
                        style={{
                            background: (d === 'All' && !deptFilter) || (deptFilter === d) ? (d === 'All' ? '#7c3aed' : DEPT_COLORS[d]) : '#1e293b',
                            color: (d === 'All' && !deptFilter) || (deptFilter === d) ? 'white' : '#64748b',
                            border: `1px solid ${(d === 'All' && !deptFilter) || (deptFilter === d) ? (d === 'All' ? '#7c3aed' : DEPT_COLORS[d]) : '#334155'}`,
                        }}>{d}</button>
                ))}
            </div>

            <div className="flex items-end gap-5 px-4 pb-5 pt-3 overflow-x-auto">
                {filtered.map(member => (
                    <button key={member.id}
                        onClick={() => { setActive(member.id); setTimeout(() => setActive(null), 700); onMemberClick(member); }}
                        className="flex flex-col items-center gap-1.5 flex-shrink-0 focus:outline-none"
                        style={{ WebkitTapHighlightColor: 'transparent', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <div style={{
                            transform: active === member.id ? 'scale(1.3)' : 'scale(1)',
                            transition: 'transform .18s cubic-bezier(.36,.07,.19,.97)',
                            filter: active === member.id ? `drop-shadow(0 0 14px ${member.deptColor})` : 'none',
                        }}>
                            <AvatarCard member={member} size={56} wiggle={false}
                                bounce={active === member.id} floatAnim={active !== member.id} />
                        </div>
                        <div className="text-center mt-1">
                            <div className="text-[9px] font-black leading-none"
                                style={{ color: active === member.id ? member.deptColor : '#94a3b8' }}>{member.name}</div>
                            <div className="text-[7px] mt-0.5 px-1.5 py-0.5 rounded-full font-black leading-none"
                                style={{ background: `${member.deptColor}20`, color: member.deptColor }}>Employee</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── WORK LOADER ──────────────────────────────────────────────────────────────
function WorkLoader() {
    const [idx, setIdx] = useState(0);
    useEffect(() => { const t = setInterval(() => setIdx(i => (i + 1) % TEAM.length), 300); return () => clearInterval(t); }, []);
    const m = TEAM[idx];
    const iconFn = SvgIcons[m.iconKey];
    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center gap-5 z-50">
            <style>{ALL_KEYFRAMES}</style>
            <div className="relative" style={{ width: 96, height: 96 }}>
                <div style={{
                    position: 'absolute', inset: -4, borderRadius: '50%',
                    border: `3px dashed ${m.gender === 'female' ? '#f472b6' : '#60a5fa'}`,
                    animation: m.gender === 'female' ? 'spinCW 3s linear infinite' : 'spinCCW 3s linear infinite',
                }} />
                <img src={buildAnimeAvatarUrl(m)} alt={m.name}
                    className="rounded-full shadow-2xl"
                    style={{
                        width: 80, height: 80,
                        background: `radial-gradient(circle at 35% 35%, ${m.bgFrom}, ${m.bgTo})`,
                        border: `3px solid ${m.deptColor}`,
                        filter: `drop-shadow(0 8px 28px ${m.deptColor}70)`,
                        animation: 'cardWiggle .5s ease-in-out infinite',
                        objectFit: 'cover',
                    }} />
                {/* SVG icon replacing emoji */}
                <div style={{
                    position: 'absolute', bottom: -4, right: -4,
                    animation: 'emojiWobble 1s ease-in-out infinite',
                    filter: `drop-shadow(0 2px 8px ${m.deptColor}90)`,
                }}>
                    {iconFn && iconFn(26)}
                </div>
            </div>
            <div className="text-center">
                <div className="font-black text-white text-sm">{m.name}</div>
                <div className="flex items-center justify-center gap-1 mt-1">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: `${m.deptColor}25`, color: m.deptColor }}>{m.dept}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black"
                        style={{
                            background: m.gender === 'female' ? '#f472b622' : '#60a5fa22',
                            color: m.gender === 'female' ? '#f472b6' : '#60a5fa',
                        }}>{m.gender === 'female' ? '♀' : '♂'}</span>
                </div>
            </div>
            <div className="flex gap-1.5">
                {TEAM.map((_, i) => (
                    <div key={i} className="h-1.5 rounded-full transition-all duration-250"
                        style={{ width: i === idx ? '18px' : '5px', background: i === idx ? TEAM[i].deptColor : '#334155' }} />
                ))}
            </div>
            <p className="text-slate-500 text-[10px] font-black tracking-[.3em] animate-pulse">LOADING TIMESHEET…</p>
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function TaskEntryPage() {
    const { user } = useAuth();
    const { id } = useParams();
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const queryParams = new URLSearchParams(window.location.search);
    const dateStr = queryParams.get('date') || format(new Date(), 'yyyy-MM-dd');
    const pmsId = queryParams.get('pmsId');
    const pmsTaskName = queryParams.get('pmsTaskName');
    const pmsProjectName = queryParams.get('pmsProjectName');
    const pmsDescription = queryParams.get('pmsDescription');

    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [isLoadingTask, setIsLoadingTask] = useState(!!id);
    const [isCelebrating, setIsCelebrating] = useState(false);
    const [xp, setXp] = useState(() => parseInt(localStorage.getItem('taskXP') || '0'));
    const [streak, setStreak] = useState(() => parseInt(localStorage.getItem('taskStreak') || '0'));
    const [soundOn, setSoundOn] = useState(true);

    // Fetch daily plan status to prevent unauthorized entries
    const { data: dailyPlanStatus, isLoading: isLoadingPlanStatus } = useQuery({
        queryKey: ['/api/daily-plans/today', user?.id, dateStr],
        queryFn: async () => {
            const res = await fetch(`/api/daily-plans/today/${user?.id}`);
            if (!res.ok) return { submitted: false };
            return res.json();
        },
        enabled: !!user?.id && dateStr === format(new Date(), 'yyyy-MM-dd'),
    });

    useEffect(() => {
        const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
        if (isToday && dailyPlanStatus && !dailyPlanStatus.submitted && !isLoadingPlanStatus) {
            setShowPlanAlert(true);
            if (soundOn) {
                // We use a custom 'restrict' tone for professional beep
                // @ts-ignore
                playSound('restrict');
            }
        }
    }, [dailyPlanStatus, isLoadingPlanStatus, dateStr, soundOn]);
    const [popups, setPopups] = useState<MemberPopup[]>([]);
    const [scores, setScores] = useState<{ id: number; text: string; x: number; y: number; color: string }[]>([]);
    const [confetti, setConfetti] = useState(false);
    const [firework, setFirework] = useState(0);
    const [typing, setTyping] = useState(false);
    const [activeBuddyId, setActiveBuddyId] = useState(() => resolveUserBuddyId(user));
    const [showPlanAlert, setShowPlanAlert] = useState(false);
    const [shakeHeader, setShakeHeader] = useState(false);
    const popId = useRef(0);
    const storageKey = user ? getPendingTasksKey(user.id, dateStr) : '';

    const spawnMember = useCallback((msg?: string, x?: number, y?: number, force?: TeamMember) => {
        const m = force ?? TEAM[Math.floor(Math.random() * TEAM.length)];
        const message = msg ?? MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
        const nid = ++popId.current;
        // Force position to top area to avoid obstructing content
        const posX = 15 + Math.random() * 10;
        const posY = 10 + Math.random() * 10;
        setPopups(p => [...p, { id: nid, member: m, msg: message, x: posX, y: posY }]);
        setTimeout(() => setPopups(p => p.filter(d => d.id !== nid)), 2900);
    }, []);

    const spawnScore = useCallback((text: string, color = '#a78bfa') => {
        const nid = ++popId.current;
        // Position score floaters in the bottom area near the corner popups
        const posX = 40 + Math.random() * 80;
        const posY = window.innerHeight - 180 - Math.random() * 60;
        setScores(p => [...p, { id: nid, text, x: posX, y: posY, color }]);
        setTimeout(() => setScores(p => p.filter(s => s.id !== nid)), 1600);
    }, []);

    const addXP = useCallback((amount: number) => {
        setXp(prev => {
            const n = prev + amount;
            localStorage.setItem('taskXP', String(n));
            if (Math.floor(n / 100) > Math.floor(prev / 100)) {
                if (soundOn) playSound('levelup');
                spawnMember('Promoted! 🎊', 22, 50);
                setShakeHeader(true); setTimeout(() => setShakeHeader(false), 700);
            }
            return n;
        });
        spawnScore(`+${amount} XP`, '#a78bfa');
    }, [soundOn, spawnMember, spawnScore]);

    useEffect(() => {
        const h = (e: CustomEvent) => { setActiveBuddyId(e.detail.id); if (soundOn) playSound('woosh'); };
        window.addEventListener('mascot:setBuddy', h as EventListener);
        return () => window.removeEventListener('mascot:setBuddy', h as EventListener);
    }, [soundOn]);

    useEffect(() => {
        const h = (e: CustomEvent) => { spawnMember(e.detail.text, e.detail.x, e.detail.y); if (soundOn) playSound('coin'); };
        window.addEventListener('mascot:doll', h as EventListener);
        return () => window.removeEventListener('mascot:doll', h as EventListener);
    }, [soundOn, spawnMember]);

    useEffect(() => {
        let t: ReturnType<typeof setTimeout>; let kc = 0;
        const onKey = () => { setTyping(true); clearTimeout(t); t = setTimeout(() => setTyping(false), 1800); kc++; if (soundOn && kc % 8 === 0) playSound('keyboard'); };
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
    }, [soundOn]);

    // Auto-spawn interval removed — no mascots on TaskEntry page

    useEffect(() => {
        if (!id || !user) {
            if (pmsId) {
                setEditingTask({
                    id: `local-${Date.now()}`, project: pmsProjectName || '', title: pmsTaskName || '',
                    subTask: '', description: pmsDescription || '', problemAndIssues: '', quantify: '1',
                    achievements: '', scopeOfImprovements: '', toolsUsed: ['Others'],
                    startTime: '09:00', endTime: '10:00', durationMinutes: 60, percentageComplete: 0,
                    isComplete: false,
                    // @ts-ignore
                    pmsId
                } as Task);
            }
            setIsLoadingTask(false); return;
        }
        (async () => {
            try {
                if (id.startsWith('local-')) {
                    const s = localStorage.getItem(storageKey);
                    if (s) { const ts: Task[] = JSON.parse(s); const f = ts.find(t => t.id === id); if (f) setEditingTask(f); }
                } else {
                    const r = await fetch(`/api/time-entries/${id}`);
                    if (r.ok) {
                        const e = await r.json();
                        const parts = e.taskDescription.split(' | ');
                        let parsed = { title: '', subTask: '', description: '' };
                        if (parts.length >= 2) parsed = { title: parts[0], subTask: parts[1], description: parts.slice(2).join(' | ') };
                        else { const c = e.taskDescription.split(':'); parsed = { title: c[0] || e.taskDescription, subTask: '', description: c[1]?.trim() || '' }; }
                        const dm = e.totalHours.match(/(\d+)h\s*(\d+)m?/);
                        setEditingTask({
                            id: e.id, project: e.projectName, ...parsed,
                            problemAndIssues: e.problemAndIssues || '', quantify: e.quantify || '',
                            achievements: e.achievements || '', scopeOfImprovements: e.scopeOfImprovements || '',
                            toolsUsed: e.toolsUsed || [], startTime: e.startTime, endTime: e.endTime,
                            durationMinutes: dm ? parseInt(dm[1]) * 60 + parseInt(dm[2] || '0') : 0,
                            percentageComplete: e.percentageComplete ?? 0, isComplete: e.status === 'approved',
                            serverStatus: e.status, pmsId: e.pmsId, pmsSubtaskId: e.pmsSubtaskId
                        });
                    }
                }
            } catch (err) { toast({ title: 'Error', description: 'Failed to load task', variant: 'destructive' }); }
            finally { setIsLoadingTask(false); }
        })();
    }, [id, user, storageKey, pmsId, pmsTaskName, pmsProjectName, pmsDescription]);

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: any }) => { const r = await apiRequest('PUT', `/api/time-entries/${id}`, data); return r.json(); },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/time-entries/employee', user?.id] }); toast({ title: "Updated", description: "Timesheet entry updated!" }); triggerWin('edit'); },
        onError: () => { toast({ title: "Error", description: "Failed to update.", variant: "destructive" }); },
    });

    const triggerWin = useCallback((mode: 'add' | 'edit') => {
        if (soundOn) { playSound('woosh'); setTimeout(() => playSound('magic'), 350); setTimeout(() => playSound('success'), 750); setTimeout(() => playSound('coin'), 1150); }
        setConfetti(true); setTimeout(() => setConfetti(false), 5000);
        setFirework(Date.now());
        const msgs = mode === 'add' ? WIN_ADD : WIN_EDIT;
        TEAM.slice(0, 5).forEach((m, i) => setTimeout(() => spawnMember(msgs[i % msgs.length], 22 + i * 15, 60 + Math.random() * 10, m), i * 280));
        const ns = streak + 1; setStreak(ns); localStorage.setItem('taskStreak', String(ns));
        addXP((mode === 'add' ? 25 : 15) + (ns >= 3 ? 10 : 0));
        if (ns >= 3) setTimeout(() => spawnScore(`🔥 ${ns}-day streak!`, '#f97316'), 900);
        setIsCelebrating(true);
        setTimeout(() => setLocation(`/tracker?date=${dateStr}`), 4000);
    }, [soundOn, streak, spawnMember, spawnScore, addXP, setLocation]);

    const handleSaveTask = async (taskData: any) => {
        if (!user) return;
        const sp = taskData.startTime.split(':').map(Number), ep = taskData.endTime.split(':').map(Number);
        const dur = (ep[0] * 60 + ep[1]) - (sp[0] * 60 + sp[1]);
        const fmtDesc = (t: any) => { let d = t.title + (' | ' + (t.subTask || '')); if (t.description) d += ' | ' + t.description; return d; };
        const fmtDur = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
        if (soundOn) playSound('woosh');
        spawnMember('Submitting… 📤', 22, 55, TEAM[5]);
        if (id) {
            if (id.startsWith('local-')) {
                const s = localStorage.getItem(storageKey);
                if (s) { const ts: Task[] = JSON.parse(s); localStorage.setItem(storageKey, JSON.stringify(ts.map(t => t.id === id ? { ...t, ...taskData, durationMinutes: dur } : t))); toast({ title: 'Saved', description: 'Draft updated.' }); triggerWin('edit'); }
            } else {
                await updateMutation.mutateAsync({ id, data: { projectName: taskData.project, taskDescription: fmtDesc(taskData), problemAndIssues: taskData.problemAndIssues || '', quantify: taskData.quantify || '', achievements: taskData.achievements || '', scopeOfImprovements: taskData.scopeOfImprovements || '', toolsUsed: taskData.toolsUsed || [], startTime: taskData.startTime, endTime: taskData.endTime, totalHours: fmtDur(dur), percentageComplete: taskData.percentageComplete || 0, pmsId: taskData.pmsId, pmsSubtaskId: taskData.pmsSubtaskId, keyStep: taskData.keyStep } });
            }
        } else {
            const nt: Task = { id: `local-${Date.now()}`, project: taskData.project, title: taskData.title, subTask: taskData.subTask || '', description: taskData.description, problemAndIssues: taskData.problemAndIssues || '', quantify: taskData.quantify || '', achievements: taskData.achievements || '', scopeOfImprovements: taskData.scopeOfImprovements || '', toolsUsed: taskData.toolsUsed || [], startTime: taskData.startTime, endTime: taskData.endTime, percentageComplete: taskData.percentageComplete || 0, durationMinutes: dur, isComplete: false, pmsId: taskData.pmsId, pmsSubtaskId: taskData.pmsSubtaskId, keyStep: taskData.keyStep };
            const s = localStorage.getItem(storageKey); const ts = s ? JSON.parse(s) : [];
            localStorage.setItem(storageKey, JSON.stringify([...ts, nt]));
            toast({ title: 'Entry Added', description: 'Added to timesheet.' });
            window.dispatchEvent(new CustomEvent('mascot:doll', { detail: { text: "Logged! Great work!", x: 40, y: 30 } }));
            setTimeout(() => window.dispatchEvent(new CustomEvent('mascot:doll', { detail: { text: "Team is proud!", x: 65, y: 52 } })), 380);
            triggerWin('add');
        }
    };

    if (isLoadingTask) return <WorkLoader />;
    const title = CAREER_TITLES[Math.min(Math.floor(xp / 100), CAREER_TITLES.length - 1)];

    return (
        <>
            <style>{ALL_KEYFRAMES}</style>
            <ConfettiCanvas active={confetti} />
            <FireworkCanvas trigger={firework} />
            {/* MemberPopupEl and CornerBuddy hidden on Add Entry page — avatars should not display here */}
            {scores.map(s => <ScoreFloat key={s.id} s={s} />)}

            <div className="min-h-screen bg-slate-950 p-4 md:p-6">
                <div className="max-w-4xl mx-auto space-y-4">
                    {/* FlyInRobot hidden on Add Entry page */}

                    {/* HEADER */}
                    <div className="flex items-center justify-between flex-wrap gap-3"
                        style={{ animation: shakeHeader ? 'headerShake .5s cubic-bezier(.36,.07,.19,.97)' : 'none' }}>
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon"
                                onClick={() => { if (soundOn) playSound('pop'); setLocation(`/tracker?date=${dateStr}`); }}
                                className="text-slate-400 hover:text-white hover:bg-slate-800 transition-all hover:scale-110 active:scale-90">
                                <ChevronLeft className="w-5 h-5" />
                            </Button>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-violet-400" />
                                    <h1 className="text-lg font-black text-white tracking-tight leading-none">
                                        {id ? 'Edit Time Entry' : 'Log Time Entry'}
                                    </h1>
                                </div>
                                <StreakBadge streak={streak} />
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <XPBar xp={xp} />
                            <button onClick={() => setSoundOn(v => !v)}
                                className="p-2 rounded-full text-slate-500 hover:text-white hover:bg-slate-800 transition-all"
                                style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Main animations - show them but balance frequency */}
                    {!id && <DuckAnimation />}
                    <AchievementCelebration isVisible={isCelebrating} onComplete={() => setLocation(`/tracker?date=${dateStr}`)} />

                    {/* FORM */}
                    <div className="relative">
                        {typing && (
                            <div className="absolute -inset-px rounded-2xl pointer-events-none"
                                style={{ background: 'linear-gradient(135deg,#7c3aed22,#10b98122)', filter: 'blur(8px)', animation: 'glowPulse 1.2s ease-in-out infinite' }} />
                        )}
                        <div className="relative z-10">
                            <TaskForm
                                task={editingTask ? {
                                    id: editingTask.id, project: editingTask.project, title: editingTask.title,
                                    // @ts-ignore
                                    pmsId: (editingTask as any).pmsId,
                                    subTask: editingTask.subTask || '', description: editingTask.description,
                                    problemAndIssues: (editingTask as any).problemAndIssues || '',
                                    quantify: editingTask.quantify || '', achievements: (editingTask as any).achievements || '',
                                    scopeOfImprovements: (editingTask as any).scopeOfImprovements || '',
                                    toolsUsed: editingTask.toolsUsed, startTime: editingTask.startTime,
                                    endTime: editingTask.endTime, percentageComplete: editingTask.percentageComplete,
                                    // @ts-ignore
                                    pmsSubtaskId: editingTask.pmsSubtaskId,
                                } : undefined}
                                onSave={handleSaveTask}
                                onCancel={() => { if (soundOn) playSound('pop'); setLocation(`/tracker?date=${dateStr}`); }}
                                user={user ? { role: user.role, employeeCode: user.employeeCode, department: user.department } : undefined}
                                date={dateStr}
                            />
                        </div>
                    </div>

                    {/* FOOTER */}
                    <div className="text-center py-3 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600">
                        <span>🏅 {title} · Level {Math.floor(xp / 100) + 1}</span>
                        <span>·</span>
                        <span>Total XP: <span className="text-violet-400 font-black">{xp}</span></span>
                        {streak >= 2 && <><span>·</span><span className="text-orange-400/60">🔥 {streak}-entry streak</span></>}
                    </div>
                </div>
            </div>
            <Dialog open={showPlanAlert} onOpenChange={(open) => {
                if (!open) setLocation(`/tracker?date=${dateStr}`);
                setShowPlanAlert(open);
            }}>
                <DialogContent className="bg-slate-900/90 backdrop-blur-xl border-blue-500/30 text-white max-w-md p-8 rounded-[2rem] shadow-[0_32px_64px_rgba(0,0,0,0.8)]">
                    <div className="flex flex-col items-center text-center space-y-6">
                        <div className="w-20 h-20 rounded-full bg-rose-500/20 flex items-center justify-center border border-rose-500/30 animate-pulse">
                            <AlertCircle className="w-10 h-10 text-rose-500" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-black tracking-tight text-white uppercase">Access Restricted</h2>
                            <p className="text-blue-100/70 text-sm leading-relaxed">
                                You have not filled your Plan for the Day, so you cannot fill the timesheet.
                            </p>
                            <div className="py-2 px-4 bg-white/5 rounded-xl border border-white/10 mt-4">
                                <p className="text-[11px] font-bold text-blue-300 uppercase tracking-widest leading-loose">
                                    Please fill your plan of the day
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={() => setLocation(`/tracker?date=${dateStr}`)}
                            className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-black py-6 rounded-2xl shadow-xl shadow-blue-900/40 transition-all hover:scale-[1.02] active:scale-95"
                        >
                            RETURN TO TRACKER
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ─── KEYFRAMES ────────────────────────────────────────────────────────────────
const ALL_KEYFRAMES = `
  @keyframes popIn {
    0%  { opacity:0; transform:translate(-50%,-50%) scale(.1) rotate(-15deg); }
    55% { opacity:1; transform:translate(-50%,-50%) scale(1.1) rotate(3deg); }
    100%{ opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0deg); }
  }
  @keyframes cardWiggle {
    0%,100%{ transform:rotate(-5deg) scale(1.04); }
    50%    { transform:rotate(5deg)  scale(1.08); }
  }
  @keyframes cardFloat {
    0%,100%{ transform:translateY(0px); }
    50%    { transform:translateY(-7px); }
  }
  @keyframes bigBounce {
    0%  { transform:scale(1); }
    32% { transform:scale(1.35) rotate(-4deg); }
    62% { transform:scale(.95) rotate(2deg); }
    100%{ transform:scale(1) rotate(0deg); }
  }
  @keyframes msgPop {
    0%  { opacity:0; transform:scale(.5) translateY(6px); }
    100%{ opacity:1; transform:scale(1) translateY(0); }
  }
  @keyframes bubbleIn {
    0%  { opacity:0; transform:scale(.5) translateY(8px); }
    65% { transform:scale(1.04) translateY(-2px); }
    100%{ opacity:1; transform:scale(1) translateY(0); }
  }
  @keyframes scoreUp {
    0%   { opacity:0; transform:translateY(0) scale(.7); }
    20%  { opacity:1; transform:translateY(-18px) scale(1.15); }
    80%  { opacity:1; transform:translateY(-55px) scale(1); }
    100% { opacity:0; transform:translateY(-80px) scale(.85); }
  }
  @keyframes streakGlow {
    0%,100%{ box-shadow:0 0 6px #f59e0b55; }
    50%    { box-shadow:0 0 14px #f59e0b99; }
  }
  @keyframes headerShake {
    0%,100%{ transform:translateX(0); }
    20%    { transform:translateX(-6px) rotate(-1.5deg); }
    40%    { transform:translateX(6px) rotate(1.5deg); }
    60%    { transform:translateX(-4px); }
    80%    { transform:translateX(4px); }
  }
  @keyframes glowPulse {
    0%,100%{ opacity:.5; }
    50%    { opacity:1; }
  }
  @keyframes spinCW  { from { transform:rotate(0deg); }   to { transform:rotate(360deg); } }
  @keyframes spinCCW { from { transform:rotate(0deg); }   to { transform:rotate(-360deg); } }
  @keyframes glowRing {
    0%,100%{ opacity:.45; transform:scale(1); }
    50%    { opacity:.9;  transform:scale(1.06); }
  }
  @keyframes shineSweep {
    0%   { left:-60%; opacity:0; }
    25%  { opacity:1; }
    50%  { left:120%; opacity:0; }
    100% { left:120%; opacity:0; }
  }
  @keyframes emojiWobble {
    0%,100%{ transform:rotate(-10deg) scale(1);   }
    25%    { transform:rotate(12deg)  scale(1.2); }
    50%    { transform:rotate(-8deg)  scale(0.95);}
    75%    { transform:rotate(10deg)  scale(1.15);}
  }
  @keyframes onlinePulse {
    0%,100%{ transform:scale(1);   opacity:1; }
    50%    { transform:scale(1.45); opacity:.7; }
  }
`;
