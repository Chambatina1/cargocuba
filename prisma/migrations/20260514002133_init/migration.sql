-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "serviceCategory" TEXT NOT NULL DEFAULT 'pasaje',
    "vehicleType" TEXT NOT NULL DEFAULT 'carro_moderno',
    "lat" REAL NOT NULL DEFAULT 23.1136,
    "lng" REAL NOT NULL DEFAULT -82.3666,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "available" BOOLEAN NOT NULL DEFAULT false,
    "rating" REAL NOT NULL DEFAULT 5.0,
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "photo" TEXT,
    "bio" TEXT,
    "businessName" TEXT,
    "services" TEXT,
    "priceRange" TEXT,
    "schedule" TEXT,
    "socialMedia" TEXT,
    "carPhoto1" TEXT,
    "carPhoto2" TEXT,
    "carPhoto3" TEXT,
    "notes" TEXT,
    "idNumber" TEXT,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedReason" TEXT,
    "suspendedAt" DATETIME,
    "referredByName" TEXT,
    "referredByPhone" TEXT,
    "route1From" TEXT,
    "route1To" TEXT,
    "route1FromLat" REAL,
    "route1FromLng" REAL,
    "route1ToLat" REAL,
    "route1ToLng" REAL,
    "route2From" TEXT,
    "route2To" TEXT,
    "route2FromLat" REAL,
    "route2FromLng" REAL,
    "route2ToLat" REAL,
    "route2ToLng" REAL,
    "route3From" TEXT,
    "route3To" TEXT,
    "route3FromLat" REAL,
    "route3FromLng" REAL,
    "route3ToLat" REAL,
    "route3ToLng" REAL,
    "sessionToken" TEXT,
    "sessionExpiry" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "photo" TEXT,
    "bio" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Forum" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#ea580c',
    "order" INTEGER NOT NULL DEFAULT 0,
    "postsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ForumPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "forumId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorPhone" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "providerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ForumPost_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "Forum" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumPost_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverType" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cargoDescription" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupLat" REAL NOT NULL,
    "pickupLng" REAL NOT NULL,
    "destAddress" TEXT,
    "destLat" REAL,
    "destLng" REAL,
    "price" REAL,
    "clientId" TEXT NOT NULL,
    "driverId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reviewerType" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "punctual" BOOLEAN,
    "respectful" BOOLEAN,
    "careful" BOOLEAN,
    "recommended" BOOLEAN,
    "tripId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Provider_phone_key" ON "Provider"("phone");

-- CreateIndex
CREATE INDEX "Provider_phone_idx" ON "Provider"("phone");

-- CreateIndex
CREATE INDEX "Provider_active_idx" ON "Provider"("active");

-- CreateIndex
CREATE INDEX "Provider_available_idx" ON "Provider"("available");

-- CreateIndex
CREATE INDEX "Provider_serviceCategory_idx" ON "Provider"("serviceCategory");

-- CreateIndex
CREATE INDEX "Provider_vehicleType_idx" ON "Provider"("vehicleType");

-- CreateIndex
CREATE UNIQUE INDEX "Client_phone_key" ON "Client"("phone");

-- CreateIndex
CREATE INDEX "Client_phone_idx" ON "Client"("phone");

-- CreateIndex
CREATE INDEX "ForumPost_forumId_idx" ON "ForumPost"("forumId");

-- CreateIndex
CREATE INDEX "ForumPost_authorPhone_idx" ON "ForumPost"("authorPhone");

-- CreateIndex
CREATE INDEX "Message_senderType_senderId_idx" ON "Message"("senderType", "senderId");

-- CreateIndex
CREATE INDEX "Message_receiverType_receiverId_idx" ON "Message"("receiverType", "receiverId");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_clientId_idx" ON "Trip"("clientId");

-- CreateIndex
CREATE INDEX "Trip_driverId_idx" ON "Trip"("driverId");

-- CreateIndex
CREATE INDEX "Review_targetType_targetId_idx" ON "Review"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Review_reviewerType_reviewerId_idx" ON "Review"("reviewerType", "reviewerId");
