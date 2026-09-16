-- AlterTable
ALTER TABLE "sliders"
ADD COLUMN "mobileImage" TEXT DEFAULT '/images/placeholder.png',
ADD COLUMN "mobileImagePublicId" TEXT,
ADD COLUMN "mobileImageStoragePath" TEXT;

-- Preserve existing sliders until a dedicated 9:16 image is uploaded.
UPDATE "sliders"
SET "mobileImage" = "image",
	"mobileImagePublicId" = "imagePublicId",
	"mobileImageStoragePath" = "imageStoragePath";
