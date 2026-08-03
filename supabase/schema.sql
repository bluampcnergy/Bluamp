


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT role FROM public.app_users WHERE username = (SELECT auth.jwt() ->> 'email');
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "username" "text" NOT NULL,
    "password" "text",
    "role" "text"
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_profiles" (
    "id" "text" NOT NULL,
    "name" "text",
    "gstNumber" "text",
    "shippingAddress" "text",
    "email" "text",
    "contactPerson" "text",
    "phoneNumber" "text"
);


ALTER TABLE "public"."company_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_tasks" (
    "id" "text" NOT NULL,
    "assigned_to" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "completed" boolean DEFAULT false,
    "due_date" "text",
    "created_at" bigint DEFAULT ((EXTRACT(epoch FROM "now"()) * (1000)::numeric))::bigint,
    "created_by" "text" NOT NULL
);


ALTER TABLE "public"."employee_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "text" NOT NULL,
    "employee_name" "text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "image_link" "text",
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "expenses_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "expenses_type_check" CHECK (("type" = ANY (ARRAY['debit'::"text", 'credit'::"text"])))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."finished_goods" (
    "id" "text" NOT NULL,
    "recipeId" "text",
    "quantity" integer,
    "qualityRemarks" "text",
    "deliveredTo" "text",
    "timestamp" bigint,
    "consumedSerials" "jsonb",
    "inRepairUnitIds" "text"[],
    "repairedUnitIds" "text"[],
    "unitMetadata" "jsonb",
    "unitDeliveries" "jsonb",
    "dismantledUnitIds" "jsonb",
    "unitComponentMap" "jsonb",
    "consumed_serials" "jsonb" DEFAULT '{}'::"jsonb",
    "unit_component_map" "jsonb" DEFAULT '{}'::"jsonb",
    "unit_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "dismantled_unit_ids" "text"[] DEFAULT '{}'::"text"[],
    "in_repair_unit_ids" "text"[] DEFAULT '{}'::"text"[],
    "isDTF" boolean DEFAULT false
);


ALTER TABLE "public"."finished_goods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text",
    "type" "text",
    "config" "jsonb"
);


ALTER TABLE "public"."invoice_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "filename" "text",
    "document_type" "text",
    "source_type" "text",
    "issuer_details" "jsonb",
    "receiver_details" "jsonb",
    "invoice_metadata" "jsonb",
    "items" "jsonb",
    "totals" "jsonb",
    "ocr_confidence_score" numeric,
    "raw_text" "text",
    "requires_review" boolean DEFAULT false,
    "uploaded_by" "text",
    "image_link" "text"
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logs" (
    "id" "text" NOT NULL,
    "timestamp" bigint,
    "username" "text",
    "action" "text",
    "details" "text"
);


ALTER TABLE "public"."logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_list" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "model_name" "text" NOT NULL,
    "price_without_gst" numeric DEFAULT 0 NOT NULL,
    "hsn_code" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."price_list" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."received_goods" (
    "id" "text" NOT NULL,
    "name" "text",
    "makeModel" "text",
    "supplier" "text",
    "quantity" integer,
    "status" "text",
    "damagedCount" integer,
    "invoiceNumber" "text",
    "serials" "text"[],
    "timestamp" bigint,
    "category" "text",
    "testReportLink" "text",
    "gradingConfig" "jsonb",
    "consumed_serials" "text"[] DEFAULT '{}'::"text"[],
    "notes" "text" DEFAULT 'actual physical qty = '::"text",
    "serialIndexMap" "jsonb",
    "min_threshold" numeric DEFAULT 10,
    "safety_buffer_percent" numeric DEFAULT 20,
    "is_ignored_for_alerts" boolean DEFAULT false,
    "uom" "text" DEFAULT 'qty'::"text",
    "initial_quantity" numeric
);


ALTER TABLE "public"."received_goods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "text" NOT NULL,
    "name" "text",
    "components" "jsonb",
    "uom" "text" DEFAULT 'qty'::"text"
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."repair_items" (
    "id" "text" NOT NULL,
    "finishedGoodId" "text",
    "recipeId" "text",
    "unitId" "text",
    "timestamp" bigint
);


ALTER TABLE "public"."repair_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."storage_items" (
    "id" "text" NOT NULL,
    "unitId" "text",
    "sectionIndex" numeric,
    "name" "text",
    "description" "text",
    "quantity" numeric,
    "linkedInventoryId" "text",
    "timestamp" numeric
);


ALTER TABLE "public"."storage_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."storage_rooms" (
    "id" "text" NOT NULL,
    "name" "text"
);


ALTER TABLE "public"."storage_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."storage_units" (
    "id" "text" NOT NULL,
    "roomId" "text",
    "name" "text",
    "type" "text",
    "sectionCount" numeric
);


ALTER TABLE "public"."storage_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplies_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_name" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "from_company" "text",
    "to_company" "text",
    "is_ordered" boolean DEFAULT false,
    "is_received" boolean DEFAULT false,
    "is_shipped" boolean DEFAULT false,
    "timestamp" bigint NOT NULL,
    "created_by" "text",
    "specification" "text",
    "supplier_id" "text",
    "website_url" "text",
    "contact_name" "text",
    "contact_number" "text",
    "contact_email" "text",
    "status" "text" DEFAULT 'to_be_ordered'::"text",
    "target_quantity" numeric DEFAULT 100,
    "uom" "text" DEFAULT 'qty'::"text",
    "rfq_text" "text",
    "is_ignored_for_alerts" boolean DEFAULT false,
    "raw_good_id" "text",
    CONSTRAINT "supplies_records_direction_check" CHECK (("direction" = ANY (ARRAY['inward'::"text", 'outward'::"text"])))
);


ALTER TABLE "public"."supplies_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."test_results" (
    "id" "text" NOT NULL,
    "receivedGoodId" "text",
    "serialNumber" "text",
    "category" "text",
    "voltage" numeric,
    "resistance" numeric,
    "capacity" numeric,
    "passed" boolean,
    "timestamp" bigint,
    "testedBy" "text",
    "grade" "text",
    "location" "text"
);


ALTER TABLE "public"."test_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webmail_accounts" (
    "id" "text" NOT NULL,
    "username" "text" NOT NULL,
    "email" "text" NOT NULL,
    "sender_name" "text",
    "imap_host" "text" DEFAULT 'mail.cnergy.co.in'::"text" NOT NULL,
    "imap_port" integer DEFAULT 993,
    "smtp_host" "text" DEFAULT 'mail.cnergy.co.in'::"text" NOT NULL,
    "smtp_port" integer DEFAULT 465,
    "auth_username" "text" NOT NULL,
    "auth_password" "text",
    "is_default" boolean DEFAULT false,
    "updated_at" bigint DEFAULT ((EXTRACT(epoch FROM "now"()) * (1000)::numeric))::bigint
);


ALTER TABLE "public"."webmail_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wip_items" (
    "id" "text" NOT NULL,
    "recipeId" "text",
    "quantity" integer,
    "timestamp" bigint,
    "consumedSerials" "jsonb",
    "consumed_serials" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."wip_items" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("username");



ALTER TABLE ONLY "public"."company_profiles"
    ADD CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_tasks"
    ADD CONSTRAINT "employee_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finished_goods"
    ADD CONSTRAINT "finished_goods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_templates"
    ADD CONSTRAINT "invoice_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."price_list"
    ADD CONSTRAINT "price_list_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."received_goods"
    ADD CONSTRAINT "received_goods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."repair_items"
    ADD CONSTRAINT "repair_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storage_items"
    ADD CONSTRAINT "storage_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storage_rooms"
    ADD CONSTRAINT "storage_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storage_units"
    ADD CONSTRAINT "storage_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplies_records"
    ADD CONSTRAINT "supplies_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."test_results"
    ADD CONSTRAINT "test_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webmail_accounts"
    ADD CONSTRAINT "webmail_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wip_items"
    ADD CONSTRAINT "wip_items_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_expenses_date" ON "public"."expenses" USING "btree" ("date" DESC);



CREATE INDEX "idx_expenses_employee" ON "public"."expenses" USING "btree" ("employee_name");



CREATE INDEX "idx_invoices_date" ON "public"."invoices" USING "btree" ((("invoice_metadata" ->> 'invoice_date'::"text")));



CREATE INDEX "idx_invoices_issuer_name" ON "public"."invoices" USING "btree" ((("issuer_details" ->> 'name'::"text")));



CREATE INDEX "idx_invoices_metadata_number" ON "public"."invoices" USING "btree" ((("invoice_metadata" ->> 'invoice_number'::"text")));



CREATE INDEX "idx_invoices_number" ON "public"."invoices" USING "btree" ((("invoice_metadata" ->> 'invoice_number'::"text")));



CREATE INDEX "idx_invoices_receiver_name" ON "public"."invoices" USING "btree" ((("receiver_details" ->> 'name'::"text")));



CREATE INDEX "idx_invoices_source_type" ON "public"."invoices" USING "btree" ("source_type");



CREATE POLICY "Allow all access employee_tasks" ON "public"."employee_tasks" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all access expenses" ON "public"."expenses" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all access for anon" ON "public"."expenses" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all access logs" ON "public"."logs" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all access webmail_accounts" ON "public"."webmail_accounts" USING (true) WITH CHECK (true);



CREATE POLICY "Allow all deletes for now" ON "public"."invoices" FOR DELETE USING (true);



CREATE POLICY "Allow anonymous delete employee_tasks" ON "public"."employee_tasks" FOR DELETE USING (true);



CREATE POLICY "Allow anonymous full access logs" ON "public"."logs" USING (true) WITH CHECK (true);



CREATE POLICY "Allow anonymous insert employee_tasks" ON "public"."employee_tasks" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow anonymous read employee_tasks" ON "public"."employee_tasks" FOR SELECT USING (true);



CREATE POLICY "Allow anonymous update employee_tasks" ON "public"."employee_tasks" FOR UPDATE USING (true);



CREATE POLICY "Allow public access" ON "public"."app_users" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access" ON "public"."finished_goods" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access" ON "public"."logs" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access" ON "public"."received_goods" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access" ON "public"."recipes" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access" ON "public"."repair_items" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access" ON "public"."test_results" USING (true) WITH CHECK (true);



CREATE POLICY "Allow public access" ON "public"."wip_items" USING (true) WITH CHECK (true);



CREATE POLICY "admin_only_invoices" ON "public"."invoices" USING (("public"."get_user_role"() = 'admin'::"text"));



CREATE POLICY "admin_only_templates" ON "public"."invoice_templates" USING (("public"."get_user_role"() = 'admin'::"text"));



CREATE POLICY "allow_all_access" ON "public"."app_users" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."company_profiles" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."expenses" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."finished_goods" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."logs" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."price_list" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."recipes" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."repair_items" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."storage_items" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."storage_rooms" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."storage_units" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."supplies_records" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."test_results" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_access" ON "public"."wip_items" USING (true) WITH CHECK (true);



CREATE POLICY "allow_billing_access" ON "public"."invoices" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users"
  WHERE (("app_users"."username" = ("auth"."jwt"() ->> 'email'::"text")) AND (("app_users"."role" = 'admin'::"text") OR ("app_users"."role" = 'billing'::"text"))))));



ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_only_goods" ON "public"."received_goods" USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finished_goods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."price_list" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."received_goods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."repair_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storage_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storage_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storage_units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplies_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."test_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webmail_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wip_items" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";


















GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON TABLE "public"."company_profiles" TO "anon";
GRANT ALL ON TABLE "public"."company_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."company_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."employee_tasks" TO "anon";
GRANT ALL ON TABLE "public"."employee_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."finished_goods" TO "anon";
GRANT ALL ON TABLE "public"."finished_goods" TO "authenticated";
GRANT ALL ON TABLE "public"."finished_goods" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_templates" TO "anon";
GRANT ALL ON TABLE "public"."invoice_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_templates" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."logs" TO "anon";
GRANT ALL ON TABLE "public"."logs" TO "authenticated";
GRANT ALL ON TABLE "public"."logs" TO "service_role";



GRANT ALL ON TABLE "public"."price_list" TO "anon";
GRANT ALL ON TABLE "public"."price_list" TO "authenticated";
GRANT ALL ON TABLE "public"."price_list" TO "service_role";



GRANT ALL ON TABLE "public"."received_goods" TO "anon";
GRANT ALL ON TABLE "public"."received_goods" TO "authenticated";
GRANT ALL ON TABLE "public"."received_goods" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."repair_items" TO "anon";
GRANT ALL ON TABLE "public"."repair_items" TO "authenticated";
GRANT ALL ON TABLE "public"."repair_items" TO "service_role";



GRANT ALL ON TABLE "public"."storage_items" TO "anon";
GRANT ALL ON TABLE "public"."storage_items" TO "authenticated";
GRANT ALL ON TABLE "public"."storage_items" TO "service_role";



GRANT ALL ON TABLE "public"."storage_rooms" TO "anon";
GRANT ALL ON TABLE "public"."storage_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."storage_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."storage_units" TO "anon";
GRANT ALL ON TABLE "public"."storage_units" TO "authenticated";
GRANT ALL ON TABLE "public"."storage_units" TO "service_role";



GRANT ALL ON TABLE "public"."supplies_records" TO "anon";
GRANT ALL ON TABLE "public"."supplies_records" TO "authenticated";
GRANT ALL ON TABLE "public"."supplies_records" TO "service_role";



GRANT ALL ON TABLE "public"."test_results" TO "anon";
GRANT ALL ON TABLE "public"."test_results" TO "authenticated";
GRANT ALL ON TABLE "public"."test_results" TO "service_role";



GRANT ALL ON TABLE "public"."webmail_accounts" TO "anon";
GRANT ALL ON TABLE "public"."webmail_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."webmail_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."wip_items" TO "anon";
GRANT ALL ON TABLE "public"."wip_items" TO "authenticated";
GRANT ALL ON TABLE "public"."wip_items" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































