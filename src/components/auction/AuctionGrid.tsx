
import React from 'react';
import { AuctionItem } from '../../types';
import { AuctionCard } from "@/src/components/auction/AuctionCard";
import { PackageCard } from "@/src/components/auction/PackageCard";

interface AuctionGridProps {
  auctions: AuctionItem[];
  onAuctionClick: (item: AuctionItem) => void;
  onWatchToggle: (id: string) => void;
  watchlist: string[];
  t: (key: string) => string;
  language: string;
  isVerified: boolean;
  onSelectPackage?: (packageId: string) => void;
  onSellerClick?: (seller: any) => void;
}

export const AuctionGrid: React.FC<AuctionGridProps> = ({
  auctions, onAuctionClick, onWatchToggle, watchlist, t, language, isVerified, onSelectPackage, onSellerClick
}) => {
  // Group package auctions and standalone auctions
  const packageGroups: Record<string, { title: string; items: AuctionItem[] }> = {};
  const standaloneAuctions: AuctionItem[] = [];

  auctions.forEach(item => {
    if (item.is_package && item.package_id) {
      if (!packageGroups[item.package_id]) {
        // Find title from item or default
        const pkgTitle = (item as any).package_title || 
          (typeof item.title === 'object' ? item.title[language] || item.title['SLO'] : item.title) || 
          'Paket dražb';
        packageGroups[item.package_id] = {
          title: pkgTitle,
          items: []
        };
      }
      packageGroups[item.package_id].items.push(item);
    } else {
      standaloneAuctions.push(item);
    }
  });

  // A package/bundle requires at least 2 active items!
  // If only 1 item remains or was relisted from a package, it must render as a single standalone auction card.
  const validPackageIds: string[] = [];
  Object.keys(packageGroups).forEach(pkgId => {
    if (packageGroups[pkgId].items.length >= 2) {
      validPackageIds.push(pkgId);
    } else {
      packageGroups[pkgId].items.forEach(singleItem => {
        standaloneAuctions.push({
          ...singleItem,
          is_package: false
        });
      });
    }
  });

  return (
    <div className="space-y-8">
      {/* If there are packages, display package cards */}
      {validPackageIds.length > 0 && (
        <div className="space-y-6">
          {validPackageIds.map(pkgId => {
            const group = packageGroups[pkgId];
            return (
              <PackageCard
                key={pkgId}
                packageId={pkgId}
                title={group.title}
                sellerName={group.items[0]?.sellerName}
                items={group.items}
                t={t}
                language={language}
                isVerified={isVerified}
                onSelectPackage={onSelectPackage || (() => {})}
                onAuctionClick={onAuctionClick}
                onSellerClick={onSellerClick}
              />
            );
          })}
        </div>
      )}

      {/* Standalone auctions grid */}
      <div className="grid gap-8 justify-center" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 320px))' }}>
        {standaloneAuctions.map(item => (
          <AuctionCard 
            key={item.id} 
            item={item} 
            t={t} 
            language={language} 
            isVerified={isVerified}
            isWatched={watchlist.includes(item.id)}
            onWatchToggle={() => onWatchToggle(item.id)}
            onClick={() => onAuctionClick(item)} 
            onSellerClick={onSellerClick}
          />
        ))}
      </div>
    </div>
  );
};

export default AuctionGrid;
