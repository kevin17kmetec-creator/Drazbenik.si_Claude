const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /currentUserUnsold\.map\(\(soldItem\) => \{[\s\S]*?\}\)[\s\n]*\)\}[\s\n]*<\/div>[\s\n]*<\/div>[\s\n]*<\/div>[\s\n]*\);[\s\n]*break;/;

const replacement = `currentUserUnsold.map((entry: any) => {
                  if (entry.type === 'package') {
                    const pkg = entry;
                    const items = pkg.items;
                    const firstItem = items[0];
                    const endMs = new Date(firstItem.endTime || firstItem.end_time).getTime();
                    const expireMs = endMs + 30 * 24 * 60 * 60 * 1000;
                    const daysLeft = Math.max(0, Math.ceil((expireMs - nowMs) / (24 * 60 * 60 * 1000)));

                    return (
                      <div
                        key={pkg.package_id}
                        className="flex flex-col md:flex-row items-center gap-8 p-6 rounded-[2.5rem] border-2 border-slate-100 hover:border-blue-200 bg-blue-50/30 transition-colors group relative"
                      >
                        <button 
                          onClick={async () => {
                            if (window.confirm("Ste prepričani, da želite dokončno izbrisati te dražbe? Te akcije ni mogoče razveljaviti.")) {
                              try {
                                for (const item of items) {
                                  await deleteDoc(doc(db, 'auctions', item.id));
                                }
                                toast.success("Dražbe uspešno in trajno izbrisane.");
                                fetchAuctions();
                              } catch (e: any) {
                                toast.error("Napaka pri brisanju: " + e.message);
                              }
                            }
                          }}
                          className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors"
                          title="Dokončno izbriši dražbe"
                        >
                          <Trash2 size={24} />
                        </button>
                        <div className="relative w-32 h-32 cursor-pointer group-hover:scale-105 transition-transform" onClick={() => {}}>
                           <SignedImg src={firstItem.images[0]} className="w-full h-full rounded-3xl object-cover shadow-md" alt="Package preview" />
                           <div className="absolute -bottom-3 -right-3 bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-black border-4 border-white">
                             {items.length}
                           </div>
                        </div>
                        <div className="flex-1 text-center md:text-left">
                          <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-full mb-2">Neprodan paket</div>
                          <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-500 mb-2">
                            {items.length} neprodanih predmetov iz paketa
                          </h3>
                          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-bold text-slate-400">
                            <span className="flex items-center gap-1.5">
                              <Calendar size={16} /> Končano: {new Date(firstItem.endTime).toLocaleDateString("sl-SI")}
                            </span>
                            <span className={\`flex items-center gap-1.5 \${daysLeft <= 3 ? 'text-red-500' : 'text-[#FEBA4F]'}\`}>
                              <Clock size={16} /> Poteče čez: {daysLeft} dni
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-3 w-full md:w-auto mt-4 md:mt-0">
                          <button
                            onClick={() => {
                              setRepublishData({ type: 'package', items: items });
                              setCreateMode('package');
                              setActiveView("createAuction");
                              window.scrollTo({ top: 0, behavior: "instant" });
                            }}
                            className="bg-[#0A1128] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-2"
                          >
                            <Upload size={16} /> Uredi in objavi paket
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const soldItem = entry.item;
                  const endMs = new Date(soldItem.endTime || (soldItem as any).end_time).getTime();
                  const expireMs = endMs + 30 * 24 * 60 * 60 * 1000;
                  const daysLeft = Math.max(0, Math.ceil((expireMs - nowMs) / (24 * 60 * 60 * 1000)));

                  return (
                    <div
                      key={soldItem.id}
                      className="flex flex-col md:flex-row items-center gap-8 p-6 rounded-[2.5rem] border-2 border-slate-100 hover:border-slate-300 transition-colors group relative"
                    >
                      <button 
                        onClick={async () => {
                          if (window.confirm("Ste prepričani, da želite dokončno izbrisati to dražbo? Te akcije ni mogoče razveljaviti.")) {
                            try {
                              await deleteDoc(doc(db, 'auctions', soldItem.id));
                              toast.success("Dražba uspešno in trajno izbrisana.");
                              fetchAuctions();
                            } catch (e: any) {
                              toast.error("Napaka pri brisanju: " + e.message);
                            }
                          }
                        }}
                        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors"
                        title="Dokončno izbriši dražbo"
                      >
                        <Trash2 size={24} />
                      </button>
                      <SignedImg
                        src={soldItem.images[0]}
                        alt="Item"
                        className="w-32 h-32 rounded-3xl object-cover shadow-md cursor-pointer group-hover:scale-105 transition-transform"
                        onClick={() => {
                          setSelectedItem(soldItem);
                          setActiveView("detail");
                          window.scrollTo({ top: 0, behavior: "instant" });
                        }}
                      />
                      <div className="flex-1 text-center md:text-left">
                        <h3
                          className="text-2xl font-black uppercase tracking-tighter text-slate-500 mb-2 cursor-pointer hover:text-[#0A1128] transition-colors"
                          onClick={() => {
                            setSelectedItem(soldItem);
                            setActiveView("detail");
                            window.scrollTo({ top: 0, behavior: "instant" });
                          }}
                        >
                          {soldItem.title[
                            language as keyof typeof soldItem.title
                          ] || soldItem.title.SLO}
                        </h3>
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-bold text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Calendar size={16} /> Končano:{" "}
                            {new Date(soldItem.endTime).toLocaleDateString(
                              "sl-SI",
                            )}
                          </span>
                          <span className={\`flex items-center gap-1.5 \${daysLeft <= 3 ? 'text-red-500' : 'text-[#FEBA4F]'}\`}>
                            <Clock size={16} /> Poteče čez: {daysLeft} dni
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 w-full md:w-auto mt-4 md:mt-0">
                        <button
                          onClick={() => setQuickRepublishItem(soldItem)}
                          className="bg-[#FEBA4F] text-[#0A1128] px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all shadow-xl flex items-center justify-center gap-2"
                        >
                          <Upload size={16} /> Hitra objava
                        </button>
                        <button
                          onClick={() => {
                            setRepublishData(soldItem);
                            setCreateMode('single');
                            setActiveView("createAuction");
                            window.scrollTo({ top: 0, behavior: "instant" });
                          }}
                          className="bg-[#0A1128] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-2"
                        >
                          <Upload size={16} /> Uredi in objavi
                        </button>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      );
      break;`;

let newContent = content.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', newContent);
console.log(newContent !== content ? "Unsold UI updated successfully" : "Failed to update UI");
