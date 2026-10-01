const fs = require('fs');
let content = fs.readFileSync('src/components/ui/CustomDateTime.tsx', 'utf8');

const targetPicker = `export const CustomTimePicker = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);`;

const newPicker = `export const CustomTimePicker = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const hoursContainerRef = useRef<HTMLDivElement>(null);
    const minutesContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                const selectedHourBtn = hoursContainerRef.current?.querySelector('.bg-\\\\[\\\\#FEBA4F\\\\]');
                if (selectedHourBtn) {
                    selectedHourBtn.scrollIntoView({ block: 'center', behavior: 'auto' });
                }
                const selectedMinBtn = minutesContainerRef.current?.querySelector('.bg-\\\\[\\\\#FEBA4F\\\\]');
                if (selectedMinBtn) {
                    selectedMinBtn.scrollIntoView({ block: 'center', behavior: 'auto' });
                }
            }, 10);
        }
    }, [isOpen]);`;

content = content.replace(targetPicker, newPicker);

content = content.replace(
  `<div className="h-48 overflow-y-auto scrollbar-hide flex flex-col gap-1 pr-2" style={{ scrollbarWidth: 'none' }}>`,
  `<div ref={hoursContainerRef} className="h-48 overflow-y-auto scrollbar-hide flex flex-col gap-1 pr-2" style={{ scrollbarWidth: 'none' }}>`
);

content = content.replace(
  `<div className="h-48 overflow-y-auto scrollbar-hide flex flex-col gap-1 pl-2" style={{ scrollbarWidth: 'none' }}>`,
  `<div ref={minutesContainerRef} className="h-48 overflow-y-auto scrollbar-hide flex flex-col gap-1 pl-2" style={{ scrollbarWidth: 'none' }}>`
);

fs.writeFileSync('src/components/ui/CustomDateTime.tsx', content);
