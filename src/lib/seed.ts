import { auth, db } from "./firebase";
import { collection, doc, setDoc, getDocs } from "firebase/firestore";

export async function seedDatabase() {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    if (!usersSnapshot.empty) {
      console.log("Database already seeded, skipping.");
      return;
    }

    console.log("Seeding Database...");

    // Create Users
    const user1Ref = doc(db, "users", "user_1");
    await setDoc(user1Ref, {
      firstName: "Alice",
      lastName: "Seller",
      email: "alice@example.com",
      role: "user",
      created_at: new Date().toISOString()
    });

    const user2Ref = doc(db, "users", "user_2");
    await setDoc(user2Ref, {
      firstName: "Bob",
      lastName: "Buyer",
      email: "bob@example.com",
      role: "user",
      created_at: new Date().toISOString()
    });

    // Create Auction
    const auctionRef = doc(db, "auctions", "auction_1");
    await setDoc(auctionRef, {
      title: 'Vintage Camera',
      description: 'A beautiful vintage camera.',
      starting_price: 100,
      current_price: 150,
      status: 'active',
      seller_id: 'user_1',
      end_time: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
      images: ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=1000'],
      category: 'Electronics',
      region: 'Ljubljana',
      bids: []
    });

    // Create Conversation
    const conversationRef = doc(db, "conversations", "conv_1");
    await setDoc(conversationRef, {
      auction_id: 'auction_1',
      participant_one: 'user_1',
      participant_two: 'user_2',
      created_at: new Date().toISOString()
    });

    // Create Messages
    const msg1Ref = doc(db, "messages", "msg_1");
    await setDoc(msg1Ref, {
      conversation_id: 'conv_1',
      sender_id: 'user_2',
      content: 'Is this still available?',
      created_at: new Date(Date.now() - 10000).toISOString(),
      is_read: true
    });

    const msg2Ref = doc(db, "messages", "msg_2");
    await setDoc(msg2Ref, {
      conversation_id: 'conv_1',
      sender_id: 'user_1',
      content: 'Yes it is!',
      created_at: new Date(Date.now() - 5000).toISOString(),
      is_read: false
    });

    console.log("Database seeded successfully.");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}
