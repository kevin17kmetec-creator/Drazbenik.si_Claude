const fs = require('fs');
let code = fs.readFileSync('src/components/profile/MessagesView.tsx', 'utf8');

// Add state for pending images
code = code.replace(/const \[newMessage, setNewMessage\] = useState\(''\);/, "const [newMessage, setNewMessage] = useState('');\n  const [pendingImages, setPendingImages] = useState<File[]>([]);");

// Modify handleUploadImage to just append to state
const handleUploadImageReplace = `  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAuctionPaid || !activeChat || !currentChatConv || !e.target.files || e.target.files.length === 0) return;
    const newFiles = Array.from(e.target.files);
    if (pendingImages.length + newFiles.length > 5) {
       toast.error("Lahko pošljete največ 5 slik hkrati.");
       return;
    }
    setPendingImages([...pendingImages, ...newFiles]);
    e.target.value = '';
  };`;
code = code.replace(/const handleUploadImage = \(e: React\.ChangeEvent<HTMLInputElement>\) => \{[\s\S]*?\}\s*\};\s*/, handleUploadImageReplace + "\n");

// Modify handleSend
const handleSendReplace = `  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuctionPaid) return;
    if (!newMessage.trim() && pendingImages.length === 0) return;

    // Send images first (if any)
    for (const file of pendingImages) {
        await uploadImage(file);
    }
    setPendingImages([]);

    // Then send text (if any)
    if (newMessage.trim()) {
        await sendMessage(newMessage);
        setNewMessage('');
    }
    
    scrollToBottom();
  };`;
code = code.replace(/const handleSend = async \(e: React\.FormEvent\) => \{[\s\S]*?\}\s*\};/, handleSendReplace);

// Make the file input accept multiple
code = code.replace(/type="file"\s*accept="image\/\*"\s*ref=\{fileInputRef\}/, 'type="file" multiple accept="image/*" ref={fileInputRef}');

// Add the image preview strip above the input
const previewStrip = `
                    <div className="p-4 bg-white border-t border-slate-100 rounded-b-3xl">
                      {pendingImages.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {pendingImages.map((file, idx) => (
                            <div key={idx} className="relative inline-block">
                              <img src={URL.createObjectURL(file)} className="h-16 w-16 object-cover rounded-xl border-2 border-slate-200" />
                              <button
                                type="button"
                                onClick={() => setPendingImages(pendingImages.filter((_, i) => i !== idx))}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-md"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <form onSubmit={handleSend} className="flex gap-3">
`;
code = code.replace(/<div className="p-4 bg-white border-t border-slate-100 rounded-b-3xl">\s*<form onSubmit=\{handleSend\} className="flex gap-3">/, previewStrip);

fs.writeFileSync('src/components/profile/MessagesView.tsx', code);
