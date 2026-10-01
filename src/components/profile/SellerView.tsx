import React, { useState, useMemo, useEffect } from 'react';
import { 
  Star, MapPin, Calendar, Building2, User, CheckCircle2, 
  TrendingUp, History, MessageSquare, ArrowLeft, ShieldCheck,
  Award, Package, ThumbsUp, AlertCircle, ShieldAlert
} from 'lucide-react';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { Seller, AuctionItem, Review } from '../../types';
import { db, auth } from '../../lib/firebase';

interface SellerViewProps {
  seller: Seller;
  onBack: () => void;
  onAuctionClick: (item: AuctionItem) => void;
  t: any;
  language: string;
  isLoggedIn: boolean;
  currentUserWinnings?: AuctionItem[];
  auctions: AuctionItem[];
}

const SellerView: React.FC<SellerViewProps> = ({ 
  seller, onBack, onAuctionClick, t, language, isLoggedIn, currentUserWinnings = [], auctions
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'past' | 'reviews'>('active');
  const [newReview, setNewReview] = useState({ rating: 5, comment: '', wouldRecommend: true });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const sellerDisplayName = useMemo(() => {
    if (!seller) return 'Neznan prodajalec';
    if (typeof seller.name === 'string') return seller.name;
    if (typeof seller.name === 'object' && seller.name !== null) {
      return seller.name[language] || seller.name['SLO'] || (seller as any).company_name || (seller as any).sellerName || 'Neznan prodajalec';
    }
    return (seller as any).company_name || (seller as any).sellerName || (seller as any).username || 'Neznan prodajalec';
  }, [seller, language]);

  const sellerAvatar = useMemo(() => {
    if (!seller) return null;
    return (seller as any).photoURL || 
      (seller as any).profile_picture_url || 
      (seller as any).profilePicture || 
      (seller as any).avatar_url || 
      (seller as any).photoUrl || 
      null;
  }, [seller]);

  const sellerAuctions = useMemo(() => {
    if (!seller) return [];
    const sId = seller.id;
    const sName = sellerDisplayName.toLowerCase().trim();
    return auctions.filter(a => {
      const matchId = sId && (a.sellerId === sId || (a as any).seller_id === sId);
      const matchName = a.sellerName && a.sellerName.toLowerCase().trim() === sName;
      return matchId || matchName;
    });
  }, [seller, sellerDisplayName, auctions]);

  const activeAuctions = useMemo(() => 
    sellerAuctions.filter(a => a.status === 'active' && new Date(a.endTime) > new Date()),
  [sellerAuctions]);

  const pastAuctions = useMemo(() => 
    sellerAuctions.filter(a => 
      a.status === 'completed' || 
      (a as any).status === 'ended' || 
      new Date(a.endTime) <= new Date()
    ),
  [sellerAuctions]);

  const totalSoldCount = useMemo(() => {
    if (!seller) return 0;
    if ((seller as any).sold_count !== undefined && (seller as any).sold_count !== null) {
      return Number((seller as any).sold_count);
    }
    const soldList = sellerAuctions.filter(a => 
      a.status === 'completed' || 
      a.payment_status === 'paid' || 
      (Boolean(a.winnerId || (a as any).winner_id) && (new Date(a.endTime).getTime() <= Date.now() || (a as any).status === 'ended'))
    );
    return soldList.length;
  }, [seller, sellerAuctions]);

  // Load real reviews from Firestore
  useEffect(() => {
    if (!seller?.id) {
      setReviews([]);
      return;
    }

    let isMounted = true;
    setIsLoadingReviews(true);

    const fetchRealReviews = async () => {
      try {
        const reviewsRef = collection(db, 'reviews');
        // Check for seller_id match
        const q1 = query(reviewsRef, where('seller_id', '==', seller.id));
        const snap1 = await getDocs(q1);
        
        let loadedReviews: Review[] = [];
        snap1.forEach(docSnap => {
          const d = docSnap.data();
          loadedReviews.push({
            id: docSnap.id,
            author: d.author || d.author_name || 'Preverjen kupec',
            rating: Number(d.rating) || 5,
            comment: d.comment || '',
            date: d.date || (d.created_at ? new Date(d.created_at).toLocaleDateString('sl-SI') : 'Nedavno'),
            isVerified: d.isVerified ?? true,
            wouldRecommend: d.wouldRecommend ?? (Number(d.rating) >= 4),
            auction_id: d.auction_id || d.auctionId,
            auction_title: d.auction_title || d.auctionTitle,
            auction_image: d.auction_image || d.auctionImage,
          });
        });

        // Also check if stored under sellerId
        if (loadedReviews.length === 0) {
          const q2 = query(reviewsRef, where('sellerId', '==', seller.id));
          const snap2 = await getDocs(q2);
          snap2.forEach(docSnap => {
            const d = docSnap.data();
            loadedReviews.push({
              id: docSnap.id,
              author: d.author || d.author_name || 'Preverjen kupec',
              rating: Number(d.rating) || 5,
              comment: d.comment || '',
              date: d.date || (d.created_at ? new Date(d.created_at).toLocaleDateString('sl-SI') : 'Nedavno'),
              isVerified: d.isVerified ?? true,
              wouldRecommend: d.wouldRecommend ?? (Number(d.rating) >= 4),
              auction_id: d.auction_id || d.auctionId,
              auction_title: d.auction_title || d.auctionTitle,
              auction_image: d.auction_image || d.auctionImage,
            });
          });
        }

        // Fallback: check if reviews array exists on user document
        if (loadedReviews.length === 0 && Array.isArray((seller as any).reviews) && (seller as any).reviews.length > 0) {
          loadedReviews = (seller as any).reviews;
        }

        if (isMounted) {
          setReviews(loadedReviews);
          setIsLoadingReviews(false);
        }
      } catch (err) {
        console.warn('Error fetching seller reviews:', err);
        if (isMounted) {
          if (Array.isArray((seller as any).reviews)) {
            setReviews((seller as any).reviews);
          } else {
            setReviews([]);
          }
          setIsLoadingReviews(false);
        }
      }
    };

    fetchRealReviews();

    return () => {
      isMounted = false;
    };
  }, [seller?.id]);

  // Dynamic calculations based strictly on real reviews
  const reviewCount = reviews.length;
  const averageRating = useMemo(() => {
    if (reviewCount === 0) return null;
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return (sum / reviewCount).toFixed(1);
  }, [reviews, reviewCount]);

  const positiveFeedbackPercentage = useMemo(() => {
    if (reviewCount === 0) return null;
    const positiveCount = reviews.filter(r => r.wouldRecommend || Number(r.rating) >= 4).length;
    return Math.round((positiveCount / reviewCount) * 100);
  }, [reviews, reviewCount]);

  const canLeaveReview = useMemo(() => {
    if (!isLoggedIn || !auth.currentUser) return false;
    if (auth.currentUser?.uid === seller.id) return false;
    return currentUserWinnings.some(w => w.sellerId === seller.id || (w as any).seller_id === seller.id);
  }, [isLoggedIn, seller.id, currentUserWinnings]);

  const [ratingFilter, setRatingFilter] = useState<'all' | number>('all');

  const filteredReviews = useMemo(() => {
    if (ratingFilter === 'all') return reviews;
    return reviews.filter(r => Math.round(Number(r.rating)) === ratingFilter);
  }, [reviews, ratingFilter]);

  const ratingCounts = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => {
      const star = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5)));
      counts[star] = (counts[star] || 0) + 1;
    });
    return counts;
  }, [reviews]);

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingReview(true);
    const authorName = auth.currentUser?.displayName || 'Preverjen kupec';
    const reviewPayload = {
      seller_id: seller.id,
      sellerId: seller.id,
      author: authorName,
      author_id: auth.currentUser?.uid || '',
      rating: newReview.rating,
      comment: newReview.comment.trim(),
      date: new Date().toLocaleDateString('sl-SI'),
      created_at: new Date().toISOString(),
      isVerified: true,
      wouldRecommend: newReview.wouldRecommend
    };

    try {
      const docRef = await addDoc(collection(db, 'reviews'), reviewPayload);
      const createdReview: Review = {
        id: docRef.id,
        ...reviewPayload
      };
      setReviews(prev => [createdReview, ...prev]);
      setNewReview({ rating: 5, comment: '', wouldRecommend: true });
      toast.success('Ocena je bila uspešno oddana!');
    } catch (err: any) {
      console.error('Error saving review to Firestore:', err);
      // Fallback local update
      const fallbackReview: Review = {
        id: `rev-${Date.now()}`,
        ...reviewPayload
      };
      setReviews(prev => [fallbackReview, ...prev]);
      setNewReview({ rating: 5, comment: '', wouldRecommend: true });
      toast.success('Ocena je bila zabeležena!');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const memberSinceStr = useMemo(() => {
    if ((seller as any).created_at) {
      const d = new Date((seller as any).created_at);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('sl-SI');
    }
    if (seller.memberSince && seller.memberSince !== '2024') {
      return seller.memberSince;
    }
    return null;
  }, [seller]);

  const isVerifiedSeller = Boolean((seller as any).identity_verified === true || (seller as any).verified_identity === true || (seller as any).identity_verification_status === 'verified');

  return (
    <div className="max-w-[1600px] mx-auto py-16 px-6 animate-in">
      {/* Back Button */}
      <button 
        onClick={onBack} 
        className="flex items-center gap-2 text-slate-400 mb-10 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
      >
        <ArrowLeft size={16}/> {t('back')}
      </button>

      {/* Seller Header Card */}
      <div className="bg-white rounded-[4rem] p-8 sm:p-12 shadow-2xl border border-slate-100 mb-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FEBA4F]/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-12 relative z-10">
          {/* Profile Picture / Icon */}
          <div className="flex-shrink-0">
            <div className="w-32 h-32 lg:w-44 lg:h-44 rounded-[3rem] bg-slate-50 border-4 border-white shadow-xl flex items-center justify-center overflow-hidden relative group">
              {sellerAvatar ? (
                <img 
                  src={sellerAvatar} 
                  alt={sellerDisplayName} 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#0A1128] text-white text-4xl lg:text-5xl font-black italic">
                  {sellerDisplayName[0]?.toUpperCase() || 'P'}
                </div>
              )}
              {isVerifiedSeller && (
                <div className="absolute bottom-3 right-3 bg-green-500 text-white p-2 rounded-2xl shadow-lg" title="Preverjen uporabnik">
                  <ShieldCheck size={18} />
                </div>
              )}
            </div>
          </div>

          {/* Seller Info */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tighter text-[#0A1128] italic">
                {sellerDisplayName}
              </h1>
              <div className="bg-[#FEBA4F]/10 text-[#FEBA4F] px-4 py-1.5 rounded-xl font-black uppercase text-[10px] tracking-widest border border-[#FEBA4F]/20">
                {seller.type === 'business' ? t('businessSeller') : t('individualSeller')}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-slate-400 font-bold mb-8 text-sm">
              <span className="flex items-center gap-2">
                <MapPin size={18} className="text-[#FEBA4F]" /> 
                {seller?.location?.[language] || seller?.location?.['SLO'] || (typeof seller?.location === 'string' ? seller.location : 'Slovenija')}
              </span>
              
              {memberSinceStr && (
                <span className="flex items-center gap-2">
                  <Calendar size={18} className="text-[#FEBA4F]" /> 
                  Član od: {memberSinceStr}
                </span>
              )}
              
              <span className="flex items-center gap-2 text-green-600">
                <Award size={18} /> 
                Prodanih artiklov: {totalSoldCount}
              </span>

              {/* Dynamic Review Rating in Header */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                <Star size={16} className={averageRating ? "text-[#FEBA4F] fill-[#FEBA4F]" : "text-slate-300"} />
                {averageRating ? (
                  <>
                    <span className="text-[#0A1128] font-black text-sm">{averageRating}</span>
                    <span className="text-slate-400 text-xs font-semibold">
                      ({reviewCount} {reviewCount === 1 ? 'ocena' : reviewCount === 2 ? 'oceni' : reviewCount <= 4 ? 'ocene' : 'ocen'})
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400 font-bold text-xs">Še nima ocen</span>
                )}
              </div>
            </div>

            {seller?.description?.[language] || seller?.description?.['SLO'] ? (
              <p className="text-slate-600 font-medium leading-relaxed text-base sm:text-lg max-w-3xl mb-8">
                {seller?.description?.[language] || seller?.description?.['SLO']}
              </p>
            ) : null}

            {/* Stats Grid - 100% Real Data */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('totalSold')}</p>
                <p className="text-2xl font-black text-[#0A1128]">{totalSoldCount}</p>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('positiveFeedback')}</p>
                <p className="text-2xl font-black text-green-600">
                  {positiveFeedbackPercentage !== null ? `${positiveFeedbackPercentage}%` : '—'}
                </p>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('activeAuctionsTab')}</p>
                <p className="text-2xl font-black text-[#FEBA4F]">{activeAuctions.length}</p>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('verifiedStatus')}</p>
                <div className={`flex items-center gap-2 font-black text-xs uppercase ${isVerifiedSeller ? 'text-green-600' : 'text-slate-400'}`}>
                  {isVerifiedSeller ? (
                    <>
                      <CheckCircle2 size={16} /> Preverjen profil
                    </>
                  ) : (
                    'Osnovni profil'
                  )}
                </div>
              </div>
            </div>

            {/* 3 Strikes Reliability Badge / Card */}
            {(() => {
              const sellerStrikes = Number((seller as any)?.unpaidStrikes ?? (seller as any)?.unpaid_strikes ?? 0);
              return (
                <div className="mt-4 p-5 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
                      sellerStrikes >= 3 
                        ? "bg-red-500/10 text-red-600 border border-red-200" 
                        : sellerStrikes > 0 
                          ? "bg-amber-500/10 text-amber-700 border border-amber-200" 
                          : "bg-green-500/10 text-green-700 border border-green-200"
                    }`}>
                      <ShieldAlert size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Zanesljivost plačil (3 Strikes sistem)</p>
                      <p className="text-sm font-black text-[#0A1128]">
                        {sellerStrikes >= 3 ? "Račun blokiran (3/3 opomini - Neplačnik)" : sellerStrikes === 0 ? "Vzoren plačnik (0/3 opominov)" : `${sellerStrikes}/3 opominov za neplačilo`}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {[1, 2, 3].map((slot) => {
                      const hasStrike = sellerStrikes >= slot;
                      return (
                        <div 
                          key={slot}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 border ${
                            hasStrike 
                              ? "bg-red-50 border-red-300 text-red-600 shadow-sm" 
                              : "bg-white border-slate-200 text-slate-400"
                          }`}
                          title={hasStrike ? `${slot}. opomin za neplačano dražbo` : `Prosta možnost (${slot}/3)`}
                        >
                          <span className={hasStrike ? "font-black text-red-600" : ""}>{hasStrike ? "X" : slot}</span>
                          <span className="text-[9px] uppercase font-bold tracking-wider">{slot}. opomin</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-8 mb-12 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('active')}
          className={`pb-6 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'active' ? 'text-[#0A1128]' : 'text-slate-400 hover:text-[#0A1128]'}`}
        >
          <div className="flex items-center gap-2"><TrendingUp size={18}/> {t('activeAuctionsTab')} ({activeAuctions.length})</div>
          {activeTab === 'active' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#FEBA4F] rounded-full"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('past')}
          className={`pb-6 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'past' ? 'text-[#0A1128]' : 'text-slate-400 hover:text-[#0A1128]'}`}
        >
          <div className="flex items-center gap-2"><History size={18}/> {t('pastAuctionsTab')} ({pastAuctions.length})</div>
          {activeTab === 'past' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#FEBA4F] rounded-full"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('reviews')}
          className={`pb-6 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'reviews' ? 'text-[#0A1128]' : 'text-slate-400 hover:text-[#0A1128]'}`}
        >
          <div className="flex items-center gap-2"><MessageSquare size={18}/> {t('userReviewsTab')} ({reviews.length})</div>
          {activeTab === 'reviews' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#FEBA4F] rounded-full"></div>}
        </button>
      </div>

      {/* Tab Content */}
      <div className="animate-in">
        {activeTab === 'active' && (
          <div className="grid gap-8 justify-center" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 320px))' }}>
            {activeAuctions.length > 0 ? (
              activeAuctions.map(item => (
                <div key={item.id} onClick={() => onAuctionClick(item)} className="cursor-pointer">
                  <div className="bg-[#0A1128] rounded-[2.5rem] overflow-hidden shadow-2xl hover:-translate-y-2 transition-all duration-300 group flex flex-col h-full border border-white/5 relative">
                    <div className="relative h-64 overflow-hidden">
                      <img 
                        src={item.images?.[0] || ''} 
                        alt={item.title?.[language] || 'Slika'} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-90 group-hover:opacity-100" 
                      />
                      <div className="absolute top-4 left-4 bg-[#0A1128]/90 backdrop-blur-sm px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-white shadow-lg flex items-center gap-1.5 border border-white/10">
                        <MapPin size={10} className="text-[#FEBA4F]" /> {item?.location?.[language] || item?.location?.['SLO'] || (typeof item?.location === 'string' ? item.location : 'Neznano')}
                      </div>
                      {item.region && (
                        <div className="absolute top-4 right-4 bg-[#FEBA4F] text-[#0A1128] backdrop-blur-sm px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg">
                          {item.region}
                        </div>
                      )}
                    </div>
                    <div className="p-8 flex flex-col flex-1">
                      <h3 className="text-lg font-black leading-tight text-white hover:text-[#FEBA4F] transition-colors line-clamp-2 mb-4">
                        {item.title?.[language] || item.title?.['SLO'] || 'Dražba'}
                      </h3>
                      <div className="mt-auto pt-6 border-t border-white/10">
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('currentBid')}</p>
                            <p className="text-2xl font-black text-[#FEBA4F]">€{item.currentBid.toLocaleString('sl-SI')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('bidCount')}</p>
                            <p className="text-sm font-black text-[#FEBA4F]">{item.bidCount}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-24 text-center">
                <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
                  <TrendingUp size={40} />
                </div>
                <p className="text-slate-400 font-bold text-xl">{t('noActiveAuctions')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'past' && (
          <div className="grid gap-8 justify-center" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 320px))' }}>
            {pastAuctions.length > 0 ? (
              pastAuctions.map(item => (
                <div key={item.id} onClick={() => onAuctionClick(item)} className="cursor-pointer opacity-85 hover:opacity-100 transition-all">
                  <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-100 flex flex-col h-full relative">
                    <div className="relative h-64 overflow-hidden">
                      <img 
                        src={item.images?.[0] || ''} 
                        alt={item.title?.[language] || 'Slika'} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="bg-white text-[#0A1128] px-6 py-2 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl">
                          {t('ended')}
                        </div>
                      </div>
                    </div>
                    <div className="p-8 flex flex-col flex-1">
                      <h3 className="text-lg font-black leading-tight text-[#0A1128] line-clamp-2 mb-4">
                        {item.title?.[language] || item.title?.['SLO'] || 'Dražba'}
                      </h3>
                      <div className="mt-auto pt-6 border-t border-slate-100">
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('finalPrice')}</p>
                            <p className="text-2xl font-black text-[#0A1128]">€{item.currentBid.toLocaleString('sl-SI')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('bidCount')}</p>
                            <p className="text-sm font-black text-[#0A1128]">{item.bidCount}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-24 text-center">
                <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
                  <History size={40} />
                </div>
                <p className="text-slate-400 font-bold text-xl">{t('noPastAuctions')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="max-w-4xl mx-auto">
            {/* Add Review Section */}
            {canLeaveReview && (
              <div className="bg-slate-50 rounded-[3rem] p-8 sm:p-10 border-2 border-dashed border-slate-200 mb-12">
                <div className="flex items-center gap-4 mb-8">
                  <div className="bg-[#FEBA4F] p-3 rounded-2xl shadow-lg">
                    <Award size={24} className="text-[#0A1128]" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-[#0A1128] uppercase tracking-tighter italic">{t('leaveReview')}</h3>
                    <p className="text-slate-400 font-bold text-sm">{t('reviewNotice')}</p>
                  </div>
                </div>

                <form onSubmit={handleAddReview} className="space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('rating')}</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(star => (
                          <button 
                            key={star} 
                            type="button"
                            onClick={() => setNewReview({...newReview, rating: star})}
                            className={`p-2 rounded-xl transition-all ${newReview.rating >= star ? 'text-[#FEBA4F] bg-[#FEBA4F]/10' : 'text-slate-300 bg-white'}`}
                          >
                            <Star size={24} fill={newReview.rating >= star ? 'currentColor' : 'none'} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 flex-1 w-full">
                       <label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('recommend')}</label>
                       <div className="flex gap-3">
                          <button 
                            type="button"
                            onClick={() => setNewReview({...newReview, wouldRecommend: true})}
                            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all border-2 ${newReview.wouldRecommend ? 'bg-green-50 border-green-200 text-green-600' : 'bg-white border-slate-100 text-slate-400'}`}
                          >
                            {t('yesRecommend')}
                          </button>
                          <button 
                            type="button"
                            onClick={() => setNewReview({...newReview, wouldRecommend: false})}
                            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all border-2 ${!newReview.wouldRecommend ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-100 text-slate-400'}`}
                          >
                            {t('noRecommend')}
                          </button>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">{t('comment')}</label>
                    <textarea 
                      value={newReview.comment}
                      onChange={e => setNewReview({...newReview, comment: e.target.value})}
                      placeholder={t('commentPlaceholder')}
                      className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-6 font-bold h-32 outline-none focus:border-[#FEBA4F] transition-all resize-none"
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={isSubmittingReview}
                    className="w-full bg-[#0A1128] text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl disabled:opacity-50"
                  >
                    {isSubmittingReview ? 'Oddajanje...' : t('publishReview')}
                  </button>
                </form>
              </div>
            )}

            {!canLeaveReview && isLoggedIn && auth.currentUser?.uid !== seller.id && (
              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 mb-12 flex items-center gap-4 text-slate-500">
                <AlertCircle size={20} />
                <p className="text-sm font-bold">{t('reviewRestriction')}</p>
              </div>
            )}

            {/* Reviews Summary & Filter Header */}
            {reviews.length > 0 && (
              <div className="bg-slate-50 rounded-[3rem] p-6 sm:p-8 border border-slate-100 mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-3xl bg-[#0A1128] text-[#FEBA4F] flex flex-col items-center justify-center font-black shadow-lg">
                    <span className="text-2xl leading-none">{averageRating || '5.0'}</span>
                    <span className="text-[9px] uppercase tracking-widest text-white/70 mt-0.5">/ 5</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} size={16} className={averageRating && s <= Math.round(Number(averageRating)) ? "text-[#FEBA4F] fill-[#FEBA4F]" : "text-slate-300"} />
                      ))}
                    </div>
                    <p className="text-xs font-black uppercase tracking-wider text-[#0A1128]">
                      Skupaj {reviewCount} {reviewCount === 1 ? 'ocena' : reviewCount === 2 ? 'oceni' : reviewCount <= 4 ? 'ocene' : 'ocen'} kupcev
                    </p>
                  </div>
                </div>

                {/* Rating Filter Pills */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setRatingFilter('all')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      ratingFilter === 'all'
                        ? 'bg-[#0A1128] text-[#FEBA4F] shadow-md'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-[#FEBA4F]'
                    }`}
                  >
                    Vse ({reviewCount})
                  </button>
                  {[5, 4, 3, 2, 1].map(star => {
                    const count = ratingCounts[star] || 0;
                    if (count === 0 && ratingFilter !== star) return null;
                    return (
                      <button
                        key={star}
                        onClick={() => setRatingFilter(star)}
                        className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                          ratingFilter === star
                            ? 'bg-[#0A1128] text-[#FEBA4F] shadow-md'
                            : 'bg-white border border-slate-200 text-slate-600 hover:border-[#FEBA4F]'
                        }`}
                      >
                        <span>{star}</span>
                        <Star size={12} className="fill-[#FEBA4F] text-[#FEBA4F]" />
                        <span className="text-[10px] text-slate-400">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reviews List */}
            <div className="space-y-6">
              {isLoadingReviews ? (
                <div className="py-20 text-center text-slate-400 font-bold">Nalaganje ocen...</div>
              ) : filteredReviews.length > 0 ? (
                filteredReviews.map(review => (
                  <div key={review.id} className="bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-lg border border-slate-100 transition-all hover:shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-[#0A1128] font-black border border-slate-200 text-base">
                          {review.author[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-sm sm:text-base text-[#0A1128]">{review.author}</h4>
                            {review.isVerified && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-md">
                                <CheckCircle2 size={11} className="text-green-600" /> Preverjen kupec
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] font-black text-slate-400 uppercase mt-0.5">{review.date}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-100 self-start sm:self-auto">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star key={s} size={14} className={s <= review.rating ? 'text-[#FEBA4F] fill-[#FEBA4F]' : 'text-slate-200'} />
                          ))}
                        </div>
                        <span className="text-xs font-black text-[#0A1128] ml-1">{review.rating} / 5</span>
                      </div>
                    </div>

                    {/* Auction title badge if provided */}
                    {review.auction_title && (
                      <div className="mb-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200/60 px-3 py-1.5 rounded-xl">
                          <Package size={13} className="text-[#FEBA4F]" />
                          <span>Dražba: <strong>{review.auction_title}</strong></span>
                        </span>
                      </div>
                    )}

                    {review.comment ? (
                      <p className="text-slate-700 font-medium leading-relaxed mb-4 text-sm sm:text-base italic bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                        "{review.comment}"
                      </p>
                    ) : (
                      <p className="text-slate-400 text-xs font-semibold mb-4 italic">
                        (Ocena oddana brez dodatnega komentarja)
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                      {review.wouldRecommend ? (
                        <span className="text-green-600 flex items-center gap-1.5 bg-green-50 px-3 py-1 rounded-lg border border-green-100">
                          <ThumbsUp size={13} /> {t('yesRecommend')}
                        </span>
                      ) : (
                        <span className="text-red-500 flex items-center gap-1.5 bg-red-50 px-3 py-1 rounded-lg border border-red-100">
                          {t('noRecommend')}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center bg-white rounded-[3rem] p-8 border border-slate-100">
                  <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                    <MessageSquare size={32} />
                  </div>
                  <p className="text-slate-400 font-bold text-base">
                    {ratingFilter === 'all' ? t('noReviews') : `Ni ocen z izbrano oceno (${ratingFilter}★).`}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SellerView;
