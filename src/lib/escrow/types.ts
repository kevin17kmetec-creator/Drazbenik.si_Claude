export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'HELD_IN_ESCROW'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'REFUNDED'
  | 'CANCELLED';

export type DeliveryMethod = 'PERSONAL_PICKUP' | 'POSTAL_DELIVERY';

export interface Order {
  id: string;
  auction_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  delivery_method: DeliveryMethod;
  status: OrderStatus;
  pickup_pin?: string;
  tracking_number?: string;
  carrier_name?: string;
  paid_at?: string; // ISO string
  shipping_deadline?: string; // ISO string
  shipped_at?: string; // ISO string
  delivered_at?: string; // ISO string
  auto_complete_at?: string; // ISO string
  completed_at?: string; // ISO string
  cancelled_reason?: string;
  created_at: string; // ISO string
  updated_at: string; // ISO string
}

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED_BUYER' | 'RESOLVED_SELLER' | 'CANCELLED';

export interface Dispute {
  id: string;
  order_id: string;
  opened_by_user_id: string;
  reason: string;
  status: DisputeStatus;
  resolution_notes?: string;
  created_at: string; // ISO string
  updated_at: string; // ISO string
}

export interface SellerStrike {
  id?: string;
  user_id: string;
  order_id: string;
  reason: string;
  created_at: string; // ISO string
}

