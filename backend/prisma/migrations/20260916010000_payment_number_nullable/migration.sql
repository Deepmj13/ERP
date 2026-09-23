-- Payment numbers are assigned at capture (G-1) — PENDING payments carry null.
ALTER TABLE "payments" ALTER COLUMN "number" DROP NOT NULL;

-- Item line_total defaults to 0; recalcTotals overwrites on create/recap.
ALTER TABLE "quotation_items" ALTER COLUMN "line_total" SET DEFAULT 0;
ALTER TABLE "sales_order_items" ALTER COLUMN "line_total" SET DEFAULT 0;
ALTER TABLE "invoice_items" ALTER COLUMN "line_total" SET DEFAULT 0;