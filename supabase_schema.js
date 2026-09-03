
/*
-- COPY THE SQL BELOW THIS LINE AND RUN IT IN THE SUPABASE SQL EDITOR --

-- ==========================================
-- 1. TABLE DEFINITIONS (Fresh Install)
-- ==========================================

-- Users Table
create table if not exists "app_users" (
  "username" text primary key,
  "password" text,
  "role" text,
  "name" text,
  "whatsapp_number" text,
  "is_active" boolean default true
);

-- Index for WhatsApp staff recognition
create index if not exists "idx_app_users_whatsapp" on "app_users"("whatsapp_number");

-- Company Profiles Table
create table if not exists "company_profiles" (
  "id" text primary key,
  "name" text,
  "category" text,
  "gstNumber" text,
  "shippingAddress" text,
  "email" text,
  "contactPerson" text,
  "phoneNumber" text,
  "source" text default 'manual',
  "verified_name" text,
  "is_business" boolean default false,
  "notes" text,
  "created_at" timestamptz default now()
);

-- Index for category search & phone lookup
create index if not exists "idx_company_profiles_category" on "company_profiles"("category");
create index if not exists "idx_company_profiles_phone" on "company_profiles"("phoneNumber");

-- Received Goods (Raw Materials) Table
create table if not exists "received_goods" (
  "id" text primary key,
  "name" text,
  "category" text,
  "makeModel" text,
  "supplier" text,
  "quantity" numeric,
  "status" text,
  "damagedCount" numeric,
  "invoiceNumber" text,
  "serials" jsonb,
  "timestamp" numeric,
  "testReportLink" text, -- Added: Test Report URL
  "gradingConfig" jsonb -- Added: Persisting Grading settings
);

-- Recipes Table
create table if not exists "recipes" (
  "id" text primary key,
  "name" text,
  "components" jsonb
);

-- Work In Progress (WIP) Table
create table if not exists "wip_items" (
  "id" text primary key,
  "recipeId" text,
  "quantity" numeric,
  "timestamp" numeric,
  "consumedSerials" jsonb
);

-- Finished Goods Table
create table if not exists "finished_goods" (
  "id" text primary key,
  "recipeId" text,
  "quantity" numeric,
  "qualityRemarks" text,
  "deliveredTo" text, -- Deprecated in favor of unitDeliveries
  "unitDeliveries" jsonb, -- Map { "UnitID": "CustomerName" }
  "timestamp" numeric,
  "consumedSerials" jsonb,
  "inRepairUnitIds" jsonb,
  "repairedUnitIds" jsonb,
  "dismantledUnitIds" jsonb, -- Added: For void/dismantled units
  "unitMetadata" jsonb, -- Added: For specs per unit (voltage, weight, etc)
  "unitComponentMap" jsonb -- Added: For strict traceability (UnitID -> Components)
);

-- Repair Items Table
create table if not exists "repair_items" (
  "id" text primary key,
  "finishedGoodId" text,
  "recipeId" text,
  "unitId" text,
  "timestamp" numeric
);

-- Test Results Table
create table if not exists "test_results" (
  "id" text primary key,
  "receivedGoodId" text,
  "serialNumber" text,
  "category" text,
  "voltage" numeric,
  "resistance" numeric,
  "capacity" numeric,
  "passed" boolean,
  "grade" text, 
  "location" text, 
  "timestamp" numeric,
  "testedBy" text
);

-- Activity Logs Table
create table if not exists "logs" (
  "id" text primary key,
  "timestamp" numeric,
  "username" text,
  "action" text,
  "details" text
);

-- Invoices Table
create table if not exists "invoices" (
  "id" uuid default gen_random_uuid() primary key,
  "created_at" timestamptz default now(),
  "filename" text,
  "document_type" text,
  "source_type" text,
  "issuer_details" jsonb,
  "receiver_details" jsonb,
  "invoice_metadata" jsonb,
  "items" jsonb,
  "totals" jsonb,
  "ocr_confidence_score" numeric,
  "raw_text" text,
  "requires_review" boolean,
  "uploaded_by" text,
  "timestamp" text
);

-- Invoice Templates Table
create table if not exists "invoice_templates" (
  "id" uuid default gen_random_uuid() primary key,
  "name" text,
  "type" text,
  "config" jsonb,
  "created_at" timestamptz default now()
);

-- STORAGE MANAGEMENT TABLES (New)

-- Storage Rooms
create table if not exists "storage_rooms" (
  "id" text primary key,
  "name" text
);

-- Storage Units (Racks, Cupboards, Drawers)
create table if not exists "storage_units" (
  "id" text primary key,
  "roomId" text,
  "name" text,
  "type" text,
  "sectionCount" numeric
);

-- Storage Items (Contents)
create table if not exists "storage_items" (
  "id" text primary key,
  "unitId" text,
  "sectionIndex" numeric,
  "name" text,
  "description" text,
  "quantity" numeric,
  "linkedInventoryId" text,
  "timestamp" numeric
);

-- Rack Assignments Table (Deprecated, kept for compatibility if needed during migration)
create table if not exists "rack_assignments" (
  "id" text primary key,
  "itemId" text,
  "itemType" text,
  "rackId" text,
  "shelfId" numeric,
  "quantity" numeric,
  "timestamp" numeric
);

-- OPTIONAL: Disable RLS
alter table "app_users" disable row level security;
alter table "company_profiles" disable row level security;
alter table "received_goods" disable row level security;
alter table "recipes" disable row level security;
alter table "wip_items" disable row level security;
alter table "finished_goods" disable row level security;
alter table "repair_items" disable row level security;
alter table "test_results" disable row level security;
alter table "logs" disable row level security;
alter table "invoices" disable row level security;
alter table "invoice_templates" disable row level security;
alter table "rack_assignments" disable row level security;
alter table "storage_rooms" disable row level security;
alter table "storage_units" disable row level security;
alter table "storage_items" disable row level security;


-- ==========================================
-- 2. MIGRATION COMMANDS (Run if tables exist)
-- ==========================================

-- REVERT MANUALLY ADDED INCORRECT TABLES
DROP TABLE IF EXISTS "delivered_items";
ALTER TABLE "finished_goods" DROP COLUMN IF EXISTS "deliveredUnitIds";

-- APPLY CORRECT NEW COLUMNS
ALTER TABLE "received_goods" ADD COLUMN IF NOT EXISTS "testReportLink" text;
ALTER TABLE "received_goods" ADD COLUMN IF NOT EXISTS "gradingConfig" jsonb;

ALTER TABLE "test_results" ADD COLUMN IF NOT EXISTS "grade" text;
ALTER TABLE "test_results" ADD COLUMN IF NOT EXISTS "location" text;

ALTER TABLE "finished_goods" ADD COLUMN IF NOT EXISTS "unitMetadata" jsonb;
ALTER TABLE "finished_goods" ADD COLUMN IF NOT EXISTS "unitDeliveries" jsonb;
ALTER TABLE "finished_goods" ADD COLUMN IF NOT EXISTS "inRepairUnitIds" jsonb;
ALTER TABLE "finished_goods" ADD COLUMN IF NOT EXISTS "repairedUnitIds" jsonb;
ALTER TABLE "finished_goods" ADD COLUMN IF NOT EXISTS "dismantledUnitIds" jsonb;
ALTER TABLE "finished_goods" ADD COLUMN IF NOT EXISTS "unitComponentMap" jsonb;

*/
