const fs = require('fs');
const content = fs.readFileSync('src/components/profile/SettingsView.tsx', 'utf8');

const regex = /<label className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-\[#FEBA4F\]\/30 transition-colors cursor-pointer">([\s\S]*?)<\/label>\s*<label className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-\[#FEBA4F\]\/30 transition-colors cursor-pointer">([\s\S]*?)<\/label>\s*<label className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-\[#FEBA4F\]\/30 transition-colors cursor-pointer">([\s\S]*?)<\/label>\s*<label className="flex items-center justify-between p-6 bg-slate-100 rounded-2xl border border-slate-200 opacity-80 cursor-not-allowed">([\s\S]*?)<\/label>/;

const replacement = `
                    <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-[#FEBA4F]/30 transition-colors">
                        <div>
                            <span className="block font-black text-[#0A1128] uppercase tracking-widest text-sm mb-1">Ponudbe na mojih dražbah</span>
                            <span className="block text-slate-500 text-sm">Prejmite e-pošto, ko nekdo odda ponudbo na vaši dražbi.</span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={formData.emailNotifications?.bids !== false}
                            onClick={() => {
                                setFormData(prev => ({
                                    ...prev,
                                    emailNotifications: {
                                        ...prev.emailNotifications,
                                        bids: !(prev.emailNotifications?.bids !== false)
                                    }
                                }));
                                isFormDirtyRef.current = true;
                            }}
                            className={\`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none \${formData.emailNotifications?.bids !== false ? 'bg-[#FEBA4F]' : 'bg-slate-300'}\`}
                        >
                            <span className={\`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-sm \${formData.emailNotifications?.bids !== false ? 'translate-x-7' : 'translate-x-1'}\`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-[#FEBA4F]/30 transition-colors">
                        <div>
                            <span className="block font-black text-[#0A1128] uppercase tracking-widest text-sm mb-1">Nova sporočila</span>
                            <span className="block text-slate-500 text-sm">Prejmite e-pošto, ko vam uporabnik pošlje sporočilo.</span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={formData.emailNotifications?.messages !== false}
                            onClick={() => {
                                setFormData(prev => ({
                                    ...prev,
                                    emailNotifications: {
                                        ...prev.emailNotifications,
                                        messages: !(prev.emailNotifications?.messages !== false)
                                    }
                                }));
                                isFormDirtyRef.current = true;
                            }}
                            className={\`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none \${formData.emailNotifications?.messages !== false ? 'bg-[#FEBA4F]' : 'bg-slate-300'}\`}
                        >
                            <span className={\`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-sm \${formData.emailNotifications?.messages !== false ? 'translate-x-7' : 'translate-x-1'}\`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-[#FEBA4F]/30 transition-colors">
                        <div>
                            <span className="block font-black text-[#0A1128] uppercase tracking-widest text-sm mb-1">Marketing in novice</span>
                            <span className="block text-slate-500 text-sm">Prejmite e-pošto o novostih in akcijah.</span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={formData.emailNotifications?.marketing !== false}
                            onClick={() => {
                                setFormData(prev => ({
                                    ...prev,
                                    emailNotifications: {
                                        ...prev.emailNotifications,
                                        marketing: !(prev.emailNotifications?.marketing !== false)
                                    }
                                }));
                                isFormDirtyRef.current = true;
                            }}
                            className={\`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none \${formData.emailNotifications?.marketing !== false ? 'bg-[#FEBA4F]' : 'bg-slate-300'}\`}
                        >
                            <span className={\`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-sm \${formData.emailNotifications?.marketing !== false ? 'translate-x-7' : 'translate-x-1'}\`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-6 bg-slate-100 rounded-2xl border border-slate-200 opacity-80 cursor-not-allowed">
                        <div>
                            <span className="block font-black text-[#0A1128] uppercase tracking-widest text-sm mb-1">Računi (Obvezno)</span>
                            <span className="block text-slate-500 text-sm">Prejmite e-pošto z računom ob nakupu paketa ali uspešni prodaji. Tega obvestila ni mogoče izklopiti.</span>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={true}
                            disabled={true}
                            className="relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none bg-[#FEBA4F] opacity-50 cursor-not-allowed"
                        >
                            <span className="inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 shadow-sm translate-x-7" />
                        </button>
                    </div>
`;

const updatedContent = content.replace(regex, replacement);
fs.writeFileSync('src/components/profile/SettingsView.tsx', updatedContent);
