import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Annonsstatus in code; the UI shows the Swedish names (see src/domain/status.ts). */
export const listingStatuses = ["active", "reserved", "sold", "flagged", "expired", "withdrawn"] as const;
export type ListingStatus = (typeof listingStatuses)[number];

/** Köpstatus in code; the UI shows the Swedish names (see src/domain/status.ts). */
export const purchaseStatuses = [
  "started",
  "authorized",
  "delivered",
  "completed",
  "failed",
  "disputed",
  "refunded",
] as const;
export type PurchaseStatus = (typeof purchaseStatuses)[number];

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  /** Utbetalningssaldo in kronor (simulated). */
  payoutBalance: integer("payout_balance").notNull().default(0),
});

export const merchants = sqliteTable("merchants", {
  /** The merchant's förkortning, e.g. "NK". */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const listings = sqliteTable(
  "listings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sellerId: integer("seller_id")
      .notNull()
      .references(() => users.id),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    /** The secret presentkortskod. Never select it outside src/domain/gift-card-code.ts. */
    giftCardCode: text("gift_card_code").notNull(),
    balance: integer("balance").notNull(),
    /** Giltighetsdatum as YYYY-MM-DD (last valid day, Europe/Stockholm). */
    validUntil: text("valid_until").notNull(),
    price: integer("price").notNull(),
    status: text("status", { enum: listingStatuses }).notNull(),
    flagReason: text("flag_reason"),
    reservedById: integer("reserved_by_id").references(() => users.id),
    reservedUntil: integer("reserved_until", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("listings_status_idx").on(t.status)],
);

/**
 * Dubblettkontroll: every presentkortskod an annons has held, kept after the annons is sold,
 * withdrawn or its code corrected. Unique per handlare, so a concurrent duplicate fails.
 */
export const listingCodes = sqliteTable(
  "listing_codes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    giftCardCode: text("gift_card_code").notNull(),
  },
  (t) => [uniqueIndex("listing_codes_merchant_code_unique").on(t.merchantId, t.giftCardCode)],
);

export const purchases = sqliteTable(
  "purchases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id),
    buyerId: integer("buyer_id")
      .notNull()
      .references(() => users.id),
    /** Belopp in kronor, locked to the annons's pris at reservation. */
    amount: integer("amount").notNull(),
    status: text("status", { enum: purchaseStatuses }).notNull(),
    failureReason: text("failure_reason"),
    claimReason: text("claim_reason"),
    adminDecision: text("admin_decision", { enum: ["refund", "reject"] }),
    authorizationId: text("authorization_id"),
    deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("purchases_buyer_idx").on(t.buyerId), index("purchases_listing_idx").on(t.listingId)],
);

export const statusHistory = sqliteTable(
  "status_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type", { enum: ["listing", "purchase"] }).notNull(),
    entityId: integer("entity_id").notNull(),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    /** The acting user; null means the system. */
    actorUserId: integer("actor_user_id").references(() => users.id),
    reason: text("reason").notNull(),
  },
  (t) => [index("status_history_entity_idx").on(t.entityType, t.entityId)],
);

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const loginCodes = sqliteTable("login_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  code: text("code").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
});

/** Outbox of the simulated SmsSender: the UI shows these in the "Simulerat SMS" box. */
export const smsOutbox = sqliteTable("sms_outbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
});

