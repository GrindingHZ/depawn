-- The liquidation fee travels with the loan rather than being read at close
-- time, so an edit to the parameters cannot change what a liquidation takes
-- from a loan originated under an earlier fee. Existing rows were originated
-- under the demo default of 200 basis points, which is what they keep.
ALTER TABLE "loan" ADD COLUMN "liquidation_fee_basis_points" INTEGER NOT NULL DEFAULT 200;
ALTER TABLE "loan" ALTER COLUMN "liquidation_fee_basis_points" DROP DEFAULT;
