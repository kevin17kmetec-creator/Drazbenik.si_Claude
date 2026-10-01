import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { auth, db, registerSnapshotListener } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  or,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  orderBy,
  limit
} from "firebase/firestore";
import { AuctionItem } from "../types";
import { toast } from "@/src/lib/toast";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
  status?: "sending" | "sent" | "error";
}

export interface OtherUser {
  id: string;
  firstName?: string;
  lastName?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  company_name?: string;
  email?: string;
  profilePicture?: string;
  profile_picture_url?: string;
  phone?: string;
  user_type?: string;
}

export interface Conversation {
  id: string;
  auction: AuctionItem;
  otherUserId: string;
  user?: OtherUser;
  lastMessage?: string;
  lastMessageTime?: string;
  isLocked?: boolean;
}

interface ChatContextType {
  conversations: Conversation[];
  activeChat: string | null;
  setActiveChat: (auctionId: string | null) => void;
  messages: Message[];
  activeConversationId: string | null;
  loadingChats: boolean;
  loadingMessages: boolean;
  unreadMessageCount: number;
  unreadCounts: Record<string, number>;
  onlineUsers: Set<string>;
  otherUserTyping: boolean;
  setTyping: (isTyping: boolean) => void;
  sendMessage: (content: string, prefix?: string) => Promise<void>;
  retryMessage: (tempId: string) => Promise<void>;
  markAsRead: (convId: string) => Promise<void>;
  uploadImage: (file: File) => Promise<void>;
  isSending: boolean;
  isConnecting: boolean;
  checkAndRecoverHealth: () => void;
}

export const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
};

export const ChatProvider: React.FC<{
  userId: string;
  auctions: AuctionItem[];
  appWakeupTrigger?: number;
  children: React.ReactNode;
}> = ({ userId, auctions, children }) => {
  const [authUserId, setAuthUserId] = useState<string>(userId || auth.currentUser?.uid || "");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isSending, setIsSending] = useState(false);
  const [onlineUsers] = useState<Set<string>>(new Set());
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const usersCacheRef = useRef<Map<string, OtherUser>>(new Map());

  // Listen to auth changes so effectiveUserId is always in sync (only for verified accounts)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u && (u.emailVerified || !u.providerData.some(p => p.providerId === 'password'))) {
        setAuthUserId(u.uid);
      } else if (!userId) {
        setAuthUserId("");
      }
    });
    return () => unsub();
  }, [userId]);

  const effectiveUserId = userId || authUserId || (auth.currentUser && (auth.currentUser.emailVerified || !auth.currentUser.providerData.some(p => p.providerId === 'password')) ? auth.currentUser.uid : "");

  // Helper to fetch/cache user info
  const fetchUserInfo = useCallback(async (targetUserId: string): Promise<OtherUser | undefined> => {
    if (!targetUserId) return undefined;
    if (usersCacheRef.current.has(targetUserId)) {
      return usersCacheRef.current.get(targetUserId);
    }
    try {
      const snap = await getDoc(doc(db, "users", targetUserId));
      if (snap.exists()) {
        const u = { id: snap.id, ...snap.data() } as OtherUser;
        usersCacheRef.current.set(targetUserId, u);
        return u;
      }
    } catch (e) {
      console.warn("Failed to fetch user in chat:", targetUserId, e);
    }
    return undefined;
  }, []);

  // Compute eligible pickup conversations from auctions + Firestore conversations
  useEffect(() => {
    if (!effectiveUserId) {
      setConversations([]);
      setLoadingChats(false);
      return;
    }

    let isMounted = true;
    setLoadingChats(true);

    const buildConversations = async (firestoreConvs: any[] = []) => {
      try {
        const convMap = new Map<string, Conversation>();

        // 1. Build conversations from eligible pickup sold auctions
        for (const a of auctions) {
          // Check if user is seller or buyer
          const isSeller = a.sellerId === effectiveUserId || (a as any).seller_id === effectiveUserId;
          const winnerId = a.winnerId || (a as any).winner_id || (a as any).winner || (a as any).second_highest_bidder_id || ((a as any).top_bids && (a as any).top_bids[0]?.bidder_id);
          const isBuyer = winnerId === effectiveUserId;

          if (!isSeller && !isBuyer) continue;

          // Check if auction is completed/ended
          const isFinished = a.status === "completed" ||
            a.payment_status === "paid" ||
            (a as any).post_auction_status === "paid" ||
            (a.endTime && new Date(a.endTime).getTime() <= Date.now());

          if (!isFinished) continue;
          if (!winnerId) continue; // No winner

          // Check delivery method: ONLY allow personal pickup, NOT exclusive postal shipping
          const isPostalOnly = a.delivery_method === "post" ||
            a.delivery_method === "shipping" ||
            (a as any).selected_delivery === "post" ||
            (a as any).selected_delivery === "shipping" ||
            (a as any).delivery_option === "shipping_only";

          if (isPostalOnly) continue; // Postal delivery does not have chat

          const otherUserId = isSeller ? winnerId : (a.sellerId || (a as any).seller_id);
          if (!otherUserId) continue;

          const convId = `conv_${a.id}`;
          const isPaid = a.payment_status === "paid" || (a as any).post_auction_status === "paid";

          const otherUserData = await fetchUserInfo(otherUserId);

          convMap.set(convId, {
            id: convId,
            auction: a,
            otherUserId,
            user: otherUserData,
            isLocked: !isPaid
          });
        }

        // 2. Merge conversations from Firestore `conversations` collection
        for (const fc of firestoreConvs) {
          const convId = fc.id;
          const auctionId = fc.auction_id;
          const otherUserId = fc.participant_one === effectiveUserId ? fc.participant_two : fc.participant_one;

          if (convMap.has(convId)) {
            const existing = convMap.get(convId)!;
            existing.lastMessage = fc.last_message;
            existing.lastMessageTime = fc.last_message_at?.toDate ? fc.last_message_at.toDate().toISOString() : fc.last_message_at;
            continue;
          }

          // If not yet in map, find matching auction or construct fallback
          let auction = auctions.find(a => a.id === auctionId);
          if (!auction && auctionId) {
            try {
              const aSnap = await getDoc(doc(db, "auctions", auctionId));
              if (aSnap.exists()) {
                const aData: any = aSnap.data();
                auction = {
                  id: aSnap.id,
                  title: aData.title || { SLO: "Dražba" },
                  category: aData.category || "Ostalo",
                  currentBid: aData.current_price || aData.currentBid || 0,
                  bidCount: aData.bid_count || aData.bidCount || 0,
                  itemCount: 1,
                  images: aData.images || [],
                  endTime: new Date(aData.end_time || aData.endTime || Date.now()),
                  location: aData.location || {},
                  region: aData.region || "Osrednjeslovenska",
                  description: aData.description || {},
                  condition: aData.condition || {},
                  specifications: aData.specifications || {},
                  biddingHistory: aData.biddingHistory || [],
                  sellerId: aData.seller_id || aData.sellerId || "unknown",
                  status: aData.status || "completed",
                  payment_status: aData.payment_status || "unpaid",
                  post_auction_status: aData.post_auction_status,
                  delivery_method: aData.delivery_method
                } as AuctionItem;
              }
            } catch (e) {}
          }

          if (auction) {
            // Ensure not postal only
            const isPostalOnly = auction.delivery_method === "post" ||
              auction.delivery_method === "shipping" ||
              (auction as any).selected_delivery === "post" ||
              (auction as any).selected_delivery === "shipping" ||
              (auction as any).delivery_option === "shipping_only";

            if (isPostalOnly) continue;

            const otherUserData = await fetchUserInfo(otherUserId);
            const isPaid = auction.payment_status === "paid" || (auction as any).post_auction_status === "paid";

            convMap.set(convId, {
              id: convId,
              auction,
              otherUserId,
              user: otherUserData,
              lastMessage: fc.last_message,
              lastMessageTime: fc.last_message_at?.toDate ? fc.last_message_at.toDate().toISOString() : fc.last_message_at,
              isLocked: !isPaid
            });
          }
        }

        if (isMounted) {
          const list = Array.from(convMap.values());
          setConversations(list);
          setLoadingChats(false);
        }
      } catch (err) {
        console.error("Error building conversations:", err);
        if (isMounted) setLoadingChats(false);
      }
    };

    // Listen to Firestore conversations
    const convRef = collection(db, "conversations");
    const q = query(convRef, or(where("participant_one", "==", effectiveUserId), where("participant_two", "==", effectiveUserId)));

    const unsubscribe = registerSnapshotListener(onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      buildConversations(data);
    }, (error) => {
      console.warn("Firestore conversations snapshot warning:", error);
      buildConversations([]);
    }));

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [effectiveUserId, auctions, fetchUserInfo]);

  // Handle activeChat / selection and auto-activate
  useEffect(() => {
    if (!activeChat) {
      setActiveConversationId(null);
      return;
    }

    const convId = activeChat.startsWith("conv_") ? activeChat : `conv_${activeChat}`;
    const rawAuctionId = activeChat.replace("conv_", "");

    setActiveConversationId(convId);

    // If conversation not in state, try to find the auction and add it
    const existing = conversations.find(c => c.id === convId || c.auction.id === rawAuctionId);
    if (!existing) {
      const matchAuction = auctions.find(a => a.id === rawAuctionId);
      if (matchAuction && effectiveUserId) {
        const isSeller = matchAuction.sellerId === effectiveUserId || (matchAuction as any).seller_id === effectiveUserId;
        const winnerId = matchAuction.winnerId || (matchAuction as any).winner_id || (matchAuction as any).second_highest_bidder_id;
        const otherUserId = isSeller ? winnerId : (matchAuction.sellerId || (matchAuction as any).seller_id);
        if (otherUserId) {
          fetchUserInfo(otherUserId).then(u => {
            const isPaid = matchAuction.payment_status === "paid" || (matchAuction as any).post_auction_status === "paid";
            setConversations(prev => {
              if (prev.some(c => c.id === convId)) return prev;
              return [
                {
                  id: convId,
                  auction: matchAuction,
                  otherUserId,
                  user: u,
                  isLocked: !isPaid
                },
                ...prev
              ];
            });
          });
        }
      }
    }
  }, [activeChat, conversations, auctions, effectiveUserId, fetchUserInfo]);

  // Real-time listener for active conversation messages (Without composite index requirement)
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    let isMounted = true;

    const msgRef = collection(db, "messages");
    const q = query(
      msgRef,
      where("conversation_id", "==", activeConversationId)
    );

    const unsubscribe = registerSnapshotListener(onSnapshot(q, (snapshot) => {
      if (!isMounted) return;
      const loadedMsgs: Message[] = snapshot.docs.map(d => {
        const data = d.data();
        let createdAtStr = new Date().toISOString();
        if (data.created_at?.toDate) {
          createdAtStr = data.created_at.toDate().toISOString();
        } else if (typeof data.created_at === "string") {
          createdAtStr = data.created_at;
        } else if (data.created_at?.seconds) {
          createdAtStr = new Date(data.created_at.seconds * 1000).toISOString();
        }

        // Auto mark as read if received by current user
        if (data.sender_id !== effectiveUserId && !data.is_read) {
          updateDoc(doc(db, "messages", d.id), { is_read: true }).catch(() => {});
        }

        return {
          id: d.id,
          conversation_id: data.conversation_id,
          sender_id: data.sender_id,
          content: data.content || "",
          created_at: createdAtStr,
          is_read: !!data.is_read,
          status: "sent" as const
        };
      }).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      // Preserve any pending optimistic messages that haven't shown up in snapshot yet
      setMessages(prev => {
        const pendingOptimistic = prev.filter(m => m.status === "sending" && !loadedMsgs.some(l => l.content === m.content && l.sender_id === m.sender_id));
        return [...loadedMsgs, ...pendingOptimistic].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });

      setLoadingMessages(false);
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn("Dostop do sporočil ni dovoljen ali seja ni veljavna.");
      } else {
        console.error("Error loading messages:", error);
      }
      if (isMounted) setLoadingMessages(false);
    }));

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [activeConversationId, effectiveUserId]);

  // Global unread messages counter listener
  useEffect(() => {
    if (!effectiveUserId || conversations.length === 0) {
      setUnreadMessageCount(0);
      setUnreadCounts({});
      return;
    }

    const convIds = conversations.map(c => c.id);
    const msgRef = collection(db, "messages");
    const q = query(msgRef, where("is_read", "==", false), limit(300));

    const unsub = registerSnapshotListener(onSnapshot(q, (snapshot) => {
      const counts: Record<string, number> = {};
      let total = 0;

      snapshot.docs.forEach(d => {
        const m = d.data();
        if (m.sender_id !== effectiveUserId && (convIds.includes(m.conversation_id) || convIds.includes(`conv_${m.conversation_id}`))) {
          counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
          total += 1;
        }
      });

      setUnreadCounts(counts);
      setUnreadMessageCount(total);
    }, (e) => {
      console.warn("Unread snapshot error:", e);
    }));

    return () => unsub();
  }, [effectiveUserId, conversations]);

  // Send message function with optimistic UI updates and instant delivery
  const sendMessage = async (content: string, prefix?: string) => {
    if (!activeConversationId || !effectiveUserId) return;

    // Find current conversation
    const currentConv = conversations.find(c => c.id === activeConversationId || c.auction.id === activeChat || `conv_${c.auction.id}` === activeConversationId);
    if (!currentConv) {
      toast.error("Pogovora ni mogoče najti.");
      return;
    }

    // Check payment status lock!
    const isPaid = currentConv.auction.payment_status === "paid" ||
      (currentConv.auction as any).post_auction_status === "paid";

    if (!isPaid) {
      toast.error("Klepet je mogoč, ko je plačilo uspešno izvedeno.");
      return;
    }

    const rawContent = (prefix ? prefix + content : content).trim();
    if (!rawContent) return;

    const nowIso = new Date().toISOString();
    const tempId = "temp_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    // Optimistically add message to local messages state for 0ms feedback
    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: effectiveUserId,
      content: rawContent,
      created_at: nowIso,
      is_read: false,
      status: "sending"
    };

    setMessages(prev => [...prev.filter(m => m.id !== tempId), optimisticMsg]);
    setIsSending(true);

    try {
      // 1. Add message document
      const addedDoc = await addDoc(collection(db, "messages"), {
        conversation_id: activeConversationId,
        sender_id: effectiveUserId,
        content: rawContent,
        is_read: false,
        created_at: nowIso
      });

      // 2. Ensure conversation document is updated in Firestore
      await setDoc(doc(db, "conversations", activeConversationId), {
        id: activeConversationId,
        auction_id: currentConv.auction.id,
        participant_one: effectiveUserId,
        participant_two: currentConv.otherUserId,
        last_message: rawContent,
        last_message_at: nowIso,
        updated_at: nowIso
      }, { merge: true });

      // Update optimistic message status
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: addedDoc.id, status: "sent" } : m));
    } catch (e: any) {
      console.error("Error sending message:", e);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: "error" } : m));
      toast.error("Napaka pri pošiljanju sporočila: " + (e.message || ""));
    } finally {
      setIsSending(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!activeConversationId || !effectiveUserId) return;
    const currentConv = conversations.find(c => c.id === activeConversationId || `conv_${c.auction.id}` === activeConversationId);
    const isPaid = currentConv?.auction?.payment_status === "paid" ||
      (currentConv?.auction as any)?.post_auction_status === "paid";

    if (!isPaid) {
      toast.error("Klepet je mogoč, ko je plačilo uspešno izvedeno.");
      return;
    }

    try {
      setIsSending(true);
      // Convert to base64 data url for instant inline image sharing
      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = reader.result as string;
            if (base64) {
              await sendMessage(`[IMAGE]${base64}`);
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });
    } catch (e) {
      console.error("Error uploading image:", e);
      toast.error("Napaka pri nalaganju slike.");
    } finally {
      setIsSending(false);
    }
  };

  const markAsRead = async (convId: string) => {
    try {
      const q = query(
        collection(db, "messages"),
        where("conversation_id", "==", convId),
        where("is_read", "==", false)
      );
      const snap = await getDoc(doc(db, "conversations", convId));
      if (snap.exists()) {
        // Handled reactively on message snapshot
      }
    } catch (e) {}
  };

  const retryMessage = async () => {};
  const setTyping = (_isTyping: boolean) => {};
  const checkAndRecoverHealth = () => {};

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeChat,
        setActiveChat,
        messages,
        activeConversationId,
        loadingChats,
        loadingMessages,
        unreadMessageCount,
        unreadCounts,
        onlineUsers,
        otherUserTyping,
        setTyping,
        sendMessage,
        retryMessage,
        markAsRead,
        uploadImage,
        isSending,
        isConnecting: false,
        checkAndRecoverHealth
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
