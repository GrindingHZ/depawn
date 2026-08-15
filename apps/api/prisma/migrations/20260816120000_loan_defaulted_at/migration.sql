-- The instant a loan was marked defaulted, which starts the statutory
-- holding period the liquidation gate reads (rule L6).
ALTER TABLE "loan" ADD COLUMN "defaulted_at" TIMESTAMP(3);
