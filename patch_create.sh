#!/bin/bash
sed -i 's/userData?: any;/userData?: any;\n    auctions?: any[];/g' src/components/auction/CreateAuctionForm.tsx

sed -i '/const handlePublish = async (e?: any, asDraft = false) => {/a\
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
            if (!initialData?.id && monthlyAuctionsCount >= userLimit) {\
                toast.error(`Dosegli ste mesečno omejitev objav za vaš naročniški paket (${userLimit}). Prosimo, nadgradite paket v nastavitvah.`);\
                return;\
            }\
        }\
' src/components/auction/CreateAuctionForm.tsx
