import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  SendHorizontal,
  Image as ImageIcon,
  Check,
  CheckCheck,
  Loader2,
  User,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Lock,
  CheckCircle2, X,
  ExternalLink,
  CreditCard,
  Search,
  MapPin,
  Clock,
  ShieldCheck,
  Star
} from 'lucide-react';
import { AuctionItem } from '../../types';
import { useChat } from "../../context/ChatContext";
import { auth } from "../../lib/firebase";
import { toast } from 'sonner';

const AvatarImage: React.FC<{ src?: string; className: string; fallbackSize?: number }> = ({ src, className, fallbackSize = 20 }) => {
  const [error, setError] = useState(false);
  if (error || !src) {
    return (
      <div className={`${className} bg-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0`}>
        <User size={fallbackSize} />
      </div>
    );
  }
  return <img src={src} className={`${className} flex-shrink-0`} onError={() => setError(true)} alt="Avatar" referrerPolicy="no-referrer" />;
};

export const MessagesView: React.FC<{
  userId: string;
  t: (k: string) => string;
  language: string;
  initialAuctionId: string | null;
  auctions: AuctionItem[];
  onBack: () => void;
  onPayAuction?: (auction: AuctionItem) => void;
  onOpenAuction?: (auction: AuctionItem) => void;
  onLeaveReview?: (auction: AuctionItem) => void;
}> = ({
  userId,
  t,
  language,
  initialAuctionId,
  auctions,
  onBack,
  onPayAuction,
  onOpenAuction,
  onLeaveReview
}) => {
  const {
    conversations,
    activeChat,
    setActiveChat,
    messages,
    loadingChats,
    loadingMessages,
    unreadCounts,
    onlineUsers,
    otherUserTyping,
    setTyping,
    sendMessage,
    retryMessage,
    uploadImage,
    isSending,
    isConnecting
  } = useChat();

  const [newMessage, setNewMessage] = useState('');
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set active chat if initialAuctionId passed
  useEffect(() => {
    if (initialAuctionId) {
      setActiveChat(initialAuctionId);
    }
  }, [initialAuctionId, setActiveChat]);

  const effectiveUserId = userId || auth.currentUser?.uid || '';

  // Find active conversation
  const currentChatConv = conversations.find(
    c => c.auction.id === activeChat || c.id === activeChat || c.id === `conv_${activeChat}`
  );

  const isAuctionPaid = currentChatConv
    ? currentChatConv.auction.payment_status === 'paid' ||
      (currentChatConv.auction as any).post_auction_status === 'paid'
    : false;

  const isBuyer = currentChatConv
    ? (currentChatConv.auction.winnerId === effectiveUserId ||
       (currentChatConv.auction as any).winner_id === effectiveUserId ||
       currentChatConv.auction.second_highest_bidder_id === effectiveUserId)
    : false;

  const isSeller = currentChatConv
    ? (currentChatConv.auction.sellerId === effectiveUserId ||
       (currentChatConv.auction as any).seller_id === effectiveUserId)
    : false;

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isAuctionPaid) return;
    setNewMessage(e.target.value);
    setTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 2000);
  };

  const handleSend = async () => {
    if (!isAuctionPaid) return;
    const msg = newMessage.trim();
    if (!msg && pendingImages.length === 0) return;

    for (const file of pendingImages) {
        await uploadImage(file);
    }
    setPendingImages([]);

    if (msg) {
        await sendMessage(msg);
        setNewMessage('');
    }
    scrollToBottom();
  };

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAuctionPaid || !activeChat || !currentChatConv || !e.target.files || e.target.files.length === 0) return;
    const newFiles = Array.from(e.target.files);
    if (pendingImages.length + newFiles.length > 5) {
       toast.error("Lahko pošljete največ 5 slik hkrati.");
       return;
    }
    setPendingImages([...pendingImages, ...newFiles]);
    e.target.value = '';
  };

  const sendQuickReply = (text: string) => {
    if (!isAuctionPaid) return;
    sendMessage(text).then(() => {
      scrollToBottom();
    });
  };

  const renderContent = (content: string) => {
    if (content.startsWith('[IMAGE]')) {
      const url = content.replace('[IMAGE]', '');
      return (
        <img
          src={url}
          alt="Poslana slika"
          className="max-w-[260px] md:max-w-sm rounded-2xl cursor-pointer hover:opacity-95 transition-opacity shadow-sm"
          onClick={() => window.open(url, '_blank')}
        />
      );
    }
    return <p className="whitespace-pre-wrap whitespace-break-spaces break-words leading-relaxed text-sm">{content}</p>;
  };

  // Filter conversations with search query
  const filteredConversations = conversations.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = c.user?.first_name || c.user?.firstName
      ? `${c.user.first_name || c.user.firstName} ${c.user.last_name || c.user.lastName || ''}`.toLowerCase()
      : (c.user?.company_name || c.user?.username || c.user?.email || '').toLowerCase();
    const title = (c.auction.title[language as keyof typeof c.auction.title] || c.auction.title.SLO || '').toLowerCase();
    return name.includes(q) || title.includes(q);
  });

  return (
    <div className="max-w-[1600px] mx-auto py-8 sm:py-16 px-4 sm:px-6 animate-in">
      {/* Top Back Navigation */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-400 mb-6 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
      >
        <ArrowLeft size={16} /> Nazaj na dražbe
      </button>

      <div className="bg-white rounded-[2.5rem] flex flex-col md:flex-row shadow-2xl border border-slate-100 min-h-[750px] max-h-[85vh] h-[800px] overflow-hidden relative">
        {/* LEFT SIDEBAR (CONVERSATIONS) */}
        <div className="w-full md:w-1/3 min-w-[300px] max-w-[400px] border-r border-slate-100 flex flex-col bg-slate-50/50">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#FEBA4F] p-2.5 rounded-2xl shadow-sm">
                  <MessageSquare size={20} className="text-[#0A1128]" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-[#0A1128] uppercase tracking-tight">Sporočila</h2>
                  <p className="text-[11px] font-bold text-slate-400">Osebni prevzemi predmeta</p>
                </div>
              </div>
              {isConnecting && (
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-black tracking-widest text-[#FEBA4F] bg-[#FEBA4F]/10 px-2.5 py-1 rounded-full">
                  <Loader2 size={12} className="animate-spin" />
                  Povezovanje...
                </div>
              )}
            </div>

            {/* Search conversations */}
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Išči pogovor ali dražbo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 pl-10 pr-4 py-2.5 rounded-xl text-xs font-bold text-[#0A1128] placeholder-slate-400 focus:outline-none focus:border-[#FEBA4F]"
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingChats ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Loader2 className="animate-spin text-[#FEBA4F] mb-3" size={28} />
                <span className="text-xs font-bold">Nalaganje pogovorov...</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <MapPin size={24} />
                </div>
                <h4 className="font-black text-sm text-[#0A1128] mb-1">Ni aktivnih pogovorov</h4>
                <p className="text-xs text-slate-400 font-medium max-w-[220px] mx-auto">
                  Klepet se samodejno odpre ob zaključeni dražbi z izbranim osebnim prevzemom.
                </p>
              </div>
            ) : (
              filteredConversations.map((c) => {
                const name = c.user?.company_name
                  ? c.user.company_name
                  : c.user?.first_name || c.user?.firstName
                  ? `${c.user.first_name || c.user.firstName} ${c.user.last_name || c.user.lastName || ''}`.trim()
                  : c.user?.username || c.user?.email || 'Uporabnik';

                const isActive = activeChat === c.auction.id || activeChat === c.id || activeChat === `conv_${c.auction.id}`;
                const isOnline = onlineUsers.has(c.otherUserId);
                const title = c.auction.title[language as keyof typeof c.auction.title] || c.auction.title.SLO;
                const count = c.id ? (unreadCounts[c.id] || 0) : 0;
                const convPaid = c.auction.payment_status === 'paid' || (c.auction as any).post_auction_status === 'paid';

                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveChat(c.auction.id)}
                    className={`flex items-center gap-3.5 p-3 rounded-2xl cursor-pointer transition-all border-2 ${
                      isActive
                        ? 'bg-white shadow-md border-[#FEBA4F]'
                        : 'border-transparent hover:bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <AvatarImage
                        src={c.user?.profile_picture_url || c.user?.profilePicture}
                        className="w-12 h-12 rounded-2xl object-cover shadow-sm"
                        fallbackSize={20}
                      />
                      {isOnline && (
                        <div className="absolute top-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-lg border-2 border-white overflow-hidden shadow-sm bg-slate-100">
                        {c.auction.images && c.auction.images[0] && (
                          <img
                            src={typeof c.auction.images[0] === 'string' ? c.auction.images[0].replace(/([\[\]"'])/g, '') : ''}
                            className="w-full h-full object-cover"
                            alt="Auction"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="font-black text-xs text-[#0A1128] truncate">{name}</h4>
                        {convPaid ? (
                          <span className="flex-shrink-0 bg-green-50 text-green-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1 border border-green-200">
                            <CheckCircle2 size={10} /> Plačano
                          </span>
                        ) : (
                          <span className="flex-shrink-0 bg-amber-50 text-amber-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-200">
                            <Lock size={10} /> Čaka plačilo
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 font-bold truncate">
                        {c.lastMessage ? c.lastMessage : title}
                      </p>

                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                          <MapPin size={10} /> Osebni prevzem
                        </span>
                        {count > 0 && (
                          <span className="bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-pulse shadow-sm">
                            {count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT SIDE (CHAT ROOM) */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {activeChat && currentChatConv ? (
            <>
              {/* CHAT HEADER */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shadow-sm z-10 bg-white/95 backdrop-blur-md">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="relative flex-shrink-0">
                    <AvatarImage
                      src={currentChatConv.user?.profile_picture_url || currentChatConv.user?.profilePicture}
                      className="w-12 h-12 rounded-2xl object-cover shadow-sm"
                      fallbackSize={22}
                    />
                    {onlineUsers.has(currentChatConv.otherUserId) && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-base text-[#0A1128] truncate">
                        {currentChatConv.user?.company_name
                          ? currentChatConv.user.company_name
                          : currentChatConv.user?.first_name || currentChatConv.user?.firstName
                          ? `${currentChatConv.user.first_name || currentChatConv.user.firstName} ${currentChatConv.user.last_name || currentChatConv.user.lastName || ''}`.trim()
                          : currentChatConv.user?.username || currentChatConv.user?.email || 'Uporabnik'}
                      </h3>
                      {isSeller ? (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg uppercase tracking-wider font-extrabold flex-shrink-0">
                          Kupec
                        </span>
                      ) : (
                        <span className="text-[10px] bg-[#FEBA4F]/20 text-[#0A1128] px-2 py-0.5 rounded-lg uppercase tracking-wider font-extrabold flex-shrink-0">
                          Prodajalec
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-bold truncate flex items-center gap-1.5 mt-0.5">
                      <span className="text-[#0A1128] font-black truncate max-w-[280px]">
                        {currentChatConv.auction.title[language as keyof typeof currentChatConv.auction.title] || currentChatConv.auction.title.SLO}
                      </span>
                      <span>•</span>
                      <span className="text-[#FEBA4F] font-black">
                        €{currentChatConv.auction.currentBid?.toLocaleString('sl-SI', { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
                  {isBuyer && isAuctionPaid && (
                    (currentChatConv.auction as any).review_submitted ? (
                      <button
                        onClick={() => onLeaveReview && onLeaveReview(currentChatConv.auction)}
                        className="flex items-center gap-1.5 bg-green-50 text-green-700 hover:bg-green-100 border-2 border-green-200 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all"
                        title="Vaša oddana ocena za prodajalca"
                      >
                        <Star size={13} className="text-[#FEBA4F] fill-[#FEBA4F]" /> Ocenjeno ({(currentChatConv.auction as any).review_rating || 5}★)
                      </button>
                    ) : onLeaveReview ? (
                      <button
                        onClick={() => onLeaveReview(currentChatConv.auction)}
                        className="flex items-center gap-1.5 bg-[#FEBA4F] text-[#0A1128] hover:bg-[#0A1128] hover:text-[#FEBA4F] border-2 border-[#FEBA4F] px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md font-sans"
                        title="Oddajte oceno za prodajalca"
                      >
                        <Star size={14} className="fill-current" />
                        <span>Oceni prodajalca</span>
                      </button>
                    ) : null
                  )}

                  {onOpenAuction && (
                    <button
                      onClick={() => onOpenAuction(currentChatConv.auction)}
                      className="hidden sm:flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-[#0A1128] px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors border border-slate-200"
                    >
                      <ExternalLink size={14} /> Odpri dražbo
                    </button>
                  )}
                </div>
              </div>

              {/* PAYMENT STATUS & LOCK BANNER */}
              {!isAuctionPaid ? (
                <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-amber-500/10 border-b border-amber-200/70 p-4 px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/20 mt-0.5 sm:mt-0">
                      <Lock size={20} />
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-[#0A1128] uppercase tracking-tight flex items-center gap-2">
                        Klepet je zaklenjen do izvedbe plačila
                      </h4>
                      <p className="text-xs text-slate-600 font-medium mt-0.5 leading-relaxed">
                        {isBuyer
                          ? 'Za dogovor o datumu in točni lokaciji osebnega prevzema morate najprej poravnati znesek dražbe.'
                          : 'Kupec še ni poravnal zneska dražbe. Ko bo plačilo uspešno izvedeno, se bo klepet za osebni prevzem samodejno odklenil za oba.'}
                      </p>
                    </div>
                  </div>

                  {isBuyer && onPayAuction && (
                    <button
                      onClick={() => onPayAuction(currentChatConv.auction)}
                      className="w-full sm:w-auto bg-[#0A1128] text-[#FEBA4F] hover:bg-[#FEBA4F] hover:text-[#0A1128] px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 flex-shrink-0"
                    >
                      <CreditCard size={16} /> Plačaj zdaj (€{currentChatConv.auction.currentBid?.toFixed(2)})
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-green-50/80 border-b border-green-200/60 p-3 px-6 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-xs text-green-800 font-bold">
                    <ShieldCheck size={18} className="text-green-600 flex-shrink-0" />
                    <span>
                      Plačilo je potrjeno. Dogovorita se za točen datum, uro in prevzemno lokacijo osebnega prevzema.
                    </span>
                  </div>
                  <span className="hidden md:inline text-[10px] uppercase font-black tracking-widest text-green-700 bg-green-100 px-3 py-1 rounded-full">
                    Odklenjen klepet
                  </span>
                </div>
              )}

              {/* MESSAGES SCROLL AREA */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/40">
                {loadingMessages ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Loader2 className="animate-spin text-[#FEBA4F] mb-3" size={32} />
                    <span className="text-xs font-bold">Nalaganje sporočil...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
                    <div className="w-16 h-16 rounded-3xl bg-[#FEBA4F]/10 text-[#0A1128] flex items-center justify-center mb-4 shadow-sm">
                      <MapPin size={28} className="text-[#FEBA4F]" />
                    </div>
                    <h3 className="font-black text-lg text-[#0A1128] mb-1 uppercase tracking-tight">
                      {isAuctionPaid ? 'Dražba je plačana!' : 'Čakanje na plačilo'}
                    </h3>
                    <p className="text-xs text-slate-400 font-bold max-w-sm">
                      {isAuctionPaid
                        ? 'Tukaj se dogovorita za podrobnosti, točen naslov in termin osebnega prevzema predmeta.'
                        : 'Pogovor se bo samodejno aktiviral takoj po prejemu plačila.'}
                    </p>

                    {isAuctionPaid && (
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-6 max-w-md">
                        <button
                          onClick={() => sendQuickReply('Lep pozdrav! Kdaj vam ustreza osebni prevzem?')}
                          className="bg-white border border-slate-200 hover:border-[#FEBA4F] text-slate-700 hover:text-[#0A1128] text-xs font-bold py-2 px-3.5 rounded-xl transition-all shadow-sm"
                        >
                          👋 Kdaj vam ustreza osebni prevzem?
                        </button>
                        <button
                          onClick={() => sendQuickReply('Pozdravljeni! Sporočite mi točno lokacijo za prevzem.')}
                          className="bg-white border border-slate-200 hover:border-[#FEBA4F] text-slate-700 hover:text-[#0A1128] text-xs font-bold py-2 px-3.5 rounded-xl transition-all shadow-sm"
                        >
                          📍 Kje točno se dobiva?
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const isMe = m.sender_id === effectiveUserId || (auth.currentUser && m.sender_id === auth.currentUser.uid);
                    const showTime =
                      idx === 0 ||
                      new Date(m.created_at).getTime() - new Date(messages[idx - 1].created_at).getTime() > 1000 * 60 * 5;

                    return (
                      <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`}>
                        {showTime && (
                          <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2 mt-3 self-center bg-slate-100 px-3 py-1 rounded-full">
                            {new Date(m.created_at).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' }) +
                              ' • ' +
                              new Date(m.created_at).toLocaleDateString('sl-SI')}
                          </div>
                        )}
                        <div className={`relative group flex gap-2 max-w-[85%] sm:max-w-[70%]`}>
                          <div
                            className={`px-5 py-3.5 rounded-2xl shadow-sm border ${
                              isMe
                                ? 'bg-[#0A1128] text-white border-[#0A1128] rounded-tr-none'
                                : 'bg-white border-slate-200 text-[#0A1128] rounded-tl-none font-medium'
                            }`}
                          >
                            {renderContent(m.content)}
                          </div>
                        </div>
                        {isMe && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] font-black text-slate-400">
                            {m.status === 'sending' ? (
                              <span className="flex items-center gap-1 opacity-50">
                                <Loader2 size={12} className="animate-spin" /> Pošiljam...
                              </span>
                            ) : m.status === 'error' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-red-500 flex items-center gap-1 font-extrabold uppercase tracking-wider">
                                  <AlertCircle size={12} /> Napaka
                                </span>
                                <button
                                  onClick={() => retryMessage(m.id)}
                                  className="flex items-center gap-1 bg-red-100 text-red-600 px-2 py-0.5 rounded-lg text-[9px] uppercase tracking-wider"
                                >
                                  <RefreshCw size={10} /> Ponovi
                                </button>
                              </div>
                            ) : m.is_read ? (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCheck size={12} /> Prebrano
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Check size={12} /> Poslano
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* INPUT BAR (LOCKED VS UNLOCKED) */}
              <div className="p-4 bg-white border-t border-slate-100">
                {!isAuctionPaid ? (
                  /* LOCKED INPUT STATE */
                  <div className="max-w-4xl mx-auto bg-slate-100 rounded-2xl p-4 border border-slate-200 flex items-center justify-between gap-4 cursor-not-allowed opacity-85">
                    <div className="flex items-center gap-3 text-slate-500">
                      <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0">
                        <Lock size={16} />
                      </div>
                      <span className="font-bold text-xs sm:text-sm">
                        Klepet je mogoč, ko je plačilo uspešno izvedeno
                      </span>
                    </div>

                    {isBuyer && onPayAuction && (
                      <button
                        onClick={() => onPayAuction(currentChatConv.auction)}
                        className="bg-[#0A1128] text-white hover:bg-[#FEBA4F] hover:text-[#0A1128] px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap"
                      >
                        Plačaj zdaj
                      </button>
                    )}
                  </div>
                ) : (
                  /* UNLOCKED ACTIVE INPUT */
                  <div className="max-w-4xl mx-auto">
                    {pendingImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {pendingImages.map((file, idx) => (
                          <div key={idx} className="relative inline-block mt-2">
                            <img src={URL.createObjectURL(file)} className="h-16 w-16 object-cover rounded-xl border-2 border-slate-200" alt="Preview" />
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
                    <div className="flex items-end gap-2 sm:gap-3 bg-slate-50 p-2 sm:p-2.5 rounded-2xl border border-slate-200 focus-within:border-[#FEBA4F] focus-within:bg-white transition-all shadow-sm">
                      <input
                        type="file" multiple accept="image/*" ref={fileInputRef}
                        className="hidden"
                        onChange={handleUploadImage}
                        disabled={isSending}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSending}
                        className="flex-shrink-0 w-10 h-10 rounded-xl hover:bg-slate-200 flex items-center justify-center cursor-pointer transition-colors text-slate-400 hover:text-[#0A1128] disabled:opacity-50"
                        title="Dodaj sliko"
                      >
                        {isSending ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                      </button>

                      <textarea
                        value={newMessage}
                        onChange={handleTyping}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder="Napišite sporočilo za dogovor o prevzemu... (Enter za pošiljanje)"
                        className="flex-1 max-h-32 min-h-[40px] bg-transparent outline-none resize-none py-2 text-xs sm:text-sm font-semibold text-[#0A1128] placeholder-slate-400 scrollbar-hide"
                        rows={1}
                      />

                      <button
                        onClick={handleSend}
                        disabled={(!newMessage.trim() && pendingImages.length === 0) || isSending}
                        className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#0A1128] text-white flex items-center justify-center hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none shadow-sm"
                        title="Pošlji sporočilo"
                      >
                        {isSending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={18} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* EMPTY STATE WHEN NO CHAT SELECTED */
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 mb-6">
                <MessageSquare size={36} />
              </div>
              <h3 className="font-black text-2xl text-[#0A1128] mb-2 uppercase tracking-tight">Vaša Sporočila</h3>
              <p className="font-bold text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
                Izberite pogovor na levi strani za dogovor o osebnem prevzemu predmeta.
              </p>
              {conversations.length > 0 && (
                <button
                  onClick={() => setActiveChat(conversations[0].auction.id)}
                  className="bg-[#0A1128] text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-md"
                >
                  Odpri prvi pogovor
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
