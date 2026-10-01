const fs = require('fs');
let content = fs.readFileSync('src/components/ui/CustomDateTime.tsx', 'utf8');

const target1 = `        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };`;

const new1 = `        const handleClickOutside = (event: MouseEvent) => {
            // Check if click was on the scrollbar
            if (event.clientX >= document.documentElement.clientWidth) return;
            
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };`;

content = content.replace(target1, new1); // For DatePicker
content = content.replace(target1, new1); // For TimePicker

fs.writeFileSync('src/components/ui/CustomDateTime.tsx', content);
