#!/bin/bash

sed -i '/const handleSubmitPackage = async () => {/a\
    if (userData && auctions) {\
        const subTier = userData.subscription_tier || userData.subscription || "FREE";\
        let userLimit = 5;\
        if (subTier === "BASIC") userLimit = 50;\
        if (subTier === "PRO") userLimit = Infinity;\
        const now = new Date();\
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();\
        const monthlyAuctionsCount = auctions.filter(a => \
            a.sellerId === userData.id && \
            new Date(a.createdAt).getTime() >= firstDayOfMonth\
        ).length;\
        const newItemsCount = items.length;\
        if (monthlyAuctionsCount + newItemsCount > userLimit) {\
            toast.error(`Z objavo te zbirke boste presegli mesečno omejitev objav (${userLimit}). Objavite lahko še največ ${Math.max(0, userLimit - monthlyAuctionsCount)} predmetov. Nadgradite paket.`);\
            return;\
        }\
    }\
' src/components/auction/CreatePackageForm.tsx
