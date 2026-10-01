const fs = require('fs');
let content = fs.readFileSync('src/components/auction/CreatePackageForm.tsx', 'utf8');

const returnTarget = `  return (
    <div className="max-w-4xl mx-auto py-12 px-6 animate-in">`;

const returnNew = `  if (isLoadingDraft) {
    return <div className="p-12 text-center text-slate-500 font-bold">Nalaganje osnutka...</div>;
  }

  if (isPreviewMode) {
    return (
      <div className="max-w-5xl mx-auto py-12 px-6 animate-in">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => setIsPreviewMode(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <ArrowLeft size={24} className="text-slate-600" />
            </button>
            <h1 className="text-3xl font-black uppercase tracking-tighter text-[#0A1128]">Predogled: {packageTitle || "Neimenovana zbirka"}</h1>
        </div>
        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 mb-8">
            <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs mb-4">Predmeti v zbirki ({items.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                        {item.images && item.images[0] && (
                            <img src={item.images[0]} alt={item.title?.SLO || item.title} className="w-full h-32 object-cover rounded-xl mb-3" />
                        )}
                        <h4 className="font-bold text-[#0A1128] text-sm mb-1">{item.title?.SLO || item.title}</h4>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">{item.startingPrice} €</span>
                            <span className="text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-lg">{item.endTime}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        <div className="flex gap-4 justify-end">
            <button onClick={() => setIsPreviewMode(false)} className="px-6 py-3 rounded-2xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                Nazaj na urejanje
            </button>
            <button 
                onClick={async () => {
                    await handlePublishPackage();
                    if (userData?.id) await deleteDoc(doc(db, 'package_drafts', userData.id));
                }} 
                className="px-6 py-3 rounded-2xl font-black uppercase tracking-widest bg-[#FEBA4F] text-[#0A1128] shadow-xl hover:scale-105 transition-all"
            >
                Objavi zbirko
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 animate-in">`;

content = content.replace(returnTarget, returnNew);

const btnTarget = `                <button 
                    onClick={handlePublishPackage}
                    disabled={items.length === 0 || !packageTitle}
                    className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest transition-all bg-[#0A1128] text-white hover:bg-[#0A1128]/90 disabled:opacity-50"
                >
                    Objavi Zbirko
                </button>`;

const btnNew = `                <button
                    onClick={handleClearDraft}
                    disabled={items.length === 0 && !packageTitle}
                    className="px-6 py-4 rounded-2xl font-black uppercase tracking-widest transition-all bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                >
                    Izbriši osnutek
                </button>
                <button 
                    onClick={() => setIsPreviewMode(true)}
                    disabled={items.length === 0 || !packageTitle}
                    className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest transition-all bg-[#FEBA4F] text-[#0A1128] hover:bg-[#FEBA4F]/90 disabled:opacity-50"
                >
                    Predogled
                </button>
                <button 
                    onClick={async () => {
                        await handlePublishPackage();
                        if (userData?.id) await deleteDoc(doc(db, 'package_drafts', userData.id));
                    }}
                    disabled={items.length === 0 || !packageTitle}
                    className="flex-1 py-4 rounded-2xl font-black uppercase tracking-widest transition-all bg-[#0A1128] text-white hover:bg-[#0A1128]/90 disabled:opacity-50"
                >
                    Objavi Zbirko
                </button>`;

content = content.replace(btnTarget, btnNew);

fs.writeFileSync('src/components/auction/CreatePackageForm.tsx', content);
