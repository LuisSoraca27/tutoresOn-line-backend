-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('student', 'tutor');

-- CreateEnum
CREATE TYPE "tutor_modality" AS ENUM ('online', 'in_person', 'both');

-- CreateEnum
CREATE TYPE "session_modality" AS ENUM ('online', 'in_person');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('pending', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "instant_request_status" AS ENUM ('searching', 'matched', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "withdrawal_status" AS ENUM ('requested', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('email', 'sms', 'whatsapp');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('simulated', 'pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "notification_event" AS ENUM ('booking_confirmed', 'session_reminder', 'status_changed', 'session_summary');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('new_booking', 'booking_accepted', 'booking_rejected', 'booking_cancelled', 'booking_rescheduled', 'new_message', 'session_completed', 'new_review', 'review_replied');

-- CreateTable
CREATE TABLE "cities" (
    "id" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "department" VARCHAR NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_levels" (
    "id" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,

    CONSTRAINT "education_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "area" VARCHAR NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "email" VARCHAR NOT NULL,
    "password_hash" VARCHAR NOT NULL,
    "role" "user_role" NOT NULL,
    "phone" VARCHAR,
    "city_id" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "user_id" VARCHAR NOT NULL,
    "education_level_id" VARCHAR NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "tutors" (
    "user_id" VARCHAR NOT NULL,
    "professional_title" VARCHAR NOT NULL,
    "bio" TEXT NOT NULL,
    "avatar_url" TEXT,
    "modality" "tutor_modality" NOT NULL,
    "coverage_radius_km" DECIMAL(6,2),
    "timezone" VARCHAR NOT NULL DEFAULT 'America/Bogota',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "responds_quickly" BOOLEAN NOT NULL DEFAULT false,
    "available_now" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tutors_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "tutor_subjects" (
    "tutor_id" VARCHAR NOT NULL,
    "subject_id" VARCHAR NOT NULL,
    "hourly_rate" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "tutor_subjects_pkey" PRIMARY KEY ("tutor_id","subject_id")
);

-- CreateTable
CREATE TABLE "tutor_subject_levels" (
    "tutor_id" VARCHAR NOT NULL,
    "subject_id" VARCHAR NOT NULL,
    "education_level_id" VARCHAR NOT NULL,

    CONSTRAINT "tutor_subject_levels_pkey" PRIMARY KEY ("tutor_id","subject_id","education_level_id")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_languages" (
    "tutor_id" VARCHAR NOT NULL,
    "language_id" VARCHAR NOT NULL,

    CONSTRAINT "tutor_languages_pkey" PRIMARY KEY ("tutor_id","language_id")
);

-- CreateTable
CREATE TABLE "scheduling_rules" (
    "tutor_id" VARCHAR NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 15,
    "minimum_notice_hours" INTEGER NOT NULL DEFAULT 12,

    CONSTRAINT "scheduling_rules_pkey" PRIMARY KEY ("tutor_id")
);

-- CreateTable
CREATE TABLE "allowed_session_durations" (
    "tutor_id" VARCHAR NOT NULL,
    "duration_minutes" INTEGER NOT NULL,

    CONSTRAINT "allowed_session_durations_pkey" PRIMARY KEY ("tutor_id","duration_minutes")
);

-- CreateTable
CREATE TABLE "weekly_availability" (
    "id" VARCHAR NOT NULL,
    "tutor_id" VARCHAR NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,

    CONSTRAINT "weekly_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "tutor_id" VARCHAR NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("tutor_id","date")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" VARCHAR NOT NULL,
    "tutor_id" VARCHAR NOT NULL,
    "student_id" VARCHAR NOT NULL,
    "subject_id" VARCHAR NOT NULL,
    "education_level_id" VARCHAR NOT NULL,
    "modality" "session_modality" NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'pending',
    "meeting_location" TEXT,
    "student_note" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_reports" (
    "booking_id" VARCHAR NOT NULL,
    "student_attended" BOOLEAN NOT NULL,
    "actual_duration_minutes" INTEGER NOT NULL,
    "observations" TEXT,

    CONSTRAINT "session_reports_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "session_notes" (
    "booking_id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "session_notes_pkey" PRIMARY KEY ("booking_id","user_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" VARCHAR NOT NULL,
    "booking_id" VARCHAR NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT NOT NULL,
    "punctuality_rating" SMALLINT,
    "clarity_rating" SMALLINT,
    "subject_knowledge_rating" SMALLINT,
    "tutor_reply" TEXT,
    "report_reason" TEXT,
    "reported_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "student_id" VARCHAR NOT NULL,
    "tutor_id" VARCHAR NOT NULL,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("student_id","tutor_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" VARCHAR NOT NULL,
    "student_id" VARCHAR NOT NULL,
    "tutor_id" VARCHAR NOT NULL,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" VARCHAR NOT NULL,
    "conversation_id" VARCHAR NOT NULL,
    "author_id" VARCHAR NOT NULL,
    "text" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instant_tutoring_requests" (
    "id" VARCHAR NOT NULL,
    "student_id" VARCHAR NOT NULL,
    "subject_id" VARCHAR NOT NULL,
    "education_level_id" VARCHAR NOT NULL,
    "modality" "session_modality" NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "note" TEXT,
    "status" "instant_request_status" NOT NULL DEFAULT 'searching',
    "tutor_id" VARCHAR,
    "booking_id" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instant_tutoring_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" VARCHAR NOT NULL,
    "tutor_id" VARCHAR NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "withdrawal_status" NOT NULL DEFAULT 'requested',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR NOT NULL,
    "recipient_id" VARCHAR NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR NOT NULL,
    "detail" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" BIGSERIAL NOT NULL,
    "notification_id" VARCHAR NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "status" "delivery_status" NOT NULL DEFAULT 'pending',
    "detail" TEXT,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" VARCHAR NOT NULL,
    "event" "notification_event" NOT NULL,
    "channel" "notification_channel" NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","event","channel")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" BIGSERIAL NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "token_hash" VARCHAR NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "languages_name_key" ON "languages"("name");

-- CreateIndex
CREATE INDEX "weekly_availability_tutor_id_day_of_week_idx" ON "weekly_availability"("tutor_id", "day_of_week");

-- CreateIndex
CREATE INDEX "bookings_tutor_id_starts_at_idx" ON "bookings"("tutor_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_student_id_starts_at_idx" ON "bookings"("student_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_key" ON "reviews"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_student_id_tutor_id_key" ON "conversations"("student_id", "tutor_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_sent_at_idx" ON "messages"("conversation_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "instant_tutoring_requests_booking_id_key" ON "instant_tutoring_requests"("booking_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_is_read_created_at_idx" ON "notifications"("recipient_id", "is_read", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_education_level_id_fkey" FOREIGN KEY ("education_level_id") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutors" ADD CONSTRAINT "tutors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_subjects" ADD CONSTRAINT "tutor_subjects_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_subjects" ADD CONSTRAINT "tutor_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_subject_levels" ADD CONSTRAINT "tutor_subject_levels_tutor_id_subject_id_fkey" FOREIGN KEY ("tutor_id", "subject_id") REFERENCES "tutor_subjects"("tutor_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_subject_levels" ADD CONSTRAINT "tutor_subject_levels_education_level_id_fkey" FOREIGN KEY ("education_level_id") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_languages" ADD CONSTRAINT "tutor_languages_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_languages" ADD CONSTRAINT "tutor_languages_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_rules" ADD CONSTRAINT "scheduling_rules_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowed_session_durations" ADD CONSTRAINT "allowed_session_durations_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "scheduling_rules"("tutor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_availability" ADD CONSTRAINT "weekly_availability_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_education_level_id_fkey" FOREIGN KEY ("education_level_id") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reports" ADD CONSTRAINT "session_reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instant_tutoring_requests" ADD CONSTRAINT "instant_tutoring_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instant_tutoring_requests" ADD CONSTRAINT "instant_tutoring_requests_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instant_tutoring_requests" ADD CONSTRAINT "instant_tutoring_requests_education_level_id_fkey" FOREIGN KEY ("education_level_id") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instant_tutoring_requests" ADD CONSTRAINT "instant_tutoring_requests_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutors"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instant_tutoring_requests" ADD CONSTRAINT "instant_tutoring_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "tutors"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
