import React from 'react';

// Deutscher Kommentar: Eigener Icon-Satz der Plattform (ersetzt lucide-react).
// Stil: zweitonig – Hauptlinie in currentColor, kleine Akzente in --ic-accent (Standard: Bernstein), dazu eine zarte Flaechenschicht.
// Teile: f = Flaechenschicht, s = Hauptlinie, a = Akzentlinie, r = blasser Ring, d = Akzentpunkt [cx, cy, r], af = Akzentflaeche
type Part = ['f' | 's' | 'a' | 'r' | 'af', string] | ['d', number, number, number];

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
}

const ACCENT = 'var(--ic-accent, currentColor)';

const make = (name: string, parts: Part[]) => {
  const Icon = React.forwardRef<SVGSVGElement, IconProps>(
    ({ size = 24, strokeWidth = 1.75, color, className, style, fill, absoluteStrokeWidth, ...rest }, ref) => {
      const solid = fill && fill !== 'none';
      const sw = absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth;
      return (
        <svg
          ref={ref}
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`ic ${className || ''}`.trim()}
          style={color ? { color, ...style } : style}
          aria-hidden="true"
          {...rest}
        >
          {parts.map((p, i) => {
            switch (p[0]) {
              case 'f':
                return <path key={i} d={p[1]} fill={solid ? String(fill) : 'currentColor'} fillOpacity={solid ? 1 : 0.14} stroke="none" />;
              case 's':
                return <path key={i} d={p[1]} />;
              case 'a':
                return <path key={i} d={p[1]} stroke={ACCENT} />;
              case 'af':
                return <path key={i} d={p[1]} fill={ACCENT} fillOpacity={0.22} stroke={ACCENT} />;
              case 'r':
                return <path key={i} d={p[1]} strokeOpacity={0.22} />;
              default:
                return <circle key={i} cx={p[1]} cy={p[2]} r={p[3]} fill={ACCENT} stroke="none" />;
            }
          })}
        </svg>
      );
    }
  );
  Icon.displayName = name;
  return Icon;
};

const CIRCLE = 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z';
const TRAY = 'M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16';
const PAGE = 'M6 3.5h8l4.5 4.5v11.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5v-14A1.5 1.5 0 0 1 6 3.5z';
const SHIELD = 'M12 3.2 19.5 6v5.6c0 4.4-3.1 7.9-7.5 9.2-4.4-1.3-7.5-4.8-7.5-9.2V6z';
const CAM = 'M3.5 8.5A1.5 1.5 0 0 1 5 7h2.2l1.4-2h6.8l1.4 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z';
const REFRESH: Part[] = [
  ['s', 'M4 12a8 8 0 0 1 13.7-5.6L20 8.5'],
  ['a', 'M20 4v4.5h-4.5'],
  ['s', 'M20 12a8 8 0 0 1-13.7 5.6L4 15.5'],
  ['a', 'M4 20v-4.5h4.5'],
];
const CHECK_CIRCLE: Part[] = [['f', CIRCLE], ['s', CIRCLE], ['a', 'M8 12.4l2.8 2.8 5.4-5.6']];
const BUILDING_BODY: Part[] = [
  ['f', 'M4.5 20.5V5A1.2 1.2 0 0 1 5.7 3.8h6.6A1.2 1.2 0 0 1 13.5 5v15.5'],
  ['s', 'M4.5 20.5V5A1.2 1.2 0 0 1 5.7 3.8h6.6A1.2 1.2 0 0 1 13.5 5v15.5'],
  ['s', 'M13.5 10h4.8a1.2 1.2 0 0 1 1.2 1.2v9.3M3 20.5h18'],
];

export const AlertCircle = make('AlertCircle', [['f', CIRCLE], ['s', CIRCLE], ['s', 'M12 8v4.6'], ['d', 12, 16.2, 1.1]]);
export const AlertTriangle = make('AlertTriangle', [['f', 'M12 4.2 3.6 18.6a1 1 0 0 0 .9 1.5h15a1 1 0 0 0 .9-1.5z'], ['s', 'M12 4.2 3.6 18.6a1 1 0 0 0 .9 1.5h15a1 1 0 0 0 .9-1.5z'], ['s', 'M12 9.6v4'], ['d', 12, 16.9, 1]]);
export const AlertOctagon = make('AlertOctagon', [['f', 'M8.3 3.8h7.4l4.5 4.5v7.4l-4.5 4.5H8.3l-4.5-4.5V8.3z'], ['s', 'M8.3 3.8h7.4l4.5 4.5v7.4l-4.5 4.5H8.3l-4.5-4.5V8.3z'], ['s', 'M12 8.2v4.4'], ['d', 12, 16, 1.1]]);
export const ArrowLeft = make('ArrowLeft', [['s', 'M20 12H5'], ['a', 'M11 5.8 4.8 12l6.2 6.2']]);
export const ArrowRight = make('ArrowRight', [['s', 'M4 12h15'], ['a', 'M13 5.8l6.2 6.2-6.2 6.2']]);
export const ArrowUp = make('ArrowUp', [['s', 'M12 20V5'], ['a', 'M5.8 11 12 4.8l6.2 6.2']]);
export const Award = make('Award', [['f', 'M12 4a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z'], ['s', 'M12 4a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z'], ['s', 'M8.6 14.2 7 20.4l5-2.6 5 2.6-1.6-6.2'], ['a', 'M12 7l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z']]);
export const Bell = make('Bell', [['f', 'M6.2 16.5V11a5.8 5.8 0 0 1 11.6 0v5.5l1.6 2H4.6z'], ['s', 'M6.2 16.5V11a5.8 5.8 0 0 1 11.6 0v5.5l1.6 2H4.6z'], ['s', 'M12 3.4v1.8'], ['a', 'M10 21.2h4']]);
export const Briefcase = make('Briefcase', [['f', 'M4 8.2h16a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.2a1 1 0 0 1 1-1z'], ['s', 'M4 8.2h16a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.2a1 1 0 0 1 1-1z'], ['s', 'M9 8.2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.2'], ['s', 'M3 13.2h18'], ['a', 'M10.5 12.2v2.6h3v-2.6']]);
export const Building = make('Building', [...BUILDING_BODY, ['a', 'M8 8h2.4M8 11.8h2.4M8 15.6h2.4']]);
export const Building2 = make('Building2', [...BUILDING_BODY, ['a', 'M7.6 8h2.8M7.6 11.6h2.8'], ['a', 'M8.2 20.5v-3.4h2.6v3.4']]);
export const Calendar = make('Calendar', [['f', 'M5 5.8h14a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.3A1.5 1.5 0 0 1 5 5.8z'], ['s', 'M5 5.8h14a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.3A1.5 1.5 0 0 1 5 5.8z'], ['s', 'M3.5 10.5h17M8 3.5v4M16 3.5v4'], ['d', 8.5, 14.8, 1.1], ['d', 12, 14.8, 1.1], ['d', 15.5, 14.8, 1.1]]);
export const Camera = make('Camera', [['f', CAM], ['s', CAM], ['a', 'M12 10.6a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2z']]);
export const Check = make('Check', [['s', 'M5 12.8l4.4 4.4L19 7.4']]);
export const CheckCheck = make('CheckCheck', [['s', 'M3.5 12.8l4 4L15 9.3'], ['a', 'M12 15.4l1.6 1.6L21 9.5']]);
export const CheckCircle = make('CheckCircle', CHECK_CIRCLE);
export const CheckCircle2 = make('CheckCircle2', CHECK_CIRCLE);
export const ChevronDown = make('ChevronDown', [['s', 'M6 9.5l6 6 6-6']]);
export const ChevronLeft = make('ChevronLeft', [['s', 'M14.5 6l-6 6 6 6']]);
export const ChevronRight = make('ChevronRight', [['s', 'M9.5 6l6 6-6 6']]);
export const Clock = make('Clock', [['f', CIRCLE], ['s', CIRCLE], ['s', 'M12 7.4V12'], ['a', 'M12 12l3.2 2']]);
export const Cookie = make('Cookie', [['f', 'M20.5 12.3A8.5 8.5 0 1 1 11.7 3.5 4 4 0 0 0 15.5 8.4a4 4 0 0 0 5 3.9z'], ['s', 'M20.5 12.3A8.5 8.5 0 1 1 11.7 3.5 4 4 0 0 0 15.5 8.4a4 4 0 0 0 5 3.9z'], ['d', 9, 10, 1.1], ['d', 13.4, 15.2, 1.1], ['d', 8.6, 15, 0.9]]);
export const Copy = make('Copy', [['f', 'M9 9h10a1.2 1.2 0 0 1 1.2 1.2v9.6A1.2 1.2 0 0 1 19 21H9a1.2 1.2 0 0 1-1.2-1.2v-9.6A1.2 1.2 0 0 1 9 9z'], ['s', 'M9 9h10a1.2 1.2 0 0 1 1.2 1.2v9.6A1.2 1.2 0 0 1 19 21H9a1.2 1.2 0 0 1-1.2-1.2v-9.6A1.2 1.2 0 0 1 9 9z'], ['a', 'M16 5.6V4.5A1.5 1.5 0 0 0 14.5 3h-9A1.5 1.5 0 0 0 4 4.5v9A1.5 1.5 0 0 0 5.5 15h1.3']]);
export const CreditCard = make('CreditCard', [['f', 'M4 5.5h16A1.5 1.5 0 0 1 21.5 7v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5z'], ['s', 'M4 5.5h16A1.5 1.5 0 0 1 21.5 7v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5z'], ['s', 'M2.5 10h19'], ['a', 'M6 14.5h3.6']]);
export const Download = make('Download', [['s', TRAY], ['s', 'M12 3.8v11'], ['a', 'M7.6 10.6 12 15l4.4-4.4']]);
export const Upload = make('Upload', [['s', TRAY], ['s', 'M12 15V4.6'], ['a', 'M7.6 8.2 12 3.8l4.4 4.4']]);
export const Edit3 = make('Edit3', [['f', 'M4 20l1-4.2L16.2 4.6a1.7 1.7 0 0 1 2.4 0l.8.8a1.7 1.7 0 0 1 0 2.4L8.2 19z'], ['s', 'M4 20l1-4.2L16.2 4.6a1.7 1.7 0 0 1 2.4 0l.8.8a1.7 1.7 0 0 1 0 2.4L8.2 19z'], ['a', 'M14.2 6.6l3.2 3.2'], ['s', 'M12.5 20.5H20']]);
export const ExternalLink = make('ExternalLink', [['s', 'M10.5 5H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 19h11a1.5 1.5 0 0 0 1.5-1.5V13'], ['a', 'M14 4.5h5.5V10M19.2 4.8 11 13']]);
export const Eye = make('Eye', [['f', 'M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z'], ['s', 'M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z'], ['a', 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z']]);
export const EyeOff = make('EyeOff', [['s', 'M5.2 7.4C3.7 9 2.8 12 2.8 12S6.2 18.2 12 18.2c1.6 0 3-.5 4.2-1.2M9.7 5.9A8 8 0 0 1 12 5.8c5.8 0 9.2 6.2 9.2 6.2s-.6 1.2-1.8 2.6'], ['s', 'M10 10.2a2.8 2.8 0 0 0 3.8 3.8'], ['a', 'M3.5 3.5l17 17']]);
export const FileText = make('FileText', [['f', PAGE], ['s', PAGE], ['s', 'M14 3.5V8h4.5'], ['a', 'M8 13h8M8 16.6h5']]);
export const FileCheck = make('FileCheck', [['f', PAGE], ['s', PAGE], ['s', 'M14 3.5V8h4.5'], ['a', 'M8.8 14l2.4 2.4 4.2-4.4']]);
export const FileUp = make('FileUp', [['f', PAGE], ['s', PAGE], ['s', 'M14 3.5V8h4.5'], ['a', 'M12 18v-6M9.4 14.4 12 11.8l2.6 2.6']]);
export const Filter = make('Filter', [['f', 'M3.5 5h17l-6.5 7.7V19l-4 2v-8.3z'], ['s', 'M3.5 5h17l-6.5 7.7V19l-4 2v-8.3z'], ['a', 'M7 8.6h10']]);
export const Gavel = make('Gavel', [['f', 'M4.6 10.4 9.9 5.1l5.3 5.3-5.3 5.3z'], ['s', 'M4.6 10.4 9.9 5.1l5.3 5.3-5.3 5.3z'], ['s', 'M13.4 13.9 20.2 20.7'], ['a', 'M3.5 20.4h8M12.6 6.4l2.9-2.9M18.4 10.7l2.9-2.9']]);
export const Globe = make('Globe', [['f', CIRCLE], ['s', CIRCLE], ['s', 'M3.5 12h17'], ['a', 'M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5M12 3.5C9.6 5.9 8.4 8.7 8.4 12s1.2 6.1 3.6 8.5']]);
export const GripHorizontal = make('GripHorizontal', [['d', 8, 10, 1.25], ['d', 12, 10, 1.25], ['d', 16, 10, 1.25], ['d', 8, 14, 1.25], ['d', 12, 14, 1.25], ['d', 16, 14, 1.25]]);
export const HelpCircle = make('HelpCircle', [['f', CIRCLE], ['s', CIRCLE], ['a', 'M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8'], ['d', 12, 16.8, 1]]);
export const History = make('History', [['s', 'M4 12a8 8 0 1 0 2.5-5.8L4 8.5'], ['a', 'M4 4.5v4h4'], ['s', 'M12 8v4.2l2.8 1.8']]);
export const Image = make('Image', [['f', 'M5 4h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 4z'], ['s', 'M5 4h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 4z'], ['s', 'M3.5 16l5-4.8 4.5 4.2 2.8-2.4 4.7 4.4'], ['d', 8.6, 8.6, 1.5]]);
export const ImagePlus = make('ImagePlus', [['s', 'M13.5 4H5A1.5 1.5 0 0 0 3.5 5.5v13A1.5 1.5 0 0 0 5 20h13a1.5 1.5 0 0 0 1.5-1.5V11'], ['s', 'M3.5 16l5-4.8 3.8 3.5'], ['d', 8.6, 8.6, 1.4], ['a', 'M18 3v6M15 6h6']]);
export const Info = make('Info', [['f', CIRCLE], ['s', CIRCLE], ['s', 'M12 11v5.2'], ['d', 12, 7.9, 1.1]]);
export const Key = make('Key', [['f', 'M8 11.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'], ['s', 'M8 11.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'], ['s', 'M10.9 12.6 20 3.5'], ['a', 'M16.5 7l2.5 2.5M14 9.5l2 2']]);
export const Landmark = make('Landmark', [['f', 'M3 9.5 12 4l9 5.5z'], ['s', 'M3 9.5 12 4l9 5.5z'], ['s', 'M6.5 12.5v6M10.2 12.5v6M13.8 12.5v6M17.5 12.5v6'], ['a', 'M3.5 20.5h17']]);
export const Languages = make('Languages', [['s', 'M4 6h9M8.5 4v2M6 6c.4 2.8 2.6 5 5.5 6M11.5 6c-.6 3.6-3.4 6.4-7 7.6'], ['a', 'M12.5 20l4.2-9.5 4.3 9.5M13.8 17.2h5.8']]);
export const Layers = make('Layers', [['f', 'M12 3.8 21 8.5l-9 4.7-9-4.7z'], ['s', 'M12 3.8 21 8.5l-9 4.7-9-4.7z'], ['a', 'M3.5 12.5 12 17l8.5-4.5'], ['s', 'M3.5 16.2 12 20.5l8.5-4.3']]);
export const LayoutGrid = make('LayoutGrid', [['s', 'M5.5 4h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'], ['s', 'M13.5 4h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'], ['s', 'M5.5 13h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z'], ['af', 'M13.5 13h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z']]);
export const Link2 = make('Link2', [['s', 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-.8.8'], ['a', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l.8-.8']]);
export const List = make('List', [['s', 'M9.5 6.5h11M9.5 12h11M9.5 17.5h11'], ['d', 4.8, 6.5, 1.3], ['d', 4.8, 12, 1.3], ['d', 4.8, 17.5, 1.3]]);
export const Loader2 = make('Loader2', [['r', CIRCLE], ['s', 'M12 3.5a8.5 8.5 0 0 1 8.5 8.5']]);
export const Lock = make('Lock', [['f', 'M6.2 10.5h11.6a1.2 1.2 0 0 1 1.2 1.2v7.1a1.2 1.2 0 0 1-1.2 1.2H6.2A1.2 1.2 0 0 1 5 18.8v-7.1a1.2 1.2 0 0 1 1.2-1.2z'], ['s', 'M6.2 10.5h11.6a1.2 1.2 0 0 1 1.2 1.2v7.1a1.2 1.2 0 0 1-1.2 1.2H6.2A1.2 1.2 0 0 1 5 18.8v-7.1a1.2 1.2 0 0 1 1.2-1.2z'], ['s', 'M8 10.5V7.8a4 4 0 0 1 8 0v2.7'], ['d', 12, 15.2, 1.4]]);
export const LogOut = make('LogOut', [['s', 'M9.5 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h3.5'], ['s', 'M10 12h10'], ['a', 'M16.5 8.2 20.3 12l-3.8 3.8']]);
export const Mail = make('Mail', [['f', 'M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5z'], ['s', 'M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5z'], ['a', 'M3.5 7.5 12 13.5l8.5-6']]);
export const MapPin = make('MapPin', [['f', 'M12 21s6.5-5.7 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.3 6.5 11 6.5 11z'], ['s', 'M12 21s6.5-5.7 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.3 6.5 11 6.5 11z'], ['a', 'M12 7.7a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z']]);
export const Menu = make('Menu', [['s', 'M4 7h16M4 12h16'], ['a', 'M4 17h10']]);
export const MessageSquare = make('MessageSquare', [['f', 'M5.5 4.5h13A1.5 1.5 0 0 1 20 6v9.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5V6a1.5 1.5 0 0 1 1.5-1.5z'], ['s', 'M5.5 4.5h13A1.5 1.5 0 0 1 20 6v9.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5V6a1.5 1.5 0 0 1 1.5-1.5z'], ['d', 8.5, 10.8, 1], ['d', 12, 10.8, 1], ['d', 15.5, 10.8, 1]]);
export const Minus = make('Minus', [['s', 'M5.5 12h13']]);
export const Package = make('Package', [['f', 'M12 3.2 20.5 7.6v8.8L12 20.8 3.5 16.4V7.6z'], ['s', 'M12 3.2 20.5 7.6v8.8L12 20.8 3.5 16.4V7.6z'], ['s', 'M3.8 7.7 12 12l8.2-4.3M12 12v8.6'], ['a', 'M7.8 5.4l8.4 4.4']]);
export const Phone = make('Phone', [['f', 'M6.5 3.5h2.6l1.5 4-1.9 1.4a11 11 0 0 0 5.4 5.4l1.4-1.9 4 1.5v2.6a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z'], ['s', 'M6.5 3.5h2.6l1.5 4-1.9 1.4a11 11 0 0 0 5.4 5.4l1.4-1.9 4 1.5v2.6a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z'], ['a', 'M14.5 4.2a5.5 5.5 0 0 1 5.3 5.3']]);
export const Plus = make('Plus', [['s', 'M5.5 12h13'], ['a', 'M12 5.5v13']]);
export const PlusCircle = make('PlusCircle', [['f', CIRCLE], ['s', CIRCLE], ['s', 'M8.2 12h7.6'], ['a', 'M12 8.2v7.6']]);
export const QrCode = make('QrCode', [['f', 'M4.5 4.5h5v5h-5z'], ['s', 'M4.5 4.5h5v5h-5z'], ['s', 'M14.5 4.5h5v5h-5z'], ['s', 'M4.5 14.5h5v5h-5z'], ['a', 'M14.5 14.5h2.4v2.4h-2.4zM18.2 18.2h1.3v1.3h-1.3zM14.5 18.6v.9M18.2 14.5h1.3']]);
export const RefreshCcw = make('RefreshCcw', REFRESH);
export const RefreshCw = make('RefreshCw', REFRESH);
export const Repeat = make('Repeat', [['s', 'M4 11V9.5A2.5 2.5 0 0 1 6.5 7H19M4 17h12.5a2.5 2.5 0 0 0 2.5-2.5V13'], ['a', 'M16 4l3.2 3L16 10M8 14l-3.2 3L8 20']]);
export const Scale = make('Scale', [['s', 'M12 4v16M7 20h10M5 7h14'], ['f', 'M5 7l-2.4 6a3 3 0 0 0 4.8 0z'], ['a', 'M5 7l-2.4 6a3 3 0 0 0 4.8 0zM19 7l-2.4 6a3 3 0 0 0 4.8 0z'], ['d', 12, 4, 1.3]]);
export const Search = make('Search', [['f', 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z'], ['s', 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z'], ['a', 'M15.3 15.3 20.5 20.5']]);
export const SendHorizontal = make('SendHorizontal', [['f', 'M3.5 4.5 21 12 3.5 19.5l2.6-7.5z'], ['s', 'M3.5 4.5 21 12 3.5 19.5l2.6-7.5z'], ['a', 'M6.1 12H21']]);
export const Settings = make('Settings', [['f', 'M10.4 3.5h3.2l.5 2.2 1.5.8 2.1-.8 1.6 2.8-1.6 1.7v1.6l1.6 1.7-1.6 2.8-2.1-.8-1.5.8-.5 2.2h-3.2l-.5-2.2-1.5-.8-2.1.8-1.6-2.8 1.6-1.7v-1.6L4.7 9.5l1.6-2.8 2.1.8 1.5-.8z'], ['s', 'M10.4 3.5h3.2l.5 2.2 1.5.8 2.1-.8 1.6 2.8-1.6 1.7v1.6l1.6 1.7-1.6 2.8-2.1-.8-1.5.8-.5 2.2h-3.2l-.5-2.2-1.5-.8-2.1.8-1.6-2.8 1.6-1.7v-1.6L4.7 9.5l1.6-2.8 2.1.8 1.5-.8z'], ['a', 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z']]);
export const Share2 = make('Share2', [['s', 'M8.4 10.8l7.2-4.1M8.4 13.2l7.2 4.1'], ['f', 'M6 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z'], ['s', 'M6 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z'], ['a', 'M18 3.8a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM18 14.6a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z']]);
export const Shield = make('Shield', [['f', SHIELD], ['s', SHIELD]]);
export const ShieldCheck = make('ShieldCheck', [['f', SHIELD], ['s', SHIELD], ['a', 'M8.8 12.2l2.2 2.2 4.2-4.4']]);
export const ShieldAlert = make('ShieldAlert', [['f', SHIELD], ['s', SHIELD], ['s', 'M12 8.4v4'], ['d', 12, 15.4, 1]]);
export const SlidersHorizontal = make('SlidersHorizontal', [['s', 'M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20'], ['a', 'M15 4.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM9 14.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z']]);
export const Sparkles = make('Sparkles', [['f', 'M10.5 4.5l1.7 4.8 4.8 1.7-4.8 1.7-1.7 4.8-1.7-4.8L4 11l4.8-1.7z'], ['s', 'M10.5 4.5l1.7 4.8 4.8 1.7-4.8 1.7-1.7 4.8-1.7-4.8L4 11l4.8-1.7z'], ['a', 'M18 3.6v3.6M16.2 5.4h3.6M17.6 15.6v3.6M15.8 17.4h3.6']]);
export const Star = make('Star', [['f', 'M12 3.8l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.1l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z'], ['s', 'M12 3.8l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.1l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z']]);
export const SwitchCamera = make('SwitchCamera', [['f', CAM], ['s', CAM], ['a', 'M9.2 12.2a3 3 0 0 1 5.4-1.1M14.7 9v2.3h-2.3M14.8 13.8a3 3 0 0 1-5.4 1.1M9.3 17v-2.3h2.3']]);
export const Table = make('Table', [['f', 'M4.5 4.5h15a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z'], ['s', 'M4.5 4.5h15a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z'], ['s', 'M3.5 9.8h17M3.5 14.8h17'], ['a', 'M9.5 9.8v9.7']]);
export const Tag = make('Tag', [['f', 'M3.8 12.2V5.2a1.4 1.4 0 0 1 1.4-1.4h7l8.6 8.6a1.4 1.4 0 0 1 0 2l-6.6 6.6a1.4 1.4 0 0 1-2 0z'], ['s', 'M3.8 12.2V5.2a1.4 1.4 0 0 1 1.4-1.4h7l8.6 8.6a1.4 1.4 0 0 1 0 2l-6.6 6.6a1.4 1.4 0 0 1-2 0z'], ['d', 8.4, 8.4, 1.5]]);
export const ThumbsUp = make('ThumbsUp', [['f', 'M8 11v9H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z'], ['s', 'M8 11v9H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z'], ['a', 'M8 11l3.2-6.8a2.2 2.2 0 0 1 2.8 2.6l-.8 2.7h5.3a1.8 1.8 0 0 1 1.8 2.1l-1 6.6A2.2 2.2 0 0 1 17.1 20H8']]);
export const Timer = make('Timer', [['f', 'M12 6a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z'], ['s', 'M12 6a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z'], ['s', 'M9.5 2.8h5M12 6V2.8'], ['a', 'M12 13.5l3-3']]);
export const Trash2 = make('Trash2', [['s', 'M4.5 7h15M9.5 7V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7'], ['f', 'M6.2 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.8a1.5 1.5 0 0 0 1.5-1.3L17.8 7z'], ['s', 'M6.2 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.8a1.5 1.5 0 0 0 1.5-1.3L17.8 7'], ['a', 'M10 11v5.5M14 11v5.5']]);
export const TrendingUp = make('TrendingUp', [['s', 'M3.5 17l6-6 4 4 7-7.5'], ['a', 'M15 7.5h5.5V13']]);
export const Trophy = make('Trophy', [['f', 'M7.5 4h9v6a4.5 4.5 0 0 1-9 0z'], ['s', 'M7.5 4h9v6a4.5 4.5 0 0 1-9 0z'], ['s', 'M7.5 6H4.2v1.5A3.3 3.3 0 0 0 7.8 11M16.5 6h3.3v1.5a3.3 3.3 0 0 1-3.6 3.5'], ['a', 'M12 14.5V18M9.5 18h5M8.5 20.2h7']]);
export const Truck = make('Truck', [['f', 'M2.8 6.5a1 1 0 0 1 1-1h9.7v10.8H2.8z'], ['s', 'M2.8 6.5a1 1 0 0 1 1-1h9.7v10.8H2.8z'], ['s', 'M13.5 9h4l3.7 3.7v3.6h-7.7'], ['a', 'M7 15.6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17.2 15.6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z']]);
export const User = make('User', [['f', 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'], ['s', 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'], ['a', 'M4.5 20.5a7.5 7.5 0 0 1 15 0']]);
export const UserCheck = make('UserCheck', [['f', 'M10 4a3.8 3.8 0 1 0 0 7.6A3.8 3.8 0 0 0 10 4z'], ['s', 'M10 4a3.8 3.8 0 1 0 0 7.6A3.8 3.8 0 0 0 10 4z'], ['s', 'M3.5 20a6.5 6.5 0 0 1 11-4.6'], ['a', 'M15.5 17.8l2 2 3.6-4']]);
export const Wand2 = make('Wand2', [['s', 'M4.5 19.5l9.8-9.8'], ['f', 'M13 8.4l2.6 2.6-1.3 1.3-2.6-2.6z'], ['s', 'M13 8.4l2.6 2.6-1.3 1.3-2.6-2.6z'], ['a', 'M17.5 3.5v3.6M15.7 5.3h3.6M20 11.2v2.4M18.8 12.4h2.4']]);
export const X = make('X', [['s', 'M6 6l12 12M18 6L6 18']]);
export const XCircle = make('XCircle', [['f', CIRCLE], ['s', CIRCLE], ['a', 'M9 9l6 6M15 9l-6 6']]);
export const Zap = make('Zap', [['f', 'M13.2 3.2 5 13.2h6l-.9 7.6L19 10.8h-6z'], ['s', 'M13.2 3.2 5 13.2h6l-.9 7.6L19 10.8h-6z']]);

export type LucideIcon = React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>;
