-- CreateTable
CREATE TABLE "main_banners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL DEFAULT '/images/placeholder.png',
    "imagePublicId" TEXT,
    "imageStoragePath" TEXT,
    "link" TEXT DEFAULT '#',
    "altText" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ENABLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "main_banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "main_banners_status_createdAt_idx" ON "main_banners"("status", "createdAt");
