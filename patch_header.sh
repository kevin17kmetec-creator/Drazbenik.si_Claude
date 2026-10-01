#!/bin/bash
sed -i '/const wonAuctionsBadge = newWinningsCount || 0;/a\
  let monthlyAuctionsCount = 0;\
  let userLimit = 5;\
  if (userData && auctions) {\
      const subTier = userData.subscription_tier || userData.subscription || "FREE";\
      if (subTier === "BASIC") userLimit = 50;\
      if (subTier === "PRO") userLimit = Infinity;\
      const now = new Date();\
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();\
      monthlyAuctionsCount = auctions.filter(a => \
          a.sellerId === userData.id && \
          new Date(a.createdAt).getTime() >= firstDayOfMonth\
      ).length;\
  }\
' src/components/layout/Header.tsx
